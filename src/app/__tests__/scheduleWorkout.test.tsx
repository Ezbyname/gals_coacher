import { resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { createPlannedWorkout, savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { abandonSession, getPlannedWorkout, startSession } from '@/data/local/training/trainingRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** QB-WORKOUT-BUILDER-001D (UI side of WB-SCHED): schedule / reschedule / unschedule and Start from the event, real routes + SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let daniel = '';
let planId = '';

async function prepare(language: 'he' | 'en', opts: { items?: boolean } = {}) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  daniel = p.profile.player.id;
  if (opts.items !== false) {
    const r = await savePlannedWorkout(opened, { planId: null, playerId: daniel, name: 'Shooting', entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 2, target: 30, loadKg: null, restSec: 60 } }] }, deps);
    if (!r.ok) throw new Error('seed');
    planId = r.plan.id;
  }
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const has = (testID: string) => screen.queryByTestId(testID) !== null;
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
async function pick(testID: string, date: Date) {
  press(testID);
  const native = await screen.findByTestId(`${testID}-native`);
  act(() => native.props.onValueChange({ nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } }, date));
  await waitFor(() => expect(screen.queryByTestId(`${testID}-native`)).toBeNull());
}
const eventOf = async () => db!.getFirstAsync<{ id: string; start_at: number; end_at: number | null; title: string | null; planned_workout_id: string | null }>('SELECT id, start_at, end_at, title, planned_workout_id FROM calendar_events');
const eventCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events'))!.n;
/** Confirms the destructive choice of the last Alert (an Alert is a native dialog: the test presses its button). */
function confirmAlert(spy: jest.SpyInstance) {
  const buttons = spy.mock.calls.at(-1)![2] as { text: string; style?: string; onPress?: () => void }[];
  act(() => buttons.find((b) => b.style === 'destructive')!.onPress!());
}

async function playerPage() {
  renderRouter(routes, { initialUrl: `/children/${daniel}` });
  await screen.findByTestId(`training-planned-${planId}`);
}

describe('schedule from the Player page (WB-SCHED-01 / 05 / 11)', () => {
  it('a planned workout is "not scheduled" and has a Schedule button; the form starts at the next quarter hour with NO end', async () => {
    await prepare('en');
    await playerPage();
    expect(text(`training-planned-${planId}-when`)).toBe('Not scheduled yet');
    press(`training-planned-${planId}-schedule`);
    await screen.findByTestId('schedule-save');
    expect(text('schedule-plan-name')).toBe('Shooting');
    expect(text('schedule-start-time-value')).toBe('12:15'); // 12:00:30 -> next quarter hour
    expect(has('schedule-end')).toBe(false); // no invented end time
    expect(has('schedule-end-hint')).toBe(true);
    expect(await eventCount()).toBe(0); // nothing stored until Save
  });

  it('WB-SCHED-01 + 11: Save creates ONE linked event with no end; the card shows when it is', async () => {
    await prepare('en');
    await playerPage();
    press(`training-planned-${planId}-schedule`);
    await screen.findByTestId('schedule-save');
    press('schedule-save');
    await screen.findByTestId(`training-planned-${planId}-reschedule`); // back on the Player page, now scheduled
    const e = await eventOf();
    expect(e).toMatchObject({ planned_workout_id: planId, title: 'Shooting', end_at: null });
    expect(e!.start_at).toBe(new Date(2026, 9, 20, 12, 15).getTime());
    expect(await eventCount()).toBe(1);
    expect(text(`training-planned-${planId}-when`)).toBe('Scheduled: 20 Oct 2026 · 12:15');
    expect(has(`training-planned-${planId}-schedule`)).toBe(false);
  });

  it('WB-SCHED-05: a start in the past is refused with a message and nothing is written', async () => {
    await prepare('en');
    await playerPage();
    press(`training-planned-${planId}-schedule`);
    await screen.findByTestId('schedule-save');
    await pick('schedule-start-date', new Date(2026, 9, 19, 12)); // yesterday
    press('schedule-save');
    await waitFor(() => expect(has('schedule-start-time-error')).toBe(true));
    expect(await eventCount()).toBe(0);
    expect(has('schedule-save')).toBe(true); // still on the form, the values are kept
  });
});

describe('reschedule / unschedule (WB-SCHED-04 / 06)', () => {
  async function scheduled() {
    await prepare('en');
    await playerPage();
    press(`training-planned-${planId}-schedule`);
    await screen.findByTestId('schedule-save');
    press('schedule-save');
    await screen.findByTestId(`training-planned-${planId}-reschedule`);
  }

  it('WB-SCHED-04: Reschedule moves the SAME event (optional end added) — still exactly one event', async () => {
    await scheduled();
    const before = await eventOf();
    press(`training-planned-${planId}-reschedule`);
    await screen.findByTestId('schedule-save');
    await pick('schedule-start-date', new Date(2026, 9, 22, 12));
    await pick('schedule-start-time', new Date(2026, 0, 1, 18, 0));
    press('schedule-add-end');
    await pick('schedule-end-time', new Date(2026, 0, 1, 19, 0));
    press('schedule-save');
    await screen.findByTestId(`training-planned-${planId}-reschedule`);
    const after = await eventOf();
    expect(after!.id).toBe(before!.id);
    expect(after).toMatchObject({ planned_workout_id: planId, start_at: new Date(2026, 9, 22, 18, 0).getTime(), end_at: new Date(2026, 9, 22, 19, 0).getTime() });
    expect(await eventCount()).toBe(1);
  });

  it('WB-SCHED-06: Unschedule asks first, then removes the event; the workout stays and can be scheduled again', async () => {
    await scheduled();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    press(`training-planned-${planId}-unschedule`);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(await eventCount()).toBe(1); // asking changes nothing
    confirmAlert(alert);
    await screen.findByTestId(`training-planned-${planId}-schedule`);
    expect(await eventCount()).toBe(0);
    expect(await getPlannedWorkout(db!, planId)).not.toBeNull();
    expect(text(`training-planned-${planId}-when`)).toBe('Not scheduled yet');
  });
});

describe('the event: Start / Continue / View and the title (WB-SCHED-07 / 10)', () => {
  async function openEvent() {
    await prepare('en');
    await playerPage();
    press(`training-planned-${planId}-schedule`);
    await screen.findByTestId('schedule-save');
    press('schedule-save');
    await screen.findByTestId(`training-planned-${planId}-reschedule`);
    const e = (await eventOf())!;
    act(() => router.push(`/children/${daniel}/schedule/${e.id}`));
    await screen.findByTestId('event-workout-section');
    return e;
  }

  it('WB-SCHED-07: the event offers Start workout; starting creates the session and freezes the plan; the event is NOT completed', async () => {
    const e = await openEvent();
    expect(text('event-workout-name')).toBe('Shooting');
    expect(text('event-workout-summary')).toBe('1 sections');
    press('event-workout-start');
    await screen.findByTestId('session-scroll');
    expect((await getPlannedWorkout(db!, planId))!.sessionId).not.toBeNull();
    expect(await db!.getFirstAsync('SELECT completed_at FROM calendar_events WHERE id = ?', [e.id])).toEqual({ completed_at: null });
    // back on the event: the button is now Continue (a session is running)
    act(() => router.back());
    await screen.findByTestId('event-workout-continue');
    expect(has('event-workout-start')).toBe(false);
  });

  it('a finished / abandoned session shows View workout / results instead', async () => {
    const e = await openEvent();
    const session = await startSession(db!, planId, deps);
    await abandonSession(db!, session.id, { clock: systemClock });
    act(() => router.replace(`/children/${daniel}/schedule/${e.id}`));
    await screen.findByTestId('event-workout-view');
    expect(has('event-workout-start')).toBe(false);
    expect(has('event-workout-continue')).toBe(false);
  });

  it('WB-SCHED-10: the event title is the workout name and follows a rename; the event form cannot edit it', async () => {
    const e = await openEvent();
    expect(text('event-details-title')).toBe('Shooting');
    await savePlannedWorkout(db!, { planId, playerId: daniel, name: 'Basketball Workout', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [{ sets: 2, target: 30, loadKg: null, restSec: 60 }] }] }, deps);
    act(() => router.replace(`/children/${daniel}/schedule/${e.id}`));
    await waitFor(() => expect(text('event-details-title')).toBe('Basketball Workout'));
    press('event-edit');
    await screen.findByTestId('event-title-locked');
    expect(text('event-title-locked')).toBe('Basketball Workout');
    expect(has('event-title')).toBe(false); // no editable title field while the plan is editable
  });

  it('Delete event on a scheduled workout says the workout stays, then unschedules only', async () => {
    const e = await openEvent();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    press('event-delete');
    expect(String(alert.mock.calls.at(-1)![1])).toBe('The event is removed from the calendar. The workout itself stays and can be scheduled again.');
    confirmAlert(alert);
    await waitFor(async () => expect(await eventCount()).toBe(0));
    expect(await getPlannedWorkout(db!, planId)).not.toBeNull();
    void e;
  });
});

describe('blocked and Hebrew (WB-SCHED-03 / 14)', () => {
  it('WB-SCHED-03: a workout that already has a session cannot be scheduled (the screen says so, no Save)', async () => {
    await prepare('en');
    const session = await startSession(db!, planId, deps);
    await abandonSession(db!, session.id, { clock: systemClock });
    renderRouter(routes, { initialUrl: `/children/${daniel}/training/schedule/${planId}` });
    await screen.findByTestId('schedule-started');
    expect(has('schedule-save')).toBe(false);
    expect(await eventCount()).toBe(0);
  });

  it('a workout with nothing in it shows no Schedule button (it could never start)', async () => {
    await prepare('en');
    const empty = await createPlannedWorkout(db!, { playerId: daniel, name: 'Empty one' }, deps);
    if (!empty.ok) throw new Error('seed');
    await playerPage();
    await screen.findByTestId(`training-planned-${empty.plan.id}`);
    expect(has(`training-planned-${empty.plan.id}-schedule`)).toBe(false);
    expect(has(`training-planned-${planId}-schedule`)).toBe(true); // the workout with content still does
  });

  it('the schedule flow works in Hebrew', async () => {
    await prepare('he');
    await playerPage();
    expect(text(`training-planned-${planId}-when`)).toBe('עדיין לא מתוזמן');
    press(`training-planned-${planId}-schedule`);
    await screen.findByTestId('schedule-save');
    expect(text('schedule-end-hint')).toContain('שעת סיום היא אופציונלית');
    press('schedule-save');
    await screen.findByTestId(`training-planned-${planId}-reschedule`);
    expect(text(`training-planned-${planId}-when`)).toMatch(/^מתוזמן: /);
  });
});
