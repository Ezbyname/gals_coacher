import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { setExerciseActive } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { archivePlayer, createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { getPlannedWorkout, listTraining, startSession } from '@/data/local/training/trainingRepository';
import { createBlock, getBlock, setBlockActive } from '@/data/local/training/workoutRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** QB-WORKOUT-BUILDER-001C (WB-ENTRY-01…14): Exercise / Block Details → Add to workout, through the real route tree and real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 16, 17).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
const players: Record<string, string> = {};

async function prepare(language: 'he' | 'en', names: string[] = ['Daniel']) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  for (const name of names) {
    const p = await createPlayer(opened, { player: { name, dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
    if (!p.ok) throw new Error('seed');
    players[name] = p.profile.player.id;
  }
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const rx = (sets: number, target: number | null) => ({ sets, target, loadKg: null, restSec: 60 });
async function block(name: string, ...exerciseIds: string[]) {
  const r = await createBlock(db!, { name, items: exerciseIds.map((exerciseId) => ({ exerciseId, prescription: rx(2, 10) })) }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.block;
}
async function plan(player: string, name: string, ...exerciseIds: string[]) {
  const r = await savePlannedWorkout(
    db!,
    { planId: null, playerId: players[player]!, name, entries: exerciseIds.map((exerciseId) => ({ kind: 'EXERCISE', exerciseId, prescription: rx(3, 8) }) as const) },
    deps,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const has = (testID: string) => screen.queryByTestId(testID) !== null;
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const disabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;
const checked = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.checked === true;
const planCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts'))!.n;
const plansOf = async (player: string) => (await listTraining(db!, players[player]!)).planned;
const exercisesOf = async (planId: string) => (await getPlannedWorkout(db!, planId))!.items.map((i) => i.exercise.exerciseId);

async function openAssign(kind: 'EXERCISE' | 'BLOCK', id: string) {
  // through the real Details screen: its button is the entry point
  renderRouter(routes, { initialUrl: kind === 'BLOCK' ? `/workouts/blocks/${id}` : `/exercises/${id}` });
  const button = kind === 'BLOCK' ? 'block-form-add-to-workout' : 'exercise-details-add-to-workout';
  await screen.findByTestId(button);
  press(button);
  await screen.findByTestId('assign-continue');
}
const pick = (player: string) => press(`assign-player-${players[player]}`);
const dest = (player: string, planId: string | 'new') => press(`assign-dest-${players[player]}-${planId}`);

describe('entry points (WB-ENTRY-01 / 04 / 09)', () => {
  it('WB-ENTRY-01: Exercise Details exposes Add to workout; WB-ENTRY-09: an inactive Exercise does not', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/exercises/FREE_THROWS' });
    await screen.findByTestId('exercise-details-add-to-workout');
    expect(screen.getAllByText('Add to workout').length).toBeGreaterThan(0);
    await setExerciseActive(db!, 'PLANK', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/exercises/PLANK' });
    await screen.findByTestId('exercise-details-toggle');
    expect(has('exercise-details-add-to-workout')).toBe(false);
  });

  it('WB-ENTRY-04: Block Details exposes Add to workout; WB-ENTRY-09: a hidden Block does not (and the route refuses it)', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS');
    renderRouter(routes, { initialUrl: `/workouts/blocks/${shooting.id}` });
    await screen.findByTestId('block-form-add-to-workout');
    await setBlockActive(db!, shooting.id, false, { clock: systemClock });
    renderRouter(routes, { initialUrl: `/workouts/blocks/${shooting.id}` });
    await screen.findByTestId('block-form-toggle');
    expect(has('block-form-add-to-workout')).toBe(false);
    renderRouter(routes, { initialUrl: `/workouts/add-to-workout?kind=BLOCK&id=${shooting.id}` });
    await screen.findByTestId('assign-inactive');
    expect(has('assign-continue')).toBe(false);
  });

  it('WB-ENTRY-09: an inactive Exercise reached by the route directly cannot be assigned either', async () => {
    await prepare('en');
    await setExerciseActive(db!, 'PLANK', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/workouts/add-to-workout?kind=EXERCISE&id=PLANK' });
    await screen.findByTestId('assign-inactive');
    expect(has('assign-continue')).toBe(false);
    expect(await planCount()).toBe(0);
  });
});

describe('Exercise → workout (WB-ENTRY-02 / 03)', () => {
  it('WB-ENTRY-02: add to one existing editable workout as a standalone Exercise', async () => {
    await prepare('en');
    const existing = await plan('Daniel', 'Tuesday', 'FREE_THROWS');
    await openAssign('EXERCISE', 'PUSH_UP');
    expect(checked(`assign-player-${players.Daniel}`)).toBe(true); // the one relevant Player is visibly preselected
    expect(disabled('assign-continue')).toBe(true); // …but the destination still has to be chosen
    dest('Daniel', existing.id);
    await waitFor(() => expect(disabled('assign-continue')).toBe(false));
    press('assign-continue');
    await screen.findByTestId(`assign-result-${players.Daniel}`);
    expect(text(`assign-result-${players.Daniel}-text`)).toBe('Added to Daniel: Tuesday');
    expect(await exercisesOf(existing.id)).toEqual(['FREE_THROWS', 'PUSH_UP']);
    expect((await getPlannedWorkout(db!, existing.id))!.items[1]).toMatchObject({ blockName: null, sectionId: null });
    expect(await planCount()).toBe(1);
  });

  it('WB-ENTRY-03: Create new workout opens the SAME Builder with the Exercise as its first entry; Cancel leaves no plan', async () => {
    await prepare('en');
    await openAssign('EXERCISE', 'PUSH_UP');
    expect(has(`assign-nodest-${players.Daniel}`)).toBe(true);
    expect(text(`assign-nodest-${players.Daniel}`)).toBe("Daniel doesn't have an editable planned workout yet.");
    press('assign-continue'); // "Create new workout" was preselected: it is the only destination
    await screen.findByTestId('builder-name');
    expect(await planCount()).toBe(0); // a local draft only
    expect(has('builder-entry-0')).toBe(true);
    expect(text('builder-entry-0-title')).toBe('Single exercise');
    press('builder-cancel');
    await waitFor(() => expect(has('builder-name')).toBe(false));
    expect(await planCount()).toBe(0);
  });

  it('WB-ENTRY-03: …and Save from that Builder creates exactly one plan holding the Exercise', async () => {
    await prepare('en');
    await openAssign('EXERCISE', 'PUSH_UP');
    press('assign-continue');
    await screen.findByTestId('builder-entry-0');
    press('builder-save');
    await waitFor(async () => expect(await planCount()).toBe(1));
    expect(await exercisesOf((await plansOf('Daniel'))[0]!.id)).toEqual(['PUSH_UP']);
  });
});

describe('Block → workout (WB-ENTRY-05 / 06)', () => {
  it('WB-ENTRY-05: adds an independent copied section to an existing workout; the Block is unchanged', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS', 'PLANK');
    const existing = await plan('Daniel', 'Tuesday', 'PUSH_UP');
    await openAssign('BLOCK', shooting.id);
    dest('Daniel', existing.id);
    press('assign-continue');
    await screen.findByTestId(`assign-result-${players.Daniel}`);
    const after = (await getPlannedWorkout(db!, existing.id))!;
    expect(after.items.map((i) => [i.exercise.exerciseId, i.sourceBlockId])).toEqual([
      ['PUSH_UP', null],
      ['FREE_THROWS', shooting.id],
      ['PLANK', shooting.id],
    ]);
    expect(after.items[1]!.sectionId).not.toBeNull();
    expect(await getBlock(db!, shooting.id)).toEqual(shooting);
  });

  it('WB-ENTRY-06: Create new workout opens the Builder with the Block as its first section and saves it', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS', 'PLANK');
    await openAssign('BLOCK', shooting.id);
    press('assign-continue');
    await screen.findByTestId('builder-entry-0');
    expect(text('builder-entry-0-title')).toBe('Block: Shooting');
    expect(has('builder-entry-0-item-1')).toBe(true);
    expect(await planCount()).toBe(0);
    press('builder-save');
    await waitFor(async () => expect(await planCount()).toBe(1));
    const saved = (await plansOf('Daniel'))[0]!;
    expect(saved.items.map((i) => [i.exercise.exerciseId, i.sourceBlockId])).toEqual([['FREE_THROWS', shooting.id], ['PLANK', shooting.id]]);
  });
});

describe('who and where (WB-ENTRY-07 / 08)', () => {
  it('WB-ENTRY-07: a workout that already has a session is not a destination (only editable ones are offered)', async () => {
    await prepare('en');
    const started = await plan('Daniel', 'Already started', 'PUSH_UP');
    const free = await plan('Daniel', 'Still planned', 'PLANK');
    await startSession(db!, started.id, deps);
    await openAssign('EXERCISE', 'FREE_THROWS');
    expect(has(`assign-dest-${players.Daniel}-${free.id}`)).toBe(true);
    expect(has(`assign-dest-${players.Daniel}-${started.id}`)).toBe(false);
  });

  it('WB-ENTRY-08: an archived Player is not selectable; with several Players nobody is preselected', async () => {
    await prepare('en', ['Daniel', 'Alice', 'Tom']);
    await archivePlayer(db!, players.Tom!, { clock: systemClock });
    await openAssign('EXERCISE', 'FREE_THROWS');
    expect(has(`assign-player-${players.Daniel}`)).toBe(true);
    expect(has(`assign-player-${players.Alice}`)).toBe(true);
    expect(has(`assign-player-${players.Tom}`)).toBe(false);
    expect(checked(`assign-player-${players.Daniel}`)).toBe(false);
    expect(checked(`assign-player-${players.Alice}`)).toBe(false); // explicit selection is required
    expect(disabled('assign-continue')).toBe(true);
  });
});

describe('several Players (WB-ENTRY-10 / 11 / 12 / 13)', () => {
  it('WB-ENTRY-10 + 11: two Players → two independent workouts; opening one for edit shows only that Player\'s plan', async () => {
    await prepare('en', ['Daniel', 'Alice', 'Tom']);
    const handling = await block('Ball handling', 'FREE_THROWS', 'PLANK');
    await openAssign('BLOCK', handling.id);
    pick('Daniel');
    pick('Alice');
    // neither Player has an editable workout: "Create new workout" is the only destination and is already chosen
    expect(screen.getByTestId(`assign-dest-${players.Daniel}-new`).props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId(`assign-dest-${players.Alice}-new`).props.accessibilityState?.selected).toBe(true);
    expect(disabled('assign-continue')).toBe(false);
    press('assign-continue');
    await screen.findByTestId('assign-done');
    expect(await planCount()).toBe(2);
    const [d] = await plansOf('Daniel');
    const [a] = await plansOf('Alice');
    expect(d!.id).not.toBe(a!.id);
    expect(await plansOf('Tom')).toEqual([]);
    expect(new Set([...d!.items, ...a!.items].map((i) => i.sectionId)).size).toBe(2);
    press(`assign-result-${players.Daniel}-edit`);
    await screen.findByTestId('builder-name');
    expect(screen.getByTestId('builder-name').props.value).toBe('New workout');
    expect((await getPlannedWorkout(db!, a!.id))!.items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS', 'PLANK']);
  });

  it('WB-ENTRY-12: each Player chooses an existing workout or a new one independently', async () => {
    await prepare('en', ['Daniel', 'Alice', 'Tom']);
    const shooting = await block('Shooting', 'FREE_THROWS');
    const dPlan = await plan('Daniel', 'Daniel strength', 'PUSH_UP');
    await plan('Daniel', 'Daniel other', 'PLANK');
    await openAssign('BLOCK', shooting.id);
    pick('Daniel');
    pick('Alice');
    pick('Tom');
    expect(has(`assign-nodest-${players.Alice}`)).toBe(true); // no editable workout: said clearly, new is the only way
    expect(has(`assign-nodest-${players.Daniel}`)).toBe(false);
    dest('Daniel', dPlan.id);
    dest('Tom', 'new');
    press('assign-continue');
    await screen.findByTestId('assign-done');
    expect(await exercisesOf(dPlan.id)).toEqual(['PUSH_UP', 'FREE_THROWS']);
    expect((await plansOf('Daniel')).map((p) => p.name).sort()).toEqual(['Daniel other', 'Daniel strength']);
    expect((await plansOf('Alice')).map((p) => p.name)).toEqual(['New workout']);
    expect((await plansOf('Tom')).map((p) => p.name)).toEqual(['New workout']);
    expect(text(`assign-result-${players.Daniel}-text`)).toBe('Added to Daniel: Daniel strength');
    expect(text(`assign-result-${players.Alice}-text`)).toBe('New workout for Alice: New workout');
  });

  it('WB-ENTRY-13: a failure for one Player is never shown as success; it names the Player and nothing was added for anyone', async () => {
    await prepare('en', ['Daniel', 'Alice']);
    const shooting = await block('Shooting', 'FREE_THROWS');
    const dPlan = await plan('Daniel', 'Daniel strength', 'PUSH_UP');
    await openAssign('BLOCK', shooting.id);
    pick('Daniel');
    pick('Alice');
    dest('Daniel', dPlan.id);
    dest('Alice', 'new');
    const before = JSON.stringify(await db!.getAllAsync('SELECT * FROM planned_workout_items ORDER BY rowid'));
    await db!.execAsync(`CREATE TEMP TRIGGER zz_boom BEFORE INSERT ON planned_workouts WHEN NEW.player_id = '${players.Alice}' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    press('assign-continue');
    await screen.findByTestId('assign-failed');
    await db!.execAsync('DROP TRIGGER zz_boom');
    expect(text('assign-failed')).toMatch(/^Nothing was added\. Alice:/);
    expect(has('assign-done')).toBe(false); // no success screen
    expect(await planCount()).toBe(1);
    expect(JSON.stringify(await db!.getAllAsync('SELECT * FROM planned_workout_items ORDER BY rowid'))).toBe(before);
    // recoverable: the selection is still there, and it works once the cause is gone
    press('assign-continue');
    await screen.findByTestId('assign-done');
    expect(await planCount()).toBe(2);
  });
});

describe('languages (WB-ENTRY-14)', () => {
  it('WB-ENTRY-14: the whole flow works in Hebrew (labels, no-editable-workout text, results)', async () => {
    await prepare('he', ['Daniel', 'Alice']);
    const shooting = await block('Shooting', 'FREE_THROWS');
    await openAssign('BLOCK', shooting.id);
    pick('Daniel');
    expect(text('assign-intro')).toContain('Shooting');
    expect(text(`assign-nodest-${players.Daniel}`)).toBe('לDaniel עדיין אין אימון מתוכנן שאפשר לערוך.');
    expect(text(`assign-dest-${players.Daniel}-new`.replace(/^/, '')).length).toBeGreaterThan(0);
    press('assign-continue'); // exactly one Player + new workout → the Builder, in Hebrew
    await screen.findByTestId('builder-entry-0');
    expect(text('builder-entry-0-title')).toBe('בלוק: Shooting');
  });

  it('WB-ENTRY-14: …and in English with two Players (LTR labels, results list)', async () => {
    await prepare('en', ['Daniel', 'Alice']);
    const shooting = await block('Shooting', 'FREE_THROWS');
    await openAssign('BLOCK', shooting.id);
    pick('Daniel');
    pick('Alice');
    press('assign-continue');
    await screen.findByTestId('assign-done');
    expect(text('assign-done-title')).toBe('Added');
    expect(await planCount()).toBe(2);
  });
});
