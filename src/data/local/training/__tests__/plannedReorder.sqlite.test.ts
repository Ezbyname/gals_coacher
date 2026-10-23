import { PROFESSIONAL_WORKOUTS } from '@/domain/training/professional';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import {
  assignContentToPlayers,
  reorderPlannedItem,
  savePlannedWorkout,
  type SaveEntry,
} from '../plannedWorkoutCompositionRepository';
import { getPlannedWorkout, startSession } from '../trainingRepository';
import { createBlock, getBlock } from '../workoutRepository';

/**
 * TRAINING-STOPWATCH-001 (additional scope) — reordering the exercises of a planned workout, on real SQLite (schema v22,
 * no migration): only the order changes, within a section, atomically, frozen once a session exists.
 */
const clock = { wallNow: () => new Date(2026, 9, 20, 12).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
const rx = (sets: number, target: number | null): Prescription => ({ sets, target, loadKg: null, restSec: 45 });
const ex = (exerciseId: string, sets = 3, target: number | null = 8): SaveEntry => ({ kind: 'EXERCISE', exerciseId, prescription: rx(sets, target) });

async function mkPlan(entries: SaveEntry[], name = 'Reorder day') {
  const r = await savePlannedWorkout(db, { planId: null, playerId: daniel, name, entries }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const idsOf = async (planId: string) => (await getPlannedWorkout(db, planId))!.items.map((i) => i.exercise.exerciseId);
const rows = (planId: string) =>
  db.getAllAsync('SELECT * FROM planned_workout_items WHERE planned_workout_id = ? ORDER BY position', [planId]);
const dump = async () =>
  JSON.stringify(
    await Promise.all(['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets'].map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`))),
  );
const withoutPosition = (row: unknown) => {
  const { position: _position, ...rest } = row as Record<string, unknown>;
  return JSON.stringify(rest);
};

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const r = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  daniel = r.profile.player.id;
});
afterEach(() => db.closeAsync());

describe('reordering standalone exercises (entry level)', () => {
  it('A, B, C -> C, A, B is persisted and survives a reopen', async () => {
    const plan = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT')]);
    const moved = await reorderPlannedItem(db, plan.id, 2, 0, deps);
    expect(moved.items.map((i) => i.exercise.exerciseId)).toEqual(['BODYWEIGHT_SQUAT', 'PUSH_UP', 'PLANK']);
    expect(await idsOf(plan.id)).toEqual(['BODYWEIGHT_SQUAT', 'PUSH_UP', 'PLANK']); // reopened from the database
  });

  it('positions stay 0..n-1 with no duplicate, and no exercise is missing or duplicated', async () => {
    const plan = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT'), ex('GLUTE_BRIDGE')]);
    await reorderPlannedItem(db, plan.id, 0, 3, deps);
    const stored = await db.getAllAsync<{ position: number; exercise_id: string }>('SELECT position, exercise_id FROM planned_workout_items WHERE planned_workout_id = ? ORDER BY position', [plan.id]);
    expect(stored.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(new Set(stored.map((r) => r.position)).size).toBe(4);
    expect(stored.map((r) => r.exercise_id).sort()).toEqual(['BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE', 'PLANK', 'PUSH_UP']);
  });

  it('only the order changes: every row keeps its exercise, prescription, section and provenance', async () => {
    const plan = await mkPlan([ex('PUSH_UP', 4, 12), ex('PLANK', 2, 40), ex('BODYWEIGHT_SQUAT', 5, 6)]);
    const before = (await rows(plan.id)).map(withoutPosition).sort();
    await reorderPlannedItem(db, plan.id, 0, 2, deps);
    expect((await rows(plan.id)).map(withoutPosition).sort()).toEqual(before);
  });

  it('Move up / Move down (one step each) give the same persisted result as one drag', async () => {
    const a = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT'), ex('GLUTE_BRIDGE')], 'drag');
    const b = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT'), ex('GLUTE_BRIDGE')], 'steps');
    await reorderPlannedItem(db, a.id, 3, 0, deps); // one drag, bottom to top
    for (const from of [3, 2, 1]) await reorderPlannedItem(db, b.id, from, from - 1, deps); // three Move up presses
    expect(await idsOf(b.id)).toEqual(await idsOf(a.id));
    expect(await idsOf(a.id)).toEqual(['GLUTE_BRIDGE', 'PUSH_UP', 'PLANK', 'BODYWEIGHT_SQUAT']);
  });

  it('an index that does not exist is refused and nothing changes', async () => {
    const plan = await mkPlan([ex('PUSH_UP'), ex('BODYWEIGHT_SQUAT')]);
    const before = await dump();
    await expect(reorderPlannedItem(db, plan.id, 0, 5, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    expect(await dump()).toEqual(before);
  });
});

describe('sections: within yes, across no', () => {
  it('inside one Block section the exercises reorder; the section and its provenance stay', async () => {
    const made = await createBlock(db, { name: 'Mix', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(2, 30) }, { exerciseId: 'BODYWEIGHT_SQUAT', prescription: rx(2, 10) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const plan = await mkPlan([{ kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) }, ex('GLUTE_BRIDGE')]);
    const sectionBefore = new Set(plan.items.slice(0, 3).map((i) => i.sectionId));
    const moved = await reorderPlannedItem(db, plan.id, 0, 2, deps);
    expect(moved.items.map((i) => i.exercise.exerciseId)).toEqual(['PLANK', 'BODYWEIGHT_SQUAT', 'PUSH_UP', 'GLUTE_BRIDGE']);
    expect(new Set(moved.items.slice(0, 3).map((i) => i.sectionId))).toEqual(sectionBefore); // still ONE section
    expect(moved.items.slice(0, 3).every((i) => i.sourceBlockId === made.block.id)).toBe(true);
    expect(moved.items[3]!.sectionId).toBeNull();
  });

  it('an exercise cannot leave its section, nor be dropped into one: refused, plan unchanged', async () => {
    const made = await createBlock(db, { name: 'Pair', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(2, 30) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const plan = await mkPlan([{ kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) }, ex('GLUTE_BRIDGE')]);
    const before = await dump();
    await expect(reorderPlannedItem(db, plan.id, 0, 2, deps)).rejects.toMatchObject({ rule: 'REORDER_CROSS_SECTION' }); // out of the section
    await expect(reorderPlannedItem(db, plan.id, 2, 1, deps)).rejects.toMatchObject({ rule: 'REORDER_CROSS_SECTION' }); // into the section
    expect(await dump()).toEqual(before);
  });

  it('a standalone exercise passes a whole section without splitting it', async () => {
    const made = await createBlock(db, { name: 'Pair', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(2, 30) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const plan = await mkPlan([ex('GLUTE_BRIDGE'), { kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) }, ex('BODYWEIGHT_SQUAT')]);
    const moved = await reorderPlannedItem(db, plan.id, 3, 0, deps); // SQUAT onto LUNGE's place
    expect(moved.items.map((i) => i.exercise.exerciseId)).toEqual(['BODYWEIGHT_SQUAT', 'GLUTE_BRIDGE', 'PUSH_UP', 'PLANK']);
    expect(moved.items[2]!.sectionId).toBe(moved.items[3]!.sectionId);
  });
});

describe('the Builder save path (KEEP positions / BLOCK order)', () => {
  it('a Block copied with a new inner order is saved in that order, with its prescriptions following', async () => {
    const made = await createBlock(db, { name: 'Trio', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(3, 30) }, { exerciseId: 'BODYWEIGHT_SQUAT', prescription: rx(4, 12) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const order = [2, 0, 1];
    const plan = await mkPlan([{ kind: 'BLOCK', blockId: made.block.id, order, prescriptions: order.map((o) => made.block.items[o]!.prescription) }]);
    expect(plan.items.map((i) => [i.exercise.exerciseId, i.prescription.sets])).toEqual([['BODYWEIGHT_SQUAT', 4], ['PUSH_UP', 2], ['PLANK', 3]]);
  });

  it('an order that is not a permutation of the Block is refused and nothing is created', async () => {
    const made = await createBlock(db, { name: 'Duo', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(2, 30) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const prescriptions = made.block.items.map((i) => i.prescription);
    for (const order of [[0, 0], [0, 2], [0]]) {
      await expect(savePlannedWorkout(db, { planId: null, playerId: daniel, name: 'x', entries: [{ kind: 'BLOCK', blockId: made.block.id, order, prescriptions }] }, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    }
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM planned_workouts')).toEqual({ n: 0 });
  });

  it('KEEP with permuted positions reorders a saved plan', async () => {
    const plan = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT')]);
    const saved = await savePlannedWorkout(db, { planId: plan.id, playerId: daniel, name: plan.name, entries: [2, 0, 1].map((p) => ({ kind: 'KEEP' as const, positions: [p], prescriptions: [plan.items[p]!.prescription] })) }, deps);
    if (!saved.ok) throw new Error('save');
    expect(saved.plan.items.map((i) => i.exercise.exerciseId)).toEqual(['BODYWEIGHT_SQUAT', 'PUSH_UP', 'PLANK']);
  });
});

describe('sessions: frozen once started, snapshot of the order at start', () => {
  it('a new session snapshots the NEW order', async () => {
    const plan = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT')]);
    await reorderPlannedItem(db, plan.id, 2, 0, deps);
    const session = await startSession(db, plan.id, deps);
    expect(session.exercises.map((e) => e.exercise.exerciseId)).toEqual(['BODYWEIGHT_SQUAT', 'PUSH_UP', 'PLANK']);
    expect(session.exercises.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it('after a session exists the reorder is refused, and the plan and the session are exactly as they were', async () => {
    const plan = await mkPlan([ex('PUSH_UP'), ex('PLANK', 3, 30), ex('BODYWEIGHT_SQUAT')]);
    await startSession(db, plan.id, deps);
    const before = await dump();
    await expect(reorderPlannedItem(db, plan.id, 2, 0, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    expect(await dump()).toEqual(before);
  });

  it('reordering another plan never touches an existing session', async () => {
    const started = await mkPlan([ex('PUSH_UP'), ex('BODYWEIGHT_SQUAT')], 'started');
    const session = await startSession(db, started.id, deps);
    const other = await mkPlan([ex('PUSH_UP'), ex('BODYWEIGHT_SQUAT')], 'other');
    const sessionDump = async () => JSON.stringify(await Promise.all(['session_exercises', 'session_sets', 'set_measurements'].map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`))));
    const before = await sessionDump();
    await reorderPlannedItem(db, other.id, 1, 0, deps);
    expect(await sessionDump()).toEqual(before);
    expect(session.exercises.map((e) => e.exercise.exerciseId)).toEqual(['PUSH_UP', 'BODYWEIGHT_SQUAT']);
  });
});

describe('plans copied from a source are reordered without touching the source', () => {
  it('a plan copied from a reusable Block: the Block is unchanged', async () => {
    const made = await createBlock(db, { name: 'Source', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(2, 30) }, { exerciseId: 'BODYWEIGHT_SQUAT', prescription: rx(2, 10) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const blockBefore = JSON.stringify(await getBlock(db, made.block.id));
    const plan = await mkPlan([{ kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) }]);
    await reorderPlannedItem(db, plan.id, 2, 0, deps);
    expect(JSON.stringify(await getBlock(db, made.block.id))).toBe(blockBefore);
    expect(await idsOf(plan.id)).toEqual(['BODYWEIGHT_SQUAT', 'PUSH_UP', 'PLANK']);
  });

  it('a plan copied from a Professional Workout: the managed source is unchanged and reorders within each section', async () => {
    const workout = PROFESSIONAL_WORKOUTS.find((w) => w.sections.some((s) => s.items.length > 1))!;
    const sourceBefore = JSON.stringify(workout);
    const [assigned] = await assignContentToPlayers(db, { kind: 'PROFESSIONAL', workoutId: workout.id, language: 'en' }, [{ playerId: daniel, destination: { type: 'NEW', name: 'Pro copy' } }], deps);
    const planId = assigned!.planId;
    const before = await idsOf(planId);
    const first = (await getPlannedWorkout(db, planId))!.items;
    const start = first.findIndex((i, n) => n + 1 < first.length && i.blockName === first[n + 1]!.blockName);
    await reorderPlannedItem(db, planId, start, start + 1, deps);
    const after = await idsOf(planId);
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
    expect(JSON.stringify(workout)).toBe(sourceBefore);
  });
});
