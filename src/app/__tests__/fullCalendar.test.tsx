import { resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, I18nManager, Platform, ScrollView, StyleSheet, type AlertButton } from 'react-native';

import * as calendar from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import { CALENDAR_EVENT_TYPES, type CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import { PLAYER_PALETTE, TYPE_COLORS, TYPE_GLYPHS } from '@/features/calendar/calendarColors';
import { MAIN_DESTINATIONS, screenStack } from '@/features/navigation/mainDestinations';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { expectBottomInsetOnMainNavOnly } from '@/test-support/mainNav';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import { spacing, touch } from '@/ui/theme';

/**
 * The Full Calendar (CAL-VIEW-001 / CAL-FILTER-001 / CAL-COLOR-001) through
 * the real route tree, real SQLite and both languages. Wiring and logic only:
 * the look on a phone (cell size, RTL mirroring, colours) is a physical check.
 */
let mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

const routes = appRoutes(resolve(__dirname, '..')) as never;
const HOUR = 3_600_000;
/** A local wall time in October 2026 (timezone-independent). */
const at = (day: number, hour = 0, minute = 0, month = 10, year = 2026) =>
  new Date(year, month - 1, day, hour, minute).getTime();
const NOW = at(5, 18, 10); // Monday 5 October 2026, 18:10 local

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid; // Basketball, created first
let noa: Uuid; // no sport, second
let tom: Uuid; // no sport, third
const seedIds = createSequentialIdService();
const seedClock = { wallNow: () => NOW - HOUR, monotonicNow: () => 0 };
const GAL: players.PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG' },
};

async function prepare(language: 'he' | 'en', playerCount = 3) {
  mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const seed = async (input: players.PlayerProfileInput, minutes: number) => {
    const clock = { wallNow: () => NOW - 24 * HOUR + minutes * 60_000, monotonicNow: () => 0 };
    const result = await players.createPlayer(opened, input, { ids: seedIds, clock });
    if (!result.ok) throw new Error('seed failed');
    return result.profile.player.id;
  };
  const people = [
    () => seed(GAL, 1),
    () =>
      seed({ player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } }, basketball: null }, 2),
    () =>
      seed({ player: { name: 'Tom', dateOfBirth: { year: 2017, month: 3, day: 4 } }, basketball: null }, 3),
  ];
  const created: Uuid[] = [];
  for (const make of people.slice(0, playerCount)) created.push(await make());
  [gal, noa, tom] = created as [Uuid, Uuid, Uuid];
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

async function seedEvent(input: CalendarEventInput, playerId: Uuid = gal) {
  const result = await calendar.createCalendarEvent(db!, playerId, input, { ids: seedIds, clock: seedClock });
  if (!result.ok) throw new Error(`seed failed: ${JSON.stringify(result.errors)}`);
  return result.event;
}

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const plain = (testID: string) => stripBidi(text(testID));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const isSelected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const label = (testID: string) => stripBidi(screen.getByTestId(testID).props.accessibilityLabel);
const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const day = (key: string) => `calendar-day-${key}`;
/** Every day cell shown, in order. */
const dayKeys = () =>
  screen
    .getAllByTestId(/^calendar-day-\d{4}-\d{2}-\d{2}$/)
    .map((n) => n.props.testID.replace('calendar-day-', ''));
/** The selected day's event rows, in order. */
const listed = () =>
  within(screen.getByTestId('calendar-day-list'))
    .queryAllByTestId(/^calendar-event-[0-9a-f-]{36}$/)
    .map((n) => n.props.testID.replace('calendar-event-', ''));
const markerText = (testID: string) =>
  String(within(screen.getByTestId(testID)).getByText(/.+/).props.children);
const markerColor = (testID: string) => style(testID).backgroundColor;

async function openCalendar(language: 'he' | 'en' = 'en') {
  const app = renderRouter(routes, { initialUrl: '/calendar' });
  await screen.findByTestId('calendar-day-list');
  void language;
  return app;
}
/** Waits until the shown range has loaded (its period title and the day list are in place). */
const loaded = () => waitFor(() => expect(screen.getByTestId('calendar-day-list')).toBeTruthy());
async function selectDay(key: string) {
  press(day(key));
  await waitFor(() => expect(isSelected(day(key))).toBe(true));
}
async function setFilter(group: 'player' | 'sport' | 'type', value: string) {
  if (!screen.queryByTestId('calendar-filters')) press('calendar-filters-toggle');
  press(`calendar-filter-${group}-${value}`);
}

describe('entry and navigation (no fifth main tab)', () => {
  it('Hebrew: Home has a Calendar entry that opens the Full Calendar; Home stays the selected tab; Back returns Home', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: '/' });
    const entry = await screen.findByTestId('home-calendar');
    expect(within(entry).getByText('לוח שנה')).toBeTruthy();
    fireEvent.press(entry);
    await screen.findByTestId('calendar-day-list');
    expect(app.getPathname()).toBe('/calendar');
    expect(MAIN_DESTINATIONS.map((d) => d.key)).toEqual(['home', 'players', 'exercises', 'settings']);
    expect(screen.getAllByRole('tab', { name: /בית|שחקנים|תרגילים|הגדרות/ })).toHaveLength(4);
    expect(screen.getByTestId('main-nav-home').props.accessibilityState.selected).toBe(true);
    expect(screenStack(app.getRouterState()).routes).toEqual(['index', 'calendar']);
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('the main navigation stays correct and keeps clear of the bottom inset (screen content does not add it)', async () => {
    await prepare('en');
    mockInsets = { top: 0, left: 0, right: 0, bottom: 48 };
    await openCalendar();
    expectBottomInsetOnMainNavOnly(48);
    const scroll = screen.UNSAFE_getAllByType(ScrollView).find((n) => n.props.testID === 'calendar-scroll')!;
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(spacing.sm);
  });
});

describe('Month view', () => {
  it('Hebrew: the month, the weekdays from Sunday, whole weeks, today marked by more than colour', async () => {
    await prepare('he');
    await openCalendar('he');
    expect(I18nManager.isRTL).toBe(true); // rows mirror (flexDirection: row under RTL)
    expect(plain('calendar-period')).toBe('אוקטובר 2026');
    expect(isSelected('calendar-mode-MONTH')).toBe(true);
    expect(isSelected('calendar-mode-WEEK')).toBe(false);
    expect(within(screen.getByTestId('calendar-mode-MONTH')).getByText('חודש')).toBeTruthy();
    expect(within(screen.getByTestId('calendar-mode-WEEK')).getByText('שבוע')).toBeTruthy();
    expect(within(screen.getByTestId('calendar-today')).getByText('היום')).toBeTruthy();
    const weekdays = screen.getAllByTestId(/^calendar-weekday-/).map((n) => String(n.props.children));
    expect(weekdays).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']);
    const keys = dayKeys();
    expect(keys).toHaveLength(35);
    expect([keys[0], keys.at(-1)]).toEqual(['2026-09-27', '2026-10-31']);
    // Today: selected, a ring and the word "today" for screen readers.
    expect(label(day('2026-10-05'))).toBe('יום שני, 5 באוקטובר 2026, אין אירועים, היום');
    expect(isSelected(day('2026-10-05'))).toBe(true);
    expect(style(day('2026-10-05')).borderWidth).toBeGreaterThan(style(day('2026-10-06')).borderWidth);
    expect(text('calendar-day-heading')).toBe('יום שני, 5 באוקטובר 2026');
    // Days of the neighbouring months are muted (and still selectable).
    expect(style(`${day('2026-09-27')}-number`).opacity).toBe(0.6);
    expect(style(`${day('2026-10-01')}-number`).opacity).toBeUndefined();
    expect(text('calendar-empty-range')).toBe('אין אירועים בחודש הזה.');
    expect(text('calendar-day-empty')).toBe('אין אירועים ביום הזה.');
    expect(screen.getByTestId('calendar-prev').props.accessibilityLabel).toBe('החודש הקודם');
    expect(screen.getByTestId('calendar-next').props.accessibilityLabel).toBe('החודש הבא');
  });

  it('English: labels, weekday names, previous / next month over a year boundary, and Today', async () => {
    await prepare('en');
    const jan = await seedEvent({ type: 'GAME', startAt: at(9, 10, 0, 1, 2027) });
    await openCalendar();
    expect(plain('calendar-period')).toBe('October 2026');
    expect(screen.getAllByTestId(/^calendar-weekday-/).map((n) => String(n.props.children))).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(within(screen.getByTestId('calendar-mode-MONTH')).getByText('Month')).toBeTruthy();
    expect(within(screen.getByTestId('calendar-filters-toggle')).getByText('Filters')).toBeTruthy();
    press('calendar-prev');
    await waitFor(() => expect(plain('calendar-period')).toBe('September 2026'));
    for (const month of ['October 2026', 'November 2026', 'December 2026', 'January 2027']) {
      press('calendar-next');
      await waitFor(() => expect(plain('calendar-period')).toBe(month));
    }
    expect(dayKeys()[0]).toBe('2026-12-27');
    expect(dayKeys().at(-1)).toBe('2027-02-06');
    // The new range is loaded: January's game shows on its day.
    await waitFor(() => expect(screen.getByTestId(`${day('2027-01-09')}-marker-0`)).toBeTruthy());
    await selectDay('2027-01-09');
    expect(listed()).toEqual([jan.id]);
    press('calendar-today');
    await waitFor(() => expect(plain('calendar-period')).toBe('October 2026'));
    expect(isSelected(day('2026-10-05'))).toBe(true);
  });

  it('a day with more events than fit shows two markers and "+N"; the day list shows them all, in time order', async () => {
    await prepare('en');
    const late = await seedEvent({ type: 'GYM', startAt: at(6, 19) }, noa);
    const early = await seedEvent({ type: 'GAME', startAt: at(6, 8) });
    const mid = await seedEvent({ type: 'RECOVERY', startAt: at(6, 12) }, tom);
    await openCalendar();
    expect(markerText(`${day('2026-10-06')}-marker-0`)).toBe('G');
    expect(markerText(`${day('2026-10-06')}-marker-1`)).toBe('T');
    expect(screen.queryByTestId(`${day('2026-10-06')}-marker-2`)).toBeNull();
    expect(plain(`${day('2026-10-06')}-more`)).toBe('+1');
    expect(label(day('2026-10-06'))).toBe('Tuesday, 6 October 2026, 3 events');
    expect(label(day('2026-10-07'))).toBe('Wednesday, 7 October 2026, no events');
    await selectDay('2026-10-06');
    expect(text('calendar-day-heading')).toBe('Tuesday, 6 October 2026');
    expect(listed()).toEqual([early.id, mid.id, late.id]);
    expect(text(`calendar-event-${early.id}-player`)).toBe('Gal');
    expect(text(`calendar-event-${late.id}-player`)).toBe('Noa');
    expect(plain(`calendar-event-${early.id}-when`)).toBe('6 Oct 2026 · 08:00');
  });

  it('a day outside the month can be chosen: the month follows it', async () => {
    await prepare('en');
    await openCalendar();
    await selectDay('2026-09-28');
    await waitFor(() => expect(plain('calendar-period')).toBe('September 2026'));
  });
});

describe('local dates: an event shows on every local day it overlaps — [start, end)', () => {
  it('same-day, overnight, ending exactly at midnight, multi-day and no-end events', async () => {
    await prepare('en');
    const same = await seedEvent({ type: 'GYM', startAt: at(6, 9), endAt: at(6, 10) });
    const overnight = await seedEvent({ type: 'GAME', startAt: at(6, 23), endAt: at(7, 1) });
    const toMidnight = await seedEvent({ type: 'TEAM_TRAINING', startAt: at(8, 22), endAt: at(9) });
    const camp = await seedEvent({ type: 'OTHER', title: 'Camp', startAt: at(12, 9), endAt: at(14, 17) });
    const noEnd = await seedEvent({ type: 'RECOVERY', startAt: at(15, 23, 30) });
    await openCalendar();
    const days: Record<string, string[]> = {};
    for (const key of ['06', '07', '08', '09', '11', '12', '13', '14', '15', '16']) {
      await selectDay(`2026-10-${key}`);
      days[key] = listed();
    }
    expect(days).toEqual({
      '06': [same.id, overnight.id],
      '07': [overnight.id],
      '08': [toMidnight.id],
      '09': [], // ended exactly at midnight: not on the 9th
      '11': [],
      '12': [camp.id],
      '13': [camp.id],
      '14': [camp.id],
      '15': [noEnd.id],
      '16': [],
    });
    // Nothing about the events was changed to display them.
    expect((await calendar.listCalendarEvents(db!, gal)).map((e) => [e.startAt, e.endAt])).toEqual([
      [at(6, 9), at(6, 10)],
      [at(6, 23), at(7, 1)],
      [at(8, 22), at(9)],
      [at(12, 9), at(14, 17)],
      [at(15, 23, 30), null],
    ]);
  });
});

describe('events open the existing Event Details', () => {
  it('tapping an event pushes the existing details route; Back returns to the calendar', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(5, 20) }, noa);
    const app = await openCalendar();
    expect(listed()).toEqual([event.id]);
    press(`calendar-event-${event.id}`);
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${noa}/schedule/${event.id}`));
    expect(screenStack(app.getRouterState()).routes).toEqual([
      'calendar',
      'children/[id]/schedule/[eventId]/index',
    ]);
    expect(await screen.findByTestId('event-completion-section')).toBeTruthy(); // the existing screen
    expect(text('event-details-type')).toBe('Game');
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/calendar'));
    expect(await screen.findByTestId(`calendar-event-${event.id}`)).toBeTruthy();
  });

  it('completion from Details shows on return; the event stays on its scheduled day and in order', async () => {
    await prepare('en');
    const first = await seedEvent({ type: 'GYM', startAt: at(5, 7) });
    const target = await seedEvent({ type: 'GAME', startAt: at(5, 20) }, noa);
    const app = await openCalendar();
    expect(screen.queryByTestId(`calendar-event-${target.id}-completed`)).toBeNull();
    press(`calendar-event-${target.id}`);
    fireEvent.press(await screen.findByTestId('event-complete'));
    await screen.findByTestId('event-uncomplete');
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/calendar'));
    expect(await screen.findByTestId(`calendar-event-${target.id}-completed`)).toBeTruthy();
    expect(text(`calendar-event-${target.id}-completed`)).toBe('✓ Completed');
    expect(listed()).toEqual([first.id, target.id]);
    expect(label(`calendar-event-${target.id}`)).toBe('Noa, Game, 5 Oct 2026 · 20:00, completed');
    expect(label(`calendar-event-${first.id}`)).toBe('Gal, Gym, 5 Oct 2026 · 07:00');
  });

  it('a completed event stays on its scheduled date, not the day it was marked', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(7, 18), endAt: at(7, 20) });
    const markedOn = at(5, 9); // marked two days early
    await calendar.markCalendarEventCompleted(db!, gal, event.id, {
      clock: { wallNow: () => markedOn, monotonicNow: () => 0 },
    });
    await openCalendar();
    expect(listed()).toEqual([]); // the 5th (today) does not get it
    expect(screen.queryByTestId(`${day('2026-10-05')}-marker-0`)).toBeNull();
    expect(screen.getByTestId(`${day('2026-10-07')}-marker-0`)).toBeTruthy();
    await selectDay('2026-10-07');
    expect(listed()).toEqual([event.id]);
    expect(text(`calendar-event-${event.id}-completed`)).toBe('✓ Completed');
  });

  it('deleting from Details opened here returns to the calendar, without the event', async () => {
    await prepare('en');
    const keep = await seedEvent({ type: 'GYM', startAt: at(5, 7) });
    const gone = await seedEvent({ type: 'GAME', startAt: at(5, 20) });
    const app = await openCalendar();
    press(`calendar-event-${gone.id}`);
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons: AlertButton[] = []) => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    fireEvent.press(await screen.findByTestId('event-delete'));
    await waitFor(() => expect(app.getPathname()).toBe('/calendar'));
    expect(screenStack(app.getRouterState()).routes).toEqual(['calendar']);
    await waitFor(() => expect(listed()).toEqual([keep.id]));
  });
});

describe('Week view', () => {
  it('seven days from Sunday, the selected day’s events, previous / next / Today (English)', async () => {
    await prepare('en');
    const tue = await seedEvent({ type: 'GAME', startAt: at(6, 17), endAt: at(6, 19) });
    const prevWeek = await seedEvent({ type: 'GYM', startAt: at(30, 9, 0, 9) }, noa);
    await openCalendar();
    press('calendar-mode-WEEK');
    await waitFor(() => expect(isSelected('calendar-mode-WEEK')).toBe(true));
    expect(screen.getByTestId('calendar-week')).toBeTruthy();
    expect(dayKeys()).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
    expect(plain('calendar-period')).toBe('4 Oct 2026 – 10 Oct 2026');
    expect(screen.getByTestId('calendar-prev').props.accessibilityLabel).toBe('Previous week');
    expect(isSelected(day('2026-10-05'))).toBe(true);
    expect(markerText(`${day('2026-10-06')}-marker-0`)).toBe('G');
    await selectDay('2026-10-06');
    expect(listed()).toEqual([tue.id]);
    expect(plain(`calendar-event-${tue.id}-when`)).toBe('6 Oct 2026 · 17:00–19:00');
    press('calendar-prev');
    await waitFor(() => expect(plain('calendar-period')).toBe('27 Sept 2026 – 3 Oct 2026'));
    await selectDay('2026-09-30');
    await waitFor(() => expect(listed()).toEqual([prevWeek.id]));
    press('calendar-next');
    press('calendar-next');
    await waitFor(() => expect(plain('calendar-period')).toBe('11 Oct 2026 – 17 Oct 2026'));
    press('calendar-today');
    await waitFor(() => expect(plain('calendar-period')).toBe('4 Oct 2026 – 10 Oct 2026'));
    expect(isSelected(day('2026-10-05'))).toBe(true);
  });

  it('Hebrew: week labels; an overnight event across the week end shows in both weeks', async () => {
    await prepare('he');
    const overnight = await seedEvent({ type: 'GAME', startAt: at(10, 23), endAt: at(11, 1) });
    await openCalendar('he');
    press('calendar-mode-WEEK');
    await waitFor(() => expect(plain('calendar-period')).toBe('4 באוק׳ 2026 – 10 באוק׳ 2026'));
    expect(screen.getByTestId('calendar-next').props.accessibilityLabel).toBe('השבוע הבא');
    await selectDay('2026-10-10');
    expect(listed()).toEqual([overnight.id]);
    press('calendar-next');
    await waitFor(() => expect(plain('calendar-period')).toBe('11 באוק׳ 2026 – 17 באוק׳ 2026'));
    await selectDay('2026-10-11');
    await waitFor(() => expect(listed()).toEqual([overnight.id]));
    await selectDay('2026-10-12');
    expect(listed()).toEqual([]);
    expect(text('calendar-day-empty')).toBe('אין אירועים ביום הזה.');
    press('calendar-next');
    await waitFor(() => expect(plain('calendar-period')).toBe('18 באוק׳ 2026 – 24 באוק׳ 2026'));
    expect(await screen.findByTestId('calendar-empty-range')).toBeTruthy();
    expect(text('calendar-empty-range')).toBe('אין אירועים בשבוע הזה.');
  });
});

describe('filters: AND across Player / Sport / Activity type, OR inside one', () => {
  async function seedMix() {
    const galGame = await seedEvent({ type: 'GAME', sport: 'BASKETBALL', startAt: at(6, 8) });
    const galGym = await seedEvent({ type: 'GYM', startAt: at(6, 10) });
    const noaGame = await seedEvent({ type: 'GAME', startAt: at(6, 12) }, noa);
    const tomRecovery = await seedEvent({ type: 'RECOVERY', startAt: at(6, 14) }, tom);
    return { galGame, galGym, noaGame, tomRecovery };
  }
  const allIds = (e: Awaited<ReturnType<typeof seedMix>>) => [
    e.galGame.id,
    e.galGym.id,
    e.noaGame.id,
    e.tomRecovery.id,
  ];

  it('default All; one Player; several Players (OR); clearing; the active filter is always visible', async () => {
    await prepare('en');
    const e = await seedMix();
    await openCalendar();
    await selectDay('2026-10-06');
    expect(listed()).toEqual(allIds(e));
    expect(screen.queryByTestId('calendar-filters-summary')).toBeNull();
    press('calendar-filters-toggle');
    expect(isSelected('calendar-filter-player-ALL')).toBe(true);
    expect(plain('calendar-filter-player-ALL-label')).toBe('✓ All');
    await setFilter('player', noa);
    await waitFor(() => expect(listed()).toEqual([e.noaGame.id]));
    expect(isSelected(`calendar-filter-player-${noa}`)).toBe(true);
    expect(plain(`calendar-filter-player-${noa}-label`)).toBe('✓ Noa'); // not colour alone
    expect(isSelected('calendar-filter-player-ALL')).toBe(false);
    expect(plain('calendar-filters-summary')).toBe('Showing only: Noa');
    expect(plain('calendar-filters-toggle-label')).toBe('Filters (1)');
    await setFilter('player', tom);
    await waitFor(() => expect(listed()).toEqual([e.noaGame.id, e.tomRecovery.id]));
    expect(plain('calendar-filters-summary')).toBe('Showing only: Noa, Tom');
    press('calendar-filters-clear');
    await waitFor(() => expect(listed()).toEqual(allIds(e)));
    expect(screen.queryByTestId('calendar-filters-summary')).toBeNull();
    expect(screen.queryByTestId('calendar-filters-clear')).toBeNull();
    expect(isSelected('calendar-filter-player-ALL')).toBe(true);
  });

  it('Sport: the stored sport; "No sport" as its own value; both = OR', async () => {
    await prepare('en');
    const e = await seedMix();
    await openCalendar();
    await selectDay('2026-10-06');
    await setFilter('sport', 'BASKETBALL');
    await waitFor(() => expect(listed()).toEqual([e.galGame.id]));
    await setFilter('sport', 'NONE');
    await waitFor(() => expect(listed()).toEqual(allIds(e)));
    await setFilter('sport', 'BASKETBALL'); // off again: No sport only
    await waitFor(() => expect(listed()).toEqual([e.galGym.id, e.noaGame.id, e.tomRecovery.id]));
    expect(plain('calendar-filters-summary')).toBe('Showing only: No sport');
  });

  it('Activity type, combined with Player (AND); the same filter applies to Week', async () => {
    await prepare('en');
    const e = await seedMix();
    await openCalendar();
    await selectDay('2026-10-06');
    await setFilter('type', 'GAME');
    await waitFor(() => expect(listed()).toEqual([e.galGame.id, e.noaGame.id]));
    await setFilter('player', gal);
    await waitFor(() => expect(listed()).toEqual([e.galGame.id]));
    expect(plain('calendar-filters-summary')).toBe('Showing only: Gal, Game');
    expect(plain('calendar-filters-toggle-label')).toBe('Filters (2)');
    // Week: same day, same result; the month cell and the week cell agree.
    expect(screen.queryByTestId(`${day('2026-10-06')}-marker-1`)).toBeNull();
    press('calendar-mode-WEEK');
    await waitFor(() => expect(screen.getByTestId('calendar-week')).toBeTruthy());
    expect(listed()).toEqual([e.galGame.id]);
    expect(screen.getByTestId(`${day('2026-10-06')}-marker-0`)).toBeTruthy();
    expect(screen.queryByTestId(`${day('2026-10-06')}-marker-1`)).toBeNull();
  });

  it('nothing matches: a safe message; data untouched; Clear brings everything back', async () => {
    await prepare('en');
    const e = await seedMix();
    const before = await db!.getAllAsync('SELECT * FROM calendar_events ORDER BY id');
    await openCalendar();
    await setFilter('player', noa);
    await setFilter('type', 'GYM');
    expect(await screen.findByTestId('calendar-no-match')).toBeTruthy();
    expect(text('calendar-no-match')).toBe('No events match these filters.');
    await selectDay('2026-10-06');
    expect(listed()).toEqual([]);
    expect(await db!.getAllAsync('SELECT * FROM calendar_events ORDER BY id')).toEqual(before);
    press('calendar-filters-clear');
    await waitFor(() => expect(listed()).toEqual(allIds(e)));
  });

  it('Hebrew filter labels; an inactive sport’s history stays visible and filterable', async () => {
    await prepare('he');
    const history = await seedEvent({ type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(6, 17) });
    expect(
      (await players.updatePlayer(db!, gal, { ...GAL, basketball: null }, { clock: seedClock })).ok,
    ).toBe(true);
    await openCalendar('he');
    expect(within(screen.getByTestId('calendar-filters-toggle')).getByText('סינון')).toBeTruthy();
    press('calendar-filters-toggle');
    const group = (id: string) => within(screen.getByTestId(id));
    expect(group('calendar-filter-player').getByText('שחקן')).toBeTruthy();
    expect(group('calendar-filter-sport').getByText('ענף')).toBeTruthy();
    expect(group('calendar-filter-type').getByText('סוג פעילות')).toBeTruthy();
    expect(plain('calendar-filter-type-ALL-label')).toBe('✓ הכל');
    expect(text('calendar-filter-sport-NONE-label')).toBe('ללא ענף');
    expect(text('calendar-filter-sport-BASKETBALL-label')).toBe('כדורסל');
    expect(text('calendar-filter-type-GAME-label')).toBe('משחק');
    press('calendar-filter-sport-BASKETBALL');
    await selectDay('2026-10-06');
    await waitFor(() => expect(listed()).toEqual([history.id]));
    expect(text(`calendar-event-${history.id}-sport`)).toBe('כדורסל');
    expect(plain('calendar-filters-summary')).toBe('מוצגים רק: כדורסל');
    expect(within(screen.getByTestId('calendar-filters-clear')).getByText('ניקוי הסינון')).toBeTruthy();
    press('calendar-filter-sport-NONE');
    press('calendar-filter-sport-BASKETBALL');
    expect(await screen.findByTestId('calendar-no-match')).toBeTruthy();
    expect(text('calendar-no-match')).toBe('אין אירועים שמתאימים לסינון.');
  });
});

describe('colours (CAL-COLOR-001): Player when several can show, activity type when one', () => {
  it('several Players: each Player’s colour by creation order — whatever the type — with its initial', async () => {
    await prepare('en');
    const galGame = await seedEvent({ type: 'GAME', startAt: at(6, 8) });
    const noaGame = await seedEvent({ type: 'GAME', startAt: at(6, 9) }, noa);
    const galGym = await seedEvent({ type: 'GYM', startAt: at(7, 9) });
    await openCalendar();
    expect(text('calendar-legend-title')).toBe('Colors show the player');
    expect(markerColor(`${day('2026-10-06')}-marker-0`)).toBe(PLAYER_PALETTE[0]);
    expect(markerColor(`${day('2026-10-06')}-marker-1`)).toBe(PLAYER_PALETTE[1]);
    expect(markerColor(`${day('2026-10-07')}-marker-0`)).toBe(PLAYER_PALETTE[0]); // Gal again, another type
    expect(markerText(`${day('2026-10-07')}-marker-0`)).toBe('G');
    await selectDay('2026-10-06');
    expect(style(`calendar-event-${galGame.id}-stripe`).backgroundColor).toBe(PLAYER_PALETTE[0]);
    expect(style(`calendar-event-${noaGame.id}-stripe`).backgroundColor).toBe(PLAYER_PALETTE[1]);
    for (const [id, initial, name] of [
      [gal, 'G', 'Gal'],
      [noa, 'N', 'Noa'],
      [tom, 'T', 'Tom'],
    ] as const) {
      expect(within(screen.getByTestId(`calendar-legend-${id}`)).getByText(initial)).toBeTruthy();
      expect(within(screen.getByTestId(`calendar-legend-${id}`)).getByText(name)).toBeTruthy();
    }
    void galGym;
  });

  it('stable: a rename, a re-render, navigation and a filter that leaves several Players keep each colour', async () => {
    await prepare('en');
    await seedEvent({ type: 'GAME', startAt: at(6, 8) }, tom);
    const app = await openCalendar();
    expect(markerColor(`${day('2026-10-06')}-marker-0`)).toBe(PLAYER_PALETTE[2]);
    // Rename Tom (created third) to a name that sorts first.
    const renamed = await players.updatePlayer(
      db!,
      tom,
      { player: { name: 'Aaron', dateOfBirth: { year: 2017, month: 3, day: 4 } }, basketball: null },
      { clock: seedClock },
    );
    expect(renamed.ok).toBe(true);
    press('calendar-next');
    await waitFor(() => expect(plain('calendar-period')).toBe('November 2026'));
    press('calendar-prev');
    await waitFor(() => expect(markerText(`${day('2026-10-06')}-marker-0`)).toBe('A'));
    expect(markerColor(`${day('2026-10-06')}-marker-0`)).toBe(PLAYER_PALETTE[2]);
    // Leave and come back (a fresh mount).
    act(() => router.push('/settings'));
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    act(() => router.back());
    await waitFor(() => expect(markerColor(`${day('2026-10-06')}-marker-0`)).toBe(PLAYER_PALETTE[2]));
    await setFilter('player', noa);
    await setFilter('player', tom);
    await waitFor(() => expect(text('calendar-legend-title')).toBe('Colors show the player'));
    expect(markerColor(`${day('2026-10-06')}-marker-0`)).toBe(PLAYER_PALETTE[2]);
  });

  it('one Player selected: colours (and glyphs) show the activity type, the same for every type', async () => {
    await prepare('en');
    const events = [];
    for (const [i, type] of CALENDAR_EVENT_TYPES.entries()) {
      events.push(
        await seedEvent(
          { type, startAt: at(4 + i, 9), title: type === 'OTHER' ? 'Photo day' : undefined },
          noa,
        ),
      );
    }
    await seedEvent({ type: 'GAME', startAt: at(4, 10) }); // Gal's: filtered out
    await openCalendar();
    await setFilter('player', noa);
    await waitFor(() => expect(text('calendar-legend-title')).toBe('Colors show the activity type'));
    for (const [i, type] of CALENDAR_EVENT_TYPES.entries()) {
      const marker = `${day(`2026-10-0${4 + i}`)}-marker-0`;
      expect(markerColor(marker)).toBe(TYPE_COLORS[type]);
      expect(markerText(marker)).toBe(TYPE_GLYPHS[type]);
      expect(within(screen.getByTestId(`calendar-legend-${type}`)).getByText(TYPE_GLYPHS[type])).toBeTruthy();
      expect(screen.queryByTestId(`${day(`2026-10-0${4 + i}`)}-marker-1`)).toBeNull();
    }
    expect(new Set(Object.values(TYPE_COLORS)).size).toBe(6);
    // OTHER keeps its own title; every type is still written out in the day list.
    await selectDay('2026-10-09');
    expect(text(`calendar-event-${events[5]!.id}-heading`)).toBe('Photo day');
    await selectDay('2026-10-06');
    expect(text(`calendar-event-${events[2]!.id}-heading`)).toBe('Game');
  });

  it('a family with one Player: activity-type colours without any filter', async () => {
    await prepare('en', 1);
    await seedEvent({ type: 'RECOVERY', startAt: at(6, 9) });
    await openCalendar();
    expect(text('calendar-legend-title')).toBe('Colors show the activity type');
    expect(markerColor(`${day('2026-10-06')}-marker-0`)).toBe(TYPE_COLORS.RECOVERY);
  });

  it('meaning never depends on colour: markers, rows, modes and chips all carry text / state', async () => {
    await prepare('en');
    const event = await seedEvent(
      { type: 'GYM', title: 'Strength', startAt: at(5, 9), endAt: at(5, 10) },
      tom,
    );
    await openCalendar();
    const row = screen.getByTestId(`calendar-event-${event.id}`);
    expect(row.props.accessibilityRole).toBe('button');
    expect(label(`calendar-event-${event.id}`)).toBe('Tom, Strength, Gym, 5 Oct 2026 · 09:00–10:00');
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
    expect(markerText(`calendar-event-${event.id}-marker`)).toBe('T');
    expect(text(`calendar-event-${event.id}-player`)).toBe('Tom');
    expect(text(`calendar-event-${event.id}-type`)).toBe('Gym');
    expect(screen.getByTestId('calendar-mode-MONTH').props.accessibilityRole).toBe('tab');
    expect(screen.getByTestId('calendar-day-2026-10-05').props.accessibilityRole).toBe('button');
    for (const id of ['calendar-prev', 'calendar-next']) {
      expect(StyleSheet.flatten(screen.getByTestId(id).props.style).minHeight).toBe(touch.buttonMinHeight);
    }
  });
});

describe('states', () => {
  it('no Players: an encouraging message, no events', async () => {
    await prepare('en', 0);
    await openCalendar();
    expect(text('calendar-no-players')).toBe('Add a player to start planning.');
    expect(screen.queryAllByTestId(/^calendar-event-/)).toHaveLength(0);
  });

  it('a storage failure: a safe localized message, no raw details', async () => {
    await prepare('he');
    jest.spyOn(calendar, 'listCalendarEventsInRange').mockRejectedValue(new Error('SQLITE_IOERR'));
    renderRouter(routes, { initialUrl: '/calendar' });
    expect(await screen.findByTestId('calendar-error')).toBeTruthy();
    expect(text('calendar-error')).toBe('לא הצלחנו לטעון את לוח הזמנים. אפשר לנסות שוב מאוחר יותר.');
    expect(screen.queryByText(/SQLITE/)).toBeNull();
  });

  it('a malformed stored event: the data message, never a partial calendar', async () => {
    await prepare('en');
    await seedEvent({ type: 'GYM', startAt: at(5, 9) });
    const bad = await seedEvent({ type: 'GAME', startAt: at(6, 9) }, noa);
    await db!.runAsync("UPDATE calendar_events SET type = 'SCHOOL' WHERE id = ?", [bad.id]);
    renderRouter(routes, { initialUrl: '/calendar' });
    expect(await screen.findByTestId('calendar-error')).toBeTruthy();
    expect(text('calendar-error')).toBe('Some stored schedule data is not valid and cannot be shown.');
    expect(screen.queryAllByTestId(/^calendar-event-/)).toHaveLength(0);
    expect(screen.queryByText(/SCHOOL/)).toBeNull();
  });
});

describe('unsaved changes (NAV-DIRTY-001) are untouched', () => {
  it('filters and views are not a form: leaving never asks', async () => {
    await prepare('en');
    const alert = jest.spyOn(Alert, 'alert');
    const app = await openCalendar();
    await setFilter('player', noa);
    press('calendar-mode-WEEK');
    fireEvent.press(screen.getByTestId('main-nav-players'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(alert).not.toHaveBeenCalled();
  });

  it('Edit opened from the calendar still guards a changed form', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', startAt: at(5, 20), title: 'Cup' });
    const dialogs: string[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((title) => void dialogs.push(title));
    const app = await openCalendar();
    press(`calendar-event-${event.id}`);
    fireEvent.press(await screen.findByTestId('event-edit'));
    fireEvent.changeText(await screen.findByTestId('event-title'), 'Cup final');
    fireEvent.press(screen.getByTestId('main-nav-home'));
    await waitFor(() => expect(dialogs).toEqual(['Leave without saving?']));
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}/edit`);
  });
});
