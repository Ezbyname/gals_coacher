import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import { createSelfAssessment } from '@/data/local/selfAssessments/selfAssessmentRepository';
import type { Uuid } from '@/domain/ids';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { appRoutes } from '@/test-support/appRoutes';
import { prepareApp } from '@/test-support/prepareApp';

/** The real route tree (every screen file under src/app), as Expo Router names it. */
const routes = appRoutes(resolve(__dirname, '..')) as never;

const NOW = new Date(2026, 9, 6, 12).getTime();
const START = new Date(2026, 9, 10, 17).getTime();
const CATEGORIES = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];
const clock = { wallNow: () => NOW - 60_000, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const GAL_INPUT: players.PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 }, heightCm: 142 },
  basketball: {
    primaryPosition: 'SG',
    secondaryPosition: 'SF',
    dominantHand: 'LEFT',
    experience: 'ONE_TO_TWO_YEARS',
    weeklyFrequency: 'TWO_TO_THREE',
  },
};

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid;
let gameEvent: Uuid;

async function prepare(language: 'he' | 'en', { inactive = false } = {}) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const created = await players.createPlayer(opened, GAL_INPUT, { ids, clock });
  if (!created.ok) throw new Error('seed failed');
  gal = created.profile.player.id;
  const assessment = await createSelfAssessment(
    opened,
    gal,
    'BASKETBALL',
    CATEGORIES.map((category) => ({ category, rating: 3 })),
    { ids, clock },
  );
  const event = await createCalendarEvent(
    opened,
    gal,
    { type: 'GAME', sport: 'BASKETBALL', startAt: START },
    { ids, clock },
  );
  if (!assessment.ok || !event.ok) throw new Error('seed failed');
  gameEvent = event.event.id;
  if (inactive) {
    const result = await players.updatePlayer(
      opened,
      gal,
      { player: GAL_INPUT.player, basketball: null },
      { clock },
    );
    if (!result.ok) throw new Error('seed failed');
  }
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

/** Everything Basketball history depends on, for "nothing lost" proofs. */
const history = async () => ({
  players: await db!.getAllAsync('SELECT * FROM players'),
  profiles: await db!.getAllAsync('SELECT * FROM basketball_player_profiles'),
  assessments: await db!.getAllAsync('SELECT * FROM self_assessments'),
  ratings: await db!.getAllAsync('SELECT * FROM self_assessment_ratings ORDER BY category'),
  events: await db!.getAllAsync('SELECT * FROM calendar_events'),
});
const assignment = () => db!.getAllAsync('SELECT rowid, player_id, sport, active FROM player_sports');
const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const selected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));

/** Alert.alert spy: records each dialog and answers with the safe (cancel) or the other button. */
function answerAlerts(answer: 'keep' | 'confirm') {
  const dialogs: { title: string; body?: string; buttons: AlertButton[] }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons = []) => {
    dialogs.push({ title, body, buttons });
    buttons.find((b) => (answer === 'keep' ? b.style === 'cancel' : b.style !== 'cancel'))?.onPress?.();
  });
  return dialogs;
}

async function openEdit(language: 'he' | 'en' = 'he', options = {}) {
  await prepare(language, options);
  const app = renderRouter(routes, { initialUrl: '/children' });
  fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
  await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
  await screen.findByDisplayValue('Gal');
  return app;
}

describe('deactivating Basketball from Edit Player', () => {
  it('asks first (Hebrew); "keep active" changes nothing', async () => {
    await openEdit('he');
    const dialogs = answerAlerts('keep');
    press('player-sport-BASKETBALL');
    expect(dialogs).toEqual([
      {
        title: 'להפוך את הכדורסל ללא פעיל?',
        body: 'פרטי הכדורסל, ההערכות העצמיות ולוח הזמנים יישמרו, ויחזרו כשבוחרים שוב בכדורסל. השינוי יחול בשמירה.',
        buttons: [
          expect.objectContaining({ text: 'להשאיר פעיל', style: 'cancel' }),
          expect.objectContaining({ text: 'להפוך ללא פעיל', style: 'destructive' }),
        ],
      },
    ]);
    expect(selected('player-sport-BASKETBALL')).toBe(true);
    expect(screen.getByTestId('player-section-basketball')).toBeTruthy();
  });

  it('confirmed, nothing is written until Save; Cancel discards the change', async () => {
    const app = await openEdit('he');
    const before = { history: await history(), assignment: await assignment() };
    const update = jest.spyOn(players, 'updatePlayer');
    answerAlerts('confirm');
    press('player-sport-BASKETBALL');
    expect(selected('player-sport-BASKETBALL')).toBe(false);
    expect(screen.queryByTestId('player-section-basketball')).toBeNull();
    await act(async () => {});
    expect(await assignment()).toEqual(before.assignment); // not yet
    press('player-cancel');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(update).not.toHaveBeenCalled();
    expect(await assignment()).toEqual(before.assignment);
    expect(await history()).toEqual(before.history);
  });

  it('confirmed + Save: inactive; profile, self-assessments and events kept; the list hides the position', async () => {
    const app = await openEdit('he');
    const before = { history: await history(), assignment: await assignment() };
    answerAlerts('confirm');
    press('player-sport-BASKETBALL');
    press('player-save');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await assignment()).toEqual(
      (before.assignment as Record<string, unknown>[]).map((row) => ({ ...row, active: 0 })),
    );
    const after = await history();
    expect({ ...after, players: undefined }).toEqual({ ...before.history, players: undefined });
    expect((after.players as { height_cm: number }[])[0]!.height_cm).toBe(142);
    // The list no longer shows the Basketball position, which is still stored.
    await screen.findByTestId(`player-row-${gal}`);
    expect(screen.queryByTestId(`player-position-${gal}`)).toBeNull();
    expect(await db!.getFirstAsync('SELECT primary_position FROM basketball_player_profiles')).toEqual({
      primary_position: 'SG',
    });
  });

  it('an active Basketball player shows the position in the list (control)', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/children' });
    expect(await screen.findByTestId(`player-position-${gal}`)).toBeTruthy();
  });
});

describe('while Basketball is inactive', () => {
  it('Edit: Basketball unselected; Self-assessment says history only; Schedule still there', async () => {
    await openEdit('he', { inactive: true });
    expect(selected('player-sport-BASKETBALL')).toBe(false);
    expect(screen.queryByTestId('player-section-basketball')).toBeNull();
    const section = await screen.findByTestId('self-assessment-section');
    expect(text('self-assessment-inactive')).toBe('הכדורסל לא פעיל כרגע — היסטוריה בלבד.');
    expect(within(section).getByText('פתיחת ההיסטוריה')).toBeTruthy();
    expect(screen.getByTestId('schedule-section')).toBeTruthy();
  });

  it('the self-assessment history is readable but read-only (no New)', async () => {
    await prepare('en', { inactive: true });
    renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    expect(await screen.findAllByTestId(/^self-assessment-entry-/)).toHaveLength(1);
    expect(text('self-assessment-history-inactive')).toBe('Basketball is inactive — history only.');
    expect(screen.queryByTestId('self-assessment-new')).toBeNull();
  });

  it('a new self-assessment opened directly cannot be saved: a clear message, nothing written', async () => {
    await prepare('he', { inactive: true });
    renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments/new` });
    await screen.findByTestId('self-assessment-save');
    for (const category of CATEGORIES) press(`self-assessment-${category}-4`);
    press('self-assessment-save');
    expect(await screen.findByTestId('self-assessment-save-error')).toBeTruthy();
    expect(text('self-assessment-save-error')).toBe(
      'הכדורסל לא פעיל לשחקן. כדי להוסיף הערכה עצמית צריך להפעיל אותו מחדש בעריכת השחקן.',
    );
    expect(await db!.getFirstAsync('SELECT count(*) AS n FROM self_assessments')).toEqual({ n: 1 });
  });

  it('a new calendar event offers no Basketball; a sport-less event saves', async () => {
    await prepare('he', { inactive: true });
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/new` });
    await screen.findByTestId('event-save');
    expect(screen.queryByTestId('event-sport')).toBeNull();
    press('event-type-GYM');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(await db!.getAllAsync("SELECT sport FROM calendar_events WHERE type = 'GYM'")).toEqual([
      { sport: null },
    ]);
  });

  it('the historical Basketball event still shows Basketball and can keep it', async () => {
    await prepare('en', { inactive: true });
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/${gameEvent}` });
    expect(await screen.findByTestId('event-details-sport')).toBeTruthy();
    expect(text('event-details-sport')).toBe('Basketball');
    press('event-edit');
    await screen.findByTestId('event-save');
    expect(selected('event-sport-BASKETBALL')).toBe(true);
    fireEvent.changeText(screen.getByTestId('event-title'), 'Final');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${gameEvent}`));
    expect(
      await db!.getFirstAsync('SELECT sport, title FROM calendar_events WHERE id = ?', [gameEvent]),
    ).toEqual({
      sport: 'BASKETBALL',
      title: 'Final',
    });
  });

  it('the historical Basketball event can clear its sport', async () => {
    await prepare('en', { inactive: true });
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/${gameEvent}/edit` });
    await screen.findByTestId('event-save');
    press('event-sport-BASKETBALL');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${gameEvent}`));
    expect(await db!.getFirstAsync('SELECT sport FROM calendar_events WHERE id = ?', [gameEvent])).toEqual({
      sport: null,
    });
  });
});

describe('reactivating Basketball', () => {
  it('selecting it again needs no confirmation and pre-fills the stored details; Save reuses the same rows', async () => {
    const app = await openEdit('en', { inactive: true });
    const before = { history: await history(), assignment: await assignment() };
    const alert = jest.spyOn(Alert, 'alert');
    press('player-sport-BASKETBALL');
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByTestId('player-section-basketball')).toBeTruthy();
    expect(selected('player-primary-SG')).toBe(true);
    expect(selected('player-secondary-SF')).toBe(true);
    expect(selected('player-hand-LEFT')).toBe(true);
    press('player-save');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await assignment()).toEqual(
      (before.assignment as Record<string, unknown>[]).map((row) => ({ ...row, active: 1 })),
    );
    expect({ ...(await history()), players: undefined }).toEqual({ ...before.history, players: undefined });
    expect(await db!.getFirstAsync('SELECT count(*) AS n FROM basketball_player_profiles')).toEqual({ n: 1 });
    // Back to normal: the position is listed again and new assessments are offered.
    expect(await screen.findByTestId(`player-position-${gal}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`player-row-${gal}`));
    expect(await screen.findByTestId('self-assessment-section')).toBeTruthy();
    expect(screen.queryByTestId('self-assessment-inactive')).toBeNull();
    press('self-assessment-open');
    expect(await screen.findByTestId('self-assessment-new')).toBeTruthy();
  });

  it('English: the confirmation and the history-only notice', async () => {
    await openEdit('en');
    const dialogs = answerAlerts('keep');
    press('player-sport-BASKETBALL');
    expect(dialogs[0]).toMatchObject({
      title: 'Make Basketball inactive?',
      body: 'Basketball details, self-assessments and the schedule stay saved, and come back when Basketball is selected again. The change applies when you save.',
    });
    expect(dialogs[0]!.buttons.map((b) => b.text)).toEqual(['Keep active', 'Make inactive']);
  });
});
