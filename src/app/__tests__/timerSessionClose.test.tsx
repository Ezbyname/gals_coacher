import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { startSession } from '@/data/local/training/trainingRepository';
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
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), release: jest.fn() })),
}));

/**
 * The TimerBar is replaced by a bare PROBE (no cleanup of its own): these tests prove that the timer's end does NOT
 * depend on a mounted TimerBar — the session close itself clears the timer, after the close succeeded.
 */
jest.mock('@/features/training/timer/TimerBar', () => {
  const actual = jest.requireActual('@/features/training/timer/TimerBar');
  const React = jest.requireActual('react');
  const { Pressable, Text, View } = jest.requireActual('react-native');
  const { useWorkoutTimer } = jest.requireActual('@/features/training/timer/WorkoutTimerProvider');
  return {
    ...actual,
    TimerBar: () => {
      const t = useWorkoutTimer();
      return React.createElement(
        View,
        null,
        React.createElement(Text, { testID: 'probe-timer' }, t.state ? `${t.state.kind}:${t.state.phase}:${t.state.identity.sessionId}` : 'none'),
        React.createElement(Pressable, {
          testID: 'probe-start-other',
          onPress: () => t.startWork({ sessionId: 'other-session', exerciseId: 'x', exercisePosition: 0, setId: 'other-set', setNumber: 1 }, 30),
        }),
      );
    },
  };
});

jest.setTimeout(45_000);

const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 20, 12, 0, 0).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let player = '';
let sessionId = '';

async function prepare() {
  await prepareApp('en');
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  player = p.profile.player.id;
  const plan = await savePlannedWorkout(
    opened,
    { planId: null, playerId: player, name: 'Close day', entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 2, target: 30, loadKg: null, restSec: 45 } }] },
    deps,
  );
  if (!plan.ok) throw new Error('seed');
  sessionId = (await startSession(opened, plan.plan.id, deps)).id;
  renderRouter(routes, { initialUrl: sessionPath(player, sessionId) });
  await screen.findByTestId('session-scroll');
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const probe = () => String(screen.getByTestId('probe-timer').props.children);
const set = (n: number) => `session-ex-0-set-${n}`;
const status = async () => (await db!.getFirstAsync<{ status: string }>('SELECT status FROM training_sessions'))!.status;
async function save(n: number, value: string) {
  fireEvent.changeText(screen.getByTestId(`${set(n)}-DURATION_S`), value);
  press(`${set(n)}-save`);
  await waitFor(async () => expect((await db!.getFirstAsync<{ s: string }>('SELECT status AS s FROM session_sets WHERE set_number = ?', [n]))!.s).toBe('DONE'));
}

describe('a successful close ends the timer of THAT session, whether or not any timer UI is mounted', () => {
  it('1: COMPLETED clears an active timer', async () => {
    await prepare();
    await save(1, '30'); // a rest timer starts for set 2
    await waitFor(() => expect(probe()).toBe(`REST:RUNNING:${sessionId}`));
    await save(2, '30'); // set 2 done; the rest bound to it is now stale (nothing but the close will clear it here)
    expect(probe()).toBe(`REST:RUNNING:${sessionId}`);
    press('session-finish');
    await waitFor(async () => expect(await status()).toBe('COMPLETED'));
    await waitFor(() => expect(probe()).toBe('none'));
  });

  it('2: PARTIAL clears an active timer', async () => {
    await prepare();
    await save(1, '30');
    await waitFor(() => expect(probe()).toBe(`REST:RUNNING:${sessionId}`));
    press('session-finish');
    await waitFor(async () => expect(await status()).toBe('PARTIAL'));
    await waitFor(() => expect(probe()).toBe('none'));
  });

  it('3: ABANDONED clears an active work timer', async () => {
    await prepare();
    press(`${set(1)}-timer-start`);
    await waitFor(() => expect(probe()).toBe(`WORK:RUNNING:${sessionId}`));
    const alert = jest.spyOn(Alert, 'alert');
    press('session-abandon');
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; style?: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.style !== 'cancel')!.onPress!());
    await waitFor(async () => expect(await status()).toBe('ABANDONED'));
    await waitFor(() => expect(probe()).toBe('none'));
  });

  it('4: a FAILED close keeps the timer (nothing was performed, so the close is refused)', async () => {
    await prepare();
    press(`${set(1)}-timer-start`);
    await waitFor(() => expect(probe()).toBe(`WORK:RUNNING:${sessionId}`));
    press('session-finish');
    await screen.findByTestId('session-failed');
    expect(await status()).toBe('IN_PROGRESS');
    expect(probe()).toBe(`WORK:RUNNING:${sessionId}`);
  });

  it("5: closing session A never clears a timer that belongs to another session", async () => {
    await prepare();
    await save(1, '30');
    press('probe-start-other'); // a timer of ANOTHER session
    await waitFor(() => expect(probe()).toBe('WORK:RUNNING:other-session'));
    press('session-finish');
    await waitFor(async () => expect(await status()).toBe('PARTIAL'));
    expect(probe()).toBe('WORK:RUNNING:other-session');
  });
});
