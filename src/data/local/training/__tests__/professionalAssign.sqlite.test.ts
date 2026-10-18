import { groupEntries } from '@/domain/training/composition';
import { PROFESSIONAL_WORKOUTS, professionalWorkout } from '@/domain/training/professional';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { listExercises, setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { archivePlayer, createPlayer } from '../../players/playerRepository';
import { AssignmentFailedError } from '../errors';
import {
  assignContentToPlayers,
  removePlannedEntry,
  savePlannedWorkout,
  updatePlannedItem,
  type AssignContent,
  type AssignTarget,
} from '../plannedWorkoutCompositionRepository';
import { getPlannedWorkout, listTraining, startSession } from '../trainingRepository';

/**
 * SPORT-CONTENT-001 — a professional workout → a Player's PlannedWorkout, on real SQLite (schema v19). The professional
 * source is read-only managed content; every use is an independent COPY (new or existing editable workout).
 */
const clock = { wallNow: () => new Date(2026, 9, 18, 12).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
let alice: string;
const PRO = (workoutId: string, language: 'he' | 'en' = 'en'): AssignContent => ({ kind: 'PROFESSIONAL', workoutId, language });
const NEW = (playerId: string, name = 'Surfing — Beginner'): AssignTarget => ({ playerId, destination: { type: 'NEW', name } });
const INTO = (playerId: string, planId: string): AssignTarget => ({ playerId, destination: { type: 'EXISTING', planId } });
const rx = (sets: number, target: number | null): Prescription => ({ sets, target, loadKg: null, restSec: 45 });
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
const tables = ['planned_workouts', 'planned_workout_items', 'training_sessions'];
const dump = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)] as const)));
const expectedIds = (workoutId: string) => professionalWorkout(workoutId)!.sections.flatMap((s) => s.items.map((i) => i.exerciseId));

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  daniel = await mkPlayer('Daniel');
  alice = await mkPlayer('Alice');
});
afterEach(() => db.closeAsync());

async function refused(promise: Promise<unknown>): Promise<AssignmentFailedError> {
  const e = await promise.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AssignmentFailedError);
  return e as AssignmentFailedError;
}

describe('the content is seeded', () => {
  it('all 21 new built-in Exercises exist, active, and carry their sport', async () => {
    const all = await listExercises(db);
    const surf = all.filter((e) => e.id.startsWith('SURF_'));
    const football = all.filter((e) => e.id.startsWith('FB_'));
    expect([surf.length, football.length]).toEqual([10, 11]);
    for (const e of [...surf, ...football]) expect([e.id, e.builtin, e.active]).toEqual([e.id, true, true]);
    expect(new Set(surf.flatMap((e) => e.sports))).toEqual(new Set(['SURFING']));
    expect(new Set(football.flatMap((e) => e.sports))).toEqual(new Set(['FOOTBALL']));
  });
});

describe('Professional workout → NEW PlannedWorkout', () => {
  it.each(PROFESSIONAL_WORKOUTS.map((w) => [w.id] as const))('%s: an independent workout with its sections, exercises and dosage, in order', async (workoutId) => {
    const pro = professionalWorkout(workoutId)!;
    const [r] = await assignContentToPlayers(db, PRO(workoutId), [NEW(daniel, pro.name[1])], deps);
    expect(r).toMatchObject({ playerId: daniel, created: true, planName: pro.name[1] });
    const plan = (await getPlannedWorkout(db, r!.planId))!;
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(expectedIds(workoutId));
    expect(plan.items.map((i) => i.position)).toEqual(plan.items.map((_, i) => i));
    // each section is a named run of items (legacy grouping): no section id, no Block behind it
    expect(plan.items.every((i) => i.sectionId === null && i.sourceBlockId === null && i.blockName !== null)).toBe(true);
    const entries = groupEntries(plan.items.map((i) => ({ sectionId: i.sectionId, blockName: i.blockName })));
    expect(entries.map((e) => (e.kind === 'SECTION' ? e.blockName : null))).toEqual(pro.sections.map((s) => s.name[1]));
    // the dosage written in the professional source is what the copy holds
    let n = 0;
    for (const s of pro.sections) {
      for (const item of s.items) {
        const copy = plan.items[n++]!;
        if (item.dosage) expect(copy.prescription).toEqual({ sets: item.dosage.sets, target: item.dosage.target, loadKg: null, restSec: item.dosage.restSec });
      }
    }
    expect(plan.sessionId).toBeNull();
  });

  it('Hebrew: the sections carry the Hebrew section names', async () => {
    const [r] = await assignContentToPlayers(db, PRO('FOOTBALL-FOUNDATION-01', 'he'), [NEW(daniel, 'כדורגל — מתחילים')], deps);
    const plan = (await getPlannedWorkout(db, r!.planId))!;
    const names = new Set(plan.items.map((i) => i.blockName));
    expect(names).toEqual(new Set(professionalWorkout('FOOTBALL-FOUNDATION-01')!.sections.map((s) => s.name[0])));
  });

  it('two Players, new workout each: two separate plans; editing one never touches the other', async () => {
    const [a, b] = await assignContentToPlayers(db, PRO('SURF-PROGRESSION-01'), [NEW(daniel), NEW(alice)], deps);
    expect(a!.planId).not.toBe(b!.planId);
    await updatePlannedItem(db, a!.planId, 0, rx(9, 9), deps);
    await removePlannedEntry(db, a!.planId, 0, deps);
    const other = (await getPlannedWorkout(db, b!.planId))!;
    expect(other.items.map((i) => i.exercise.exerciseId)).toEqual(expectedIds('SURF-PROGRESSION-01'));
  });
});

describe('Professional workout → EXISTING editable PlannedWorkout', () => {
  it('adds its sections after the existing items; the existing items are untouched; it can be added twice', async () => {
    const plan = await mkPlan(daniel, 'Tuesday', 'PUSH_UP', 'PLANK');
    const before = (await getPlannedWorkout(db, plan.id))!.items;
    const [r] = await assignContentToPlayers(db, PRO('FOOTBALL-PROGRESSION-01'), [INTO(daniel, plan.id)], deps);
    expect(r).toMatchObject({ planId: plan.id, created: false, planName: 'Tuesday' });
    const after = (await getPlannedWorkout(db, plan.id))!.items;
    expect(after.slice(0, 2)).toEqual(before);
    expect(after.slice(2).map((i) => i.exercise.exerciseId)).toEqual(expectedIds('FOOTBALL-PROGRESSION-01'));
    await assignContentToPlayers(db, PRO('FOOTBALL-PROGRESSION-01'), [INTO(daniel, plan.id)], deps);
    expect((await getPlannedWorkout(db, plan.id))!.items).toHaveLength(2 + 2 * expectedIds('FOOTBALL-PROGRESSION-01').length);
  });

  it('a FROZEN workout (a session exists) is rejected, naming the Player, and nothing is written', async () => {
    const plan = await mkPlan(daniel, 'Started', 'PUSH_UP');
    await startSession(db, plan.id, deps);
    const before = await dump();
    const e = await refused(assignContentToPlayers(db, PRO('SURF-FOUNDATION-01'), [INTO(daniel, plan.id)], deps));
    expect(e.playerId).toBe(daniel);
    expect(await dump()).toEqual(before);
  });

  it("another Player's workout is not a valid destination", async () => {
    const plan = await mkPlan(alice, 'Alice plan', 'PUSH_UP');
    const before = await dump();
    await refused(assignContentToPlayers(db, PRO('SURF-FOUNDATION-01'), [INTO(daniel, plan.id)], deps));
    expect(await dump()).toEqual(before);
  });
});

describe('rules, atomicity and isolation', () => {
  it('an archived Player gets nothing; an inactive Exercise refuses the whole add and leaves no empty plan', async () => {
    const before = await dump();
    await archivePlayer(db, alice, { clock });
    await refused(assignContentToPlayers(db, PRO('SURF-FOUNDATION-01'), [NEW(alice)], deps));
    await setExerciseActive(db, 'SURF_POP_UP', false, { clock });
    await refused(assignContentToPlayers(db, PRO('SURF-FOUNDATION-01'), [NEW(daniel)], deps));
    expect(await dump()).toEqual(before);
    expect((await listTraining(db, daniel)).planned).toEqual([]);
  });

  it('one refusal among several Players rolls everyone back', async () => {
    const plan = await mkPlan(alice, 'Started', 'PUSH_UP');
    await startSession(db, plan.id, deps);
    const before = await dump();
    const e = await refused(assignContentToPlayers(db, PRO('FOOTBALL-FOUNDATION-01'), [NEW(daniel), INTO(alice, plan.id)], deps));
    expect(e.playerId).toBe(alice);
    expect(await dump()).toEqual(before);
  });

  it('editing the COPY never changes the professional source; the source is the same object graph afterwards', async () => {
    const snapshot = JSON.stringify(PROFESSIONAL_WORKOUTS);
    const [r] = await assignContentToPlayers(db, PRO('SURF-PERFORMANCE-01'), [NEW(daniel)], deps);
    await updatePlannedItem(db, r!.planId, 3, rx(11, 22), deps);
    await removePlannedEntry(db, r!.planId, 0, deps);
    await savePlannedWorkout(db, { planId: r!.planId, playerId: daniel, name: 'My renamed workout', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [rx(1, 5)] }] }, deps);
    expect(JSON.stringify(PROFESSIONAL_WORKOUTS)).toBe(snapshot);
    // a later use starts from the original, not from the edited copy
    const [again] = await assignContentToPlayers(db, PRO('SURF-PERFORMANCE-01'), [NEW(alice)], deps);
    expect((await getPlannedWorkout(db, again!.planId))!.items.map((i) => i.exercise.exerciseId)).toEqual(expectedIds('SURF-PERFORMANCE-01'));
  });

  it('an unknown professional workout is refused', async () => {
    const before = await dump();
    await refused(assignContentToPlayers(db, PRO('NOPE'), [NEW(daniel)], deps));
    expect(await dump()).toEqual(before);
  });
});
