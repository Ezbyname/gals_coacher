import { readdirSync, readFileSync } from 'node:fs';
import path, { join, resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import {
  Alert,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type AlertButton,
} from 'react-native';

import * as calendar from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import { BUILTIN_ACTIVITY_TYPES } from '@/domain/activityType';
import * as calendarDomain from '@/domain/calendarEvent';
import type { CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import { LRI, PDI, stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import * as localTime from '@/services/clock/localCalendarDate';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { appRoutes, routeName } from '@/test-support/appRoutes';
import { expectBottomInsetOnMainNavOnly } from '@/test-support/mainNav';
import { prepareApp } from '@/test-support/prepareApp';
import * as keyboardReveal from '@/ui/keyboardReveal';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { spacing, touch } from '@/ui/theme';

// The device's bottom inset; 0 unless a test sets it.
let mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

/** The real route tree (every screen file under src/app), as Expo Router names it. */
const routes = appRoutes(resolve(__dirname, '..'));

const HOUR = 3_600_000;
/** A local wall time in October 2026 (timezone-independent). */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const NOW = at(5, 18, 10); // Monday 5 October 2026, 18:10 local

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid; // Basketball
let noa: Uuid; // no sport
const seedIds = createSequentialIdService();
const seedClock = { wallNow: () => NOW - HOUR, monotonicNow: () => 0 };

async function prepare(language: 'he' | 'en', platform: 'android' | 'ios' = 'android') {
  mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', platform);
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const seed = async (input: players.PlayerProfileInput) => {
    const result = await players.createPlayer(opened, input, { ids: seedIds, clock: seedClock });
    if (!result.ok) throw new Error('seed failed');
    return result.profile.player.id;
  };
  gal = await seed({
    player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
    basketball: { primaryPosition: 'PG' },
  });
  noa = await seed({
    player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } },
    basketball: null,
  });
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

/** Seeds a saved event through the real repository. */
async function seedEvent(input: CalendarEventInput, playerId: Uuid = gal) {
  const result = await calendar.createCalendarEvent(db!, playerId, input, { ids: seedIds, clock: seedClock });
  if (!result.ok) throw new Error(`seed failed: ${JSON.stringify(result.errors)}`);
  return result.event;
}
const rows = () => db!.getAllAsync<Record<string, unknown>>('SELECT * FROM calendar_events ORDER BY id');
const eventCount = async () =>
  (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events'))!.n;

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const plain = (testID: string) => stripBidi(text(testID));
const isSelected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const isDisabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));

/** Android: tapping the field mounts the native dialog; the user picks `date`. */
async function pick(testID: string, date: Date) {
  press(testID);
  const native = await screen.findByTestId(`${testID}-native`);
  act(() => native.props.onValueChange({ nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } }, date));
  await waitFor(() => expect(screen.queryByTestId(`${testID}-native`)).toBeNull());
}

/** `url` is built after the players are seeded (their ids are only known then). */
async function open(
  url: () => string,
  language: 'he' | 'en' = 'he',
  platform: 'android' | 'ios' = 'android',
) {
  await prepare(language, platform);
  return renderRouter(routes as never, { initialUrl: url() });
}
async function openNew(language: 'he' | 'en' = 'he', playerId?: () => Uuid) {
  await prepare(language);
  const app = renderRouter(routes as never, {
    initialUrl: `/children/${(playerId ?? (() => gal))()}/schedule/new`,
  });
  await screen.findByTestId('event-save');
  return app;
}

/** An Alert.alert spy that records each dialog and answers with the button labelled `answer`. */
function answerAlerts(answer: 'confirm' | 'cancel') {
  const dialogs: { title: string; body?: string; buttons: AlertButton[] }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons = []) => {
    dialogs.push({ title, body, buttons });
    const button = buttons.find((b) => (answer === 'cancel' ? b.style === 'cancel' : b.style !== 'cancel'));
    button?.onPress?.();
  });
  return dialogs;
}

describe('route tree', () => {
  it('the five schedule screens exist under the Player route, named with `/` on every OS', () => {
    expect(
      Object.keys(routes)
        .filter((r) => r.includes('schedule'))
        .sort(),
    ).toEqual([
      'children/[id]/schedule/[eventId]/edit',
      'children/[id]/schedule/[eventId]/index',
      // CAL-TEXT-IMPORT-001C: import weekly trainings from text (a static segment, before [eventId]).
      'children/[id]/schedule/import',
      'children/[id]/schedule/index',
      'children/[id]/schedule/new',
    ]);
    // Route names use Expo `/` separators on every OS (path.relative gives `\\` on Windows).
    expect(Object.keys(routes).every((name) => !name.includes('\\'))).toBe(true);
    const appDir = 'C:\\Codes\\gals_coacher\\src\\app';
    expect(routeName(appDir, `${appDir}\\children\\[id]\\schedule\\[eventId]\\edit.tsx`, path.win32)).toBe(
      'children/[id]/schedule/[eventId]/edit',
    );
    expect(routeName('/repo/src/app', '/repo/src/app/children/[id]/schedule/index.tsx', path.posix)).toBe(
      'children/[id]/schedule/index',
    );
  });
});

describe('entry from Edit Player', () => {
  it('a player without a sport has a Schedule section (and no Self-assessment); empty summary', async () => {
    const app = await open(() => `/children/${noa}`);
    expect(await screen.findByDisplayValue('Noa')).toBeTruthy();
    const section = await screen.findByTestId('schedule-section');
    expect(within(section).getByText('לוח זמנים')).toBeTruthy();
    expect(screen.queryByTestId('self-assessment-section')).toBeNull();
    expect(await screen.findByTestId('schedule-none')).toBeTruthy();
    expect(text('schedule-none')).toBe('אין אירועים קרובים.');
    press('schedule-open');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${noa}/schedule`));
  });

  it('a Basketball player has Self-assessment then Schedule, both after the profile form', async () => {
    await open(() => `/children/${gal}`);
    expect(await screen.findByTestId('schedule-section')).toBeTruthy();
    const order = screen
      .getAllByTestId(/^(player-save|player-cancel|self-assessment-section|schedule-section)$/)
      .map((n) => n.props.testID);
    expect(order).toEqual(['player-save', 'player-cancel', 'self-assessment-section', 'schedule-section']);
    for (const id of ['player-section-personal', 'player-section-sport', 'player-section-basketball']) {
      expect(within(screen.getByTestId(id)).queryByTestId('schedule-section')).toBeNull();
    }
  });

  it('summarizes only the next current/upcoming event (never the list); in-progress says Now', async () => {
    await prepare('en');
    await seedEvent({ type: 'GAME', startAt: at(3, 17), endAt: at(3, 19) }); // past
    await seedEvent({ type: 'OTHER', title: 'Photo day', startAt: at(6, 10) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}` });
    expect(await screen.findByTestId('schedule-next')).toBeTruthy();
    // OTHER: the title alone (no "Other"), then the date and time.
    expect(plain('schedule-next')).toBe('Next: Photo day');
    expect(plain('schedule-next-when')).toBe('6 Oct 2026 · 10:00');
    expect(stripBidi(screen.getByTestId('schedule-next-event').props.accessibilityLabel)).toBe(
      'Next: Photo day, 6 Oct 2026 · 10:00',
    );
    expect(screen.queryByText(/Other/)).toBeNull();
    expect(screen.queryByTestId(/^schedule-event-/)).toBeNull();
  });

  it('an event under way is summarized as Now (Hebrew, LTR time range)', async () => {
    await prepare('he');
    await seedEvent({ type: 'TEAM_TRAINING', startAt: at(5, 17, 30), endAt: at(5, 19) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}` });
    expect(await screen.findByTestId('schedule-next')).toBeTruthy();
    // No title: the type is the heading; the second line is only the date and time.
    expect(plain('schedule-next')).toBe('עכשיו: אימון קבוצתי');
    expect(text('schedule-next-when')).toBe(`5 באוק׳ 2026 · ${LRI}17:30–19:00${PDI}`);
  });

  it('a title keeps its meaningful type: title, then type · date and time (Hebrew, read as one item)', async () => {
    await prepare('he');
    await seedEvent({ type: 'GYM', title: 'אימון כוח', startAt: at(6, 18), endAt: at(6, 19) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}` });
    expect(await screen.findByTestId('schedule-next')).toBeTruthy();
    expect(plain('schedule-next')).toBe('הבא: אימון כוח');
    expect(plain('schedule-next-when')).toBe('חדר כושר · 6 באוק׳ 2026 · 18:00–19:00');
    expect(text('schedule-next-when')).toContain(`${LRI}18:00–19:00${PDI}`);
    const summary = screen.getByTestId('schedule-next-event');
    expect(summary.props.accessible).toBe(true);
    expect(stripBidi(summary.props.accessibilityLabel)).toBe(
      'הבא: אימון כוח, חדר כושר, 6 באוק׳ 2026 · 18:00–19:00',
    );
  });

  it('a summary of an event ending on a later day keeps each time with its own date', async () => {
    await prepare('en');
    await seedEvent({ type: 'PERSONAL_TRAINING', startAt: at(6, 23), endAt: at(7, 1) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}` });
    expect(await screen.findByTestId('schedule-next-when')).toBeTruthy();
    expect(plain('schedule-next-when')).toBe('6 Oct 2026 · 23:00 – 7 Oct 2026 · 01:00');
  });
});

describe('agenda', () => {
  async function seedAll() {
    const inProgress = await seedEvent({ type: 'TEAM_TRAINING', startAt: at(5, 17, 30), endAt: at(5, 19) });
    const photo = await seedEvent({ type: 'OTHER', title: 'Photo day', startAt: at(6, 10) });
    const gym = await seedEvent({ type: 'GYM', startAt: at(6, 10) }); // same start, larger id
    const game = await seedEvent({ type: 'GAME', sport: 'BASKETBALL', startAt: at(3, 17), endAt: at(3, 19) });
    const recovery = await seedEvent({ type: 'RECOVERY', startAt: at(5, 18) }); // started 10 min ago, no end
    const overnight = await seedEvent({ type: 'PERSONAL_TRAINING', startAt: at(9, 19), endAt: at(10, 1) });
    return { inProgress, photo, gym, game, recovery, overnight };
  }
  const cardIds = (section: string) =>
    within(screen.getByTestId(section))
      .getAllByTestId(/^schedule-event-[^-]+-[^-]+-[^-]+-[^-]+-[^-]+$/)
      .map((n) => n.props.testID.replace('schedule-event-', ''));

  it('empty: an encouraging empty state and Add Event (no sample events)', async () => {
    const app = await open(() => `/children/${noa}/schedule`);
    expect(await screen.findByTestId('schedule-empty')).toBeTruthy();
    expect(screen.getByText('עדיין אין אירועים.')).toBeTruthy();
    expect(screen.getByText('אפשר להוסיף אימון, משחק או כל דבר אחר שמתוכנן.')).toBeTruthy();
    expect(screen.queryAllByTestId(/^schedule-event-/)).toHaveLength(0);
    expect(screen.queryByTestId('schedule-upcoming')).toBeNull();
    expect(screen.queryByTestId('schedule-past')).toBeNull();
    press('schedule-add');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${noa}/schedule/new`));
  });

  it('Current & upcoming and Past come from splitAgenda(events, clock now), in its order', async () => {
    await prepare('en');
    const e = await seedAll();
    const split = jest.spyOn(calendarDomain, 'splitAgenda');
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId('schedule-upcoming');
    expect(split).toHaveBeenCalledTimes(1);
    expect(split.mock.calls[0]![0]).toHaveLength(6);
    expect(split.mock.calls[0]![1]).toBe(NOW);
    expect(cardIds('schedule-upcoming')).toEqual([e.inProgress.id, e.photo.id, e.gym.id, e.overnight.id]);
    expect(cardIds('schedule-past')).toEqual([e.recovery.id, e.game.id]);
    // The in-progress event (start < now ≤ end) is current, marked Now; nothing else is.
    expect(text(`schedule-event-${e.inProgress.id}-now`)).toBe('Now');
    expect(screen.getAllByTestId(/-now$/)).toHaveLength(1);
    expect(screen.getByText('Current & upcoming')).toBeTruthy();
    expect(screen.getByText('Past')).toBeTruthy();
  });

  it('cards show type, optional title / end / sport — and nothing that is not set', async () => {
    await prepare('en');
    const e = await seedAll();
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId('schedule-upcoming');
    const id = (event: { id: string }, part: string) => `schedule-event-${event.id}-${part}`;
    // Without a title the type is the heading; OTHER never shows "Other" (its title says it).
    expect(text(id(e.photo, 'heading'))).toBe('Photo day');
    expect(screen.queryByTestId(id(e.photo, 'type'))).toBeNull();
    expect(screen.queryByText('Other')).toBeNull();
    expect(text(id(e.gym, 'heading'))).toBe('Gym');
    expect(screen.queryByTestId(id(e.gym, 'type'))).toBeNull();
    // No end / same day: one line, the time right after its date.
    expect(text(id(e.photo, 'when'))).toBe(`6 Oct 2026 · ${LRI}10:00${PDI}`);
    expect(text(id(e.game, 'when'))).toBe(`3 Oct 2026 · ${LRI}17:00–19:00${PDI}`);
    // Ends on a later day: Start and End rows, each time with its own date.
    expect(screen.queryByTestId(id(e.overnight, 'when'))).toBeNull();
    expect(plain(id(e.overnight, 'start'))).toBe('Start: 9 Oct 2026 · 19:00');
    expect(plain(id(e.overnight, 'end'))).toBe('End: 10 Oct 2026 · 01:00');
    expect(text(id(e.overnight, 'start'))).toContain(`${LRI}19:00${PDI}`);
    expect(text(id(e.overnight, 'end'))).toContain(`${LRI}01:00${PDI}`);
    expect(screen.queryByTestId(id(e.game, 'start'))).toBeNull();
    expect(text(id(e.game, 'sport'))).toBe('Basketball');
    expect(screen.getAllByTestId(/-sport$/)).toHaveLength(1);
    expect(screen.queryByText(/null|undefined|NaN/)).toBeNull();
  });

  it('only past events: Current & upcoming says nothing is coming up', async () => {
    await prepare('he');
    await seedEvent({ type: 'GAME', startAt: at(1, 10) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    expect(await screen.findByTestId('schedule-no-upcoming')).toBeTruthy();
    expect(text('schedule-no-upcoming')).toBe('אין אירועים קרובים.');
    expect(screen.getAllByTestId(/^schedule-event-[^-]+-[^-]+-[^-]+-[^-]+-[^-]+$/)).toHaveLength(1);
  });

  it('tapping an event opens its details', async () => {
    await prepare('he');
    const event = await seedEvent({ type: 'GAME', startAt: at(7, 10) });
    const app = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    fireEvent.press(await screen.findByTestId(`schedule-event-${event.id}`));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
  });

  it('corrupt stored data: a safe message, no partial list, no raw details', async () => {
    await prepare('he');
    await seedEvent({ type: 'GAME', startAt: at(7, 10) });
    await db!.runAsync(
      `INSERT INTO calendar_events (id, player_id, type, start_at, created_at, updated_at)
       VALUES ('00000000-0000-4000-8000-0000000000c1', ?, 'SCHOOL', ?, 1, 1)`,
      [gal, at(8, 10)],
    );
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    expect(await screen.findByTestId('schedule-error')).toBeTruthy();
    expect(text('schedule-error')).toBe('חלק מנתוני לוח הזמנים שמורים בצורה לא תקינה ולא ניתן להציג אותם.');
    expect(screen.queryAllByTestId(/^schedule-event-/)).toHaveLength(0);
    expect(screen.queryByText(/SCHOOL|CalendarEventDataError|SQL/)).toBeNull();
  });

  it('an unknown player gets a safe message', async () => {
    await open(() => '/children/00000000-0000-4000-8000-000000000999/schedule', 'en');
    expect(await screen.findByTestId('schedule-error')).toBeTruthy();
    expect(text('schedule-error')).toBe('This player was not found.');
  });
});

describe('create', () => {
  it('Hebrew: exactly the six type labels; no type chosen yet; next quarter hour today; no end', async () => {
    await openNew('he');
    const types = screen
      .getAllByTestId(/^event-type-[A-Z_]+-label$/)
      .map((n) => [n.props.testID.replace(/^event-type-|-label$/g, ''), String(n.props.children)]);
    expect(types).toEqual([
      ['TEAM_TRAINING', 'אימון קבוצתי'],
      ['PERSONAL_TRAINING', 'אימון אישי'],
      ['GAME', 'משחק'],
      ['GYM', 'חדר כושר'],
      ['RECOVERY', 'התאוששות'],
      ['OTHER', 'אחר'],
    ]);
    expect(types.filter(([code]) => isSelected(`event-type-${code}`))).toEqual([]);
    expect(text('event-start-date-value')).toBe('יום שני, 5 באוקטובר 2026');
    expect(text('event-start-time-value')).toBe(`${LRI}18:15${PDI}`); // 18:10 → next quarter hour
    expect(screen.queryByTestId('event-end')).toBeNull();
    expect(screen.getByTestId('event-add-end')).toBeTruthy();
  });

  it('English type labels', async () => {
    await openNew('en');
    expect(screen.getAllByTestId(/^event-type-[A-Z_]+-label$/).map((n) => String(n.props.children))).toEqual([
      'Team training',
      'Personal training',
      'Game',
      'Gym',
      'Recovery',
      'Other',
    ]);
  });

  it('one assignable sport: a single optional Basketball chip, off for a new event (no "No sport")', async () => {
    await openNew('en');
    expect(
      within(screen.getByTestId('event-sport'))
        .getAllByTestId(/-label$/)
        .map((n) => String(n.props.children)),
    ).toEqual(['Basketball']);
    expect(screen.getByText('Sport (optional)')).toBeTruthy();
    expect(screen.queryByTestId('event-sport-NONE')).toBeNull();
    expect(screen.queryByText('No sport')).toBeNull();
    expect(isSelected('event-sport-BASKETBALL')).toBe(false);
  });

  it('never auto-assigns the sport: a Basketball player saves a sport-less event by default', async () => {
    const app = await openNew('he');
    press('event-type-TEAM_TRAINING');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect((await rows())[0]).toMatchObject({ type: 'TEAM_TRAINING', sport: null });
  });

  it('tapping Basketball selects it; tapping again clears it (saved as no sport)', async () => {
    const app = await openNew('he');
    press('event-type-GAME');
    press('event-sport-BASKETBALL');
    expect(isSelected('event-sport-BASKETBALL')).toBe(true);
    press('event-sport-BASKETBALL');
    expect(isSelected('event-sport-BASKETBALL')).toBe(false);
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect((await rows())[0]).toMatchObject({ type: 'GAME', sport: null });
  });

  it('a player without a sport sees no sport choice at all', async () => {
    await openNew('en', () => noa);
    expect(screen.queryByTestId('event-sport')).toBeNull();
    expect(screen.queryByText('Basketball')).toBeNull();
  });

  it('Save without a type writes nothing, keeps every value and asks for a type', async () => {
    const app = await openNew('he');
    fireEvent.changeText(screen.getByTestId('event-title'), 'אימון');
    press('event-save');
    expect(await screen.findByTestId('event-type-error')).toBeTruthy();
    expect(text('event-type-error')).toBe('יש לבחור סוג אירוע.');
    expect(await eventCount()).toBe(0);
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    expect(screen.getByTestId('event-title').props.value).toBe('אימון');
  });

  it('a known type saves with no title, no sport, no end; the schedule shows it at once', async () => {
    const app = await openNew('he');
    press('event-type-GAME');
    expect(isSelected('event-type-GAME')).toBe(true);
    press('event-save');
    // Opened directly (no schedule underneath): the schedule replaces New.
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    const [row] = await rows();
    expect(row).toMatchObject({
      player_id: gal,
      type: 'GAME',
      sport: null,
      start_at: at(5, 18, 15),
      end_at: null,
      title: null,
      notes: null,
      created_at: NOW,
      updated_at: NOW,
    });
    expect(await screen.findByTestId(`schedule-event-${row!.id}`)).toBeTruthy();
  });

  it('OTHER needs a title: a localized message, nothing written; with a title it saves', async () => {
    const app = await openNew('en');
    press('event-type-OTHER');
    expect(screen.getByText('Title (required for Other)')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('event-title'), '   ');
    press('event-save');
    expect(await screen.findByTestId('event-title-error')).toBeTruthy();
    expect(text('event-title-error')).toBe('An event of type Other needs a title.');
    expect(await eventCount()).toBe(0);
    expect(isSelected('event-type-OTHER')).toBe(true);
    fireEvent.changeText(screen.getByTestId('event-title'), '  Photo day ');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect((await rows())[0]).toMatchObject({ type: 'OTHER', title: 'Photo day' });
  });

  it('a type does not imply a sport: Gym with Basketball saves the stable code', async () => {
    const app = await openNew('he');
    press('event-type-GYM');
    press('event-sport-BASKETBALL');
    expect(isSelected('event-sport-BASKETBALL')).toBe(true);
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect((await rows())[0]).toMatchObject({ type: 'GYM', sport: 'BASKETBALL' });
  });

  it('date, start, end date and end time from the native pickers — an overnight event', async () => {
    const app = await openNew('en');
    press('event-type-PERSONAL_TRAINING');
    await pick('event-start-date', new Date(2026, 9, 9, 12));
    await pick('event-start-time', new Date(2026, 0, 1, 19, 30)); // only the time is taken
    expect(text('event-start-date-value')).toBe('Friday, 9 October 2026');
    expect(text('event-start-time-value')).toBe(`${LRI}19:30${PDI}`);
    press('event-add-end');
    // The end starts from the start; nothing is chosen for the user.
    expect(text('event-end-date-value')).toBe('Friday, 9 October 2026');
    expect(text('event-end-time-value')).toBe(`${LRI}19:30${PDI}`);
    await pick('event-end-date', new Date(2026, 9, 10, 12));
    await pick('event-end-time', new Date(2026, 0, 1, 1, 0));
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    const [row] = await rows();
    expect(row).toMatchObject({ start_at: at(9, 19, 30), end_at: at(10, 1) });
    expect(await screen.findByTestId(`schedule-event-${row!.id}-start`)).toBeTruthy();
    expect(plain(`schedule-event-${row!.id}-start`)).toBe('Start: 9 Oct 2026 · 19:30');
    expect(plain(`schedule-event-${row!.id}-end`)).toBe('End: 10 Oct 2026 · 01:00');
  });

  it('a native picker dismissed without a choice changes nothing', async () => {
    await openNew('en');
    press('event-start-time');
    const native = await screen.findByTestId('event-start-time-native');
    expect(native.props).toMatchObject({ mode: 'time', is24Hour: true });
    expect(native.props.value.getHours()).toBe(18);
    expect(native.props.value.getMinutes()).toBe(15);
    act(() => native.props.onDismiss());
    expect(screen.queryByTestId('event-start-time-native')).toBeNull();
    expect(text('event-start-time-value')).toBe(`${LRI}18:15${PDI}`);
  });

  it('an end not after the start: a message, nothing written, every value kept; removing the end saves', async () => {
    const app = await openNew('he');
    press('event-type-GAME');
    fireEvent.changeText(screen.getByTestId('event-title'), 'גמר');
    press('event-add-end'); // end == start
    press('event-save');
    expect(await screen.findByTestId('event-end-time-error')).toBeTruthy();
    expect(text('event-end-time-error')).toBe('הסיום צריך להיות אחרי ההתחלה.');
    await pick('event-end-time', new Date(2026, 0, 1, 17, 0)); // before the start
    press('event-save');
    expect(await screen.findByTestId('event-end-time-error')).toBeTruthy();
    expect(await eventCount()).toBe(0);
    expect(isSelected('event-type-GAME')).toBe(true);
    expect(screen.getByTestId('event-title').props.value).toBe('גמר');
    expect(text('event-start-time-value')).toBe(`${LRI}18:15${PDI}`);
    expect(text('event-end-time-value')).toBe(`${LRI}17:00${PDI}`);
    press('event-remove-end');
    expect(screen.queryByTestId('event-end')).toBeNull();
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect((await rows())[0]).toMatchObject({ title: 'גמר', end_at: null });
  });

  it('title and notes are trimmed by the domain; blank notes are saved as nothing', async () => {
    const app = await openNew('en');
    press('event-type-RECOVERY');
    fireEvent.changeText(screen.getByTestId('event-title'), '  Stretching  ');
    fireEvent.changeText(screen.getByTestId('event-notes'), ' \n ');
    expect(screen.getByTestId('event-notes').props.multiline).toBe(true);
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect((await rows())[0]).toMatchObject({ title: 'Stretching', notes: null });
  });

  it('a start time that does not exist on this device (DST gap) is flagged, nothing written', async () => {
    await openNew('he');
    press('event-type-GAME');
    jest.spyOn(localTime, 'localDateTimeToEpoch').mockReturnValue(null);
    press('event-save');
    expect(await screen.findByTestId('event-start-time-error')).toBeTruthy();
    expect(text('event-start-time-error')).toBe(
      'השעה הזו לא קיימת במכשיר בגלל מעבר שעון. אפשר לבחור שעה אחרת.',
    );
    expect(await eventCount()).toBe(0);
  });

  it('a storage failure keeps the screen and every value, with a safe message; retry works', async () => {
    const app = await openNew('he');
    press('event-type-GAME');
    fireEvent.changeText(screen.getByTestId('event-notes'), 'נעליים');
    const run = db!.runAsync.bind(db!);
    const spy = jest.spyOn(db!, 'runAsync').mockImplementation(async (sql, params) => {
      if (sql.includes('INSERT INTO calendar_events')) throw new Error('SQLITE_FULL: disk is full');
      return run(sql, params);
    });
    press('event-save');
    expect(await screen.findByTestId('event-save-error')).toBeTruthy();
    expect(text('event-save-error')).toBe('השמירה לא הצליחה. הפרטים נשארו, אפשר לנסות שוב.');
    expect(screen.queryByText(/SQLITE|disk/)).toBeNull();
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    expect(isSelected('event-type-GAME')).toBe(true);
    expect(screen.getByTestId('event-notes').props.value).toBe('נעליים');
    expect(isDisabled('event-save')).toBe(false);
    expect(isDisabled('event-cancel')).toBe(false);
    expect(await eventCount()).toBe(0);
    spy.mockRestore();
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(await eventCount()).toBe(1);
  });

  it('a rapid double Save creates exactly one event', async () => {
    const app = await openNew('he');
    press('event-type-GAME');
    const create = jest.spyOn(calendar, 'createCalendarEvent');
    // Both presses in the same frame: only the ref guard (not the disabled state) can stop the second.
    const save = screen.getByTestId('event-save');
    act(() => {
      fireEvent.press(save);
      fireEvent.press(save);
    });
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await eventCount()).toBe(1);
  });

  it('while a save is pending, Save and Cancel are disabled; one save, one navigation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = calendar.createCalendarEvent;
    const create = jest.spyOn(calendar, 'createCalendarEvent').mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    const app = await openNew('he');
    press('event-type-GAME');
    const replace = jest.spyOn(router, 'replace');
    press('event-save');
    await waitFor(() => expect(screen.getByText('שומר...')).toBeTruthy());
    expect(isDisabled('event-save')).toBe(true);
    expect(isDisabled('event-cancel')).toBe(true);
    press('event-cancel');
    await act(async () => {});
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    expect(replace).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await eventCount()).toBe(1);
  });

  it('Cancel writes nothing and returns to the schedule', async () => {
    const app = await openNew('he');
    press('event-type-GAME');
    fireEvent.changeText(screen.getByTestId('event-title'), 'x');
    const create = jest.spyOn(calendar, 'createCalendarEvent');
    press('event-cancel');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(create).not.toHaveBeenCalled();
    expect(await eventCount()).toBe(0);
  });

  it('iOS: the picker opens in a sheet (app locale); Cancel keeps the value, Confirm applies it', async () => {
    await prepare('he', 'ios');
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/new` });
    await screen.findByTestId('event-save');
    press('event-start-time');
    let native = await screen.findByTestId('event-start-time-native');
    expect(native.props).toMatchObject({ mode: 'time', display: 'spinner', locale: 'he-IL' });
    act(() => native.props.onValueChange({}, new Date(2026, 9, 5, 7, 45)));
    press('event-start-time-cancel');
    expect(text('event-start-time-value')).toBe(`${LRI}18:15${PDI}`);
    press('event-start-time');
    native = await screen.findByTestId('event-start-time-native');
    act(() => native.props.onValueChange({}, new Date(2026, 9, 5, 7, 45)));
    press('event-start-time-confirm');
    expect(text('event-start-time-value')).toBe(`${LRI}07:45${PDI}`);
    expect(text('event-start-date-value')).toBe('יום שני, 5 באוקטובר 2026');
  });
});

describe('details', () => {
  it('English: every set field, localized; no ids, timestamps or status', async () => {
    await prepare('en');
    const event = await seedEvent({
      type: 'GAME',
      sport: 'BASKETBALL',
      startAt: at(6, 18),
      endAt: at(6, 19, 30),
      title: 'Cup final',
      notes: 'Bring water',
    });
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    expect(await screen.findByTestId('event-details-type')).toBeTruthy();
    // The title is the heading; the meaningful type under it.
    expect(text('event-details-title')).toBe('Cup final');
    expect(text('event-details-type')).toBe('Game');
    // With an end: explicit Start and End rows, each time with its own date (even on the same day).
    expect(text('event-details-start')).toBe(`Start: ⁨6 Oct 2026 · ${LRI}18:00${PDI}⁩`);
    expect(plain('event-details-end')).toBe('End: 6 Oct 2026 · 19:30');
    expect(text('event-details-sport')).toBe('Basketball');
    expect(text('event-details-notes')).toBe('Bring water');
    expect(screen.getByText('Notes')).toBeTruthy();
    expect(screen.queryByText(new RegExp(event.id))).toBeNull();
    expect(screen.queryByText(/created|updated|status|repeat/i)).toBeNull();
    expect(screen.queryByText(/BASKETBALL|GAME/)).toBeNull(); // labels, never stored codes
  });

  it('OTHER with a title: the title only, never "Other"; an overnight end has its own date', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'OTHER', title: 'Photo day', startAt: at(6, 23), endAt: at(7, 1) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    expect(await screen.findByTestId('event-details-title')).toBeTruthy();
    expect(text('event-details-title')).toBe('Photo day');
    expect(screen.queryByTestId('event-details-type')).toBeNull();
    expect(screen.queryByText('Other')).toBeNull();
    expect(plain('event-details-start')).toBe('Start: 6 Oct 2026 · 23:00');
    expect(plain('event-details-end')).toBe('End: 7 Oct 2026 · 01:00');
    expect((await rows())[0]).toMatchObject({ type: 'OTHER' }); // the stored classification is kept
  });

  it('Hebrew minimal event: only type, date and time', async () => {
    await prepare('he');
    const event = await seedEvent({ type: 'RECOVERY', startAt: at(6, 7, 5) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    expect(await screen.findByTestId('event-details-type')).toBeTruthy();
    expect(text('event-details-type')).toBe('התאוששות');
    // No end: a Start row only, its time an LTR run inside Hebrew.
    expect(plain('event-details-start')).toBe('התחלה: 6 באוק׳ 2026 · 07:05');
    expect(text('event-details-start')).toContain(`${LRI}07:05${PDI}`);
    for (const id of [
      'event-details-title',
      'event-details-end',
      'event-details-sport',
      'event-details-notes-section',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it('an unknown event and a malformed event each get a safe message', async () => {
    await open(() => `/children/${gal}/schedule/00000000-0000-4000-8000-0000000000ee`, 'en');
    expect(await screen.findByTestId('event-details-error')).toBeTruthy();
    expect(text('event-details-error')).toBe('This event was not found. It may have been deleted.');
  });

  it('a malformed stored event: data message, no raw details', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(6, 7) });
    await db!.runAsync("UPDATE calendar_events SET type = 'SCHOOL' WHERE id = ?", [event.id]);
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    expect(await screen.findByTestId('event-details-error')).toBeTruthy();
    expect(text('event-details-error')).toBe('Some stored schedule data is not valid and cannot be shown.');
    expect(screen.queryByText(/SCHOOL/)).toBeNull();
  });
});

describe('delete', () => {
  async function openDetails(language: 'he' | 'en' = 'he') {
    await prepare(language);
    const keep = await seedEvent({ type: 'GYM', startAt: at(8, 9) });
    const event = await seedEvent({ type: 'GAME', startAt: at(7, 10) });
    const app = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    fireEvent.press(await screen.findByTestId(`schedule-event-${event.id}`));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    await screen.findByTestId('event-delete');
    return { app, event, keep };
  }

  it('asks first (Hebrew); keeping the event writes nothing and stays on details', async () => {
    const { app, event } = await openDetails('he');
    const dialogs = answerAlerts('cancel');
    const remove = jest.spyOn(calendar, 'deleteCalendarEvent');
    press('event-delete');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]!.title).toBe('למחוק את האירוע?');
    expect(dialogs[0]!.body).toBe('האירוע יוסר מלוח הזמנים. אי אפשר לבטל את המחיקה.');
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['השארת האירוע', 'cancel'],
      ['מחיקה', 'destructive'],
    ]);
    await act(async () => {});
    expect(remove).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`);
    expect(await eventCount()).toBe(2);
  });

  it('confirmed: the event is gone for good and the schedule no longer shows it', async () => {
    const { app, event, keep } = await openDetails('en');
    answerAlerts('confirm');
    const back = jest.spyOn(router, 'back');
    press('event-delete');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(back).toHaveBeenCalledTimes(1); // one step back to the existing schedule
    expect((await rows()).map((r) => r.id)).toEqual([keep.id]);
    await waitFor(() => expect(screen.queryByTestId(`schedule-event-${event.id}`)).toBeNull());
    expect(screen.getByTestId(`schedule-event-${keep.id}`)).toBeTruthy();
  });

  it('a failed delete stays on details with a safe message; the event remains', async () => {
    const { app, event } = await openDetails('he');
    answerAlerts('confirm');
    jest.spyOn(calendar, 'deleteCalendarEvent').mockRejectedValue(new Error('SQLITE_BUSY'));
    press('event-delete');
    expect(await screen.findByTestId('event-delete-error')).toBeTruthy();
    expect(text('event-delete-error')).toBe('המחיקה לא הצליחה. האירוע עדיין כאן, אפשר לנסות שוב.');
    expect(screen.queryByText(/SQLITE/)).toBeNull();
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`);
    expect(await eventCount()).toBe(2);
    expect(isDisabled('event-delete')).toBe(false);
  });
});

describe('edit', () => {
  async function openEdit(input: CalendarEventInput, language: 'he' | 'en' = 'en', playerId?: () => Uuid) {
    await prepare(language);
    const event = await seedEvent(input, (playerId ?? (() => gal))());
    const owner = (playerId ?? (() => gal))();
    const app = renderRouter(routes as never, { initialUrl: `/children/${owner}/schedule/${event.id}` });
    fireEvent.press(await screen.findByTestId('event-edit'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${owner}/schedule/${event.id}/edit`));
    await screen.findByTestId('event-save');
    return { app, event };
  }

  it('pre-populates every value from the saved event (local date and time)', async () => {
    await openEdit({
      type: 'GAME',
      sport: 'BASKETBALL',
      startAt: at(6, 18),
      endAt: at(7, 0, 30),
      title: 'Cup final',
      notes: 'Bring water',
    });
    expect(isSelected('event-type-GAME')).toBe(true);
    expect(isSelected('event-sport-BASKETBALL')).toBe(true);
    expect(text('event-start-date-value')).toBe('Tuesday, 6 October 2026');
    expect(text('event-start-time-value')).toBe(`${LRI}18:00${PDI}`);
    expect(text('event-end-date-value')).toBe('Wednesday, 7 October 2026');
    expect(text('event-end-time-value')).toBe(`${LRI}00:30${PDI}`);
    expect(screen.getByTestId('event-title').props.value).toBe('Cup final');
    expect(screen.getByTestId('event-notes').props.value).toBe('Bring water');
  });

  it('changes every field, removes end and sport: same event updated, createdAt kept; back to details', async () => {
    const { app, event } = await openEdit({
      type: 'GAME',
      sport: 'BASKETBALL',
      startAt: at(6, 18),
      endAt: at(6, 19),
      title: 'Cup',
      notes: 'Water',
    });
    const create = jest.spyOn(calendar, 'createCalendarEvent');
    const back = jest.spyOn(router, 'back');
    // Edit shows the stored sport; tapping it clears it.
    expect(isSelected('event-sport-BASKETBALL')).toBe(true);
    press('event-type-RECOVERY');
    press('event-sport-BASKETBALL');
    await pick('event-start-date', new Date(2026, 9, 12, 12));
    await pick('event-start-time', new Date(2026, 0, 1, 8, 0));
    press('event-remove-end');
    fireEvent.changeText(screen.getByTestId('event-title'), '');
    fireEvent.changeText(screen.getByTestId('event-notes'), 'Easy day');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    expect(back).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(await rows()).toEqual([
      {
        id: event.id,
        player_id: gal,
        type: 'RECOVERY',
        sport: null,
        start_at: at(12, 8),
        end_at: null,
        title: null,
        notes: 'Easy day',
        created_at: event.createdAt,
        updated_at: NOW,
        completed_at: null,
        completion_source: null,
        location: null,
        source: null,
        import_batch_id: null,
      },
    ]);
    // Details reloads on focus with the new values.
    await waitFor(() => expect(text('event-details-type')).toBe('Recovery'));
    expect(plain('event-details-start')).toBe('Start: 12 Oct 2026 · 08:00');
    expect(screen.queryByTestId('event-details-end')).toBeNull();
    expect(screen.queryByTestId('event-details-title')).toBeNull();
  });

  it('adds an end and a sport to an event that had neither', async () => {
    const { app, event } = await openEdit({ type: 'GYM', startAt: at(6, 18) });
    press('event-sport-BASKETBALL');
    press('event-add-end');
    await pick('event-end-time', new Date(2026, 0, 1, 19, 15));
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    expect((await rows())[0]).toMatchObject({ sport: 'BASKETBALL', end_at: at(6, 19, 15) });
  });

  it('changing to OTHER without a title is refused; the stored event is unchanged', async () => {
    const { event } = await openEdit({ type: 'GAME', startAt: at(6, 18) }, 'he');
    const before = await rows();
    press('event-type-OTHER');
    press('event-save');
    expect(await screen.findByTestId('event-title-error')).toBeTruthy();
    expect(text('event-title-error')).toBe('לאירוע מסוג "אחר" צריך כותרת.');
    expect(await rows()).toEqual(before);
    expect(event.type).toBe('GAME');
  });

  it('a storage failure keeps every edited value and the stored event', async () => {
    const { app, event } = await openEdit({ type: 'GAME', startAt: at(6, 18) }, 'he');
    const before = await rows();
    const run = db!.runAsync.bind(db!);
    jest.spyOn(db!, 'runAsync').mockImplementation(async (sql, params) => {
      if (sql.includes('UPDATE calendar_events')) throw new Error('SQLITE_IOERR');
      return run(sql, params);
    });
    press('event-type-GYM');
    fireEvent.changeText(screen.getByTestId('event-title'), 'כוח');
    press('event-save');
    expect(await screen.findByTestId('event-save-error')).toBeTruthy();
    expect(text('event-save-error')).toBe('השמירה לא הצליחה. הפרטים נשארו, אפשר לנסות שוב.');
    expect(isSelected('event-type-GYM')).toBe(true);
    expect(screen.getByTestId('event-title').props.value).toBe('כוח');
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}/edit`);
    expect(await rows()).toEqual(before);
  });

  it('Cancel writes nothing and returns to details', async () => {
    const { app, event } = await openEdit({ type: 'GAME', startAt: at(6, 18) });
    const before = await rows();
    const update = jest.spyOn(calendar, 'updateCalendarEvent');
    press('event-type-GYM');
    press('event-cancel');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    expect(update).not.toHaveBeenCalled();
    expect(await rows()).toEqual(before);
  });

  it('opened directly (deep link): Save replaces Edit with the details', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(6, 18) });
    const app = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}/edit` });
    await screen.findByTestId('event-save');
    const back = jest.spyOn(router, 'back');
    press('event-type-GYM');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    expect(back).not.toHaveBeenCalled();
    expect(await screen.findByTestId('event-details-type')).toBeTruthy();
    await waitFor(() => expect(text('event-details-type')).toBe('Gym'));
  });
});

describe('navigation through the real route stack', () => {
  it('Players → Edit → Schedule → New → Save → Schedule → Details → Edit → Save → Details → Back → Schedule → Back → Edit', async () => {
    await prepare('he');
    const app = renderRouter(routes as never, { initialUrl: '/children' });
    const at_ = async (path: string) => waitFor(() => expect(app.getPathname()).toBe(path));
    const schedule = `/children/${gal}/schedule`;

    fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
    await at_(`/children/${gal}`);
    fireEvent.press(await screen.findByTestId('schedule-open'));
    await at_(schedule);
    fireEvent.press(await screen.findByTestId('schedule-add'));
    await at_(`${schedule}/new`);
    await screen.findByTestId('event-save');
    press('event-type-TEAM_TRAINING');
    const back = jest.spyOn(router, 'back');
    const replace = jest.spyOn(router, 'replace');
    press('event-save');
    await at_(schedule);
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    const [row] = await rows();
    const id = String(row!.id);

    fireEvent.press(await screen.findByTestId(`schedule-event-${id}`));
    await at_(`${schedule}/${id}`);
    fireEvent.press(await screen.findByTestId('event-edit'));
    await at_(`${schedule}/${id}/edit`);
    await screen.findByTestId('event-save');
    press('event-type-GAME');
    press('event-save');
    await at_(`${schedule}/${id}`);
    expect(back).toHaveBeenCalledTimes(2);
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(text('event-details-type')).toBe('משחק'));

    // Android-style Back through the stack: no duplicate entries on the way down.
    act(() => router.back());
    await at_(schedule);
    expect(await screen.findByTestId(`schedule-event-${id}-heading`)).toBeTruthy();
    await waitFor(() => expect(text(`schedule-event-${id}-heading`)).toBe('משחק'));
    act(() => router.back());
    await at_(`/children/${gal}`);
    // The Player Edit summary reloaded on focus and shows the new event.
    await waitFor(() => expect(text('schedule-next')).toContain('משחק'));
    act(() => router.back());
    await at_('/children');
  });

  it('Schedule → New → Cancel → Schedule (one step back; nothing written)', async () => {
    await prepare('en');
    const app = renderRouter(routes as never, { initialUrl: `/children/${gal}` });
    fireEvent.press(await screen.findByTestId('schedule-open'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    fireEvent.press(await screen.findByTestId('schedule-add'));
    await screen.findByTestId('event-cancel');
    const back = jest.spyOn(router, 'back');
    press('event-cancel');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(back).toHaveBeenCalledTimes(1);
    expect(await eventCount()).toBe(0);
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
  });
});

describe('language', () => {
  it('switching the app language changes labels only; stored data keeps its stable codes', async () => {
    await prepare('en');
    const event = await seedEvent({
      type: 'TEAM_TRAINING',
      sport: 'BASKETBALL',
      startAt: at(6, 18),
      endAt: at(6, 19, 30),
    });
    const before = await rows();
    const first = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    expect(await screen.findByTestId(`schedule-event-${event.id}-heading`)).toBeTruthy();
    expect(text(`schedule-event-${event.id}-heading`)).toBe('Team training');
    expect(text(`schedule-event-${event.id}-sport`)).toBe('Basketball');
    first.unmount();

    await prepareApp('he');
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    expect(await screen.findByTestId(`schedule-event-${event.id}-heading`)).toBeTruthy();
    expect(text(`schedule-event-${event.id}-heading`)).toBe('אימון קבוצתי');
    expect(text(`schedule-event-${event.id}-sport`)).toBe('כדורסל');
    // 24-hour time range, isolated LTR inside Hebrew, right after its date.
    expect(text(`schedule-event-${event.id}-when`)).toBe(`6 באוק׳ 2026 · ${LRI}18:00–19:30${PDI}`);
    expect(await rows()).toEqual(before);
    expect(before[0]).toMatchObject({ type: 'TEAM_TRAINING', sport: 'BASKETBALL' });
  });
});

// With the main navigation (NAV-001) the bar below the screens carries the device inset;
// each screen's own scroll content then adds none (no doubled gap).
describe('safe area (a 48dp bottom inset)', () => {
  const scrollOf = (testID: string) => {
    expect(screen.UNSAFE_getAllByType(SafeAreaScrollView).some((n) => n.props.testID === testID)).toBe(true);
    const scroll = screen.UNSAFE_getAllByType(ScrollView).find((n) => n.props.testID === testID)!;
    return StyleSheet.flatten(scroll.props.contentContainerStyle);
  };
  /** testIDs of the scroll's own children, in order (the last is what must clear the inset). */
  const lastIds = (testID: string, pattern: RegExp) =>
    within(screen.getByTestId(testID))
      .getAllByTestId(pattern)
      .map((n) => n.props.testID);

  it('agenda: the last past event stays clear of the bottom inset', async () => {
    await prepare('he');
    const past = await seedEvent({ type: 'GAME', startAt: at(1, 10) });
    mockInsets = { top: 0, left: 0, right: 0, bottom: 48 };
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId(`schedule-event-${past.id}`);
    expect(scrollOf('schedule-scroll')).toMatchObject({
      padding: spacing.lg,
      paddingBottom: spacing.lg,
    });
    expectBottomInsetOnMainNavOnly(48);
    expect(lastIds('schedule-scroll', /^(schedule-add|schedule-event-[0-9a-f-]+)$/).slice(-1)).toEqual([
      `schedule-event-${past.id}`,
    ]);
  });

  it('create: Save / Cancel are the last controls, above the inset', async () => {
    await prepare('he');
    mockInsets = { top: 0, left: 0, right: 0, bottom: 48 };
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/new` });
    await screen.findByTestId('event-save');
    expect(scrollOf('event-form-scroll')).toMatchObject({
      padding: spacing.lg,
      paddingBottom: spacing.lg,
    });
    expectBottomInsetOnMainNavOnly(48);
    expect(lastIds('event-form-scroll', /^event-(type|notes|save|cancel)$/).slice(-2)).toEqual([
      'event-save',
      'event-cancel',
    ]);
  });

  it('edit: Save / Cancel are the last controls, above the inset', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(6, 18) });
    mockInsets = { top: 0, left: 0, right: 0, bottom: 48 };
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}/edit` });
    await screen.findByTestId('event-save');
    expect(scrollOf('event-form-scroll')).toMatchObject({ paddingBottom: spacing.lg });
    expectBottomInsetOnMainNavOnly(48);
    expect(lastIds('event-form-scroll', /^event-(type|notes|save|cancel)$/).slice(-2)).toEqual([
      'event-save',
      'event-cancel',
    ]);
  });

  it('details: Edit / Delete are the last controls, above the inset', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(6, 18), notes: 'n' });
    mockInsets = { top: 0, left: 0, right: 0, bottom: 48 };
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    await screen.findByTestId('event-delete');
    expect(scrollOf('event-details-scroll')).toMatchObject({ paddingBottom: spacing.lg });
    expectBottomInsetOnMainNavOnly(48);
    expect(
      lastIds('event-details-scroll', /^event-(details-type|details-notes-section|edit|delete)$/).slice(-2),
    ).toEqual(['event-edit', 'event-delete']);
  });
});

describe('keyboard (CAL-KEY-001; wiring only — the real keyboard is verified on a device)', () => {
  /** The keyboard wrapper around the form's scroll view, and the scroll view inside it. */
  const keyboardWrapper = () => {
    const wrappers = screen.UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(wrappers).toHaveLength(1);
    const wrapper = wrappers[0]!;
    expect(wrapper.props.testID).toBe('event-form-keyboard');
    expect(within(screen.getByTestId('event-form-keyboard')).getByTestId('event-form-scroll')).toBeTruthy();
    return wrapper;
  };
  const formScroll = () =>
    screen.UNSAFE_getAllByType(ScrollView).find((n) => n.props.testID === 'event-form-scroll')!;
  /**
   * measureWindowRect answers for the visible area (the view with testID
   * event-form-viewport; a View ref is the preset's mock instance, which keeps
   * its props) and for the focused field — in window dp.
   */
  let rects: { field: { top: number; bottom: number }; viewport: { top: number; bottom: number } };
  const measuring = (field: typeof rects.field, viewport: typeof rects.viewport) => {
    rects = { field, viewport };
    return jest
      .spyOn(keyboardReveal, 'measureWindowRect')
      .mockImplementation(async (node) =>
        (node as { props?: { testID?: string } } | null)?.props?.testID === 'event-form-viewport'
          ? rects.viewport
          : rects.field,
      );
  };
  const showKeyboard = () =>
    act(() =>
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
        duration: 0,
        easing: 'keyboard',
      }),
    );

  it.each(['android', 'ios'] as const)(
    '%s: padding by the keyboard overlap, offset by where the form starts in the window',
    async (platform) => {
      await prepare('he', platform);
      renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/new` });
      await screen.findByTestId('event-save');
      const wrapper = keyboardWrapper();
      // Android draws edge-to-edge: the window does not shrink for the keyboard (NB-02 / NB-03 failed without this).
      expect(wrapper.props.behavior).toBe('padding');
      expect(typeof wrapper.props.keyboardVerticalOffset).toBe('number');
      for (const id of ['event-title', 'event-notes', 'event-save', 'event-cancel']) {
        expect(within(screen.getByTestId('event-form-scroll')).getByTestId(id)).toBeTruthy();
      }
      expect(formScroll().props.keyboardShouldPersistTaps).toBe('handled');
    },
  );

  it('the keyboard offset is where the form starts in the window (measured, below the header)', async () => {
    await openNew('he');
    jest
      .spyOn(keyboardReveal, 'measureWindowRect')
      .mockImplementation(async (node) =>
        (node as { props?: { testID?: string } } | null)?.props?.testID === 'event-form-root'
          ? { top: 88, bottom: 900 }
          : null,
      );
    fireEvent(screen.getByTestId('event-form-root'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 812 } },
    });
    await waitFor(() => expect(keyboardWrapper().props.keyboardVerticalOffset).toBe(88));
  });

  it('focusing Title scrolls just enough to show it above the keyboard (Android)', async () => {
    await openNew('he');
    const scrollTo = jest.spyOn(formScroll().instance as ScrollView, 'scrollTo');
    await act(async () => {}); // let earlier layout work settle
    scrollTo.mockClear();
    // Visible area 100–500 (above the keyboard); Title at 520–600 is hidden.
    measuring({ top: 520, bottom: 600 }, { top: 100, bottom: 500 });
    fireEvent(screen.getByTestId('event-title'), 'focus');
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 600 - (500 - 16), animated: true }));
  });

  it('the keyboard opening while Notes is focused reveals the bottom of Notes (the typing position)', async () => {
    await openNew('en');
    const scrollTo = jest.spyOn(formScroll().instance as ScrollView, 'scrollTo');
    await act(async () => {}); // let earlier layout work settle
    scrollTo.mockClear();
    measuring({ top: 200, bottom: 300 }, { top: 100, bottom: 800 }); // visible before the keyboard
    fireEvent(screen.getByTestId('event-notes'), 'focus');
    await act(async () => {});
    expect(scrollTo).not.toHaveBeenCalled();
    // The keyboard opens: the visible area shrinks to 100–420 and Notes now sits at 380–560.
    rects = { field: { top: 380, bottom: 560 }, viewport: { top: 100, bottom: 420 } };
    showKeyboard();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 560 - (420 - 16), animated: true }));
  });

  it('a multiline Notes field growing while typing stays revealed; blurred fields are left alone', async () => {
    await openNew('en');
    const scrollTo = jest.spyOn(formScroll().instance as ScrollView, 'scrollTo');
    await act(async () => {}); // let earlier layout work settle
    scrollTo.mockClear();
    measuring({ top: 300, bottom: 700 }, { top: 100, bottom: 500 });
    fireEvent(screen.getByTestId('event-notes'), 'focus');
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    act(() => formScroll().props.onContentSizeChange(400, 1400));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2));
    fireEvent(screen.getByTestId('event-notes'), 'blur');
    showKeyboard();
    act(() => formScroll().props.onContentSizeChange(400, 1500));
    await act(async () => {});
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('safe-area bottom padding is unchanged inside the keyboard wrapper (no double gap)', async () => {
    await prepare('en', 'ios');
    mockInsets = { top: 0, left: 0, right: 0, bottom: 34 };
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/new` });
    await screen.findByTestId('event-save');
    keyboardWrapper();
    expect(StyleSheet.flatten(formScroll().props.contentContainerStyle)).toMatchObject({
      padding: spacing.lg,
      paddingBottom: spacing.lg,
    });
    expectBottomInsetOnMainNavOnly(34);
  });

  it('edit uses the same keyboard-aware form', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(6, 18) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}/edit` });
    await screen.findByTestId('event-save');
    expect(keyboardWrapper().props.behavior).toBe('padding');
  });
});

describe('accessibility', () => {
  it('an event card is a button whose label says type, title, date and time (and Now)', async () => {
    await prepare('en');
    const live = await seedEvent({ type: 'TEAM_TRAINING', startAt: at(5, 17, 30), endAt: at(5, 19) });
    const photo = await seedEvent({ type: 'OTHER', title: 'Photo day', startAt: at(6, 10) });
    const gym = await seedEvent({ type: 'GYM', title: 'Strength', startAt: at(6, 23), endAt: at(7, 1) });
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    const card = await screen.findByTestId(`schedule-event-${live.id}`);
    expect(card.props.accessibilityRole).toBe('button');
    expect(stripBidi(card.props.accessibilityLabel)).toBe('Team training, now, 5 Oct 2026 · 17:30–19:00');
    // OTHER: the title only; a meaningful type follows a title.
    expect(stripBidi(screen.getByTestId(`schedule-event-${photo.id}`).props.accessibilityLabel)).toBe(
      'Photo day, 6 Oct 2026 · 10:00',
    );
    expect(stripBidi(screen.getByTestId(`schedule-event-${gym.id}`).props.accessibilityLabel)).toBe(
      'Strength, Gym, 6 Oct 2026 · 23:00 – 7 Oct 2026 · 01:00',
    );
    expect(StyleSheet.flatten(card.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
  });

  it('form: chips expose selection; date / time fields have descriptive labels and big targets', async () => {
    await openNew('he');
    press('event-type-GYM');
    expect(screen.getByTestId('event-type-GYM').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('event-type-GAME').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('event-sport-BASKETBALL').props.accessibilityState).toMatchObject({
      selected: false,
    });
    const date = screen.getByTestId('event-start-date');
    expect(date.props.accessibilityRole).toBe('button');
    expect(stripBidi(date.props.accessibilityLabel)).toBe('תאריך: יום שני, 5 באוקטובר 2026');
    expect(stripBidi(screen.getByTestId('event-start-time').props.accessibilityLabel)).toBe(
      'שעת התחלה: 18:15',
    );
    expect(StyleSheet.flatten(date.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
    for (const id of ['event-save', 'event-cancel', 'event-add-end']) {
      expect(screen.getByTestId(id).props.accessibilityRole).toBe('button');
    }
    press('event-add-end');
    expect(stripBidi(screen.getByTestId('event-end-date').props.accessibilityLabel)).toBe(
      'תאריך סיום: יום שני, 5 באוקטובר 2026',
    );
    expect(stripBidi(screen.getByTestId('event-end-time').props.accessibilityLabel)).toBe('שעת סיום: 18:15');
    expect(screen.getByTestId('event-remove-end').props.accessibilityRole).toBe('button');
  });
});

describe('completion (CAL-COMP-001: explicit, manual, undoable)', () => {
  const completionRow = (eventId: string) =>
    db!.getFirstAsync('SELECT completed_at, completion_source FROM calendar_events WHERE id = ?', [eventId]);
  /** Every stored column except the two completion ones: what marking must never change. */
  const scheduleRow = async (eventId: string) => {
    const {
      completed_at: _a,
      completion_source: _s,
      ...rest
    } = (await rows()).find((r) => r.id === eventId)!;
    return rest;
  };
  async function openDetails(
    language: 'he' | 'en',
    input: CalendarEventInput = { type: 'GAME', startAt: at(7, 10) },
  ) {
    await prepare(language);
    const event = await seedEvent(input);
    const app = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    await screen.findByTestId('event-completion-section');
    return { app, event };
  }
  const markInRepo = (eventId: string, when = NOW - 2 * HOUR) =>
    calendar.markCalendarEventCompleted(db!, gal, eventId, {
      clock: { wallNow: () => when, monotonicNow: () => 0 },
    });

  it('Hebrew: Mark as completed stores it at once (no dialog), shows ✓ Completed + time and Undo', async () => {
    const { app, event } = await openDetails('he');
    const alert = jest.spyOn(Alert, 'alert');
    const before = await scheduleRow(event.id);
    expect(within(screen.getByTestId('event-complete')).getByText('סימון כהושלם')).toBeTruthy();
    expect(screen.queryByTestId('event-completion-status')).toBeNull();
    expect(screen.queryByTestId('event-uncomplete')).toBeNull();

    press('event-complete');
    expect(await screen.findByTestId('event-completion-status')).toBeTruthy();
    expect(text('event-completion-status')).toBe('✓ הושלם'); // a symbol and a word, not colour alone
    expect(plain('event-completed-at')).toBe('סומן כהושלם: 5 באוק׳ 2026 · 18:10');
    expect(within(screen.getByTestId('event-uncomplete')).getByText('ביטול הסימון')).toBeTruthy();
    expect(screen.queryByTestId('event-complete')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`);
    expect(await completionRow(event.id)).toEqual({ completed_at: NOW, completion_source: 'LOCAL_USER' });
    // The schedule, type, sport, text and updatedAt are untouched.
    expect(await scheduleRow(event.id)).toEqual(before);
  });

  it('English: Undo completion clears it at once (no dialog); Mark is offered again', async () => {
    const { event } = await openDetails('en');
    const alert = jest.spyOn(Alert, 'alert');
    const before = await scheduleRow(event.id);
    expect(within(screen.getByTestId('event-complete')).getByText('Mark as completed')).toBeTruthy();
    press('event-complete');
    await screen.findByTestId('event-uncomplete');
    expect(text('event-completion-status')).toBe('✓ Completed');
    expect(plain('event-completed-at')).toBe('Marked completed: 5 Oct 2026 · 18:10');
    expect(within(screen.getByTestId('event-uncomplete')).getByText('Undo completion')).toBeTruthy();

    press('event-uncomplete');
    await screen.findByTestId('event-complete');
    expect(screen.queryByTestId('event-completion-status')).toBeNull();
    expect(screen.queryByTestId('event-completed-at')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    expect(await completionRow(event.id)).toEqual({ completed_at: null, completion_source: null });
    expect(await scheduleRow(event.id)).toEqual(before);
  });

  it('a past event is NOT shown as completed until the user marks it (time infers nothing)', async () => {
    const { event } = await openDetails('en', {
      type: 'TEAM_TRAINING',
      startAt: at(1, 17),
      endAt: at(1, 19),
    });
    expect(screen.getByTestId('event-complete')).toBeTruthy();
    expect(screen.queryByTestId('event-completion-status')).toBeNull();
    expect(screen.queryByText(/Completed/)).toBeNull();
    expect(await completionRow(event.id)).toEqual({ completed_at: null, completion_source: null });
  });

  it('a stored completion is shown on a fresh open (survives leaving and restarting the screen)', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GYM', startAt: at(4, 9) });
    await markInRepo(event.id, at(4, 11, 5));
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    expect(await screen.findByTestId('event-completion-status')).toBeTruthy();
    expect(plain('event-completed-at')).toBe('Marked completed: 4 Oct 2026 · 11:05');
    expect(screen.getByTestId('event-uncomplete')).toBeTruthy();
  });

  it('a failed mark stays on details, shows a safe message, never shows Completed; retry works', async () => {
    const { app, event } = await openDetails('he');
    const mark = jest
      .spyOn(calendar, 'markCalendarEventCompleted')
      .mockRejectedValueOnce(new Error('SQLITE_FULL'));
    press('event-complete');
    expect(await screen.findByTestId('event-completion-error')).toBeTruthy();
    expect(text('event-completion-error')).toBe('שמירת הסימון לא הצליחה. לא השתנה דבר, אפשר לנסות שוב.');
    expect(screen.queryByText(/SQLITE/)).toBeNull();
    expect(screen.queryByTestId('event-completion-status')).toBeNull();
    expect(screen.queryByTestId('event-uncomplete')).toBeNull();
    expect(isDisabled('event-complete')).toBe(false);
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`);
    expect(await completionRow(event.id)).toEqual({ completed_at: null, completion_source: null });

    press('event-complete'); // retry
    expect(await screen.findByTestId('event-completion-status')).toBeTruthy();
    expect(screen.queryByTestId('event-completion-error')).toBeNull();
    expect(mark).toHaveBeenCalledTimes(2);
    expect(await completionRow(event.id)).toEqual({ completed_at: NOW, completion_source: 'LOCAL_USER' });
  });

  it('a failed undo keeps Completed with a safe message (English); retry works', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(7, 10) });
    await markInRepo(event.id);
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    await screen.findByTestId('event-uncomplete');
    jest.spyOn(calendar, 'undoCalendarEventCompletion').mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    press('event-uncomplete');
    expect(await screen.findByTestId('event-completion-error')).toBeTruthy();
    expect(text('event-completion-error')).toBe(
      'Saving the completion did not work. Nothing changed; you can try again.',
    );
    expect(text('event-completion-status')).toBe('✓ Completed');
    expect(await completionRow(event.id)).toEqual({
      completed_at: NOW - 2 * HOUR,
      completion_source: 'LOCAL_USER',
    });
    press('event-uncomplete');
    await screen.findByTestId('event-complete');
    expect(screen.queryByTestId('event-completion-error')).toBeNull();
    expect(await completionRow(event.id)).toEqual({ completed_at: null, completion_source: null });
  });

  it('while a change is pending its buttons are disabled; a double tap writes once', async () => {
    const { event } = await openDetails('en');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = calendar.markCalendarEventCompleted; // captured before the spy replaces it
    const mark = jest
      .spyOn(calendar, 'markCalendarEventCompleted')
      .mockImplementation(async (...args) => (await gate, original(...args)));
    press('event-complete');
    press('event-complete');
    await waitFor(() => expect(isDisabled('event-complete')).toBe(true));
    expect(within(screen.getByTestId('event-complete')).getByText('Saving…')).toBeTruthy();
    expect(isDisabled('event-edit')).toBe(true);
    expect(isDisabled('event-delete')).toBe(true);
    await act(async () => release());
    await screen.findByTestId('event-uncomplete');
    expect(mark).toHaveBeenCalledTimes(1);
    expect(isDisabled('event-edit')).toBe(false);
    expect(await eventCount()).toBe(1);
    expect(await completionRow(event.id)).toEqual({ completed_at: NOW, completion_source: 'LOCAL_USER' });
  });

  it('every event type can be completed (a titled OTHER too)', async () => {
    await prepare('en');
    for (const type of BUILTIN_ACTIVITY_TYPES) {
      const event = await seedEvent({
        type,
        startAt: at(8, 9),
        title: type === 'OTHER' ? 'Photo day' : undefined,
      });
      const view = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
      await screen.findByTestId('event-complete');
      press('event-complete');
      expect(await screen.findByTestId('event-completion-status')).toBeTruthy();
      expect(await completionRow(event.id)).toEqual({ completed_at: NOW, completion_source: 'LOCAL_USER' });
      view.unmount();
    }
  });

  it('a historical event of a now-inactive sport can be completed and undone', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(2, 17) });
    const off = await players.updatePlayer(
      db!,
      gal,
      { player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } }, basketball: null },
      { clock: seedClock },
    );
    expect(off.ok).toBe(true);
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    await screen.findByTestId('event-complete');
    press('event-complete');
    expect(await screen.findByTestId('event-completion-status')).toBeTruthy();
    expect(screen.queryByTestId('event-completion-error')).toBeNull();
    press('event-uncomplete');
    await screen.findByTestId('event-complete');
    expect(await completionRow(event.id)).toEqual({ completed_at: null, completion_source: null });
  });

  it('editing a completed event keeps it completed (same time); the form has no completion control', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(7, 10), title: 'Cup' });
    await markInRepo(event.id);
    const app = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule/${event.id}` });
    await screen.findByTestId('event-uncomplete');
    press('event-edit');
    await screen.findByTestId('event-save');
    expect(screen.queryByTestId(/^event-(complete|uncomplete|completion)/)).toBeNull();
    fireEvent.changeText(screen.getByTestId('event-title'), 'Cup final');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    await waitFor(() => expect(text('event-details-title')).toBe('Cup final'));
    expect(text('event-completion-status')).toBe('✓ Completed');
    expect(await completionRow(event.id)).toEqual({
      completed_at: NOW - 2 * HOUR,
      completion_source: 'LOCAL_USER',
    });
  });

  it('agenda: a completed card shows ✓ + word and says so to a screen reader; nothing moves', async () => {
    await prepare('en');
    const live = await seedEvent({ type: 'TEAM_TRAINING', startAt: at(5, 17, 30), endAt: at(5, 19) });
    const future = await seedEvent({ type: 'GAME', startAt: at(7, 10) });
    const later = await seedEvent({ type: 'GYM', startAt: at(8, 10) });
    const past = await seedEvent({ type: 'RECOVERY', startAt: at(3, 9) });
    const older = await seedEvent({ type: 'GYM', startAt: at(2, 9) });
    const cardIds = (section: string) =>
      within(screen.getByTestId(section))
        .getAllByTestId(/^schedule-event-[^-]+-[^-]+-[^-]+-[^-]+-[^-]+$/)
        .map((n) => n.props.testID.replace('schedule-event-', ''));
    const first = renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId('schedule-upcoming');
    const sections = { up: cardIds('schedule-upcoming'), past: cardIds('schedule-past') };
    expect(sections).toEqual({ up: [live.id, future.id, later.id], past: [past.id, older.id] });
    expect(screen.queryAllByTestId(/-completed$/)).toHaveLength(0);
    first.unmount();

    // A future, an in-progress and a past event marked; one past left unmarked.
    for (const e of [future, live, past]) await markInRepo(e.id);
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId('schedule-upcoming');
    expect({ up: cardIds('schedule-upcoming'), past: cardIds('schedule-past') }).toEqual(sections);
    expect(screen.getAllByTestId(/-completed$/).map((n) => n.props.testID)).toEqual([
      `schedule-event-${live.id}-completed`,
      `schedule-event-${future.id}-completed`,
      `schedule-event-${past.id}-completed`,
    ]);
    expect(text(`schedule-event-${future.id}-completed`)).toBe('✓ Completed');
    const label = (e: { id: string }) =>
      stripBidi(screen.getByTestId(`schedule-event-${e.id}`).props.accessibilityLabel);
    expect(label(future)).toBe('Game, 7 Oct 2026 · 10:00, completed');
    expect(label(live)).toBe('Team training, now, 5 Oct 2026 · 17:30–19:00, completed');
    expect(label(older)).toBe('Gym, 2 Oct 2026 · 09:00'); // not completed: unchanged
    expect(text(`schedule-event-${live.id}-now`)).toBe('Now'); // still current
  });

  it('agenda (Hebrew): the completed badge and screen-reader text are localized', async () => {
    await prepare('he');
    const event = await seedEvent({ type: 'GAME', startAt: at(7, 10) });
    await markInRepo(event.id);
    renderRouter(routes as never, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId(`schedule-event-${event.id}-completed`);
    expect(text(`schedule-event-${event.id}-completed`)).toBe('✓ הושלם');
    expect(stripBidi(screen.getByTestId(`schedule-event-${event.id}`).props.accessibilityLabel)).toMatch(
      /^משחק, .*, הושלם$/,
    );
  });

  it('the completion controls are big buttons (≥ 56dp) with a button role', async () => {
    await openDetails('en');
    const mark = screen.getByTestId('event-complete');
    expect(mark.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(mark.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
    press('event-complete');
    const undo = await screen.findByTestId('event-uncomplete');
    expect(undo.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(undo.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
  });
});

describe('calendar UI boundaries (source guards)', () => {
  const root = resolve(__dirname, '../../..');
  const files = [
    ...readdirSync(join(root, 'src/features/calendar'))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => `src/features/calendar/${f}`),
    'src/ui/DateTimeField.tsx',
    'src/app/children/[id]/schedule/index.tsx',
    'src/app/children/[id]/schedule/new.tsx',
    'src/app/children/[id]/schedule/[eventId]/index.tsx',
    'src/app/children/[id]/schedule/[eventId]/edit.tsx',
    'src/app/calendar.tsx',
  ];
  const code = (file: string) =>
    readFileSync(join(root, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it.each(files)('%s: clock / local time only, no SQL, no own sectioning or ordering', (file) => {
    const source = code(file);
    expect(source).not.toMatch(/Date\.now|toISOString|Date\.UTC|getUTC|timeZone/);
    expect(source).not.toMatch(
      /\b(SELECT|INSERT|UPDATE|DELETE)\b|runAsync|getAllAsync|getFirstAsync|execAsync/,
    );
    expect(source).not.toMatch(/\.sort\(|agendaSection|CURRENT_OR_UPCOMING/);
    // Stored type codes come from the Activity Type catalog; no feature file names one.
    expect(source).not.toMatch(
      /['"`](TEAM_TRAINING|PERSONAL_TRAINING|GAME|GYM|RECOVERY|SCHOOL|UNAVAILABLE)['"`]/,
    );
    expect(source).not.toMatch(/expo-calendar|CALENDAR_PERMISSION|READ_CALENDAR|WRITE_CALENDAR/);
  });

  it('the feature uses the domain splitAgenda for sections', () => {
    expect(code('src/features/calendar/CalendarAgenda.tsx')).toMatch(/splitAgenda\(events, now\)/);
    expect(code('src/features/calendar/ScheduleSection.tsx')).toMatch(/splitAgenda\(events, now\)/);
  });

  it('no device-calendar permission or dependency', () => {
    const config =
      readFileSync(join(root, 'app.json'), 'utf8') + readFileSync(join(root, 'package.json'), 'utf8');
    expect(config).not.toMatch(/expo-calendar|READ_CALENDAR|WRITE_CALENDAR|NSCalendarsUsageDescription/);
  });
});
