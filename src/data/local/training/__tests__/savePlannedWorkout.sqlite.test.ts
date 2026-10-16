import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { PlayerArchivedError } from '../../players/errors';
import { archivePlayer, createPlayer } from '../../players/playerRepository';
import { TrainingNotFoundError } from '../errors';
import { savePlannedWorkout, type SaveEntry } from '../plannedWorkoutCompositionRepository';
import { getPlannedWorkout, listTraining, startSession } from '../trainingRepository';
import { createBlock, getBlock, setBlockActive } from '../workoutRepository';

/** QB-WORKOUT-BUILDER-001B — the Builder's one atomic Save (create / update), on real SQLite. */
const clock = { wallNow: () => new Date(2026, 9, 16, 17).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
let alice: string;
const rx = (sets: number, target: number | null, loadKg: number | null = null): Prescription => ({ sets, target, loadKg, restSec: 45 });
async function mkBlock(name: string, ...items: [string, Prescription?][]) {
  const r = await createBlock(db, { name, items: items.map(([exerciseId, p]) => ({ exerciseId, prescription: p ?? rx(2, 10) })) }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.block;
}
const mkPlayer = async (name: string) => {
  const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  return r.profile.player.id;
};
const blockEntry = (b: { id: string; items: readonly { prescription: Prescription }[] }): SaveEntry => ({ kind: 'BLOCK', blockId: b.id, prescriptions: b.items.map((i) => i.prescription) });
const planRows = async () => db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts');
const ALL = ['planned_workouts', 'planned_workout_items', 'training_sessions'];
const dump = async () => Object.fromEntries(await Promise.all(ALL.map(async (t) => [t, await db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)] as const)));
async function save(entries: SaveEntry[], extra: { planId?: string | null; playerId?: string; name?: string } = {}) {
  const r = await savePlannedWorkout(db, { planId: extra.planId ?? null, playerId: extra.playerId ?? daniel, name: extra.name ?? 'Tuesday', entries }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  daniel = await mkPlayer('Daniel');
  alice = await mkPlayer('Alice');
});
afterEach(() => db.closeAsync());

describe('create (the plan exists only after Save)', () => {
  it('Block + standalone Exercise + the same Block again: one plan, exact order, independent sections, provenance', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS'], ['PLANK']);
    expect(await planRows()).toEqual({ n: 0 });
    const plan = await save([blockEntry(shooting), { kind: 'EXERCISE', exerciseId: 'PUSH_UP', prescription: rx(3, 12) }, blockEntry(shooting)], { name: '  Daniel Tue  ' });
    expect(await planRows()).toEqual({ n: 1 });
    expect(plan.name).toBe('Daniel Tue'); // trimmed
    expect(plan.templateId).toBeNull();
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS', 'PLANK', 'PUSH_UP', 'FREE_THROWS', 'PLANK']);
    expect(plan.items.map((i) => i.sourceBlockId)).toEqual([shooting.id, shooting.id, null, shooting.id, shooting.id]);
    expect(new Set(plan.items.filter((i) => i.sectionId).map((i) => i.sectionId)).size).toBe(2);
    expect(plan.items[2]!.prescription).toEqual(rx(3, 12));
    expect(plan.items.map((i) => i.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('an empty composition is refused (PLAN_EMPTY) and NO row is left behind; a blank / long name is returned, nothing written', async () => {
    const before = await dump();
    await expect(savePlannedWorkout(db, { planId: null, playerId: daniel, name: 'x', entries: [] }, deps)).rejects.toMatchObject({ rule: 'PLAN_EMPTY' });
    expect(await dump()).toEqual(before);
    const block = await mkBlock('S', ['FREE_THROWS']);
    const e = [blockEntry(block)];
    expect(await savePlannedWorkout(db, { planId: null, playerId: daniel, name: '   ', entries: e }, deps)).toEqual({ ok: false, errors: { name: 'REQUIRED' } });
    expect(await savePlannedWorkout(db, { planId: null, playerId: daniel, name: 'N'.repeat(36), entries: e }, deps)).toEqual({ ok: false, errors: { name: 'TOO_LONG' } });
    expect(await planRows()).toEqual({ n: 0 });
  });

  it('an invalid prescription is returned by "entry.item" and nothing is created', async () => {
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 8, 40)], ['PUSH_UP']);
    const r = await savePlannedWorkout(
      db,
      { planId: null, playerId: daniel, name: 'x', entries: [{ kind: 'BLOCK', blockId: strength.id, prescriptions: [rx(3, 8, 40), rx(0, 5)] }, { kind: 'EXERCISE', exerciseId: 'PLANK', prescription: rx(2, -5) }] },
      deps,
    );
    expect(r).toEqual({ ok: false, errors: { items: { '0.1': expect.objectContaining({ sets: expect.anything() }), '1.0': expect.objectContaining({ target: expect.anything() }) } } });
    expect(await planRows()).toEqual({ n: 0 });
  });

  it('the repository resolves everything itself: an unknown Block / Exercise, a prescription count that does not match', async () => {
    const block = await mkBlock('S', ['FREE_THROWS'], ['PLANK']);
    await expect(save([{ kind: 'BLOCK', blockId: 'missing', prescriptions: [] }])).rejects.toBeInstanceOf(TrainingNotFoundError);
    await expect(save([{ kind: 'EXERCISE', exerciseId: 'NOPE', prescription: rx(1, 1) }])).rejects.toBeInstanceOf(TrainingNotFoundError);
    await expect(save([{ kind: 'BLOCK', blockId: block.id, prescriptions: [rx(1, 1)] }])).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    await expect(save([{ kind: 'KEEP', positions: [0], prescriptions: [rx(1, 1)] }])).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' }); // nothing saved to keep
    expect(await planRows()).toEqual({ n: 0 });
  });

  it('a failure in the middle rolls everything back: no plan row, no items', async () => {
    const block = await mkBlock('S', ['FREE_THROWS'], ['PLANK'], ['PUSH_UP']);
    await db.execAsync("CREATE TEMP TRIGGER zz_boom BEFORE INSERT ON planned_workout_items WHEN NEW.position = 2 BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(save([blockEntry(block)])).rejects.toThrow(/boom/);
    await db.execAsync('DROP TRIGGER zz_boom');
    expect(await dump()).toEqual({ planned_workouts: [], planned_workout_items: [], training_sessions: [] });
  });
});

describe('update (an existing plan before its session exists)', () => {
  it('keep / re-prescribe / reorder / remove / add and rename in one save; the source Block never changes', async () => {
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 10, 50)], ['PUSH_UP']);
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    const plan = await save([blockEntry(strength), { kind: 'EXERCISE', exerciseId: 'PLANK', prescription: rx(2, 30) }, blockEntry(shooting)]);
    const blockBefore = await getBlock(db, strength.id);
    // positions: 0 bench, 1 push-up (Strength) | 2 plank | 3 free throws (Shooting)
    const updated = await save(
      [
        { kind: 'KEEP', positions: [3], prescriptions: [rx(5, 20)] }, // Shooting first, new prescription
        { kind: 'KEEP', positions: [0, 1], prescriptions: [rx(4, 6, 70), rx(2, 12)] }, // Strength, bench re-prescribed
        { kind: 'EXERCISE', exerciseId: 'PUSH_UP', prescription: rx(1, 5) }, // a new standalone at the end
      ],
      { planId: plan.id, name: 'Renamed' },
    );
    expect(updated.id).toBe(plan.id);
    expect(updated.name).toBe('Renamed');
    expect(updated.items.map((i) => [i.exercise.exerciseId, i.blockName, i.prescription.sets])).toEqual([
      ['FREE_THROWS', 'Shooting', 5],
      ['BARBELL_BENCH_PRESS', 'Strength', 4],
      ['PUSH_UP', 'Strength', 2],
      ['PUSH_UP', null, 1],
    ]); // PLANK removed
    expect(updated.items[1]!.sectionId).toBe(plan.items[0]!.sectionId); // a kept section keeps its identity
    expect(await getBlock(db, strength.id)).toEqual(blockBefore); // copies only
    expect(await getPlannedWorkout(db, plan.id)).toEqual(updated); // persisted exactly
    expect((await listTraining(db, daniel)).planned).toHaveLength(1);
  });

  it('removing everything is refused (PLAN_EMPTY); the saved plan is untouched', async () => {
    const block = await mkBlock('S', ['FREE_THROWS']);
    const plan = await save([blockEntry(block)]);
    const before = await dump();
    await expect(save([], { planId: plan.id })).rejects.toMatchObject({ rule: 'PLAN_EMPTY' });
    expect(await dump()).toEqual(before);
  });

  it('bad KEEP references are refused: unknown or duplicated positions', async () => {
    const block = await mkBlock('S', ['FREE_THROWS'], ['PLANK']);
    const plan = await save([blockEntry(block)]);
    const before = await dump();
    await expect(save([{ kind: 'KEEP', positions: [5], prescriptions: [rx(1, 1)] }], { planId: plan.id })).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    await expect(save([{ kind: 'KEEP', positions: [0, 0], prescriptions: [rx(1, 1), rx(1, 1)] }], { planId: plan.id })).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    expect(await dump()).toEqual(before);
  });

  it('a started plan is frozen (PLAN_ALREADY_STARTED); a plan of another Player is not found', async () => {
    const block = await mkBlock('S', ['FREE_THROWS']);
    const plan = await save([blockEntry(block)]);
    await expect(save([blockEntry(block)], { planId: plan.id, playerId: alice })).rejects.toBeInstanceOf(TrainingNotFoundError);
    await startSession(db, plan.id, deps);
    const before = await dump();
    await expect(save([blockEntry(block)], { planId: plan.id })).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    expect(await dump()).toEqual(before);
  });

  it('a failure mid-rewrite keeps the old plan exactly (items and name)', async () => {
    const block = await mkBlock('S', ['FREE_THROWS'], ['PLANK']);
    const plan = await save([blockEntry(block)]);
    const before = await dump();
    await db.execAsync("CREATE TEMP TRIGGER zz_boom BEFORE INSERT ON planned_workout_items WHEN NEW.position = 3 BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(save([blockEntry(block), blockEntry(block)], { planId: plan.id, name: 'Changed' })).rejects.toThrow(/boom/);
    await db.execAsync('DROP TRIGGER zz_boom');
    expect(await dump()).toEqual(before);
  });
});

describe('the S1 / S2 guards stay in force through the Builder save', () => {
  it('inactive Block / Exercise cannot be newly added; items already saved stay editable even when later hidden', async () => {
    const good = await mkBlock('Good', ['FREE_THROWS'], ['PLANK']);
    const hidden = await mkBlock('Hidden', ['PUSH_UP']);
    const plan = await save([blockEntry(good)]);
    await setBlockActive(db, hidden.id, false, { clock });
    await setExerciseActive(db, 'PLANK', false, { clock }); // inside the SAVED plan now
    await setExerciseActive(db, 'GOBLET_SQUAT', false, { clock });
    const before = await dump();
    await expect(save([{ kind: 'KEEP', positions: [0, 1], prescriptions: [rx(2, 10), rx(2, 30)] }, blockEntry(hidden)], { planId: plan.id })).rejects.toMatchObject({ rule: 'BLOCK_INACTIVE' });
    await expect(save([{ kind: 'KEEP', positions: [0, 1], prescriptions: [rx(2, 10), rx(2, 30)] }, { kind: 'EXERCISE', exerciseId: 'GOBLET_SQUAT', prescription: rx(1, 1) }], { planId: plan.id })).rejects.toMatchObject({ rule: 'EXERCISE_INACTIVE' });
    await expect(save([blockEntry(good)], { planId: plan.id })).rejects.toMatchObject({ rule: 'EXERCISE_INACTIVE' }); // re-copying a Block with a hidden Exercise
    expect(await dump()).toEqual(before);
    // existing content stays: re-saving the kept items with a new prescription works
    const kept = await save([{ kind: 'KEEP', positions: [0, 1], prescriptions: [rx(4, 12), rx(3, 40)] }], { planId: plan.id });
    expect(kept.items.map((i) => i.prescription.sets)).toEqual([4, 3]);
  });

  it('an archived Player cannot create or edit a plan', async () => {
    const block = await mkBlock('S', ['FREE_THROWS']);
    const plan = await save([blockEntry(block)]);
    await archivePlayer(db, daniel, { clock });
    const before = await dump();
    await expect(save([blockEntry(block)])).rejects.toBeInstanceOf(PlayerArchivedError);
    await expect(save([blockEntry(block)], { planId: plan.id })).rejects.toBeInstanceOf(PlayerArchivedError);
    expect(await dump()).toEqual(before);
  });
});
