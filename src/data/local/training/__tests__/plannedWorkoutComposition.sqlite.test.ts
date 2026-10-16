import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { groupEntries } from '@/domain/training/composition';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { PlayerArchivedError } from '../../players/errors';
import { archivePlayer, createPlayer, restorePlayer } from '../../players/playerRepository';
import { TemplateUnavailableItemsError, TrainingDataError, TrainingNotFoundError, TrainingRuleError } from '../errors';
import {
  addBlockToPlannedWorkout,
  addExerciseToPlannedWorkout,
  createPlannedWorkout,
  movePlannedEntry,
  removePlannedEntry,
  updatePlannedItem,
} from '../plannedWorkoutCompositionRepository';
import {
  abandonSession,
  getPlannedWorkout,
  listTraining,
  planAndStart,
  planWorkout,
  startSession,
  type PlannedWorkout,
} from '../trainingRepository';
import { createBlock, createTemplate, getBlock, getTemplate, setBlockActive, updateBlock } from '../workoutRepository';

/**
 * QB-WORKOUT-BUILDER-001A on real SQLite (WB-DATA-01…08 + the freeze boundary). Owner decisions 2026-10-15/16:
 * a PlannedWorkout is the Player's editable composition (copied Block sections + standalone Exercises, one order)
 * until a TrainingSession exists; Blocks are copied, provenance only; S1/S2 guards stay.
 */
const T0 = new Date(2026, 9, 16, 17).getTime();
let now = T0;
const clock = { wallNow: () => now, monotonicNow: () => 0 };
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
async function newPlan(playerId = daniel, name = 'Tuesday') {
  const r = await createPlannedWorkout(db, { playerId, name }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
async function addEx(planId: string, exerciseId: string, options: { at?: number; prescription?: Prescription } = {}) {
  const r = await addExerciseToPlannedWorkout(db, planId, exerciseId, deps, options);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const order = (plan: PlannedWorkout) => plan.items.map((i) => i.exercise.exerciseId);
const kinds = (plan: PlannedWorkout) =>
  groupEntries(plan.items).map((e) => (e.kind === 'SECTION' ? `S:${e.blockName}(${e.items.length})` : `E:${e.item.exercise.exerciseId}`));
const TABLES = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements', 'workout_blocks', 'workout_block_items', 'workout_templates', 'workout_template_blocks'];
const dump = async (d: Db = db) => {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = await d.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`);
  return out;
};

async function open(file = ':memory:') {
  const d = openNodeSqlite(file);
  await d.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(d, migrations);
  return d;
}
const mkPlayer = async (name: string) => {
  const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  return r.profile.player.id;
};

beforeEach(async () => {
  now = T0;
  db = await open();
  daniel = await mkPlayer('Daniel');
  alice = await mkPlayer('Alice');
});
afterEach(() => db.closeAsync());

describe('WB-DATA-01/02/03 — composition and exact order', () => {
  it('WB-DATA-01: one PlannedWorkout accepts several Blocks (the same Block twice = two sections, each with provenance)', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 8, 40)], ['PUSH_UP']);
    let plan = await newPlan();
    expect(plan.items).toEqual([]); // starts EMPTY; templateId stays null; no date/time anywhere
    expect(plan.templateId).toBeNull();
    plan = await addBlockToPlannedWorkout(db, plan.id, shooting.id, deps);
    plan = await addBlockToPlannedWorkout(db, plan.id, strength.id, deps);
    plan = await addBlockToPlannedWorkout(db, plan.id, shooting.id, deps);
    expect(kinds(plan)).toEqual(['S:Shooting(1)', 'S:Strength(2)', 'S:Shooting(1)']);
    expect(plan.items.map((i) => i.sourceBlockId)).toEqual([shooting.id, strength.id, strength.id, shooting.id]);
    const sections = [...new Set(plan.items.map((i) => i.sectionId))];
    expect(sections).toHaveLength(3); // distinct ids, even for the repeated Block
    expect(plan.items.every((i) => i.sectionId !== null)).toBe(true);
    expect(plan.items[1]!.prescription).toEqual(rx(3, 8, 40)); // the Block's prescription was copied
    expect(plan.items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
  });

  it('WB-DATA-02: a standalone Exercise (no Block): same Exercise identity, own prescription, no section or provenance', async () => {
    let plan = await newPlan();
    plan = await addEx(plan.id, 'PLANK', { prescription: rx(3, 45) });
    plan = await addEx(plan.id, 'PUSH_UP'); // default prescription
    expect(kinds(plan)).toEqual(['E:PLANK', 'E:PUSH_UP']);
    expect(plan.items[0]).toMatchObject({ blockName: null, sectionId: null, sourceBlockId: null, prescription: rx(3, 45) });
    expect(plan.items[1]!.prescription.sets).toBeGreaterThanOrEqual(1);
    // the Exercise entity itself is not duplicated: only the plan holds the item (a snapshot of identity + names)
    expect(await db.getFirstAsync("SELECT count(*) AS n FROM exercises WHERE id = 'PLANK'")).toEqual({ n: 1 });
    // an invalid prescription is returned and nothing is written
    const before = await dump();
    const bad = await addExerciseToPlannedWorkout(db, plan.id, 'PLANK', deps, { prescription: rx(0, 45) });
    expect(bad).toEqual({ ok: false, errors: expect.objectContaining({ sets: expect.anything() }) });
    expect(await dump()).toEqual(before);
  });

  it('WB-DATA-03: Block + standalone + Block (+ Exercises between Blocks) keep the exact order, across edits and a real restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gals-v17-'));
    const file = join(dir, 'gals_coacher.db');
    try {
      await db.closeAsync();
      db = await open(file);
      daniel = await mkPlayer('Daniel');
      const handling = await mkBlock('Ball Handling', ['GOBLET_SQUAT'], ['PUSH_UP']);
      const shooting = await mkBlock('Shooting', ['FREE_THROWS'], ['PLANK']);
      const fitness = await mkBlock('Fitness', ['BODYWEIGHT_SQUAT']);
      let plan = await newPlan();
      plan = await addBlockToPlannedWorkout(db, plan.id, handling.id, deps);
      plan = await addEx(plan.id, 'PLANK'); // "sprint" between Blocks
      plan = await addBlockToPlannedWorkout(db, plan.id, shooting.id, deps);
      plan = await addEx(plan.id, 'PUSH_UP');
      plan = await addBlockToPlannedWorkout(db, plan.id, fitness.id, deps);
      expect(kinds(plan)).toEqual(['S:Ball Handling(2)', 'E:PLANK', 'S:Shooting(2)', 'E:PUSH_UP', 'S:Fitness(1)']);
      const expected = ['GOBLET_SQUAT', 'PUSH_UP', 'PLANK', 'FREE_THROWS', 'PLANK', 'PUSH_UP', 'BODYWEIGHT_SQUAT'];
      expect(order(plan)).toEqual(expected);
      // insert at an entry index between two Blocks, then move a whole section
      plan = await addEx(plan.id, 'FREE_THROWS', { at: 1 });
      expect(kinds(plan)).toEqual(['S:Ball Handling(2)', 'E:FREE_THROWS', 'E:PLANK', 'S:Shooting(2)', 'E:PUSH_UP', 'S:Fitness(1)']);
      plan = await movePlannedEntry(db, plan.id, 3, 0, deps); // Shooting first
      expect(kinds(plan)[0]).toBe('S:Shooting(2)');
      plan = await removePlannedEntry(db, plan.id, 2, deps); // the standalone FREE_THROWS
      expect(kinds(plan)).toEqual(['S:Shooting(2)', 'S:Ball Handling(2)', 'E:PLANK', 'E:PUSH_UP', 'S:Fitness(1)']);
      const persisted = (await db.getAllAsync<{ position: number }>('SELECT position FROM planned_workout_items WHERE planned_workout_id = ? ORDER BY position', [plan.id])).map((r) => r.position);
      expect(persisted).toEqual([0, 1, 2, 3, 4, 5, 6]); // contiguous: one deterministic order
      // survives a restart
      const before = await getPlannedWorkout(db, plan.id);
      await db.closeAsync();
      db = await open(file);
      expect(await getPlannedWorkout(db, plan.id)).toEqual(before);
    } finally {
      await db.closeAsync();
      db = await open();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refused edits: a position that does not exist (nothing clamped), an unknown plan / Block / Exercise', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    let plan = await newPlan();
    plan = await addBlockToPlannedWorkout(db, plan.id, shooting.id, deps);
    const before = await dump();
    for (const f of [
      () => addExerciseToPlannedWorkout(db, plan.id, 'PLANK', deps, { at: 5 }),
      () => addBlockToPlannedWorkout(db, plan.id, shooting.id, deps, -1),
      () => removePlannedEntry(db, plan.id, 3, deps),
      () => movePlannedEntry(db, plan.id, 0, 2, deps),
      () => updatePlannedItem(db, plan.id, 9, rx(1, 1), deps),
    ]) {
      await expect(f()).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    }
    await expect(addExerciseToPlannedWorkout(db, plan.id, 'NOPE', deps)).rejects.toBeInstanceOf(TrainingNotFoundError);
    await expect(addBlockToPlannedWorkout(db, plan.id, 'missing', deps)).rejects.toBeInstanceOf(TrainingNotFoundError);
    await expect(removePlannedEntry(db, 'missing', 0, deps)).rejects.toBeInstanceOf(TrainingNotFoundError);
    expect(await dump()).toEqual(before);
  });
});

describe('WB-DATA-04/05/06 — isolation (copy, never a live reference)', () => {
  it('WB-DATA-04: editing the copied content changes ONLY that plan (not the Block, not the Template, not another plan)', async () => {
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 10, 50)], ['PUSH_UP']);
    const template = await createTemplate(db, { name: 'Gym', blockIds: [strength.id] }, deps);
    if (!template.ok) throw new Error('seed');
    let a = await addBlockToPlannedWorkout(db, (await newPlan(daniel, 'Daniel')).id, strength.id, deps);
    const b = await addBlockToPlannedWorkout(db, (await newPlan(daniel, 'Other plan')).id, strength.id, deps);
    const blockBefore = await getBlock(db, strength.id);
    const templateBefore = await getTemplate(db, template.template.id);
    const otherBefore = await getPlannedWorkout(db, b.id);
    const edit = await updatePlannedItem(db, a.id, 0, rx(5, 3, 70), deps);
    expect(edit.ok).toBe(true);
    a = (await getPlannedWorkout(db, a.id))!;
    expect(a.items[0]!.prescription).toEqual(rx(5, 3, 70));
    a = await removePlannedEntry(db, a.id, 0, deps); // remove the whole copied section from THIS plan only
    expect(a.items).toEqual([]);
    expect(await getBlock(db, strength.id)).toEqual(blockBefore);
    expect(await getTemplate(db, template.template.id)).toEqual(templateBefore);
    expect(await getPlannedWorkout(db, b.id)).toEqual(otherBefore);
  });

  it('WB-DATA-05: editing / hiding the source Block later never changes an existing plan (provenance only)', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS', rx(2, 10)], ['PLANK']);
    const plan = await addBlockToPlannedWorkout(db, (await newPlan()).id, shooting.id, deps);
    const planBefore = await getPlannedWorkout(db, plan.id);
    const rowsBefore = await db.getAllAsync('SELECT * FROM planned_workout_items ORDER BY rowid');
    await updateBlock(db, shooting.id, { name: 'Renamed', items: [{ exerciseId: 'PUSH_UP', prescription: rx(9, 99) }] }, { clock });
    await setBlockActive(db, shooting.id, false, { clock });
    await setExerciseActive(db, 'FREE_THROWS', false, { clock });
    expect(await getPlannedWorkout(db, plan.id)).toEqual(planBefore);
    expect(await db.getAllAsync('SELECT * FROM planned_workout_items ORDER BY rowid')).toEqual(rowsBefore);
    expect(planBefore!.items[0]!.blockName).toBe('Shooting'); // the name at copy time
    expect(planBefore!.items[0]!.sourceBlockId).toBe(shooting.id); // traceability only
    // and the plan stays editable: its own items are existing content (hiding never rewrites or blocks it)
    const moved = await updatePlannedItem(db, plan.id, 0, rx(4, 12), deps);
    expect(moved.ok).toBe(true);
  });

  it('WB-DATA-06: two Players copying the same Block stay fully independent (edits, order, freeze)', async () => {
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 10, 50)]);
    const d = await addBlockToPlannedWorkout(db, (await newPlan(daniel, 'D')).id, strength.id, deps);
    const a = await addBlockToPlannedWorkout(db, (await newPlan(alice, 'A')).id, strength.id, deps);
    expect(d.items[0]!.sectionId).not.toBe(a.items[0]!.sectionId); // separate copies
    await updatePlannedItem(db, d.id, 0, rx(1, 5, 20), deps);
    await addExerciseToPlannedWorkout(db, d.id, 'PLANK', deps);
    expect((await getPlannedWorkout(db, a.id))!.items).toEqual(a.items); // Alice's plan untouched
    // Daniel starts: only Daniel's plan freezes; Alice's stays editable
    await startSession(db, d.id, deps);
    await expect(removePlannedEntry(db, d.id, 0, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    const edited = await updatePlannedItem(db, a.id, 0, rx(4, 6, 60), deps);
    expect(edited.ok).toBe(true);
    expect((await listTraining(db, daniel)).sessions).toHaveLength(1);
    expect((await listTraining(db, alice)).sessions).toHaveLength(0);
  });
});

describe('WB-DATA-07/08 — the S1 / S2 guards stay enforced', () => {
  it('WB-DATA-07: an inactive Block / Exercise cannot be newly added; existing items stay; an invalid Template cannot silently plan', async () => {
    const good = await mkBlock('Good', ['FREE_THROWS']);
    const hiddenBlock = await mkBlock('Hidden', ['PUSH_UP']);
    const withInactive = await mkBlock('Has inactive', ['PLANK'], ['BODYWEIGHT_SQUAT']);
    const plan = await addBlockToPlannedWorkout(db, (await newPlan()).id, good.id, deps);
    await setBlockActive(db, hiddenBlock.id, false, { clock });
    await setExerciseActive(db, 'BODYWEIGHT_SQUAT', false, { clock });
    await setExerciseActive(db, 'GOBLET_SQUAT', false, { clock });
    const before = await dump();
    await expect(addBlockToPlannedWorkout(db, plan.id, hiddenBlock.id, deps)).rejects.toMatchObject({ rule: 'BLOCK_INACTIVE' });
    await expect(addBlockToPlannedWorkout(db, plan.id, withInactive.id, deps)).rejects.toMatchObject({ rule: 'EXERCISE_INACTIVE' });
    await expect(addExerciseToPlannedWorkout(db, plan.id, 'GOBLET_SQUAT', deps)).rejects.toMatchObject({ rule: 'EXERCISE_INACTIVE' });
    expect(await dump()).toEqual(before); // nothing was added, nothing silently dropped
    // an invalid legacy Template (hidden Block inside) still cannot create a NEW plan (QB-BLOCK-LIBRARY S2)
    const tpl = await createTemplate(db, { name: 'Tpl', blockIds: [good.id, hiddenBlock.id] }, deps);
    expect(tpl).toEqual({ ok: false, errors: { inactiveBlocks: [hiddenBlock.id] } }); // a hidden Block cannot be newly added
    const tpl2 = await createTemplate(db, { name: 'Tpl2', blockIds: [good.id] }, deps);
    if (!tpl2.ok) throw new Error('seed');
    await setBlockActive(db, good.id, false, { clock });
    await expect(planWorkout(db, { playerId: daniel, templateId: tpl2.template.id }, deps)).rejects.toBeInstanceOf(TemplateUnavailableItemsError);
  });

  it('WB-DATA-08: an archived Player takes no composition activity: repository AND database refuse; reads stay; restore re-enables', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    const plan = await addBlockToPlannedWorkout(db, (await newPlan()).id, shooting.id, deps);
    await archivePlayer(db, daniel, { clock });
    const before = await dump();
    await expect(createPlannedWorkout(db, { playerId: daniel, name: 'New' }, deps)).rejects.toBeInstanceOf(PlayerArchivedError);
    for (const f of [
      () => addBlockToPlannedWorkout(db, plan.id, shooting.id, deps),
      () => addExerciseToPlannedWorkout(db, plan.id, 'PLANK', deps),
      () => removePlannedEntry(db, plan.id, 0, deps),
      () => movePlannedEntry(db, plan.id, 0, 0, deps),
      () => updatePlannedItem(db, plan.id, 0, rx(1, 1), deps),
    ]) {
      await expect(f()).rejects.toBeInstanceOf(PlayerArchivedError);
    }
    // defence in depth: the database itself refuses (even a direct statement)
    const refused = /archived player gets no new activity/;
    await expect(db.runAsync('UPDATE planned_workouts SET name = ?', ['x'])).rejects.toThrow(refused);
    await expect(db.runAsync('UPDATE planned_workout_items SET sets = 9')).rejects.toThrow(refused);
    await expect(db.runAsync('DELETE FROM planned_workout_items')).rejects.toThrow(refused);
    await expect(db.runAsync("INSERT INTO planned_workout_items (planned_workout_id, position, block_name, exercise_id, exercise_name_he, exercise_name_en, measurement_type, comparison_policy, uses_load, distance_m, sets, target, load_kg, rest_sec) SELECT planned_workout_id, 99, block_name, exercise_id, exercise_name_he, exercise_name_en, measurement_type, comparison_policy, uses_load, distance_m, sets, target, load_kg, rest_sec FROM planned_workout_items LIMIT 1")).rejects.toThrow(refused);
    expect(await dump()).toEqual(before);
    expect(await getPlannedWorkout(db, plan.id)).toEqual(plan); // history stays readable
    await restorePlayer(db, daniel, { clock });
    expect((await updatePlannedItem(db, plan.id, 0, rx(3, 12), deps)).ok).toBe(true);
  });
});

describe('the freeze boundary: editable until a TrainingSession EXISTS (not until it completes)', () => {
  it('a started (IN_PROGRESS) plan is frozen at once: every operation refused, SQL too; nothing changes', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    const plan = await addBlockToPlannedWorkout(db, (await newPlan()).id, shooting.id, deps);
    const session = await startSession(db, plan.id, deps);
    expect(session.status).toBe('IN_PROGRESS');
    const before = await dump();
    for (const f of [
      () => addBlockToPlannedWorkout(db, plan.id, shooting.id, deps),
      () => addExerciseToPlannedWorkout(db, plan.id, 'PLANK', deps),
      () => removePlannedEntry(db, plan.id, 0, deps),
      () => movePlannedEntry(db, plan.id, 0, 0, deps),
      () => updatePlannedItem(db, plan.id, 0, rx(1, 1), deps),
    ]) {
      await expect(f()).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    }
    await expect(db.runAsync("UPDATE planned_workouts SET name = 'x'")).rejects.toThrow(/frozen/);
    await expect(db.runAsync('UPDATE planned_workout_items SET sets = 9')).rejects.toThrow(/frozen/);
    await expect(db.runAsync('DELETE FROM planned_workout_items')).rejects.toThrow(/frozen/);
    expect(await dump()).toEqual(before);
    await abandonSession(db, session.id, deps); // stopping does not unfreeze it either
    await expect(removePlannedEntry(db, plan.id, 0, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
  });

  it('a plan made from a Template (planWorkout) carries sections + provenance and is editable until started; planAndStart is frozen at once', async () => {
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 10, 50)]);
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    const t = await createTemplate(db, { name: 'Gym + Shots', blockIds: [strength.id, shooting.id, strength.id] }, deps);
    if (!t.ok) throw new Error('seed');
    let plan = await planWorkout(db, { playerId: daniel, templateId: t.template.id }, deps);
    expect(kinds(plan)).toEqual(['S:Strength(1)', 'S:Shooting(1)', 'S:Strength(1)']);
    expect(plan.items.map((i) => i.sourceBlockId)).toEqual([strength.id, shooting.id, strength.id]);
    expect(new Set(plan.items.map((i) => i.sectionId)).size).toBe(3); // the repeated Block is two sections
    plan = await addEx(plan.id, 'PLANK', { at: 1 });
    expect(kinds(plan)[1]).toBe('E:PLANK');
    const started = await planAndStart(db, { playerId: alice, templateId: t.template.id }, deps);
    await expect(removePlannedEntry(db, started.plannedWorkoutId!, 0, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
  });

  it('an empty plan can be composed but not started (PLAN_EMPTY); a composed plan starts and its session copies the order exactly', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS']);
    const plan = await newPlan();
    await expect(startSession(db, plan.id, deps)).rejects.toMatchObject({ rule: 'PLAN_EMPTY' });
    expect((await listTraining(db, daniel)).planned.map((p) => p.id)).toEqual([plan.id]); // listed while empty
    await addBlockToPlannedWorkout(db, plan.id, shooting.id, deps);
    await addExerciseToPlannedWorkout(db, plan.id, 'PLANK', deps);
    await movePlannedEntry(db, plan.id, 1, 0, deps);
    const session = await startSession(db, plan.id, deps);
    expect(session.exercises.map((e) => [e.position, e.plannedPosition, e.blockName, e.exercise.exerciseId])).toEqual([
      [0, 0, null, 'PLANK'],
      [1, 1, 'Shooting', 'FREE_THROWS'],
    ]);
  });

  it('create: the name is required and within the limit; an unknown Player is not found', async () => {
    expect(await createPlannedWorkout(db, { playerId: daniel, name: '   ' }, deps)).toEqual({ ok: false, errors: { name: 'REQUIRED' } });
    expect(await createPlannedWorkout(db, { playerId: daniel, name: 'N'.repeat(36) }, deps)).toEqual({ ok: false, errors: { name: 'TOO_LONG' } });
    await expect(createPlannedWorkout(db, { playerId: 'missing', name: 'x' }, deps)).rejects.toBeInstanceOf(TrainingNotFoundError);
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM planned_workouts')).toEqual({ n: 0 });
  });

  it('a stored composition that breaks its rules is refused on read (nothing is repaired)', async () => {
    const shooting = await mkBlock('Shooting', ['FREE_THROWS'], ['PLANK']);
    const plan = await addBlockToPlannedWorkout(db, (await newPlan()).id, shooting.id, deps);
    await addExerciseToPlannedWorkout(db, plan.id, 'PUSH_UP', deps);
    await addBlockToPlannedWorkout(db, plan.id, shooting.id, deps);
    // out-of-band corruption (the freeze trigger would refuse; drop it here to simulate a damaged file)
    await db.execAsync('DROP TRIGGER planned_items_frozen_update');
    await db.runAsync("UPDATE planned_workout_items SET section_id = (SELECT section_id FROM planned_workout_items WHERE position = 0) WHERE position = 3");
    await expect(getPlannedWorkout(db, plan.id)).rejects.toBeInstanceOf(TrainingDataError);
  });
});

describe('while a plan is editable, only its prescription and name change in place (identity never does)', () => {
  it('SQL: sets / target / load / rest and the plan name may change; exercise snapshot, section, provenance, position and the plan identity may not', async () => {
    const strength = await mkBlock('Strength', ['BARBELL_BENCH_PRESS', rx(3, 10, 50)], ['PUSH_UP']);
    const plan = await addBlockToPlannedWorkout(db, (await newPlan()).id, strength.id, deps);
    const before = await dump();
    // allowed (the editable fields)
    await db.runAsync('UPDATE planned_workout_items SET sets = 4, target = 8, load_kg = 55, rest_sec = 30 WHERE position = 0');
    await db.runAsync("UPDATE planned_workouts SET name = 'Renamed', updated_at = ? WHERE id = ?", [T0 + 1, plan.id]);
    // refused: identity of an item
    for (const set of [
      "exercise_id = 'PLANK'",
      "exercise_name_en = 'Other'",
      "exercise_name_he = 'אחר'",
      "measurement_type = 'DURATION'",
      'uses_load = 1',
      'distance_m = 5',
      "comparison_policy = 'LOWER_IS_BETTER'",
      "block_name = 'Other block'",
      "section_id = 'another-section'",
      "source_block_id = NULL, section_id = NULL",
      'position = 7',
      "planned_workout_id = (SELECT id FROM planned_workouts LIMIT 1) || 'x'",
    ]) {
      await expect(db.runAsync(`UPDATE planned_workout_items SET ${set} WHERE position = 1`)).rejects.toThrow(/frozen|FOREIGN|CHECK/);
    }
    // refused: identity of the plan
    for (const set of [`player_id = '${alice}'`, "template_id = 'x'", 'created_at = 1', "id = 'new-id'"]) {
      await expect(db.runAsync(`UPDATE planned_workouts SET ${set} WHERE id = ?`, [plan.id])).rejects.toThrow(/frozen|FOREIGN|CHECK/);
    }
    const after = await dump();
    expect(after.planned_workout_items!.map((r) => (r as { position: number; sets: number }).sets)).toEqual([4, 2]); // only the allowed edit landed
    expect(after.planned_workout_items!.map((r) => ({ ...(r as object), sets: 0, target: 0, load_kg: 0, rest_sec: 0 }))).toEqual(
      before.planned_workout_items!.map((r) => ({ ...(r as object), sets: 0, target: 0, load_kg: 0, rest_sec: 0 })),
    );
    expect((await db.getFirstAsync<{ name: string; player_id: string }>('SELECT name, player_id FROM planned_workouts WHERE id = ?', [plan.id]))).toEqual({ name: 'Renamed', player_id: daniel });
  });
});

it('TrainingRuleError carries the new rule codes', () => {
  expect(new TrainingRuleError('PLAN_EMPTY').rule).toBe('PLAN_EMPTY');
  expect(new TrainingRuleError('POSITION_OUT_OF_RANGE').rule).toBe('POSITION_OUT_OF_RANGE');
});
