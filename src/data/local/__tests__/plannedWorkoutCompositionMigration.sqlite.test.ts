import { groupEntries } from '@/domain/training/composition';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { readExercisesUnserialized } from '../exercises/exerciseRepository';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { createPlayer } from '../players/playerRepository';
import {
  addBlockToPlannedWorkout,
  addExerciseToPlannedWorkout,
  movePlannedEntry,
  removePlannedEntry,
  updatePlannedItem,
} from '../training/plannedWorkoutCompositionRepository';
import {
  finishSession,
  getPlannedWorkout,
  getSession,
  listTraining,
  recordSet,
  skipSet,
  snapshotOf,
  startSession,
} from '../training/trainingRepository';
import { createBlock, createTemplate } from '../training/workoutRepository';

/**
 * QB-WORKOUT-BUILDER-001A — schema v17 (MIG-17-01…08): additive columns + the freeze-trigger change.
 * The v16 database is built realistically (players, blocks, a template, legacy plans written exactly as v16 wrote
 * them, sessions with recorded / skipped / finished results), then migrated.
 */
type Db = ReturnType<typeof openNodeSqlite>;
const T0 = new Date(2026, 9, 16, 17).getTime();
const clock = { wallNow: () => T0, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
const rx = (sets: number, target: number | null, loadKg: number | null = null): Prescription => ({ sets, target, loadKg, restSec: 60 });
const V16 = migrations.filter((m) => m.version <= 16);
let dbs: Db[] = [];

async function open(list = migrations): Promise<Db> {
  const d = openNodeSqlite(':memory:');
  dbs.push(d);
  await d.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(d, list);
  return d;
}
afterEach(async () => {
  for (const d of dbs) await d.closeAsync();
  dbs = [];
});

/** A plan written the way v16 wrote it: no section id, no provenance, only a block NAME on each row. */
async function legacyPlan(d: Db, playerId: string, name: string, rows: { block: string; exercise: string; p: Prescription }[]): Promise<string> {
  const exercises = await readExercisesUnserialized(d);
  const id = ids.newUuid();
  await d.runAsync('INSERT INTO planned_workouts (id, player_id, template_id, name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)', [id, playerId, name, T0, T0]);
  for (const [position, row] of rows.entries()) {
    const s = snapshotOf(exercises.find((e) => e.id === row.exercise)!);
    await d.runAsync(
      `INSERT INTO planned_workout_items (planned_workout_id, position, block_name, exercise_id, exercise_name_he, exercise_name_en,
         measurement_type, comparison_policy, uses_load, distance_m, sets, target, load_kg, rest_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, position, row.block, s.exerciseId, s.name.he, s.name.en, s.measurement.type, s.measurement.comparison, s.measurement.usesLoad ? 1 : 0, s.measurement.distanceM, row.p.sets, row.p.target, row.p.loadKg, row.p.restSec],
    );
  }
  return id;
}

interface Seed {
  db: Db;
  gal: string;
  noa: string;
  finishedPlan: string; // legacy, performed and FINISHED (PARTIAL)
  runningPlan: string; // legacy, IN_PROGRESS session
  openPlan: string; // legacy, NO session
  finishedSession: string;
  runningSession: string;
  strengthBlock: string;
}
async function seedV16(): Promise<Seed> {
  const db = await open(V16);
  const mk = async (name: string) => {
    const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
    if (!r.ok) throw new Error('seed');
    return r.profile.player.id;
  };
  const gal = await mk('Gal');
  const noa = await mk('Noa');
  const strength = await createBlock(db, { name: 'Strength', items: [{ exerciseId: 'BARBELL_BENCH_PRESS', prescription: rx(3, 10, 50) }, { exerciseId: 'PUSH_UP', prescription: rx(2, 12) }] }, deps);
  const shooting = await createBlock(db, { name: 'Shooting', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(2, 10) }] }, deps);
  if (!strength.ok || !shooting.ok) throw new Error('seed');
  const tpl = await createTemplate(db, { name: 'Gym + Shots', blockIds: [strength.block.id, shooting.block.id] }, deps);
  if (!tpl.ok) throw new Error('seed');
  const rows = [
    { block: 'Strength', exercise: 'BARBELL_BENCH_PRESS', p: rx(3, 10, 50) },
    { block: 'Strength', exercise: 'PUSH_UP', p: rx(2, 12) },
    { block: 'Shooting', exercise: 'FREE_THROWS', p: rx(2, 10) },
  ];
  const finishedPlan = await legacyPlan(db, gal, 'Gym + Shots', rows);
  const runningPlan = await legacyPlan(db, noa, 'Noa run', rows.slice(0, 2));
  const openPlan = await legacyPlan(db, gal, 'Open plan', [{ block: 'Strength', exercise: 'BARBELL_BENCH_PRESS', p: rx(3, 10, 50) }]);
  // sessions with real results, via the real repository (the v16 shape: it only writes session tables)
  const finished = await startSession(db, finishedPlan, deps);
  const bench = finished.exercises[0]!.sets;
  const a = await recordSet(db, bench[0]!.id, { REPETITIONS: 10, LOAD_KG: 50 }, deps);
  if (!a.ok) throw new Error('set');
  await skipSet(db, bench[1]!.id, { clock });
  const fin = await finishSession(db, finished.id, { clock });
  const running = await startSession(db, runningPlan, deps);
  const b = await recordSet(db, running.exercises[0]!.sets[0]!.id, { REPETITIONS: 8, LOAD_KG: 45 }, deps);
  if (!b.ok) throw new Error('set');
  return { db, gal, noa, finishedPlan, runningPlan, openPlan, finishedSession: fin.id, runningSession: running.id, strengthBlock: strength.block.id };
}

type Columns = Record<string, string[]>;
const tableNames = async (d: Db) =>
  (await d.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);
const columnsOf = async (d: Db): Promise<Columns> => {
  const out: Columns = {};
  for (const t of await tableNames(d)) out[t] = (await d.getAllAsync<{ name: string }>(`SELECT name FROM pragma_table_info('${t}') ORDER BY cid`)).map((c) => c.name);
  return out;
};
/** Every row of every table, restricted to the given (pre-migration) columns. */
const dumpWith = async (d: Db, columns: Columns) => {
  const out: Record<string, unknown[]> = {};
  for (const [t, cols] of Object.entries(columns)) out[t] = await d.getAllAsync(`SELECT ${cols.join(', ')} FROM ${t} ORDER BY rowid`);
  return out;
};
const triggers = async (d: Db) => (await d.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")).map((r) => r.name);
const objects = async (d: Db) => d.getAllAsync<{ type: string; name: string; sql: string }>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");

const OLD_TRIGGERS = ['planned_items_frozen_update', 'planned_items_never_deleted', 'planned_workouts_frozen_update'];
const NEW_TRIGGERS = ['planned_items_archived_player_delete', 'planned_items_archived_player_insert', 'planned_items_archived_player_update', 'planned_items_frozen_delete', 'planned_workouts_archived_player_update'];

it('MIG-17-01: a fresh database reaches v17 with the two nullable columns, the new triggers and sound constraints', async () => {
  const d = openNodeSqlite(':memory:');
  dbs.push(d);
  await d.execAsync('PRAGMA foreign_keys = ON');
  const result = await runMigrations(d, migrations);
  expect(result.to).toBe(18);
  expect(result.applied.at(-2)).toBe('planned_workout_composition'); // v18 (calendar link) follows; proven in its own suite
  expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
  const cols = await d.getAllAsync("SELECT name, type, \"notnull\" AS not_null, dflt_value FROM pragma_table_info('planned_workout_items') WHERE name IN ('section_id', 'source_block_id') ORDER BY cid");
  expect(cols).toEqual([
    { name: 'section_id', type: 'TEXT', not_null: 0, dflt_value: null },
    { name: 'source_block_id', type: 'TEXT', not_null: 0, dflt_value: null },
  ]);
  const t = await triggers(d);
  for (const name of [...NEW_TRIGGERS, 'planned_workouts_frozen_update', 'planned_items_frozen_update', 'planned_items_frozen_insert', 'planned_workouts_never_deleted']) expect(t).toContain(name);
  expect(t).not.toContain('planned_items_never_deleted');
  expect(await d.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
  expect(await d.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
  // constraints: provenance and section come together; provenance must reference a real Block
  const player = await createPlayer(d, { player: { name: 'P', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!player.ok) throw new Error('seed');
  const plan = ids.newUuid();
  await d.runAsync('INSERT INTO planned_workouts (id, player_id, template_id, name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)', [plan, player.profile.player.id, 'x', T0, T0]);
  const insert = (section: string | null, block: string | null) =>
    d.runAsync(
      `INSERT INTO planned_workout_items (planned_workout_id, position, block_name, exercise_id, exercise_name_he, exercise_name_en, measurement_type, comparison_policy, uses_load, distance_m, sets, target, load_kg, rest_sec, section_id, source_block_id)
       VALUES (?, 0, NULL, 'PLANK', 'א', 'a', 'DURATION', NULL, 0, NULL, 1, NULL, NULL, NULL, ?, ?)`,
      [plan, section, block],
    );
  await expect(insert('s1', null)).rejects.toThrow(/CHECK/);
  await expect(insert(null, 'b1')).rejects.toThrow(/CHECK/);
  await expect(insert('s1', 'no-such-block')).rejects.toThrow(/FOREIGN KEY/);
  await expect(insert('', null)).rejects.toThrow(/CHECK/);
  await insert(null, null); // a standalone / legacy-shaped row is valid
});

describe('upgrade from a realistic v16 database', () => {
  it('MIG-17-02: v16 → v17 succeeds; every existing row of every table is unchanged; the new columns are NULL; only the expected objects change', async () => {
    const seed = await seedV16();
    const { db } = seed;
    const before = await columnsOf(db);
    const rowsBefore = await dumpWith(db, before);
    const objectsBefore = await objects(db);
    const triggersBefore = await triggers(db);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 16 });

    const result = await runMigrations(db, migrations);
    expect(result).toEqual({ from: 16, to: 18, applied: ['planned_workout_composition', 'planned_workout_calendar_link'] });

    expect(await dumpWith(db, before)).toEqual(rowsBefore); // nothing rewritten, nothing lost, in ANY table
    expect(await db.getAllAsync('SELECT section_id, source_block_id FROM planned_workout_items')).toEqual(rowsBefore.planned_workout_items!.map(() => ({ section_id: null, source_block_id: null })));
    const triggersAfter = await triggers(db);
    expect(triggersBefore.filter((n) => !triggersAfter.includes(n))).toEqual(['planned_items_never_deleted']); // renamed: planned_items_frozen_delete
    expect(triggersAfter.filter((n) => !triggersBefore.includes(n) && !n.startsWith('calendar_events_plan_'))).toEqual(NEW_TRIGGERS); // v18's own triggers: see plannedWorkoutCalendarLinkMigration
    // every other schema object is byte-for-byte what it was
    const unchanged = (o: { type: string; name: string }) =>
      !OLD_TRIGGERS.includes(o.name) && o.name !== 'planned_workout_items' && o.name !== 'calendar_events'; // v18 adds a column to calendar_events
    const after = await objects(db);
    expect(after.filter(unchanged).filter((o) => objectsBefore.some((b) => b.name === o.name))).toEqual(objectsBefore.filter(unchanged));
    expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    // the upgraded schema equals a fresh install's
    const fresh = await open();
    expect((await objects(db)).map((o) => [o.type, o.name, o.sql])).toEqual((await objects(fresh)).map((o) => [o.type, o.name, o.sql]));
  });

  it('MIG-17-03: idempotent under the migration framework: a second run applies nothing and changes nothing', async () => {
    const { db } = await seedV16();
    await runMigrations(db, migrations);
    const objectsAfter = await objects(db);
    const columns = await columnsOf(db);
    const rows = await dumpWith(db, columns);
    expect(await runMigrations(db, migrations)).toEqual({ from: 18, to: 18, applied: [] });
    expect(await objects(db)).toEqual(objectsAfter);
    expect(await dumpWith(db, columns)).toEqual(rows);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
  });

  it('MIG-17-04: existing plans stay readable (legacy: no section id, no provenance), with their exact content and grouping', async () => {
    const seed = await seedV16();
    const { db } = seed;
    const planBefore = await getPlannedWorkout(db, seed.finishedPlan);
    const openBefore = await getPlannedWorkout(db, seed.openPlan);
    const overviewBefore = await listTraining(db, seed.gal);
    await runMigrations(db, migrations);
    expect(await getPlannedWorkout(db, seed.finishedPlan)).toEqual(planBefore);
    expect(await getPlannedWorkout(db, seed.openPlan)).toEqual(openBefore);
    expect(await listTraining(db, seed.gal)).toEqual(overviewBefore);
    const plan = (await getPlannedWorkout(db, seed.finishedPlan))!;
    expect(plan.items.map((i) => [i.sectionId, i.sourceBlockId])).toEqual([[null, null], [null, null], [null, null]]);
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['BARBELL_BENCH_PRESS', 'PUSH_UP', 'FREE_THROWS']);
    expect(groupEntries(plan.items).map((e) => (e.kind === 'SECTION' ? `${e.blockName}(${e.items.length})` : 'E'))).toEqual(['Strength(2)', 'Shooting(1)']);
    expect(plan.sessionId).toBe(seed.finishedSession);
  });

  it('MIG-17-05: existing TrainingSessions, their planned values and results are unchanged (finished and in progress)', async () => {
    const seed = await seedV16();
    const { db } = seed;
    const SESSION_TABLES = ['training_sessions', 'session_exercises', 'session_sets', 'set_measurements'];
    const columns = await columnsOf(db);
    const rawBefore = await dumpWith(db, Object.fromEntries(SESSION_TABLES.map((t) => [t, columns[t]!])));
    const finishedBefore = await getSession(db, seed.finishedSession);
    const runningBefore = await getSession(db, seed.runningSession);
    expect(finishedBefore!.status).toBe('PARTIAL');
    expect(runningBefore!.status).toBe('IN_PROGRESS');
    await runMigrations(db, migrations);
    expect(await dumpWith(db, Object.fromEntries(SESSION_TABLES.map((t) => [t, columns[t]!])))).toEqual(rawBefore);
    expect(await getSession(db, seed.finishedSession)).toEqual(finishedBefore);
    expect(await getSession(db, seed.runningSession)).toEqual(runningBefore);
    // the results themselves, explicitly
    const measured = await db.getAllAsync<{ kind: string; measured_value: number; final_value: number }>('SELECT kind, measured_value, final_value FROM set_measurements ORDER BY rowid');
    expect(measured.map((m) => [m.kind, m.final_value])).toEqual([['REPETITIONS', 10], ['LOAD_KG', 50], ['REPETITIONS', 8], ['LOAD_KG', 45]]);
    // the still-running session can keep being recorded (the migration did not close or lock it)
    const next = await recordSet(db, runningBefore!.exercises[0]!.sets[1]!.id, { REPETITIONS: 9, LOAD_KG: 45 }, deps);
    expect(next.ok).toBe(true);
  });

  it('MIG-17-06: a legacy plan with NO session can be edited (compose, re-prescribe, reorder, remove); other plans are untouched', async () => {
    const seed = await seedV16();
    const { db } = seed;
    await runMigrations(db, migrations);
    const columns = await columnsOf(db);
    const finishedRows = async () => db.getAllAsync('SELECT * FROM planned_workout_items WHERE planned_workout_id IN (?, ?) ORDER BY planned_workout_id, position', [seed.finishedPlan, seed.runningPlan]);
    const othersBefore = await finishedRows();

    let plan = await addBlockToPlannedWorkout(db, seed.openPlan, seed.strengthBlock, deps); // a Block copy after the legacy section
    const added = await addExerciseToPlannedWorkout(db, seed.openPlan, 'PLANK', deps, { at: 1 }); // between legacy and the copy
    if (!added.ok) throw new Error('add');
    plan = added.plan;
    expect(groupEntries(plan.items).map((e) => (e.kind === 'SECTION' ? `S:${e.blockName}:${e.sectionId === null ? 'legacy' : 'new'}(${e.items.length})` : `E:${e.item.exercise.exerciseId}`))).toEqual([
      'S:Strength:legacy(1)',
      'E:PLANK',
      'S:Strength:new(2)',
    ]);
    const edited = await updatePlannedItem(db, seed.openPlan, 0, rx(5, 3, 70), deps); // the LEGACY item's prescription
    expect(edited.ok).toBe(true);
    plan = await movePlannedEntry(db, seed.openPlan, 2, 0, deps);
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['BARBELL_BENCH_PRESS', 'PUSH_UP', 'BARBELL_BENCH_PRESS', 'PLANK']);
    plan = await removePlannedEntry(db, seed.openPlan, 1, deps); // the legacy section, as one entry
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['BARBELL_BENCH_PRESS', 'PUSH_UP', 'PLANK']);
    expect(await finishedRows()).toEqual(othersBefore); // legacy plans WITH sessions: not a single row touched
    expect((await getSession(db, seed.finishedSession))!.status).toBe('PARTIAL');
    void columns;
  });

  it('MIG-17-07: a legacy plan WITH a TrainingSession cannot be edited (finished or in progress): repository AND database refuse', async () => {
    const seed = await seedV16();
    const { db } = seed;
    await runMigrations(db, migrations);
    const columns = await columnsOf(db);
    const before = await dumpWith(db, columns);
    for (const planId of [seed.finishedPlan, seed.runningPlan]) {
      for (const f of [
        () => addBlockToPlannedWorkout(db, planId, seed.strengthBlock, deps),
        () => addExerciseToPlannedWorkout(db, planId, 'PLANK', deps),
        () => removePlannedEntry(db, planId, 0, deps),
        () => movePlannedEntry(db, planId, 0, 0, deps),
        () => updatePlannedItem(db, planId, 0, rx(1, 1), deps),
      ]) {
        await expect(f()).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
      }
      await expect(db.runAsync('UPDATE planned_workouts SET name = ? WHERE id = ?', ['x', planId])).rejects.toThrow(/frozen/);
      await expect(db.runAsync('UPDATE planned_workout_items SET sets = 9 WHERE planned_workout_id = ?', [planId])).rejects.toThrow(/frozen/);
      await expect(db.runAsync('DELETE FROM planned_workout_items WHERE planned_workout_id = ?', [planId])).rejects.toThrow(/frozen/);
      await expect(db.runAsync("INSERT INTO planned_workout_items (planned_workout_id, position, block_name, exercise_id, exercise_name_he, exercise_name_en, measurement_type, comparison_policy, uses_load, distance_m, sets) VALUES (?, 99, NULL, 'PLANK', 'א', 'a', 'DURATION', NULL, 0, NULL, 1)", [planId])).rejects.toThrow(/frozen/);
    }
    await expect(db.runAsync('DELETE FROM planned_workouts WHERE id = ?', [seed.finishedPlan])).rejects.toThrow(/never deleted/);
    expect(await dumpWith(db, columns)).toEqual(before);
  });

  it('MIG-17-08: a failed edit leaves the database exactly as it was (failure mid-rewrite, invalid input, bad position, rule refusals)', async () => {
    const seed = await seedV16();
    const { db } = seed;
    await runMigrations(db, migrations);
    const columns = await columnsOf(db);
    const before = await dumpWith(db, columns);
    // (a) a failure in the MIDDLE of the rewrite (the old items were already deleted and some new ones written)
    await db.execAsync("CREATE TEMP TRIGGER zz_boom_2 BEFORE INSERT ON planned_workout_items WHEN NEW.position = 2 BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(addBlockToPlannedWorkout(db, seed.openPlan, seed.strengthBlock, deps)).rejects.toThrow(/boom/); // positions 0,1,2
    await db.execAsync('DROP TRIGGER zz_boom_2');
    expect(await dumpWith(db, columns)).toEqual(before); // the plan has exactly its old items
    await db.execAsync("CREATE TEMP TRIGGER zz_boom_1 BEFORE INSERT ON planned_workout_items WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(addExerciseToPlannedWorkout(db, seed.openPlan, 'PLANK', deps)).rejects.toThrow(/boom/); // positions 0,1
    await db.execAsync('DROP TRIGGER zz_boom_1');
    expect(await dumpWith(db, columns)).toEqual(before);
    // (b)(c)(d) refused without writing anything
    expect(await updatePlannedItem(db, seed.openPlan, 0, rx(0, 1), deps)).toEqual({ ok: false, errors: expect.anything() });
    await expect(movePlannedEntry(db, seed.openPlan, 0, 7, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    await expect(addBlockToPlannedWorkout(db, seed.finishedPlan, seed.strengthBlock, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    expect(await dumpWith(db, columns)).toEqual(before);
    // the same operations work once nothing is sabotaged (the guards above were not accidents)
    expect((await addBlockToPlannedWorkout(db, seed.openPlan, seed.strengthBlock, deps)).items).toHaveLength(3);
  });

  it('MIG-17-08b: a v17 that fails part-way rolls back completely: user_version stays 16, no new column, old triggers, data intact', async () => {
    const { db } = await seedV16();
    const columns = await columnsOf(db);
    const rows = await dumpWith(db, columns);
    const triggersBefore = await triggers(db);
    const broken = [...V16, { ...migrations[16]!, sql: `${migrations[16]!.sql}\nCREATE TABLE planned_workouts (id TEXT);` }];
    await expect(runMigrations(db, broken)).rejects.toThrow(/already exists/);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 16 });
    expect(await columnsOf(db)).toEqual(columns); // no section_id / source_block_id
    expect(await triggers(db)).toEqual(triggersBefore); // the old freeze triggers are back / never left
    expect(await dumpWith(db, columns)).toEqual(rows);
    // and the same database then migrates cleanly
    expect((await runMigrations(db, migrations)).to).toBe(18);
  });
});
