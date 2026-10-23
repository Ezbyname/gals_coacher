import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform } from 'react-native';

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

jest.setTimeout(45_000);

/**
 * TRAINING-STOPWATCH-001 on the real session route: the stopwatch for TIME sets, the timed+load record fix (also for the
 * TRAINING-TIMER-001 countdown), and the set execution UX (states, Next, planned / extra progress, finish summary).
 */
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

async function prepare(entries: Parameters<typeof savePlannedWorkout>[1]['entries']) {
  await prepareApp('en');
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
  const plan = await savePlannedWorkout(opened, { planId: null, playerId: player, name: 'Stopwatch day', entries }, deps);
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

const sprint = (sets: number, target = 5) => ({ kind: 'EXERCISE' as const, exerciseId: 'SPRINT_10M', prescription: { sets, target, loadKg: null, restSec: 60, timeSemantics: 'COMPLETION_TIME_CAP' as const } });
const sled = (sets: number) => ({ kind: 'EXERCISE' as const, exerciseId: 'SLED_PUSH', prescription: { sets, target: 20, loadKg: null, restSec: null } });
const carry = (sets: number) => ({ kind: 'EXERCISE' as const, exerciseId: 'FARMER_CARRY', prescription: { sets, target: 30, loadKg: null, restSec: null } });
const plank = (sets: number) => ({ kind: 'EXERCISE' as const, exerciseId: 'PLANK', prescription: { sets, target: 30, loadKg: null, restSec: null } });

const has = (id: string) => screen.queryByTestId(id) !== null;
const text = (id: string) => stripBidi(String(screen.getByTestId(id).props.children));
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const set = (ex: number, n: number) => `session-ex-${ex}-set-${n}`;
const measurements = async () =>
  db!.getAllAsync<{ kind: string; measured_value: number; final_value: number; was_edited: number; source: string }>(
    'SELECT kind, measured_value, final_value, was_edited, source FROM set_measurements ORDER BY kind',
  );
const statuses = async () => (await db!.getAllAsync<{ status: string }>('SELECT status FROM session_sets ORDER BY rowid')).map((r) => r.status);
async function openSession() {
  renderRouter(routes, { initialUrl: sessionPath(player, sessionId) });
  await screen.findByTestId('session-scroll');
}
async function pass(ms: number) {
  advance(ms);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

describe('stopwatch eligibility', () => {
  it('a TIME set (planned or extra) offers the stopwatch; a DURATION set offers only the countdown', async () => {
    await prepare([sprint(1), plank(1)]);
    await openSession();
    expect(has(`${set(0, 1)}-stopwatch-start`)).toBe(true);
    expect(has(`${set(0, 1)}-timer-start`)).toBe(false); // the cap drill never gets a countdown
    expect(has(`${set(1, 1)}-stopwatch-start`)).toBe(false);
    expect(has(`${set(1, 1)}-timer-start`)).toBe(true);
    press('session-ex-0-add-set');
    await screen.findByTestId(`${set(0, 2)}-stopwatch-start`); // an extra TIME set may use it
    press('session-ex-1-add-set');
    await screen.findByTestId(`${set(1, 2)}`);
    expect(has(`${set(1, 2)}-stopwatch-start`)).toBe(false); // an extra DURATION set stays manual
    expect(has('timer-bar')).toBe(false);
  });
});

describe('stopwatch flow', () => {
  it('Start -> elapsed -> Stop suggests 0.01 s precision and writes nothing; Record writes ONE result and the plan is untouched', async () => {
    await prepare([sprint(2)]);
    await openSession();
    press(`${set(0, 1)}-stopwatch-start`);
    await screen.findByTestId('timer-bar');
    expect(has('timer-pause')).toBe(false); // no pause
    await pass(5370);
    expect(text('timer-caption')).toBe('Elapsed');
    press('timer-stop');
    expect(text('timer-caption')).toBe('Stopwatch stopped'); // the live-region announcement of the stop
    expect(text('timer-digits')).toBe('5.37');
    expect(screen.getByTestId(`${set(0, 1)}-TIME_S`).props.value).toBe('5.37'); // suggestion only
    expect(await measurements()).toEqual([]);
    expect(await statuses()).toEqual(['PENDING', 'PENDING']);
    press('timer-record');
    await waitFor(async () => expect((await measurements()).length).toBe(1));
    expect(await measurements()).toEqual([{ kind: 'TIME_S', measured_value: 5.37, final_value: 5.37, was_edited: 0, source: 'MANUAL' }]);
    expect(await db!.getFirstAsync('SELECT planned_target FROM session_sets ORDER BY rowid')).toEqual({ planned_target: 5 });
  });

  it('an actual above the cap is a valid result (no pass / fail)', async () => {
    await prepare([sprint(1, 5)]);
    await openSession();
    press(`${set(0, 1)}-stopwatch-start`);
    await screen.findByTestId('timer-bar');
    await pass(7200);
    press('timer-stop');
    press('timer-record');
    await waitFor(async () => expect(await statuses()).toEqual(['DONE']));
    expect((await measurements())[0]).toMatchObject({ kind: 'TIME_S', final_value: 7.2 });
  });

  it('starting a stopwatch on another set while one runs asks first; Cancel keeps it, confirming replaces it', async () => {
    await prepare([sprint(2)]);
    await openSession();
    press(`${set(0, 1)}-stopwatch-start`);
    await screen.findByTestId('timer-bar');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    press(`${set(0, 2)}-stopwatch-start`);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(text('timer-title')).toMatch(/1/); // still set 1
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => {
      buttons.find((b) => b.style !== 'cancel')!.onPress!();
    });
    await waitFor(() => expect(text('timer-title')).toMatch(/2/));
  });
});

describe('timed + load record (FARMER_CARRY / SLED_PUSH)', () => {
  it('SLED_PUSH: Record without a load saves nothing, shows what is missing and keeps the timed value; saving after entering the load stores both', async () => {
    await prepare([sled(1)]);
    await openSession();
    press(`${set(0, 1)}-stopwatch-start`);
    await screen.findByTestId('timer-bar');
    await pass(6120);
    press('timer-stop');
    press('timer-record');
    await waitFor(() => expect(has('timer-needs')).toBe(true));
    expect(text('timer-needs')).toContain('Load');
    expect(await measurements()).toEqual([]);
    expect(await statuses()).toEqual(['PENDING']); // never silently DONE
    expect(screen.getByTestId(`${set(0, 1)}-TIME_S`).props.value).toBe('6.12');
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-LOAD_KG`), '60');
    press(`${set(0, 1)}-save`);
    await waitFor(async () => expect(await statuses()).toEqual(['DONE']));
    expect(await measurements()).toEqual([
      { kind: 'LOAD_KG', measured_value: 60, final_value: 60, was_edited: 0, source: 'MANUAL' },
      { kind: 'TIME_S', measured_value: 6.12, final_value: 6.12, was_edited: 0, source: 'MANUAL' },
    ]);
  });

  it('SLED_PUSH: with the load already typed, the stopwatch Record stores both kinds in one go', async () => {
    await prepare([sled(1)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-LOAD_KG`), '45');
    press(`${set(0, 1)}-stopwatch-start`);
    await screen.findByTestId('timer-bar');
    await pass(4000);
    press('timer-stop');
    press('timer-record');
    await waitFor(async () => expect(await statuses()).toEqual(['DONE']));
    expect((await measurements()).map((m) => [m.kind, m.final_value])).toEqual([
      ['LOAD_KG', 45],
      ['TIME_S', 4],
    ]);
  });

  it('FARMER_CARRY: the countdown Record has the same behaviour (no load -> nothing saved, message shown)', async () => {
    await prepare([carry(1)]);
    await openSession();
    press(`${set(0, 1)}-timer-start`);
    await screen.findByTestId('timer-bar');
    await pass(31_000);
    press('timer-record');
    await waitFor(() => expect(has('timer-needs')).toBe(true));
    expect(await measurements()).toEqual([]);
    expect(await statuses()).toEqual(['PENDING']);
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-LOAD_KG`), '24');
    press(`${set(0, 1)}-save`);
    await waitFor(async () => expect(await statuses()).toEqual(['DONE']));
    expect((await measurements()).map((m) => [m.kind, m.final_value])).toEqual([
      ['DURATION_S', 30],
      ['LOAD_KG', 24],
    ]);
  });
});

describe('set execution UX', () => {
  it('states, Next hint (visual only), planned progress and skipped are counted from the set states', async () => {
    await prepare([plank(3)]);
    await openSession();
    expect(text(`${set(0, 1)}-state`)).toBe('Pending');
    expect(has(`${set(0, 1)}-next`)).toBe(true);
    expect(has(`${set(0, 2)}-next`)).toBe(false);
    expect(text('session-ex-0-progress')).toBe('0 / 3 planned sets completed');
    // out of order: the athlete does set 2 first; Next stays on the first pending set
    fireEvent.changeText(screen.getByTestId(`${set(0, 2)}-DURATION_S`), '28');
    press(`${set(0, 2)}-save`);
    await waitFor(() => expect(text(`${set(0, 2)}-state`)).toBe('Done'));
    expect(has(`${set(0, 1)}-next`)).toBe(true);
    expect(text(`${set(0, 2)}-actual`)).toContain('28'); // the actual is on the same row
    press(`${set(0, 3)}-skip`);
    await waitFor(() => expect(text(`${set(0, 3)}-state`)).toBe('Skipped'));
    expect(text('session-ex-0-progress')).toBe('1 / 3 planned sets completed · 1 skipped');
    expect(await statuses()).toEqual(['PENDING', 'DONE', 'SKIPPED']);
  });

  it('an extra set is never in the planned denominator, and a pending extra set does not read as "Exercise completed"', async () => {
    await prepare([plank(1)]);
    await openSession();
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(text('session-ex-0-state')).toBe('✓ Exercise completed'));
    press('session-ex-0-add-set');
    await screen.findByTestId(`${set(0, 2)}`);
    expect(text('session-ex-0-progress')).toBe('1 / 1 planned sets completed · Extra sets pending: 1');
    expect(text('session-ex-0-state')).toBe('Planned work completed');
    fireEvent.changeText(screen.getByTestId(`${set(0, 2)}-DURATION_S`), '25');
    press(`${set(0, 2)}-save`);
    await waitFor(() => expect(text('session-ex-0-state')).toBe('✓ Exercise completed'));
    expect(text('session-ex-0-progress')).toBe('1 / 1 planned sets completed · 1 extra performed');
  });

  it('the workout progress block counts planned sets and exercises, and becomes the summary once finished', async () => {
    await prepare([plank(2), sprint(1)]);
    await openSession();
    expect(text('session-progress-0')).toBe('0 / 3 planned sets completed');
    expect(text('session-progress-1')).toBe('0 / 2 exercises completed');
    fireEvent.changeText(screen.getByTestId(`${set(0, 1)}-DURATION_S`), '30');
    press(`${set(0, 1)}-save`);
    await waitFor(() => expect(text('session-progress-0')).toBe('1 / 3 planned sets completed'));
    press('session-finish');
    await waitFor(() => expect(has('session-read-only')).toBe(true));
    expect(text('session-progress-0')).toBe('1 / 3 planned sets completed'); // the same derived numbers, as a summary
    expect(has(`${set(0, 1)}-next`)).toBe(false);
  });
});
