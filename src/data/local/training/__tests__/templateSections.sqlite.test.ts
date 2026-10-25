import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import type { Prescription } from '@/domain/training/training';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { assignContentToPlayers, savePlannedWorkout, type SaveEntry, type SectionItem } from '../plannedWorkoutCompositionRepository';
import { getPlannedWorkout, startSession } from '../trainingRepository';
import { createBlock } from '../workoutRepository';
import { setExerciseActive } from '../../exercises/exerciseRepository';

/**
 * WORKOUT-TEMPLATES-001: the Builder's SECTION entry (an imported template / a rearranged section) on real SQLite (schema v22 -> v23):
 * legacy-shaped sections, explicit exercises resolved from the catalog, provenance never falsified, atomic.
 */
const clock = { wallNow: () => new Date(2026, 9, 25, 12).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let player: string;
const rx = (sets: number, target: number | null, restSec: number | null = 60, extra: Partial<Prescription> = {}): Prescription => ({ sets, target, loadKg: null, restSec, ...extra });
const sec = (name: string, ...items: { exerciseId: string; prescription: Prescription }[]): SaveEntry => ({ kind: 'SECTION', name, items });
const rows = (planId: string) => db.getAllAsync<Record<string, unknown>>('SELECT * FROM planned_workout_items WHERE planned_workout_id = ? ORDER BY position', [planId]);
const dump = async () => JSON.stringify(await Promise.all(['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises'].map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`))));

async function save(entries: SaveEntry[], planId: string | null = null, name = 'From template') {
  const r = await savePlannedWorkout(db, { planId, playerId: player, name, entries }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const r = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  player = r.profile.player.id;
});
afterEach(() => db.closeAsync());

describe('SECTION entries are written in the legacy shape from catalog ids', () => {
  it('Warm-up / Main / Cool-down: names, order, prescription (incl. time_semantics), no section_id, no source_block_id', async () => {
    const plan = await save([
      sec('Warm-up', { exerciseId: 'JUMPING_JACKS', prescription: rx(2, 30, 15) }),
      sec('Main workout', { exerciseId: 'SPRINT_10M', prescription: rx(3, 5, 90, { timeSemantics: 'COMPLETION_TIME_CAP' }) }, { exerciseId: 'PUSH_UP', prescription: rx(3, 10) }),
      sec('Cool-down', { exerciseId: 'CHILDS_POSE', prescription: rx(1, 45, 0) }),
    ]);
    const r = await rows(plan.id);
    expect(r.map((x) => [x.position, x.block_name, x.exercise_id, x.section_id, x.source_block_id])).toEqual([
      [0, 'Warm-up', 'JUMPING_JACKS', null, null],
      [1, 'Main workout', 'SPRINT_10M', null, null],
      [2, 'Main workout', 'PUSH_UP', null, null],
      [3, 'Cool-down', 'CHILDS_POSE', null, null],
    ]);
    expect(r[1]).toMatchObject({ sets: 3, target: 5, rest_sec: 90, time_semantics: 'COMPLETION_TIME_CAP' });
    expect(r[2]).toMatchObject({ sets: 3, target: 10, rest_sec: 60, time_semantics: null });
    expect((await getPlannedWorkout(db, plan.id))!.items.map((i) => i.blockName)).toEqual(['Warm-up', 'Main workout', 'Main workout', 'Cool-down']);
  });
  it('the exercise snapshot comes from the catalog, never from the screen: measurement and names are the exercise\'s own', async () => {
    const plan = await save([sec('Main workout', { exerciseId: 'PLANK', prescription: rx(3, 30, 45) })]);
    const [row] = await rows(plan.id);
    expect(row).toMatchObject({ exercise_id: 'PLANK', exercise_name_en: 'Plank', measurement_type: 'DURATION' });
  });
  it('an unknown exercise, an inactive exercise, an empty section and a blank name are refused and nothing is written', async () => {
    const before = await dump();
    await expect(savePlannedWorkout(db, { planId: null, playerId: player, name: 'x', entries: [sec('A', { exerciseId: 'NOPE', prescription: rx(1, 1) })] }, deps)).rejects.toThrow();
    await setExerciseActive(db, 'PLANK', false, { clock });
    await expect(savePlannedWorkout(db, { planId: null, playerId: player, name: 'x', entries: [sec('A', { exerciseId: 'PLANK', prescription: rx(1, 30) })] }, deps)).rejects.toMatchObject({ rule: 'EXERCISE_INACTIVE' });
    await expect(savePlannedWorkout(db, { planId: null, playerId: player, name: 'x', entries: [{ kind: 'SECTION', name: 'A', items: [] }] }, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    await expect(savePlannedWorkout(db, { planId: null, playerId: player, name: 'x', entries: [sec('  ', { exerciseId: 'PUSH_UP', prescription: rx(1, 5) })] }, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    expect(await dump()).toBe(before);
  });
  it('an invalid prescription is returned by entry.item and nothing is written', async () => {
    const r = await savePlannedWorkout(db, { planId: null, playerId: player, name: 'x', entries: [sec('A', { exerciseId: 'PUSH_UP', prescription: rx(0, 10) })] }, deps);
    expect(r).toMatchObject({ ok: false, errors: { items: { '0.0': { sets: expect.anything() } } } });
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM planned_workouts')).toEqual({ n: 0 });
  });
});

describe('moving items between sections of a saved plan', () => {
  async function professionalPlan() {
    const [assigned] = await assignContentToPlayers(db, { kind: 'PROFESSIONAL', workoutId: 'ATH-ACCELERATION-01', language: 'en' }, [{ playerId: player, destination: { type: 'NEW', name: 'Accel copy' } }], deps);
    return (await getPlannedWorkout(db, assigned!.planId))!;
  }
  it('a kept item moved to another section changes only its section name and position: exercise, sets, target, rest, time_semantics are identical', async () => {
    const plan = await professionalPlan();
    const before = await rows(plan.id);
    const last = plan.items.length - 1; // 20 m Sprint, COMPLETION_TIME_CAP
    const sections = [...new Set(plan.items.map((i) => i.blockName))];
    const entries = sections.map((name) => ({
      kind: 'SECTION' as const,
      name: name!,
      items: plan.items
        .filter((i) => i.blockName === name && i.position !== last)
        .map((i): SectionItem => ({ keep: i.position, prescription: i.prescription })),
    }));
    entries[0] = { ...entries[0]!, items: [...entries[0]!.items, { keep: last, prescription: plan.items[last]!.prescription }] };
    const saved = await save(entries, plan.id, 'Accel copy');
    const after = await rows(saved.id);
    const strip = (x: Record<string, unknown>) => JSON.stringify({ ...x, position: 0, block_name: '' });
    expect(after.map(strip).sort()).toEqual(before.map(strip).sort()); // nothing but section / order changed
    expect(after.find((x) => x.position === 3)).toMatchObject({ exercise_id: 'SPRINT_20M', block_name: sections[0], time_semantics: 'COMPLETION_TIME_CAP' });
    expect(after.every((x) => x.section_id === null && x.source_block_id === null)).toBe(true);
    expect(after.map((x) => x.position)).toEqual(after.map((_, i) => i)); // contiguous, no duplicate
  });
  it('an item of a copied Block section cannot move into a section: refused (provenance is never rewritten) and the plan is unchanged', async () => {
    const made = await createBlock(db, { name: 'Mine', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 10) }, { exerciseId: 'PLANK', prescription: rx(2, 30) }] }, deps);
    if (!made.ok) throw new Error('seed');
    const plan = await save([
      { kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) },
      { kind: 'EXERCISE', exerciseId: 'DEAD_BUG', prescription: rx(2, 10) },
    ]);
    const before = await dump();
    await expect(
      savePlannedWorkout(db, { planId: plan.id, playerId: player, name: 'x', entries: [{ kind: 'SECTION', name: 'Main workout', items: [{ keep: 0, prescription: rx(2, 10) }, { keep: 2, prescription: rx(2, 10) }] }, { kind: 'KEEP', positions: [1], prescriptions: [rx(2, 30)] }] }, deps),
    ).rejects.toMatchObject({ rule: 'MOVE_PROVENANCE_REFUSED' });
    expect(await dump()).toBe(before);
    const rowsNow = await rows(plan.id);
    expect(rowsNow.slice(0, 2).every((x) => x.source_block_id === made.block.id && x.section_id !== null)).toBe(true);
  });
  it('a standalone item (no section) may move into a section and gets that section\'s name', async () => {
    const plan = await save([{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: rx(3, 30, 45) }, { kind: 'EXERCISE', exerciseId: 'DEAD_BUG', prescription: rx(2, 10) }]);
    const saved = await save([{ kind: 'SECTION', name: 'Main workout', items: [{ keep: 0, prescription: rx(3, 30, 45) }, { keep: 1, prescription: rx(2, 10) }] }], plan.id, 'x');
    expect((await rows(saved.id)).map((x) => [x.exercise_id, x.block_name])).toEqual([['PLANK', 'Main workout'], ['DEAD_BUG', 'Main workout']]);
  });
  it('a stored position can be used once; one that does not exist is refused', async () => {
    const plan = await save([{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: rx(3, 30, 45) }]);
    const before = await dump();
    await expect(savePlannedWorkout(db, { planId: plan.id, playerId: player, name: 'x', entries: [{ kind: 'SECTION', name: 'A', items: [{ keep: 0, prescription: rx(3, 30) }, { keep: 0, prescription: rx(3, 30) }] }] }, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    await expect(savePlannedWorkout(db, { planId: plan.id, playerId: player, name: 'x', entries: [{ kind: 'SECTION', name: 'A', items: [{ keep: 7, prescription: rx(3, 30) }] }] }, deps)).rejects.toMatchObject({ rule: 'POSITION_OUT_OF_RANGE' });
    expect(await dump()).toBe(before);
  });
  it('once a TrainingSession exists the plan is frozen: a section save is refused', async () => {
    const plan = await save([sec('Main workout', { exerciseId: 'PLANK', prescription: rx(3, 30, 45) })]);
    await startSession(db, plan.id, deps);
    await expect(savePlannedWorkout(db, { planId: plan.id, playerId: player, name: 'x', entries: [sec('Other', { exerciseId: 'PUSH_UP', prescription: rx(3, 10) })] }, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
  });
  it('a session started from a template-derived plan snapshots the section names and the order', async () => {
    const plan = await save([
      sec('Warm-up', { exerciseId: 'JUMPING_JACKS', prescription: rx(2, 30, 15) }),
      sec('Main workout', { exerciseId: 'PUSH_UP', prescription: rx(3, 10) }, { exerciseId: 'PLANK', prescription: rx(3, 30, 45) }),
      sec('Cool-down', { exerciseId: 'CHILDS_POSE', prescription: rx(1, 45, 0) }),
    ]);
    const session = await startSession(db, plan.id, deps);
    expect(session.exercises.map((e) => [e.exercise.exerciseId, e.blockName])).toEqual([
      ['JUMPING_JACKS', 'Warm-up'],
      ['PUSH_UP', 'Main workout'],
      ['PLANK', 'Main workout'],
      ['CHILDS_POSE', 'Cool-down'],
    ]);
  });
});
