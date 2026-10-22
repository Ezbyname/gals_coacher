import { resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { startSession } from '@/data/local/training/trainingRepository';
import { stripBidi } from '@/i18n/bidi';
import { sessionPath } from '@/features/training/trainingLabels';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), release: jest.fn() })),
}));

jest.setTimeout(45_000); // real router + SQLite + real quarter-second timer ticks

/** TRAINING-TIMER-001 slices C / D on the real session route: DURATION work timer, rest timer, history untouched. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
let wall = new Date(2026, 9, 20, 12, 0, 0).getTime();
let mono = 10_000;
const advance = (ms: number) => {
  wall += ms;
  mono += ms;
};
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let player = '';
let sessionId = '';

async function prepare(language: 'he' | 'en', entries: Parameters<typeof savePlannedWorkout>[1]['entries']) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockImplementation(() => wall);
  jest.spyOn(systemClock, 'monotonicNow').mockImplementation(() => mono);
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  player = p.profile.player.id;
  const plan = await savePlannedWorkout(opened, { planId: null, playerId: player, name: 'Timer day', entries }, deps);
  if (!plan.ok) throw new Error('seed');
  sessionId = (await startSession(opened, plan.plan.id, deps)).id;
}
beforeEach(() => {
  wall = new Date(2026, 9, 20, 12, 0, 0).getTime();
  mono = 10_000;
});
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const plank = (sets: number, rest: number | null) => ({ kind: 'EXERCISE' as const, exerciseId: 'PLANK', prescription: { sets, target: 30, loadKg: null, restSec: rest } });
const sprint = (sets: number) => ({ kind: 'EXERCISE' as const, exerciseId: 'SPRINT_10M', prescription: { sets, target: 5, loadKg: null, restSec: 60, timeSemantics: 'COMPLETION_TIME_CAP' as const } });

const has = (id: string) => screen.queryByTestId(id) !== null;
const text = (id: string) => stripBidi(String(screen.getByTestId(id).props.children));
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const set = (ex: number, n: number) => `session-ex-${ex}-set-${n}`;
const measurements = async () => db!.getAllAsync<{ kind: string; measured_value: number; final_value: number; source: string }>('SELECT kind, measured_value, final_value, source FROM set_measurements');
const dump = async (t: string) => JSON.stringify(await db!.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`));
async function openSession() {
  renderRouter(routes, { initialUrl: sessionPath(player, sessionId) });
  await screen.findByTestId('session-scroll');
}
/** Time passes; the timer's own tick notices within a quarter second. */
async function pass(ms: number) {
  advance(ms);
  await act(async () => {
    jest.advanceTimersByTime(300); // expo-router's test library runs on fake timers
  });
}

describe('work timer eligibility on the real screen (1-3, 38-40)', () => {
  it('only a DURATION set offers Start timer; a completion-time drill (cap) and an extra set never do', async () => {
    await prepare('en', [plank(2, 45), sprint(2)]);
    await openSession();
    expect(has(`${set(0, 1)}-timer-start`)).toBe(true);
    expect(has(`${set(0, 2)}-timer-start`)).toBe(true);
    expect(has(`${set(1, 1)}-timer-start`)).toBe(false); // SPRINT_10M, COMPLETION_TIME_CAP
    expect(has(`${set(1, 2)}-timer-start`)).toBe(false);
    expect(has('timer-bar')).toBe(false); // an open session alone starts nothing
  });
});

describe('work timer (23-29)', () => {
  it('Start is manual and counts down from the planned 30 s; pausing freezes; Stop at 7 s suggests 7 and writes NOTHING', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    const planBefore = await dump('planned_workout_items');
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    expect(text('timer-digits')).toBe('00:30');
    await pass(7000);
    expect(text('timer-digits')).toBe('00:23');
    press('timer-pause');
    await pass(60_000);
    expect(text('timer-digits')).toBe('00:23');
    press('timer-resume');
    press('timer-stop');
    expect(text('timer-caption')).toBe('Worked 7 s');
    expect(screen.getByTestId('timer-record').props.accessibilityState).toBeDefined();
    expect(screen.getByTestId(`${set(0, 1)}-DURATION_S`).props.value).toBe('7'); // the suggestion, to be saved by the user
    expect(await measurements()).toEqual([]); // 25: nothing written until the user confirms
    expect(await dump('planned_workout_items')).toBe(planBefore); // 23, 42
    expect(await db!.getFirstAsync('SELECT planned_target FROM session_sets ORDER BY rowid')).toEqual({ planned_target: 30 }); // 29
  });

  it('Record 7 s uses the existing record path (MANUAL); planned stays 30; the rest timer starts like after any save', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    await pass(7000);
    press('timer-stop');
    press('timer-record');
    await waitFor(async () => expect((await measurements()).length).toBe(1));
    expect(await measurements()).toEqual([{ kind: 'DURATION_S', measured_value: 7, final_value: 7, source: 'MANUAL' }]);
    expect(await db!.getFirstAsync('SELECT planned_target, status FROM session_sets ORDER BY rowid')).toEqual({ planned_target: 30, status: 'DONE' });
    await waitFor(() => expect(text('timer-title')).toMatch(/^Rest/));
  });

  it('27 + 28: running to zero shows Time\'s up and writes nothing; Record 30 s is a user action', async () => {
    await prepare('en', [plank(1, 45)]);
    await openSession();
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    await pass(31_000);
    await waitFor(() => expect(text('timer-caption')).toBe("Time's up"));
    expect(text('timer-digits')).toBe('00:00');
    expect(await measurements()).toEqual([]);
    expect(screen.getByTestId('session-status')).toBeTruthy();
    expect(has('timer-record')).toBe(true); // offered, never pressed for the user
    press('timer-record');
    await waitFor(async () => expect(await measurements()).toEqual([{ kind: 'DURATION_S', measured_value: 30, final_value: 30, source: 'MANUAL' }]));
  });
});

describe('rest timer (30-37)', () => {
  it('30: saving a set with rest > 0 and another pending set in the SAME exercise auto-starts rest, bound to the next set; 36: Skip clears it', async () => {
    await prepare('en', [plank(3, 45)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '28');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(has('timer-bar')).toBe(true));
    expect(text('timer-title')).toBe('Rest · Next set');
    expect(text('timer-next-set')).toMatch(/set 2$/);
    expect(text('timer-digits')).toBe('00:45');
    expect(await measurements()).toHaveLength(1); // only the user's save; the rest wrote nothing
    press('timer-skip-rest');
    expect(has('timer-bar')).toBe(false);
    expect(await measurements()).toHaveLength(1);
  });

  it('37: rest expiry shows the next set and writes no history', async () => {
    await prepare('en', [plank(2, 20)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(has('timer-bar')).toBe(true));
    const before = [await dump('set_measurements'), await dump('session_sets'), await dump('training_sessions')];
    await pass(21_000);
    await waitFor(() => expect(text('timer-caption')).toBe('Rest is over'));
    expect(text('timer-next-set')).toMatch(/set 2$/);
    expect([await dump('set_measurements'), await dump('session_sets'), await dump('training_sessions')]).toEqual(before);
  });

  it('31 + 32: rest 0 or no rest creates no timer', async () => {
    await prepare('en', [plank(3, 0)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(async () => expect(await measurements()).toHaveLength(1));
    expect(has('timer-bar')).toBe(false);
  });

  it('31b: a null rest creates no timer', async () => {
    await prepare('en', [plank(3, null)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(async () => expect(await measurements()).toHaveLength(1));
    expect(has('timer-bar')).toBe(false);
  });

  it('33 + 34: the last pending set of an exercise starts no rest, and another exercise never counts as the next set', async () => {
    await prepare('en', [plank(1, 45), sprint(2)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(async () => expect(await measurements()).toHaveLength(1));
    expect(has('timer-bar')).toBe(false); // Plank has one set; the sprint's sets are another exercise
  });

  it('35: out of order — saving set 2 while set 1 is pending binds the rest to set 1', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 2)}-DURATION_S`), '30');
    press(`${set(0, 2)}-save`);
    await waitFor(() => expect(has('timer-bar')).toBe(true));
    expect(text('timer-next-set')).toMatch(/set 1$/);
  });

  it('re-saving a set that was already done does not start a rest again', async () => {
    await prepare('en', [plank(3, 45)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(has('timer-bar')).toBe(true));
    press('timer-skip-rest');
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '29');
    press(`${set(0, 1)}-save`);
    await waitFor(async () => expect((await measurements())[0]!.final_value).toBe(29));
    expect(has('timer-bar')).toBe(false);
  });
});

describe('navigation and session close (13-15, 19-22)', () => {
  it('13-15: Session -> Calendar -> Session keeps the same running timer on the same set, with the right remaining time', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    press(`${set(0, 2)}-timer-start`);
    await screen.findByTestId('timer-bar');
    await pass(5000);
    act(() => router.push('/calendar'));
    await screen.findByTestId('calendar-day-list');
    expect(has('timer-bar')).toBe(false); // it belongs to the session screen...
    await pass(5000);
    act(() => router.back());
    await screen.findByTestId('timer-bar'); // ...and is still running when we come back
    expect(text('timer-title')).toMatch(/set 2$/);
    expect(text('timer-digits')).toBe('00:20');
  });

  it('19-22: finishing or stopping the session clears the timer; a later tick does nothing', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(has('timer-bar')).toBe(true));
    press('session-finish'); // PARTIAL: one of two planned sets was done
    await waitFor(() => expect(has('timer-bar')).toBe(false));
    const before = [await dump('set_measurements'), await dump('session_sets'), await dump('training_sessions')];
    await pass(60_000);
    expect(has('timer-bar')).toBe(false);
    expect([await dump('set_measurements'), await dump('session_sets'), await dump('training_sessions')]).toEqual(before);
  });

  it('a timer whose set the user recorded by hand ends (it never stays attached to something that moved on)', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '12');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(text('timer-title')).toBe('Rest · Next set')); // replaced by the rest of the saved set
  });
});

describe('history is never touched by the timer (41-43)', () => {
  it('time_semantics, the plan and a finished session stay as they were through a whole timer round', async () => {
    await prepare('en', [plank(2, 45), sprint(1)]);
    await openSession();
    const before = [await dump('planned_workout_items'), await dump('planned_workouts'), await dump('session_exercises')];
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    await pass(31_000);
    press('timer-dismiss');
    expect(await dump('planned_workout_items')).toBe(before[0]);
    expect(await dump('planned_workouts')).toBe(before[1]);
    expect(await dump('session_exercises')).toBe(before[2]); // includes time_semantics
    expect(await measurements()).toEqual([]);
  });
});

describe('Hebrew, direction and accessibility (49-53)', () => {
  it('Hebrew labels; the digits stay left-to-right (isolated) inside the RTL screen', async () => {
    await prepare('he', [plank(2, 45)]);
    await openSession();
    expect(screen.getByTestId(`${set(0, 1)}-timer-start`)).toHaveTextContent('התחל טיימר');
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    const digits = String(screen.getByTestId('timer-digits').props.children);
    expect(digits.startsWith('⁦') && digits.endsWith('⁩')).toBe(true); // LRI ... PDI
    expect(stripBidi(digits)).toBe('00:30');
    expect(screen.getByTestId('timer-pause')).toHaveTextContent('השהה');
    expect(screen.getByTestId('timer-stop')).toHaveTextContent('עצור');
    await pass(31_000);
    await waitFor(() => expect(text('timer-caption')).toBe('הזמן נגמר'));
    expect(screen.getByTestId('timer-record')).toHaveTextContent(/שמור .*30.* שנ׳/);
  });

  it('English labels', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    expect(screen.getByTestId(`${set(0, 1)}-timer-start`)).toHaveTextContent('Start timer');
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    expect(screen.getByTestId('timer-pause')).toHaveTextContent('Pause');
    press('timer-pause');
    expect(screen.getByTestId('timer-resume')).toHaveTextContent('Resume');
    expect(screen.getByTestId('timer-stop')).toHaveTextContent('Stop');
  });

  it('52 + 53: the digits are a labelled timer; the caption is a polite live region that only changes on meaningful transitions', async () => {
    await prepare('en', [plank(2, 45)]);
    await openSession();
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    const digits = screen.getByTestId('timer-digits');
    expect(digits.props.accessibilityRole).toBe('timer');
    expect(stripBidi(digits.props.accessibilityLabel)).toMatch(/Remaining: 00:30/);
    const caption = () => text('timer-caption');
    const first = caption();
    await pass(1000);
    await pass(1000);
    expect(caption()).toBe(first); // seconds ticking do not change what a screen reader is told
    expect(screen.getByTestId('timer-caption').props.accessibilityLiveRegion).toBe('polite');
    press('timer-pause');
    expect(caption()).toBe('Timer paused');
  });
});
