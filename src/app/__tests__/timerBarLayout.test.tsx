import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform, StyleSheet } from 'react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';

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

jest.setTimeout(45_000);

/**
 * TRAINING-TIMER-001 — the pinned timer bar must reserve its own space. Jest cannot prove pixels, so this proves the
 * STRUCTURE that makes overlap impossible: the bar is an ordinary (not absolutely positioned) sibling placed BEFORE the
 * scroll view, so the workout starts below it; with no timer nothing is rendered, so no gap is left; and every state
 * (work running / paused / finished, rest) goes through that same single layout path. The on-device pixels are checked
 * on the APK.
 */
const routes = appRoutes(resolve(__dirname, '..')) as never;
let wall = new Date(2026, 9, 20, 12, 0, 0).getTime();
let mono = 10_000;
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };

async function open(language: 'he' | 'en') {
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
  const plan = await savePlannedWorkout(
    opened,
    { planId: null, playerId: p.profile.player.id, name: 'Layout day', entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 3, target: 30, loadKg: null, restSec: 45 } }] },
    deps,
  );
  if (!plan.ok) throw new Error('seed');
  const session = await startSession(opened, plan.plan.id, deps);
  renderRouter(routes, { initialUrl: sessionPath(p.profile.player.id, session.id) });
  await screen.findByTestId('session-scroll');
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

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
async function pass(ms: number) {
  wall += ms;
  mono += ms;
  await act(async () => {
    jest.advanceTimersByTime(300); // expo-router's test library runs on fake timers
  });
}

function find(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null, testID: string): ReactTestRendererJSON | null {
  if (node === null) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = find(n, testID);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.testID === testID) return node;
  for (const child of node.children ?? []) {
    if (typeof child === 'string') continue;
    const hit = find(child, testID);
    if (hit) return hit;
  }
  return null;
}
const rootChildren = () => {
  const root = find(screen.toJSON(), 'session-root')!;
  return (root.children ?? []).filter((c): c is ReactTestRendererJSON => typeof c !== 'string');
};
const ids_ = () => rootChildren().map((c) => String(c.props.testID));

/** The single layout contract, asserted in every state: [bar, scroll] in normal flow, bar not absolute, controls in one row. */
function expectBarReservesItsOwnSpace() {
  expect(ids_()).toEqual(['timer-bar', 'session-scroll-root']); // the bar comes first and the scroll view follows it
  const bar = rootChildren()[0]!;
  const flat = StyleSheet.flatten(bar.props.style) as Record<string, unknown>;
  expect(flat.position).not.toBe('absolute'); // never an overlay
  expect(flat.zIndex).toBeUndefined();
  const buttons = find(screen.toJSON(), 'timer-buttons')!;
  expect((StyleSheet.flatten(buttons.props.style) as { flexDirection?: string }).flexDirection).toBe('row'); // compact: one row
}

describe('the timer bar reserves its own space (no overlap) in every state', () => {
  it('no timer: nothing is rendered above the scroll view, so no timer-specific gap exists', async () => {
    await open('en');
    expect(ids_()).toEqual(['session-scroll-root']);
    expect(find(screen.toJSON(), 'timer-bar')).toBeNull();
  });

  it('WORK running, PAUSED, FINISHED (Time\'s up) and REST all use the same layout path', async () => {
    await open('en');
    press('session-ex-0-set-1-timer-start'); // WORK running
    await screen.findByTestId('timer-bar');
    expectBarReservesItsOwnSpace();

    press('timer-pause'); // PAUSED
    await screen.findByTestId('timer-resume');
    expectBarReservesItsOwnSpace();
    press('timer-resume');

    await pass(31_000); // FINISHED
    await waitFor(() => expect(screen.getByTestId('timer-record')).toBeTruthy());
    expectBarReservesItsOwnSpace();
    press('timer-dismiss');
    await waitFor(() => expect(find(screen.toJSON(), 'timer-bar')).toBeNull());
    expect(ids_()).toEqual(['session-scroll-root']); // the gap is gone again

    fireEventSave();
    await waitFor(() => expect(find(screen.toJSON(), 'timer-skip-rest')).not.toBeNull()); // REST
    expectBarReservesItsOwnSpace();
    press('timer-skip-rest');
    await waitFor(() => expect(ids_()).toEqual(['session-scroll-root']));
  });

  it('the same contract holds in Hebrew (RTL)', async () => {
    await open('he');
    press('session-ex-0-set-1-timer-start');
    await screen.findByTestId('timer-bar');
    expectBarReservesItsOwnSpace();
  });
});

function fireEventSave() {
  fireEvent.changeText(screen.getByTestId('session-ex-0-set-2-DURATION_S'), '30');
  press('session-ex-0-set-2-save');
}
