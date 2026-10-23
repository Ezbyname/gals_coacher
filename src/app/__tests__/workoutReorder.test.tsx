import { resolve } from 'node:path';

import { router } from 'expo-router';
import { act as rtlAct, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { getPlannedWorkout, startSession } from '@/data/local/training/trainingRepository';
import { createBlock } from '@/data/local/training/workoutRepository';
import { stripBidi } from '@/i18n/bidi';
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

/** TRAINING-STOPWATCH-001 (additional scope): reordering the exercises of a workout in the Builder, on the real route tree. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let daniel = '';
const rx = (sets: number, target: number | null) => ({ sets, target, loadKg: null, restSec: 60 });

async function prepare(language: 'he' | 'en') {
  mounted = false;
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  let tick = new Date(2026, 9, 20, 12).getTime();
  jest.spyOn(systemClock, 'wallNow').mockImplementation(() => (tick += 1000)); // every write has its own updated_at
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  daniel = p.profile.player.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

/** A saved plan: [PUSH_UP] [Block: PLANK, BODYWEIGHT_SQUAT, GLUTE_BRIDGE] [DEAD_BUG] */
async function seededPlan(blockName = 'Core') {
  const made = await createBlock(db!, { name: blockName, items: ['PLANK', 'BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE'].map((exerciseId) => ({ exerciseId, prescription: rx(2, 10) })) }, deps);
  if (!made.ok) throw new Error('seed');
  const r = await savePlannedWorkout(
    db!,
    {
      planId: null,
      playerId: daniel,
      name: `Reorder day ${blockName}`,
      entries: [
        { kind: 'EXERCISE', exerciseId: 'PUSH_UP', prescription: rx(3, 10) },
        { kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) },
        { kind: 'EXERCISE', exerciseId: 'DEAD_BUG', prescription: rx(2, 10) },
      ],
    },
    deps,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const has = (id: string) => screen.queryByTestId(id) !== null;
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const names = () => screen.queryAllByTestId(/^builder-entry-\d+-item-\d+-name$/).map((n) => stripBidi(String(n.props.children)));
const stored = async (planId: string) => (await getPlannedWorkout(db!, planId))!.items.map((i) => i.exercise.exerciseId);
const act = (id: string, actionName: 'moveUp' | 'moveDown') => fireEvent(screen.getByTestId(id), 'accessibilityAction', { nativeEvent: { actionName } });
/** Opens the saved plan in the Builder from the Player page, so Save has a screen to go back to (as in the app). */
let mounted = false;
async function openBuilder(planId: string) {
  if (!mounted) renderRouter(routes, { initialUrl: `/children/${daniel}` });
  mounted = true; // a second open in the same test continues from the Player page Save went back to
  await screen.findByTestId('training-create-workout');
  await rtlAct(async () => {
    await Promise.resolve();
  });
  rtlAct(() => router.push(`/children/${daniel}/training/builder/${planId}` as never));
  await screen.findByTestId('builder-scroll');
}
const touched = async (planId: string) => (await db!.getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM planned_workouts WHERE id = ?', [planId]))!.updated_at;
/** Presses Save and waits until the plan row was written (the Builder has no screen to go back to in these tests). */
async function save(planId: string) {
  const before = await touched(planId);
  press('builder-save');
  await waitFor(async () => expect(await touched(planId)).not.toBe(before));
}

describe('Builder: reorder inside a section and between entries', () => {
  it('Move up inside a Block section reorders its exercises; Save persists it; the reopened Builder shows it', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await openBuilder(plan.id);
    expect(names().length).toBe(5);
    press('builder-entry-1-item-2-up'); // GLUTE_BRIDGE above BODYWEIGHT_SQUAT
    press('builder-entry-1-item-1-up'); // ... and above PLANK
    await save(plan.id);
    expect(await stored(plan.id)).toEqual(['PUSH_UP', 'GLUTE_BRIDGE', 'PLANK', 'BODYWEIGHT_SQUAT', 'DEAD_BUG']);
    await openBuilder(plan.id);
    expect(names().length).toBe(5); // the reopened Builder renders every exercise, from the saved order
    expect(await stored(plan.id)).toEqual(['PUSH_UP', 'GLUTE_BRIDGE', 'PLANK', 'BODYWEIGHT_SQUAT', 'DEAD_BUG']);
  });

  it('the handle\'s accessibility actions give the SAME result as the Move buttons (entry level and inside a section)', async () => {
    await prepare('en');
    const a = await seededPlan();
    await openBuilder(a.id);
    act('builder-entry-1-item-0-handle', 'moveDown'); // PLANK below BODYWEIGHT_SQUAT
    act('builder-entry-2-handle', 'moveUp'); // DEAD_BUG above the Block
    await save(a.id);
    const viaActions = await stored(a.id);

    const b = await seededPlan('Core 2');
    await openBuilder(b.id);
    press('builder-entry-1-item-0-down');
    press('builder-entry-2-up');
    await save(b.id);
    expect(await stored(b.id)).toEqual(viaActions);
    expect(viaActions).toEqual(['PUSH_UP', 'DEAD_BUG', 'BODYWEIGHT_SQUAT', 'PLANK', 'GLUTE_BRIDGE']);
  });

  it('no control moves an exercise across sections: a standalone entry has no inner handle, the first / last of a section have no up / down', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await openBuilder(plan.id);
    expect(has('builder-entry-0-item-0-handle')).toBe(false); // standalone
    expect(has('builder-entry-2-item-0-handle')).toBe(false);
    expect(has('builder-entry-1-item-0-up')).toBe(false); // first of the section
    expect(has('builder-entry-1-item-2-down')).toBe(false); // last of the section
    act('builder-entry-1-item-0-handle', 'moveUp'); // a refused step does nothing
    act('builder-entry-1-item-2-handle', 'moveDown');
    await save(plan.id);
    expect(await stored(plan.id)).toEqual(['PUSH_UP', 'PLANK', 'BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE', 'DEAD_BUG']);
  });

  it('a reorder that is not saved changes nothing in the database (the plan is only a local draft until Save)', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await openBuilder(plan.id);
    press('builder-entry-2-up');
    expect(await stored(plan.id)).toEqual(['PUSH_UP', 'PLANK', 'BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE', 'DEAD_BUG']);
  });

  it('a started plan is read-only: no handle, no Move buttons, and the repository refuses a save', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await startSession(db!, plan.id, deps);
    await openBuilder(plan.id).catch(() => undefined);
    await screen.findByTestId('builder-readonly');
    for (const gone of ['builder-entry-1-handle', 'builder-entry-1-item-0-handle', 'builder-entry-1-up', 'builder-entry-1-item-1-up']) expect(has(gone)).toBe(false);
  });

  it('Hebrew: the same reorder works and the handle is labelled in Hebrew', async () => {
    await prepare('he');
    const plan = await seededPlan();
    await openBuilder(plan.id);
    expect(String(screen.getByTestId('builder-entry-1-handle').props.accessibilityLabel)).toMatch(/שינוי סדר/);
    press('builder-entry-2-up');
    await save(plan.id);
    expect(await stored(plan.id)).toEqual(['PUSH_UP', 'DEAD_BUG', 'PLANK', 'BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE']);
  });
});

describe('Builder: dragging the handle', () => {
  const touchAt = (y: number, time: number) => ({
    nativeEvent: { touches: [{ pageX: 0, pageY: y, identifier: 0, timestamp: time }], changedTouches: [{ pageX: 0, pageY: y, identifier: 0, timestamp: time }], pageY: y, pageX: 0, identifier: 0, timestamp: time, target: 1 },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: time,
      numberActiveTouches: 1,
      touchBank: [{ touchActive: true, startPageX: 0, startPageY: 0, startTimeStamp: 0, currentPageX: 0, currentPageY: y, currentTimeStamp: time, previousPageX: 0, previousPageY: 0, previousTimeStamp: 0 }],
    },
  });
  const layout = (id: string, y: number, height: number) => fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: { x: 0, y, width: 300, height } } });

  it('dragging an entry from the bottom to the top moves it there; a tiny drag is only a tap', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await openBuilder(plan.id);
    layout('builder-entry-0', 0, 100);
    layout('builder-entry-1', 100, 300);
    layout('builder-entry-2', 400, 100);
    const handle = screen.getByTestId('builder-entry-2-handle');
    fireEvent(handle, 'responderGrant', touchAt(0, 0));
    fireEvent(handle, 'responderMove', touchAt(3, 10));
    fireEvent(handle, 'responderRelease', touchAt(3, 20)); // 3 px: not a drag
    await save(plan.id);
    expect(await stored(plan.id)).toEqual(['PUSH_UP', 'PLANK', 'BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE', 'DEAD_BUG']);
  });

  it('a long drag up moves the entry to the top', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await openBuilder(plan.id);
    layout('builder-entry-0', 0, 100);
    layout('builder-entry-1', 100, 300);
    layout('builder-entry-2', 400, 100);
    const handle = screen.getByTestId('builder-entry-2-handle');
    fireEvent(handle, 'responderGrant', touchAt(0, 0));
    fireEvent(handle, 'responderMove', touchAt(-200, 10));
    fireEvent(handle, 'responderMove', touchAt(-390, 20));
    fireEvent(handle, 'responderRelease', touchAt(-390, 30));
    await save(plan.id);
    expect(await stored(plan.id)).toEqual(['DEAD_BUG', 'PUSH_UP', 'PLANK', 'BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE']);
  });
});
