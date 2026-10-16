import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { PlayerArchivedError } from '../../players/errors';
import { archivePlayer, createPlayer } from '../../players/playerRepository';
import { AssignmentFailedError, TrainingNotFoundError, TrainingRuleError } from '../errors';
import {
  assignContentToPlayers,
  savePlannedWorkout,
  updatePlannedItem,
  type AssignContent,
  type AssignTarget,
} from '../plannedWorkoutCompositionRepository';
import { getPlannedWorkout, listTraining, startSession } from '../trainingRepository';
import { createBlock, getBlock, setBlockActive } from '../workoutRepository';

/**
 * QB-WORKOUT-BUILDER-001C — Exercise / Block → Add to workout for one or several Players, on real SQLite.
 * WB-ENTRY-02/05/07/08/09/10/11/12/13 are proven here at the data layer; the UI tests cover the screens.
 */
const clock = { wallNow: () => new Date(2026, 9, 16, 17).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
let alice: string;
let tom: string;
const rx = (sets: number, target: number | null): Prescription => ({ sets, target, loadKg: null, restSec: 45 });
async function mkBlock(name: string, ...exerciseIds: string[]) {
  const r = await createBlock(db, { name, items: exerciseIds.map((exerciseId) => ({ exerciseId, prescription: rx(2, 10) })) }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.block;
}
const mkPlayer = async (name: string) => {
  const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  return r.profile.player.id;
};
async function mkPlan(playerId: string, name: string, ...exerciseIds: string[]) {
  const r = await savePlannedWorkout(
    db,
    { planId: null, playerId, name, entries: exerciseIds.map((exerciseId) => ({ kind: 'EXERCISE', exerciseId, prescription: rx(3, 8) }) as const) },
    deps,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const NEW = (playerId: string, name = 'New workout'): AssignTarget => ({ playerId, destination: { type: 'NEW', name } });
const INTO = (playerId: string, planId: string): AssignTarget => ({ playerId, destination: { type: 'EXISTING', planId } });
const BLOCK = (blockId: string): AssignContent => ({ kind: 'BLOCK', blockId });
const EXERCISE = (exerciseId: string): AssignContent => ({ kind: 'EXERCISE', exerciseId });
const ALL = ['planned_workouts', 'planned_workout_items', 'training_sessions'];
const dump = async () => Object.fromEntries(await Promise.all(ALL.map(async (t) => [t, await db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)] as const)));
const plansOf = async (playerId: string) => (await listTraining(db, playerId)).planned;

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  daniel = await mkPlayer('Daniel');
  alice = await mkPlayer('Alice');
  tom = await mkPlayer('Tom');
});
afterEach(() => db.closeAsync());

async function failure(promise: Promise<unknown>): Promise<AssignmentFailedError> {
  const e = await promise.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AssignmentFailedError);
  return e as AssignmentFailedError;
}

describe('Exercise → existing workout (WB-ENTRY-02)', () => {
  it('is added as a standalone Exercise (no fake Block) at the end, with its default prescription', async () => {
    const plan = await mkPlan(daniel, 'Tuesday', 'FREE_THROWS');
    const [result] = await assignContentToPlayers(db, EXERCISE('PUSH_UP'), [INTO(daniel, plan.id)], deps);
    expect(result).toMatchObject({ playerId: daniel, planId: plan.id, created: false, planName: 'Tuesday' });
    const after = (await getPlannedWorkout(db, plan.id))!;
    expect(after.items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS', 'PUSH_UP']);
    expect(after.items[1]).toMatchObject({ blockName: null, sectionId: null, sourceBlockId: null });
    expect(after.items.map((i) => i.position)).toEqual([0, 1]);
    expect(after.items[0]!.prescription).toEqual(rx(3, 8)); // existing content untouched
  });
});

describe('Block → existing workout (WB-ENTRY-05)', () => {
  it('adds an independent copied section; the Block is unchanged; the same Block can be added twice', async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS', 'PLANK');
    const plan = await mkPlan(daniel, 'Tuesday', 'PUSH_UP');
    await assignContentToPlayers(db, BLOCK(block.id), [INTO(daniel, plan.id)], deps);
    await assignContentToPlayers(db, BLOCK(block.id), [INTO(daniel, plan.id)], deps);
    const after = (await getPlannedWorkout(db, plan.id))!;
    expect(after.items.map((i) => i.exercise.exerciseId)).toEqual(['PUSH_UP', 'FREE_THROWS', 'PLANK', 'FREE_THROWS', 'PLANK']);
    expect(after.items.map((i) => i.sourceBlockId)).toEqual([null, block.id, block.id, block.id, block.id]);
    const sections = after.items.filter((i) => i.sectionId).map((i) => i.sectionId);
    expect(new Set(sections).size).toBe(2);
    expect(await getBlock(db, block.id)).toEqual(block); // provenance only: the Block never changes
  });
});

describe('several Players (WB-ENTRY-10 / 11 / 12)', () => {
  it('two Players, new workout each: TWO separate plans with independent copies; editing one never touches the other', async () => {
    const block = await mkBlock('Ball handling', 'FREE_THROWS', 'PLANK');
    const out = await assignContentToPlayers(db, BLOCK(block.id), [NEW(daniel, 'D plan'), NEW(alice, 'A plan')], deps);
    expect(out.map((o) => [o.playerId, o.created])).toEqual([[daniel, true], [alice, true]]);
    expect(out[0]!.planId).not.toBe(out[1]!.planId);
    const [d] = await plansOf(daniel);
    const [a] = await plansOf(alice);
    expect(d!.playerId).toBe(daniel);
    expect(a!.playerId).toBe(alice);
    expect(d!.items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS', 'PLANK']);
    expect(new Set([...d!.items, ...a!.items].map((i) => i.sectionId)).size).toBe(2); // one section id per Player
    expect(await plansOf(tom)).toEqual([]); // not selected: nothing
    // edit Daniel's workout: Alice's is exactly as it was
    const before = JSON.stringify((await getPlannedWorkout(db, a!.id))!);
    const edited = await updatePlannedItem(db, d!.id, 0, rx(9, 99), deps);
    expect(edited.ok).toBe(true);
    expect(JSON.stringify((await getPlannedWorkout(db, a!.id))!)).toBe(before);
    expect((await getPlannedWorkout(db, d!.id))!.items[0]!.prescription).toEqual(rx(9, 99));
    expect(await getBlock(db, block.id)).toEqual(block);
  });

  it('each Player chooses independently: Daniel an existing workout, Alice a new one, Tom another existing one', async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS');
    const dPlan = await mkPlan(daniel, 'Daniel strength', 'PUSH_UP');
    const tPlan = await mkPlan(tom, 'Tom basics', 'PLANK');
    const out = await assignContentToPlayers(db, BLOCK(block.id), [INTO(daniel, dPlan.id), NEW(alice, 'Alice new'), INTO(tom, tPlan.id)], deps);
    expect(out.map((o) => [o.planName, o.created])).toEqual([['Daniel strength', false], ['Alice new', true], ['Tom basics', false]]);
    expect((await getPlannedWorkout(db, dPlan.id))!.items.map((i) => i.exercise.exerciseId)).toEqual(['PUSH_UP', 'FREE_THROWS']);
    expect((await getPlannedWorkout(db, tPlan.id))!.items.map((i) => i.exercise.exerciseId)).toEqual(['PLANK', 'FREE_THROWS']);
    expect((await plansOf(alice)).map((p) => p.name)).toEqual(['Alice new']);
    expect(await plansOf(daniel)).toHaveLength(1); // the existing plan was used, no second one created
  });
});

describe('refusals leave NOTHING behind, for every Player (WB-ENTRY-07 / 08 / 09 / 13)', () => {
  it('a plan that already has a session cannot receive content; the refusal names the Player and nothing is written for anyone', async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS');
    const started = await mkPlan(alice, 'Alice started', 'PUSH_UP');
    await startSession(db, started.id, deps);
    const free = await mkPlan(daniel, 'Daniel free', 'PLANK');
    const before = await dump();
    const e = await failure(assignContentToPlayers(db, BLOCK(block.id), [INTO(daniel, free.id), INTO(alice, started.id)], deps));
    expect(e.playerId).toBe(alice);
    expect(e.cause).toBeInstanceOf(TrainingRuleError);
    expect((e.cause as TrainingRuleError).rule).toBe('PLAN_ALREADY_STARTED');
    expect(await dump()).toEqual(before); // Daniel (processed first) was rolled back too
  });

  it('an archived Player is refused (new or existing destination) and the others are rolled back', async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS');
    const plan = await mkPlan(tom, 'Tom plan', 'PLANK');
    await archivePlayer(db, alice, { clock });
    const before = await dump();
    const e1 = await failure(assignContentToPlayers(db, BLOCK(block.id), [NEW(daniel), NEW(alice)], deps));
    expect(e1.playerId).toBe(alice);
    expect(e1.cause).toBeInstanceOf(PlayerArchivedError);
    const e2 = await failure(assignContentToPlayers(db, EXERCISE('PUSH_UP'), [INTO(tom, plan.id), NEW(alice)], deps));
    expect(e2.playerId).toBe(alice);
    expect(await dump()).toEqual(before);
  });

  it('an inactive Exercise / Block / a Block holding an inactive Exercise cannot be newly assigned; no empty plan is left', async () => {
    const hidden = await mkBlock('Hidden', 'FREE_THROWS');
    const holding = await mkBlock('Holding', 'PLANK');
    await setBlockActive(db, hidden.id, false, { clock });
    await setExerciseActive(db, 'PLANK', false, { clock });
    await setExerciseActive(db, 'PUSH_UP', false, { clock });
    const before = await dump();
    expect(((await failure(assignContentToPlayers(db, BLOCK(hidden.id), [NEW(daniel)], deps))).cause as TrainingRuleError).rule).toBe('BLOCK_INACTIVE');
    expect(((await failure(assignContentToPlayers(db, BLOCK(holding.id), [NEW(daniel)], deps))).cause as TrainingRuleError).rule).toBe('EXERCISE_INACTIVE');
    expect(((await failure(assignContentToPlayers(db, EXERCISE('PUSH_UP'), [NEW(daniel), NEW(alice)], deps))).cause as TrainingRuleError).rule).toBe('EXERCISE_INACTIVE');
    expect(await dump()).toEqual(before);
  });

  it("another Player's plan is never a destination", async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS');
    const aliceOwn = await mkPlan(alice, 'Alice plan', 'PLANK');
    const before = await dump();
    const e = await failure(assignContentToPlayers(db, BLOCK(block.id), [INTO(daniel, aliceOwn.id)], deps));
    expect(e.cause).toBeInstanceOf(TrainingNotFoundError);
    expect(await dump()).toEqual(before);
  });

  it('a failure part-way through (after the first Player was written) rolls EVERYTHING back — never a silent partial success', async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS', 'PLANK');
    const dPlan = await mkPlan(daniel, 'Daniel plan', 'PUSH_UP');
    const before = await dump();
    await db.execAsync(`CREATE TEMP TRIGGER zz_boom BEFORE INSERT ON planned_workouts WHEN NEW.player_id = '${alice}' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const e = await failure(assignContentToPlayers(db, BLOCK(block.id), [INTO(daniel, dPlan.id), NEW(alice), NEW(tom)], deps));
    await db.execAsync('DROP TRIGGER zz_boom');
    expect(e.playerId).toBe(alice);
    expect(String((e.cause as Error).message)).toMatch(/boom/);
    expect(await dump()).toEqual(before); // Daniel's existing plan is exactly as before, Tom got nothing
  });

  it('no Player, the same Player twice, or a blank / over-long new name is refused (ASSIGNMENT_INVALID)', async () => {
    const block = await mkBlock('Shooting', 'FREE_THROWS');
    await expect(assignContentToPlayers(db, BLOCK(block.id), [], deps)).rejects.toMatchObject({ rule: 'ASSIGNMENT_INVALID' });
    await expect(assignContentToPlayers(db, BLOCK(block.id), [NEW(daniel), NEW(daniel)], deps)).rejects.toMatchObject({ rule: 'ASSIGNMENT_INVALID' });
    const blank = await failure(assignContentToPlayers(db, BLOCK(block.id), [NEW(daniel, '   ')], deps));
    expect((blank.cause as TrainingRuleError).rule).toBe('ASSIGNMENT_INVALID');
    const long = await failure(assignContentToPlayers(db, BLOCK(block.id), [NEW(daniel, 'x'.repeat(200))], deps));
    expect((long.cause as TrainingRuleError).rule).toBe('ASSIGNMENT_INVALID');
    expect(await plansOf(daniel)).toEqual([]);
  });
});
