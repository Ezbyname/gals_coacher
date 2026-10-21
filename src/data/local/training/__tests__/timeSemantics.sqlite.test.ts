import { builtinExercise } from '@/domain/exercise/catalog';
import { resolveTimeSemantics, type TimeSemantics } from '@/domain/exercise/timeSemantics';
import { PROFESSIONAL_WORKOUTS, GENERAL_ATHLETIC_WORKOUTS, professionalWorkout } from '@/domain/training/professional';
import type { ProfessionalItem } from '@/domain/training/professional';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { assignTrainingBlock } from '../trainingBlockAssignment';
import { assignContentToPlayers, savePlannedWorkout } from '../plannedWorkoutCompositionRepository';
import { getPlannedWorkout, getSession, recordSet, startSession } from '../trainingRepository';

/**
 * TRAINING-BLOCKS-001 — HISTORY-SAFE time semantics (schema v22). What a seconds value means is stored WITH the copied plan item
 * and the session exercise; nothing is inferred from the exercise id, so an old "Goal time" never silently becomes a cap, a
 * later registry change cannot reach an existing plan or session, and a real result above a cap is recorded as it is.
 */
const clock = { wallNow: () => new Date(2026, 9, 18, 12).getTime(), monotonicNow: () => 0 };
let ids = createSequentialIdService();
const deps = () => ({ ids, clock });
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let player: string;

beforeEach(async () => {
  ids = createSequentialIdService();
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const r = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps());
  if (!r.ok) throw new Error('seed');
  player = r.profile.player.id;
});
afterEach(() => db.closeAsync());

const legacyPlan = async (name: string, exerciseId: string, target: number | null) => {
  const r = await savePlannedWorkout(db, { planId: null, playerId: player, name, entries: [{ kind: 'EXERCISE', exerciseId, prescription: { sets: 3, target, loadKg: null, restSec: 60 } }] }, deps());
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
};
const columnOf = async (table: 'planned_workout_items' | 'session_exercises') => (await db.getAllAsync<{ time_semantics: string | null }>(`SELECT time_semantics FROM ${table}`)).map((r) => r.time_semantics);
const block = async (blockId: string) => (await assignTrainingBlock(db, { blockId, playerId: player, language: 'en', startTimes: null }, deps())).planIds;
const sprintPlanId = async (planIds: readonly string[], exerciseId: string) => {
  for (const id of planIds) {
    const plan = (await getPlannedWorkout(db, id))!;
    if (plan.items.some((i) => i.exercise.exerciseId === exerciseId)) return id;
  }
  throw new Error(`no plan with ${exerciseId}`);
};
const meaning = (p: { timeSemantics?: TimeSemantics | null }, type: 'TIME' | 'DURATION') => resolveTimeSemantics(type, p.timeSemantics);

describe('legacy data keeps its meaning (an old plan and an old session are Goal time)', () => {
  it('1. an OLD PlannedWorkout with SPRINT_10M and no explicit semantics stores NULL and resolves to the historical goal time', async () => {
    const plan = await legacyPlan('Old sprints', 'SPRINT_10M', 2.5);
    expect(await columnOf('planned_workout_items')).toEqual([null]);
    const read = (await getPlannedWorkout(db, plan.id))!;
    expect(read.items[0]!.prescription).toEqual({ sets: 3, target: 2.5, loadKg: null, restSec: 60 }); // no semantics key at all
    expect(meaning(read.items[0]!.prescription, 'TIME')).toBe('PERFORMANCE_GOAL_TIME');
  });

  it('2. an OLD TrainingSession with the same data also stays Goal time', async () => {
    const plan = await legacyPlan('Old sprints', 'SPRINT_10M', 2.5);
    const session = await startSession(db, plan.id, deps());
    expect(await columnOf('session_exercises')).toEqual([null]);
    const read = (await getSession(db, session.id))!;
    expect(read.exercises[0]!.timeSemantics).toBeUndefined();
    expect(resolveTimeSemantics('TIME', read.exercises[0]!.timeSemantics)).toBe('PERFORMANCE_GOAL_TIME');
  });

  it('a legacy item is not a cap merely because its exercise appears in the new Training Blocks (no id rule): the same exercise coexists in both meanings', async () => {
    const legacy = await legacyPlan('Custom', 'SPRINT_10M', 3);
    const planIds = await block('SPEED-ACCELERATION-6W-01');
    const fromBlock = (await getPlannedWorkout(db, await sprintPlanId(planIds, 'SPRINT_10M')))!.items.find((i) => i.exercise.exerciseId === 'SPRINT_10M')!;
    const old = (await getPlannedWorkout(db, legacy.id))!.items[0]!;
    expect([meaning(old.prescription, 'TIME'), meaning(fromBlock.prescription, 'TIME')]).toEqual(['PERFORMANCE_GOAL_TIME', 'COMPLETION_TIME_CAP']);
    expect(old.exercise.exerciseId).toBe(fromBlock.exercise.exerciseId); // the very same exercise
  });
});

describe('a new Training Block opts in explicitly, and the meaning is copied', () => {
  it('3. the block prescriptions that are completion-time drills are marked COMPLETION_TIME_CAP in the registry', () => {
    const caps = GENERAL_ATHLETIC_WORKOUTS.flatMap((w) => w.sections.flatMap((s) => s.items.filter((i) => i.timeSemantics === 'COMPLETION_TIME_CAP').map((i) => `${w.id}:${i.exerciseId}`)));
    expect(caps).toEqual([
      'ATH-ACCELERATION-01:SPRINT_10M',
      'ATH-ACCELERATION-01:SPRINT_20M',
      'ATH-SPEED-01:SPRINT_20M',
      'ATH-SPEED-01:SPRINT_30M_FLYING',
      'ATH-DECEL-COD-01:T_DRILL',
      'ATH-DECEL-COD-01:PRO_AGILITY_5_10_5',
      'ATH-REPEATED-EFFORT-01:SPRINT_20M',
      'ATH-REPEATED-EFFORT-01:SPRINT_20M',
      'ATH-REPEATED-EFFORT-01:SPRINT_20M',
    ]);
  });

  it('4. copying that workout into a Player plan preserves CAP: in the column and when read back', async () => {
    const planIds = await block('SPEED-ACCELERATION-6W-01');
    const plan = (await getPlannedWorkout(db, await sprintPlanId(planIds, 'SPRINT_10M')))!;
    const sprint = plan.items.find((i) => i.exercise.exerciseId === 'SPRINT_10M')!;
    expect(sprint.prescription.timeSemantics).toBe('COMPLETION_TIME_CAP');
    expect(plan.items.filter((i) => i.prescription.timeSemantics !== undefined).map((i) => i.exercise.exerciseId)).toEqual(['SPRINT_10M', 'SPRINT_20M']); // only the cap drills carry a meaning
    expect((await columnOf('planned_workout_items')).filter((v) => v !== null).length).toBeGreaterThan(0);
    expect(new Set((await columnOf('planned_workout_items')).filter((v) => v !== null))).toEqual(new Set(['COMPLETION_TIME_CAP']));
  });

  it('5. starting the session preserves CAP, and finishing keeps it', async () => {
    const planIds = await block('SPEED-ACCELERATION-6W-01');
    const planId = await sprintPlanId(planIds, 'SPRINT_10M');
    const session = await startSession(db, planId, deps());
    const sprint = session.exercises.find((e) => e.exercise.exerciseId === 'SPRINT_10M')!;
    expect(sprint.timeSemantics).toBe('COMPLETION_TIME_CAP');
    expect(session.exercises.filter((e) => e.timeSemantics !== undefined).map((e) => e.exercise.exerciseId)).toEqual(['SPRINT_10M', 'SPRINT_20M']);
    expect((await columnOf('session_exercises')).filter((v) => v !== null)).toEqual(['COMPLETION_TIME_CAP', 'COMPLETION_TIME_CAP']);
    const again = (await getSession(db, session.id))!;
    expect(again.exercises.find((e) => e.exercise.exerciseId === 'SPRINT_10M')!.timeSemantics).toBe('COMPLETION_TIME_CAP');
  });

  it('6. changing the registry later cannot change an existing copied plan or session', async () => {
    const planIds = await block('SPEED-ACCELERATION-6W-01');
    const planId = await sprintPlanId(planIds, 'SPRINT_10M');
    const session = await startSession(db, planId, deps());
    const workout = professionalWorkout('ATH-ACCELERATION-01')!;
    const item = workout.sections.flatMap((s) => s.items).find((i) => i.exerciseId === 'SPRINT_10M') as { timeSemantics?: TimeSemantics };
    const original = item.timeSemantics;
    try {
      item.timeSemantics = 'PERFORMANCE_GOAL_TIME'; // the registry changes its mind
      const plan = (await getPlannedWorkout(db, planId))!;
      expect(plan.items.find((i) => i.exercise.exerciseId === 'SPRINT_10M')!.prescription.timeSemantics).toBe('COMPLETION_TIME_CAP'); // the plan keeps what it was copied with
      expect((await getSession(db, session.id))!.exercises.find((e) => e.exercise.exerciseId === 'SPRINT_10M')!.timeSemantics).toBe('COMPLETION_TIME_CAP');
      // only a NEW copy follows the new registry
      const later = await block('SPEED-ACCELERATION-6W-01');
      const freshId = await sprintPlanId(later, 'SPRINT_10M');
      const fresh = (await getPlannedWorkout(db, freshId))!.items.find((i) => i.exercise.exerciseId === 'SPRINT_10M')!;
      expect(fresh.prescription.timeSemantics).toBe('PERFORMANCE_GOAL_TIME');
    } finally {
      item.timeSemantics = original;
    }
  });

  it('7. an actual time greater than the configured cap is recorded as it is: not rejected, not clamped, not failed', async () => {
    const planIds = await block('SPEED-ACCELERATION-6W-01');
    const session = await startSession(db, await sprintPlanId(planIds, 'SPRINT_10M'), deps());
    const sprint = session.exercises.find((e) => e.exercise.exerciseId === 'SPRINT_10M')!;
    expect(sprint.sets[0]!.plannedTarget).toBe(5); // the cap
    const result = await recordSet(db, sprint.sets[0]!.id, { TIME_S: 5.8 }, deps());
    expect(result.ok).toBe(true);
    const saved = (await getSession(db, session.id))!.exercises.find((e) => e.exercise.exerciseId === 'SPRINT_10M')!.sets[0]!;
    expect(saved.status).toBe('DONE');
    expect(saved.measurements.find((m) => m.kind === 'TIME_S')!.finalValue).toBe(5.8); // above the 5 s cap, kept exactly
    // and a far larger value too
    const second = await recordSet(db, sprint.sets[1]!.id, { TIME_S: 9.4 }, deps());
    expect(second.ok).toBe(true);
  });
});

describe('editing a plan keeps the stored meaning', () => {
  it('re-saving a copied plan with its own prescriptions (what the builder does) keeps CAP; a prescription built without one stays legacy', async () => {
    const planIds = await block('SPEED-ACCELERATION-6W-01');
    const planId = await sprintPlanId(planIds, 'SPRINT_10M');
    const plan = (await getPlannedWorkout(db, planId))!;
    const entries = plan.items.map((i) => ({ kind: 'EXERCISE', exerciseId: i.exercise.exerciseId, prescription: { ...i.prescription, restSec: 75 } }) as const);
    const saved = await savePlannedWorkout(db, { planId, playerId: player, name: plan.name, entries }, deps());
    expect(saved.ok).toBe(true);
    const again = (await getPlannedWorkout(db, planId))!;
    expect(again.items.find((i) => i.exercise.exerciseId === 'SPRINT_10M')!.prescription).toMatchObject({ restSec: 75, timeSemantics: 'COMPLETION_TIME_CAP' });
    // the same exercise added fresh (no stored meaning) is legacy
    const added = await savePlannedWorkout(
      db,
      { planId, playerId: player, name: plan.name, entries: [...entries, { kind: 'EXERCISE', exerciseId: 'SPRINT_30M_FLYING', prescription: { sets: 2, target: 6, loadKg: null, restSec: 120 } }] },
      deps(),
    );
    expect(added.ok).toBe(true);
    const last = (await getPlannedWorkout(db, planId))!.items.at(-1)!;
    expect(last.exercise.exerciseId).toBe('SPRINT_30M_FLYING');
    expect(last.prescription.timeSemantics).toBeUndefined();
  });
});

describe('the specific prescription decides, not the exercise', () => {
  const items = (id: string) => professionalWorkout(id)!.sections.flatMap((s) => s.items);
  const alts = (id: string, ex: string) => items(id).find((i) => i.exerciseId === ex)!.alternatives!;

  it('8–9. run intervals and the partner mirror drill are DURATION measurements: always DURATION_TARGET, never a cap', () => {
    for (const id of ['RUN_INTERVALS', 'PARTNER_MIRROR_DRILL', 'PLANK', 'EASY_RUN']) {
      expect([id, builtinExercise(id)!.measurement.type]).toEqual([id, 'DURATION']);
      expect(resolveTimeSemantics('DURATION', 'COMPLETION_TIME_CAP')).toBe('DURATION_TARGET'); // even a stray stored cap cannot make a duration a cap
    }
    for (const w of GENERAL_ATHLETIC_WORKOUTS) for (const i of w.sections.flatMap((s) => s.items)) if (['RUN_INTERVALS', 'PARTNER_MIRROR_DRILL'].includes(i.exerciseId)) expect(i.timeSemantics).toBeUndefined();
  });

  it('10. ROW_500M, SHUTTLE_RUN and SLED_PUSH follow their OWN prescription: a fixed 500 m is a cap, a worked duration is a duration', () => {
    const interval = alts('ATH-CONDITIONING-INTERVALS-01', 'RUN_INTERVALS').find((a) => a.exerciseId === 'ROW_500M')!;
    expect(interval.timeSemantics).toBe('COMPLETION_TIME_CAP');
    const repeated = alts('ATH-REPEATED-EFFORT-01', 'SPRINT_20M');
    expect(repeated.find((a) => a.exerciseId === 'SHUTTLE_RUN')!.timeSemantics).toBe('DURATION_TARGET');
    expect(repeated.find((a) => a.exerciseId === 'SLED_PUSH')!.timeSemantics).toBe('DURATION_TARGET');
    // the same exercise ids carry different meanings in different prescriptions, so no id rule can be right
    expect(resolveTimeSemantics('TIME', 'DURATION_TARGET')).toBe('DURATION_TARGET');
    expect(resolveTimeSemantics('TIME', 'COMPLETION_TIME_CAP')).toBe('COMPLETION_TIME_CAP');
    expect(resolveTimeSemantics('TIME', undefined)).toBe('PERFORMANCE_GOAL_TIME');
  });

  it('a semantic on a non-TIME exercise is refused at assignment (nothing is written)', async () => {
    const workout = professionalWorkout('ATH-MOVEMENT-FOUNDATION-01')!;
    const plank = workout.sections.flatMap((s) => s.items).find((i) => i.exerciseId === 'PLANK') as { timeSemantics?: TimeSemantics };
    plank.timeSemantics = 'COMPLETION_TIME_CAP';
    try {
      await expect(assignContentToPlayers(db, { kind: 'PROFESSIONAL', workoutId: workout.id, language: 'en' }, [{ playerId: player, destination: { type: 'NEW', name: 'x' } }], deps())).rejects.toThrow();
    } finally {
      delete plank.timeSemantics;
    }
    expect((await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts'))!.n).toBe(0);
  });
});

describe('published sport content is unchanged', () => {
  it('12. none of the 17 published sport workouts (or their alternatives) carries a time semantics; their JSON has no such key', () => {
    expect(PROFESSIONAL_WORKOUTS).toHaveLength(17);
    const every = (w: { sections: readonly { items: readonly ProfessionalItem[] }[] }) => w.sections.flatMap((s) => s.items);
    for (const w of PROFESSIONAL_WORKOUTS) for (const i of every(w)) expect([w.id, i.exerciseId, i.timeSemantics]).toEqual([w.id, i.exerciseId, undefined]);
    expect(JSON.stringify(PROFESSIONAL_WORKOUTS)).not.toMatch(/timeSemantics/);
  });

  it('a published Basketball plan copied now stores NULL: it reads as the Goal time it always was', async () => {
    const [r] = await assignContentToPlayers(db, { kind: 'PROFESSIONAL', workoutId: 'BASKETBALL-BALL-HANDLING-01', language: 'en' }, [{ playerId: player, destination: { type: 'NEW', name: 'Ball handling' } }], deps());
    const plan = (await getPlannedWorkout(db, r!.planId))!;
    const cone = plan.items.find((i) => i.exercise.exerciseId === 'CONE_DRIBBLE_SLALOM')!;
    expect(cone.exercise.measurement.type).toBe('TIME');
    expect(cone.prescription.timeSemantics).toBeUndefined();
    expect(meaning(cone.prescription, 'TIME')).toBe('PERFORMANCE_GOAL_TIME');
    expect(await columnOf('planned_workout_items')).toEqual(plan.items.map(() => null));
  });
});
