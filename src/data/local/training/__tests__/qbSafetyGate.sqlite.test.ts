import type { CustomExerciseInput } from '@/domain/exercise/exercise';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { createCustomExercise, setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { PlayerArchivedError, PlayerHasActiveSessionError } from '../../players/errors';
import { archivePlayer, createPlayer, getPlayer, restorePlayer } from '../../players/playerRepository';
import { TemplateUnavailableItemsError, TrainingRuleError } from '../errors';
import {
  abandonSession,
  addSet,
  findInProgressSessionId,
  finishSession,
  getPlannedWorkout,
  getSession,
  listTraining,
  planAndStart,
  planWorkout,
  recordSet,
  skipSet,
  startSession,
} from '../trainingRepository';
import {
  createBlock,
  createTemplate,
  getBlock,
  getTemplate,
  setBlockActive,
  unavailableItemsOf,
  updateBlock,
  updateTemplate,
} from '../workoutRepository';

/**
 * QB SAFETY GATE (owner decisions 2026-10-15), permanent regression tests.
 * S1: a Player cannot be archived during a workout; session writes refuse an archived Player.
 * S2: inactive means "not available for NEW use"; a Template holding inactive content cannot start a NEW plan.
 */
const MARCH: CustomExerciseInput = {
  name: 'Kettlebell March', categories: ['CONDITIONING'], primaryMuscles: ['GLUTES'], secondaryMuscles: [],
  difficulty: 'BEGINNER', sports: [], equipment: [['KETTLEBELL']], measurementType: 'DURATION',
  comparison: 'HIGHER_IS_BETTER', usesLoad: false, instructions: '', tutorialUrl: '',
};
const rx = (sets: number, target: number | null) => ({ sets, target, loadKg: null, restSec: 60 });
let now = new Date(2026, 9, 15, 17).getTime();
const clock = { wallNow: () => now, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
let db: ReturnType<typeof openNodeSqlite>;
let gal: string;
let march: string;

async function seed() {
  const shots = await createBlock(db, { name: 'Shots', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(2, 10) }, { exerciseId: march, prescription: rx(1, 30) }] }, deps);
  const other = await createBlock(db, { name: 'Other', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(1, 5) }] }, deps);
  if (!shots.ok || !other.ok) throw new Error('seed');
  const t = await createTemplate(db, { name: 'Tpl', blockIds: [shots.block.id, other.block.id] }, deps);
  if (!t.ok) throw new Error('seed');
  return { shots: shots.block, other: other.block, template: t.template };
}

beforeEach(async () => {
  now = new Date(2026, 9, 15, 17).getTime();
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const p = await createPlayer(db, { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  gal = p.profile.player.id;
  const e = await createCustomExercise(db, MARCH, deps);
  if (!e.ok) throw new Error('seed');
  march = e.exercise.id;
});
afterEach(() => db.closeAsync());

const tableDump = async (names: string[]) => {
  const out: Record<string, unknown[]> = {};
  for (const n of names) out[n] = await db.getAllAsync(`SELECT * FROM ${n} ORDER BY rowid`);
  return out;
};
const TRAINING_TABLES = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements'];

describe('S1 — archiving and the session write path', () => {
  it('S1-01: archiving a Player with an IN_PROGRESS session is rejected, naming the session', async () => {
    const { template } = await seed();
    const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps);
    const err = await archivePlayer(db, gal, { clock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlayerHasActiveSessionError);
    expect((err as PlayerHasActiveSessionError).sessionId).toBe(session.id);
    expect(await findInProgressSessionId(db, gal)).toBe(session.id);
    expect((await getPlayer(db, gal))!.player.archivedAt).toBeNull();
  });

  it('S1-02: the rejected archive changes nothing — no status, no row, no Player field (never ABANDONED)', async () => {
    const { template } = await seed();
    const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps);
    const before = await tableDump(TRAINING_TABLES);
    const playerBefore = await db.getAllAsync('SELECT * FROM players');
    await expect(archivePlayer(db, gal, { clock })).rejects.toBeInstanceOf(PlayerHasActiveSessionError);
    expect(await tableDump(TRAINING_TABLES)).toEqual(before);
    expect(await db.getAllAsync('SELECT * FROM players')).toEqual(playerBefore);
    expect((await getSession(db, session.id))!.status).toBe('IN_PROGRESS');
    // once the workout is finished (by the user) the archive is allowed
    const sets = session.exercises.flatMap((e) => e.sets);
    const done = await recordSet(db, sets[0]!.id, { MADE: 7, ATTEMPTS: 10 }, deps);
    if (!done.ok) throw new Error('set');
    await finishSession(db, session.id, deps);
    await expect(archivePlayer(db, gal, { clock })).resolves.toBeGreaterThan(0);
  });

  it('S1-02b: stopping the workout (the user\'s choice) also lets the Player be archived', async () => {
    const { template } = await seed();
    const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps);
    await abandonSession(db, session.id, deps);
    await expect(archivePlayer(db, gal, { clock })).resolves.toBeGreaterThan(0);
    expect((await getSession(db, session.id))!.status).toBe('ABANDONED');
  });

  it('S1-03: every session write refuses an ARCHIVED Player, below the UI; nothing is written', async () => {
    const { template } = await seed();
    const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps);
    const sets = session.exercises.flatMap((e) => e.sets);
    // a legacy / out-of-band state: archived while the session is still IN_PROGRESS (the repository can no longer produce it)
    await db.runAsync('UPDATE players SET archived_at = ? WHERE id = ?', [now, gal]);
    const before = await tableDump(TRAINING_TABLES);
    const refused = async (f: () => Promise<unknown>) => expect(f()).rejects.toBeInstanceOf(PlayerArchivedError);
    await refused(() => recordSet(db, sets[0]!.id, { MADE: 7, ATTEMPTS: 10 }, deps));
    await refused(() => skipSet(db, sets[1]!.id, { clock }));
    await refused(() => addSet(db, session.exercises[0]!.id, deps));
    await refused(() => finishSession(db, session.id, { clock }));
    await refused(() => abandonSession(db, session.id, { clock }));
    expect(await tableDump(TRAINING_TABLES)).toEqual(before);
    // restoring the Player makes the workout writable again (it was never changed or closed for them)
    await restorePlayer(db, gal, { clock });
    await expect(abandonSession(db, session.id, { clock })).resolves.toMatchObject({ status: 'ABANDONED' });
  });

  it('S1-04: finished historical sessions of an archived Player stay readable and unchanged', async () => {
    const { template } = await seed();
    const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps);
    const done = await recordSet(db, session.exercises[0]!.sets[0]!.id, { MADE: 7, ATTEMPTS: 10 }, deps);
    if (!done.ok) throw new Error('set');
    const finished = await finishSession(db, session.id, deps);
    const plan = (await listTraining(db, gal)).sessions[0]!;
    await archivePlayer(db, gal, { clock });
    expect(await getSession(db, session.id)).toEqual(finished);
    expect((await listTraining(db, gal)).sessions[0]).toEqual(plan);
    expect(await getPlannedWorkout(db, finished.plannedWorkoutId!)).not.toBeNull();
    await expect(addSet(db, session.exercises[0]!.id, deps)).rejects.toThrow(); // closed AND archived: refused
  });

  it('archiving an already archived Player stays idempotent (the original time)', async () => {
    const first = await archivePlayer(db, gal, { clock });
    now += 3_600_000;
    expect(await archivePlayer(db, gal, { clock })).toBe(first);
  });
});

describe('S2 — inactive means "not available for NEW use"', () => {
  it('S2-01: an inactive Exercise cannot be NEWLY added to a block (create or edit); existing items stay', async () => {
    const { shots } = await seed();
    await setExerciseActive(db, march, false, { clock });
    const created = await createBlock(db, { name: 'New', items: [{ exerciseId: march, prescription: rx(1, 10) }] }, deps);
    expect(created).toEqual({ ok: false, errors: { inactiveItems: [0] } });
    // an EDIT keeps the existing inactive item (existing content stays) ...
    const kept = await updateBlock(db, shots.id, { name: 'Shots 2', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(3, 10) }, { exerciseId: march, prescription: rx(1, 30) }] }, { clock });
    expect(kept.ok).toBe(true);
    // ... but cannot ADD a second copy of it
    const more = await updateBlock(db, shots.id, { name: 'Shots 2', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(3, 10) }, { exerciseId: march, prescription: rx(1, 30) }, { exerciseId: march, prescription: rx(1, 30) }] }, { clock });
    expect(more).toEqual({ ok: false, errors: { inactiveItems: [2] } });
    expect((await getBlock(db, shots.id))!.items).toHaveLength(2);
  });

  it('S2-02: a hidden Block cannot be NEWLY added to a Template; the Template it is already in is kept', async () => {
    const { other, shots, template } = await seed();
    await setBlockActive(db, other.id, false, { clock });
    const fresh = await createTemplate(db, { name: 'Fresh', blockIds: [other.id] }, deps);
    expect(fresh).toEqual({ ok: false, errors: { inactiveBlocks: [other.id] } });
    const kept = await updateTemplate(db, template.id, { name: 'Tpl B', blockIds: [shots.id, other.id] }, { clock });
    expect(kept.ok).toBe(true); // existing content stays
    const added = await updateTemplate(db, template.id, { name: 'Tpl B', blockIds: [shots.id, other.id, other.id] }, { clock });
    expect(added).toEqual({ ok: false, errors: { inactiveBlocks: [other.id] } });
    expect((await getTemplate(db, template.id))!.blocks).toHaveLength(2);
  });

  it('S2-03: an old Template holding inactive content is blocked for NEW planning (plan and start); nothing is copied or dropped', async () => {
    const { other, template } = await seed();
    await setBlockActive(db, other.id, false, { clock });
    await setExerciseActive(db, march, false, { clock });
    const before = await tableDump(TRAINING_TABLES);
    const err = await planWorkout(db, { playerId: gal, templateId: template.id }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TemplateUnavailableItemsError);
    const unavailable = (err as TemplateUnavailableItemsError).unavailable;
    expect(unavailable.blocks.map((b) => b.name)).toEqual(['Other']);
    expect(unavailable.exercises.map((e) => e.id)).toEqual([march]);
    await expect(planAndStart(db, { playerId: gal, templateId: template.id }, deps)).rejects.toBeInstanceOf(TemplateUnavailableItemsError);
    expect(await tableDump(TRAINING_TABLES)).toEqual(before);
    expect(unavailableItemsOf((await getTemplate(db, template.id))!)).toEqual(unavailable);
    // resolved explicitly (restore the items) -> allowed again, with everything in it
    await setBlockActive(db, other.id, true, { clock });
    await setExerciseActive(db, march, true, { clock });
    const plan = await planWorkout(db, { playerId: gal, templateId: template.id }, deps);
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS', march, 'FREE_THROWS']);
  });

  it('S2-04: existing historical plans and sessions stay exactly as they were when content is hidden later', async () => {
    const { other, template } = await seed();
    const plan = await planWorkout(db, { playerId: gal, templateId: template.id }, deps);
    const started = await startSession(db, plan.id, deps);
    const before = await tableDump(TRAINING_TABLES);
    const planBefore = await getPlannedWorkout(db, plan.id);
    await setBlockActive(db, other.id, false, { clock });
    await setExerciseActive(db, march, false, { clock });
    expect(await tableDump(TRAINING_TABLES)).toEqual(before);
    expect(await getPlannedWorkout(db, plan.id)).toEqual(planBefore);
    expect(await getSession(db, started.id)).toEqual(started);
    // and an already-valid active Template still plans normally (S2 touches NEW use of unavailable content only)
    const t2 = await createTemplate(db, { name: 'Clean', blockIds: [(await seed2()).id] }, deps);
    expect(t2.ok).toBe(true);
    if (t2.ok) await expect(planWorkout(db, { playerId: gal, templateId: t2.template.id }, deps)).resolves.toBeDefined();
  });
});

async function seed2() {
  const b = await createBlock(db, { name: 'Clean block', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(1, 10) }] }, deps);
  if (!b.ok) throw new Error('seed');
  return b.block;
}

describe('rule codes', () => {
  it('BLOCK_INACTIVE / EXERCISE_INACTIVE are training rules', () => {
    expect(new TrainingRuleError('BLOCK_INACTIVE').rule).toBe('BLOCK_INACTIVE');
    expect(new TrainingRuleError('EXERCISE_INACTIVE').rule).toBe('EXERCISE_INACTIVE');
  });
});
