import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform } from 'react-native';

import { createCalendarEvent, markCalendarEventCompleted, scheduleWorkout } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { abandonSession, finishSession, recordSet, startSession } from '@/data/local/training/trainingRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** CAL-TRAIN-001 slice C: the event details of a scheduled workout (Player, state, planned exercises) and Start / Continue / View. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
const at = (h: number) => new Date(2026, 9, 20, h, 0).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let daniel = '';

async function prepare(language: 'he' | 'en') {
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
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

/** A scheduled workout: PLANK 3 x 30 s and a 20 m sprint with a completion time cap. */
async function seed(startHour: number) {
  const early = { ids, clock: { wallNow: () => at(7), monotonicNow: () => 0 } };
  const plan = await savePlannedWorkout(
    db!,
    {
      planId: null,
      playerId: daniel,
      name: 'Mixed',
      entries: [
        { kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 3, target: 30, loadKg: null, restSec: 60 } },
        { kind: 'EXERCISE', exerciseId: 'SPRINT_20M', prescription: { sets: 2, target: 7, loadKg: null, restSec: null, timeSemantics: 'COMPLETION_TIME_CAP' } },
      ],
    },
    deps,
  );
  if (!plan.ok) throw new Error('seed');
  const ev = await scheduleWorkout(db!, { playerId: daniel, planId: plan.plan.id, startAt: at(startHour) }, early);
  if (!ev.ok) throw new Error('seed');
  return { planId: plan.plan.id, eventId: ev.event.id };
}
const sessions = async () => (await db!.getAllAsync<{ id: string; status: string }>('SELECT id, status FROM training_sessions')).map((r) => `${r.status}`);
const sessionRows = async () => db!.getAllAsync<{ id: string }>('SELECT id FROM training_sessions');
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const has = (testID: string) => screen.queryByTestId(testID) !== null;
async function open(eventId: string) {
  renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/${eventId}` });
  await screen.findByTestId('event-workout-section');
}
const finishOne = async (planId: string) => {
  const s = await startSession(db!, planId, deps);
  for (const e of s.exercises) for (const set of e.sets) await recordSet(db!, set.id, e.exercise.measurement.type === 'DURATION' ? { DURATION_S: 30 } : { TIME_S: 6 }, deps);
  return finishSession(db!, s.id, deps);
};

describe('event details of a scheduled workout (English)', () => {
  it('shows the workout, the Player, the planned exercises with their prescription (semantics-aware) and Start', async () => {
    await prepare('en');
    const w = await seed(18);
    await open(w.eventId);
    expect(text('event-workout-name')).toBe('Mixed');
    expect(text('event-workout-player')).toBe('Daniel');
    expect(has('event-workout-state')).toBe(false); // UPCOMING keeps the normal look
    expect(text('event-workout-item-0')).toMatch(/plank/i);
    expect(text('event-workout-item-0-prescription')).toContain('3 ×');
    expect(text('event-workout-item-1-prescription')).toContain('time cap 7 s'); // the stored meaning wins; never drawn as a goal
    expect(has('event-workout-start')).toBe(true);
    expect(has('event-complete')).toBe(false); // a workout event is completed by training, not by a mark
  });

  it('an overdue workout shows Missed and can still be started; Start opens ONE session', async () => {
    await prepare('en');
    const w = await seed(8); // 08:00, the clock says 12:00
    await open(w.eventId);
    expect(text('event-workout-state')).toBe('⚠ Missed');
    fireEvent.press(screen.getByTestId('event-workout-start'));
    await screen.findByTestId('session-scroll');
    expect(await sessions()).toEqual(['IN_PROGRESS']);
  });

  it('a stale Start (the session was created meanwhile) opens the existing session, with no error and no second session', async () => {
    await prepare('en');
    const w = await seed(11); // already past: no early-start question
    await open(w.eventId);
    const started = await startSession(db!, w.planId, deps); // another screen started it
    fireEvent.press(screen.getByTestId('event-workout-start'));
    await screen.findByTestId('session-scroll');
    expect(await sessionRows()).toEqual([{ id: started.id }]);
    expect(has('event-workout-failed')).toBe(false);
  });

  it('IN_PROGRESS offers Continue; COMPLETED, PARTIAL and ABANDONED offer View and never Start', async () => {
    await prepare('en');
    const a = await seed(9);
    const s = await startSession(db!, a.planId, deps);
    await open(a.eventId);
    expect(text('event-workout-state')).toBe('▶ Workout in progress');
    expect(has('event-workout-continue')).toBe(true);
    expect(has('event-workout-start')).toBe(false);
    await abandonSession(db!, s.id, deps);
    // reload the screen on the same event: stopped
    renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/${a.eventId}` });
    await screen.findByTestId('event-workout-view');
    expect(text('event-workout-state')).toBe('■ Stopped');
    expect(has('event-workout-start')).toBe(false);
    expect(has('event-workout-continue')).toBe(false);
  });

  it('18 + 19: a completed workout opens its existing session; nothing new is created', async () => {
    await prepare('en');
    const w = await seed(9);
    const closed = await finishOne(w.planId);
    expect(closed.status).toBe('COMPLETED');
    await open(w.eventId);
    expect(text('event-workout-state')).toBe('✓ Completed');
    expect(has('event-workout-start')).toBe(false);
    fireEvent.press(screen.getByTestId('event-workout-view'));
    await screen.findByTestId('session-scroll');
    expect(await sessionRows()).toEqual([{ id: closed.id }]);
    expect(text('session-status')).toMatch(/completed/i);
  });
});

describe('manual completion', () => {
  it('24: an ordinary event keeps Mark as completed', async () => {
    await prepare('en');
    const plain = await createCalendarEvent(db!, daniel, { type: 'OTHER', startAt: at(18), endAt: null, title: 'Dentist' }, deps);
    if (!plain.ok) throw new Error('seed');
    renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/${plain.event.id}` });
    await screen.findByTestId('event-complete');
    expect(has('event-workout-section')).toBe(false);
  });

  it('25: a legacy linked event that was marked completed (no session) stays Completed; its mark is not erased and cannot be changed', async () => {
    await prepare('en');
    const w = await seed(18);
    await markCalendarEventCompleted(db!, daniel, w.eventId, { clock: systemClock });
    const before = await db!.getFirstAsync('SELECT completed_at, completion_source FROM calendar_events WHERE id = ?', [w.eventId]);
    await open(w.eventId);
    expect(text('event-workout-state')).toBe('✓ Completed');
    expect(has('event-completion-status')).toBe(true);
    expect(has('event-complete')).toBe(false);
    expect(has('event-uncomplete')).toBe(false);
    expect(await db!.getFirstAsync('SELECT completed_at, completion_source FROM calendar_events WHERE id = ?', [w.eventId])).toEqual(before);
    expect(await sessions()).toEqual([]);
  });
});

describe('event details (Hebrew)', () => {
  it('shows the Hebrew state words and Player; the layout keeps the text direction automatic', async () => {
    await prepare('he');
    const w = await seed(8);
    await open(w.eventId);
    expect(text('event-workout-state')).toBe('⚠ לא בוצע');
    expect(text('event-workout-player')).toBe('Daniel');
    expect(screen.getByTestId('event-workout-name').props.style).toEqual(expect.objectContaining({ textAlign: 'auto' }));
    expect(text('event-workout-item-1-prescription')).toContain('7'); // the cap value is still shown
  });
});

const buttonsOf = (spy: jest.SpyInstance) => spy.mock.calls.at(-1)![2] as { text: string; style?: string; onPress?: () => void }[];

describe('starting a future workout early (14, 15)', () => {
  it('asks first with the scheduled time; Cancel starts nothing; Start now starts it and leaves the event exactly as scheduled', async () => {
    await prepare('en');
    const w = await seed(18);
    await open(w.eventId);
    const alert = jest.spyOn(Alert, 'alert');
    const eventBefore = JSON.stringify(await db!.getFirstAsync('SELECT * FROM calendar_events WHERE id = ?', [w.eventId]));
    fireEvent.press(screen.getByTestId('event-workout-start'));
    expect(String(alert.mock.calls.at(-1)![1])).toMatch(/This workout is scheduled for .*18:00.*\. Start it now\?/);
    act(() => buttonsOf(alert).find((b) => b.style === 'cancel')!.onPress?.());
    expect(await sessions()).toEqual([]); // nothing started
    fireEvent.press(screen.getByTestId('event-workout-start'));
    act(() => buttonsOf(alert).find((b) => b.text === 'Start now')!.onPress!());
    await screen.findByTestId('session-scroll');
    expect(await sessions()).toEqual(['IN_PROGRESS']);
    expect(JSON.stringify(await db!.getFirstAsync('SELECT * FROM calendar_events WHERE id = ?', [w.eventId]))).toBe(eventBefore); // WHEN untouched
  });

  it('asks in Hebrew too', async () => {
    await prepare('he');
    const w = await seed(18);
    await open(w.eventId);
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent.press(screen.getByTestId('event-workout-start'));
    expect(String(alert.mock.calls.at(-1)![1])).toMatch(/האימון מתוכנן ל.*18:00.*להתחיל אותו עכשיו\?/);
  });

  it('a past (overdue) workout starts without a question', async () => {
    await prepare('en');
    const w = await seed(8);
    await open(w.eventId);
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent.press(screen.getByTestId('event-workout-start'));
    await screen.findByTestId('session-scroll');
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('delete after a session exists (20)', () => {
  it('the confirmation says only the calendar entry goes and the history stays; the history survives', async () => {
    await prepare('en');
    const w = await seed(9);
    const closed = await finishOne(w.planId);
    await open(w.eventId);
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent.press(screen.getByTestId('event-delete'));
    expect(String(alert.mock.calls.at(-1)![1])).toBe('Only this calendar entry will be removed. The workout and its training history stay under the Player.');
    act(() => buttonsOf(alert).find((b) => b.style === 'destructive')!.onPress!());
    await waitFor(async () => expect(await db!.getFirstAsync('SELECT count(*) AS n FROM calendar_events')).toEqual({ n: 0 }));
    expect(await sessionRows()).toEqual([{ id: closed.id }]);
    expect(await db!.getFirstAsync('SELECT count(*) AS n FROM planned_workouts')).toEqual({ n: 1 });
  });
});

describe('slice E: a closed workout reopens its read-only history (14)', () => {
  it.each(['COMPLETED', 'PARTIAL', 'ABANDONED'] as const)('%s: the calendar item opens the same session, read-only, planned and actual untouched', async (status) => {
    await prepare('en');
    const w = await seed(9);
    const s = await startSession(db!, w.planId, deps);
    if (status === 'ABANDONED') {
      await abandonSession(db!, s.id, deps);
    } else {
      await recordSet(db!, s.exercises[0]!.sets[0]!.id, { DURATION_S: 28 }, deps);
      if (status === 'COMPLETED') {
        for (const e of s.exercises) for (const set of e.sets) if (set.id !== s.exercises[0]!.sets[0]!.id) await recordSet(db!, set.id, e.exercise.measurement.type === 'DURATION' ? { DURATION_S: 30 } : { TIME_S: 6 }, deps);
      }
      expect((await finishSession(db!, s.id, deps)).status).toBe(status);
    }
    const history = JSON.stringify([await db!.getAllAsync('SELECT * FROM session_sets ORDER BY rowid'), await db!.getAllAsync('SELECT * FROM set_measurements ORDER BY rowid'), await db!.getAllAsync('SELECT * FROM planned_workout_items ORDER BY rowid')]);
    await open(w.eventId);
    expect(has('event-workout-start')).toBe(false);
    fireEvent.press(screen.getByTestId('event-workout-view'));
    await screen.findByTestId('session-scroll');
    expect(has('session-finish')).toBe(false); // no way to change it
    expect(has('session-abandon')).toBe(false);
    expect(has('session-read-only')).toBe(true);
    expect(await sessionRows()).toEqual([{ id: s.id }]);
    expect(JSON.stringify([await db!.getAllAsync('SELECT * FROM session_sets ORDER BY rowid'), await db!.getAllAsync('SELECT * FROM set_measurements ORDER BY rowid'), await db!.getAllAsync('SELECT * FROM planned_workout_items ORDER BY rowid')])).toBe(history);
  });
});
