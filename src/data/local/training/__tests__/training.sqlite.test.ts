import type { CustomExerciseInput } from '@/domain/exercise/exercise';
import type { Uuid } from '@/domain/ids';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import {
  createCustomExercise,
  setExerciseActive,
  updateCustomExercise,
} from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer, type PlayerProfileInput } from '../../players/playerRepository';
import { TrainingDataError, TrainingRuleError } from '../errors';
import {
  abandonSession,
  addSet,
  finishSession,
  getPlannedWorkout,
  getSession,
  listTraining,
  planAndStart,
  planWorkout,
  recordSet,
  skipSet,
  startSession,
  type TrainingSession,
} from '../trainingRepository';
import {
  createBlock,
  createTemplate,
  listBlocks,
  setBlockActive,
  setTemplateActive,
  updateBlock,
  updateTemplate,
} from '../workoutRepository';

/** TRAIN-002 persistence on real SQLite: builder, frozen plans, planned vs actual, history. */
const T0 = new Date(2026, 9, 7, 17).getTime();
const MIN = 60_000;

const GAL: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG' },
};
const NOA: PlayerProfileInput = {
  player: { name: 'Noa', dateOfBirth: { year: 2013, month: 1, day: 2 } },
  basketball: null,
};
const MARCH: CustomExerciseInput = {
  name: 'Kettlebell March',
  categories: ['CONDITIONING'],
  primaryMuscles: ['GLUTES'],
  secondaryMuscles: [],
  difficulty: 'BEGINNER',
  sports: [],
  equipment: [['KETTLEBELL']],
  measurementType: 'DURATION',
  comparison: 'HIGHER_IS_BETTER',
  usesLoad: true,
  instructions: '',
  tutorialUrl: '',
};
const rx = (sets: number, target: number | null, loadKg: number | null = null, restSec: number | null = 90) =>
  ({ sets, target, loadKg, restSec }) satisfies Prescription;

describe('training on real SQLite', () => {
  let db: ReturnType<typeof openNodeSqlite>;
  let ids: IdService;
  let now: number;
  const clock = { wallNow: () => now, monotonicNow: () => 0 };
  const deps = () => ({ ids, clock });
  let gal: Uuid;
  let noa: Uuid;
  let march: string;

  /** Block "Strength": bench 3 × 10 @ 50 kg, march 2 × 40 s @ 16 kg; Block "Shooting": free throws 2 × 10. */
  async function buildTemplate() {
    const strength = await createBlock(
      db,
      {
        name: 'Strength',
        items: [
          { exerciseId: 'BARBELL_BENCH_PRESS', prescription: rx(3, 10, 50) },
          { exerciseId: march, prescription: rx(2, 40, 16, 60) },
        ],
      },
      deps(),
    );
    const shooting = await createBlock(
      db,
      { name: 'Shooting', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(2, 10, null, 30) }] },
      deps(),
    );
    if (!strength.ok || !shooting.ok) throw new Error('block seed failed');
    const template = await createTemplate(
      db,
      { name: 'Gym + Shots', blockIds: [strength.block.id, shooting.block.id] },
      deps(),
    );
    if (!template.ok) throw new Error('template seed failed');
    return { strength: strength.block, shooting: shooting.block, template: template.template };
  }
  const setsOf = (session: TrainingSession, position: number) => session.exercises[position]!.sets;
  const record = async (setId: string, values: Record<string, number>) => {
    const result = await recordSet(db, setId, values, deps());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.session;
  };
  const tables = async (names: string[]) => {
    const out: Record<string, unknown[]> = {};
    for (const name of names) out[name] = await db.getAllAsync(`SELECT * FROM ${name} ORDER BY rowid`);
    return out;
  };

  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    ids = createSequentialIdService();
    now = T0;
    for (const [input, set] of [
      [GAL, (id: Uuid) => (gal = id)],
      [NOA, (id: Uuid) => (noa = id)],
    ] as const) {
      const result = await createPlayer(db, input, { ids, clock });
      if (!result.ok) throw new Error('seed failed');
      set(result.profile.player.id);
    }
    const created = await createCustomExercise(db, MARCH, deps());
    if (!created.ok) throw new Error('exercise seed failed');
    march = created.exercise.id;
  });
  afterEach(() => db.closeAsync());

  describe('builder (blocks and templates)', () => {
    it('blocks and templates are Family-owned, client UUIDs, timestamps; items keep order and prescription', async () => {
      const { strength, template } = await buildTemplate();
      const family = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_meta WHERE key = 'local_family_id'",
      );
      expect(await db.getAllAsync('SELECT family_id, created_at, updated_at FROM workout_blocks')).toEqual([
        { family_id: family!.value, created_at: T0, updated_at: T0 },
        { family_id: family!.value, created_at: T0, updated_at: T0 },
      ]);
      expect(strength.items.map((i) => [i.exercise.id, i.prescription])).toEqual([
        ['BARBELL_BENCH_PRESS', rx(3, 10, 50)],
        [march, rx(2, 40, 16, 60)],
      ]);
      expect(template.blocks.map((b) => b.name)).toEqual(['Strength', 'Shooting']);
    });

    it('invalid input writes nothing: blank / duplicate name, no items, a load on a no-load exercise, a target on COMPLETION-less fields', async () => {
      await buildTemplate();
      const before = await tables(['workout_blocks', 'workout_block_items']);
      expect(await createBlock(db, { name: ' ', items: [] }, deps())).toEqual({
        ok: false,
        errors: { name: 'REQUIRED', items: 'REQUIRED' },
      });
      expect(
        await createBlock(
          db,
          {
            name: 'strength',
            items: [
              { exerciseId: 'PLANK', prescription: rx(3, 30, 10) }, // plank takes no load
              { exerciseId: 'PUSH_UP', prescription: rx(0, 10.5) }, // 0 sets, fractional reps
            ],
          },
          deps(),
        ),
      ).toEqual({
        ok: false,
        errors: {
          name: 'DUPLICATE',
          itemErrors: { 0: { loadKg: 'NOT_APPLICABLE' }, 1: { sets: 'INVALID', target: 'INVALID' } },
        },
      });
      expect(await tables(['workout_blocks', 'workout_block_items'])).toEqual(before);
    });

    it('edit and inactive keep the same id; blocks / templates are never deleted', async () => {
      const { strength, template } = await buildTemplate();
      now = T0 + MIN;
      const edited = await updateBlock(
        db,
        strength.id,
        { name: 'Strength A', items: [{ exerciseId: 'PUSH_UP', prescription: rx(2, 12) }] },
        { clock },
      );
      expect(edited.ok && edited.block).toMatchObject({ id: strength.id, name: 'Strength A', createdAt: T0 });
      expect((await setBlockActive(db, strength.id, false, { clock })).active).toBe(false);
      expect((await listBlocks(db)).map((b) => [b.name, b.active])).toEqual([
        ['Strength A', false],
        ['Shooting', true],
      ]);
      await expect(db.runAsync('DELETE FROM workout_blocks', [])).rejects.toThrow(/never deleted/);
      await expect(db.runAsync('DELETE FROM workout_templates', [])).rejects.toThrow(/never deleted/);
      expect((await setTemplateActive(db, template.id, false, { clock })).active).toBe(false);
      await expect(planWorkout(db, { playerId: gal, templateId: template.id }, deps())).rejects.toMatchObject(
        {
          rule: 'TEMPLATE_INACTIVE',
        },
      );
    });

    it('a reusable block follows its exercise: a load the exercise no longer uses is dropped (a plan keeps it)', async () => {
      const { strength, template } = await buildTemplate();
      const plan = await planWorkout(db, { playerId: gal, templateId: template.id }, deps());
      await updateCustomExercise(db, march, { ...MARCH, usesLoad: false }, { clock });
      const block = (await listBlocks(db)).find((b) => b.id === strength.id)!;
      expect(block.items[1]!.prescription).toEqual(rx(2, 40, null, 60));
      expect((await getPlannedWorkout(db, plan.id))!.items[1]!.prescription).toEqual(rx(2, 40, 16, 60));
      // Structural corruption still fails closed (simulated by a type-confused value).
      await db.runAsync("UPDATE workout_block_items SET target = 'ten' WHERE position = 0", []);
      await expect(listBlocks(db)).rejects.toMatchObject({ field: 'block.prescription' });
    });
  });

  describe('planned workout = frozen snapshot', () => {
    it('copies every exercise snapshot and prescription in block order', async () => {
      const { template } = await buildTemplate();
      const plan = await planWorkout(db, { playerId: gal, templateId: template.id }, deps());
      expect(plan).toMatchObject({
        playerId: gal,
        templateId: template.id,
        name: 'Gym + Shots',
        sessionId: null,
      });
      expect(
        plan.items.map((i) => [
          i.position,
          i.blockName,
          i.exercise.name.en,
          i.exercise.measurement,
          i.prescription,
        ]),
      ).toEqual([
        [
          0,
          'Strength',
          'Barbell Bench Press',
          { type: 'REPETITIONS', comparison: null, usesLoad: true, distanceM: null },
          rx(3, 10, 50),
        ],
        [
          1,
          'Strength',
          'Kettlebell March',
          { type: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: true, distanceM: null },
          rx(2, 40, 16, 60),
        ],
        [
          2,
          'Shooting',
          'Free Throws',
          expect.objectContaining({ type: 'MADE_ATTEMPTS', usesLoad: false }),
          rx(2, 10, null, 30),
        ],
      ]);
    });

    it('later changes to the exercise (name, active), block, template never rewrite it', async () => {
      const { strength, template } = await buildTemplate();
      const plan = await planWorkout(db, { playerId: gal, templateId: template.id }, deps());
      now = T0 + MIN;
      await updateCustomExercise(db, march, { ...MARCH, name: 'Suitcase March', usesLoad: false }, { clock });
      await setExerciseActive(db, 'BARBELL_BENCH_PRESS', false, { clock });
      await updateBlock(
        db,
        strength.id,
        { name: 'Changed', items: [{ exerciseId: 'PUSH_UP', prescription: rx(5, 20) }] },
        { clock },
      );
      await updateTemplate(db, template.id, { name: 'Renamed', blockIds: [strength.id] }, { clock });
      expect(await getPlannedWorkout(db, plan.id)).toEqual(plan);
      // A plan is never deleted. It is editable until execution begins (v17), then SQL refuses any change:
      await expect(db.runAsync('DELETE FROM planned_workouts', [])).rejects.toThrow(/never deleted/);
      await startSession(db, plan.id, deps());
      await expect(db.runAsync("UPDATE planned_workouts SET name = 'x'", [])).rejects.toThrow(/frozen/);
      await expect(db.runAsync('UPDATE planned_workout_items SET sets = 9', [])).rejects.toThrow(/frozen/);
      await expect(db.runAsync('DELETE FROM planned_workout_items', [])).rejects.toThrow(/frozen/);
      await expect(db.runAsync('DELETE FROM planned_workouts', [])).rejects.toThrow(/never deleted/);
    });
  });

  describe('session = what actually happened', () => {
    it('starting copies the per-set plan; the plan itself stays separate and unchanged', async () => {
      const { template } = await buildTemplate();
      const plan = await planWorkout(db, { playerId: gal, templateId: template.id }, deps());
      now = T0 + 5 * MIN;
      const session = await startSession(db, plan.id, deps());
      expect(session).toMatchObject({
        playerId: gal,
        plannedWorkoutId: plan.id,
        name: 'Gym + Shots',
        purpose: 'TRAINING',
        status: 'IN_PROGRESS',
        startedAt: T0 + 5 * MIN,
        endedAt: null,
      });
      expect(
        setsOf(session, 0).map((s) => [s.setNumber, s.planned, s.plannedTarget, s.plannedLoadKg, s.status]),
      ).toEqual([
        [1, true, 10, 50, 'PENDING'],
        [2, true, 10, 50, 'PENDING'],
        [3, true, 10, 50, 'PENDING'],
      ]);
      expect((await getPlannedWorkout(db, plan.id))!).toEqual({ ...plan, sessionId: session.id });
      await expect(startSession(db, plan.id, deps())).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    });

    it('Bench 3 × 10 @ 50 kg performed as 10 @ 50 · 10 @ 50 · 7 @ 50: the last set stays 7', async () => {
      const { template } = await buildTemplate();
      let session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      const bench = setsOf(session, 0);
      await record(bench[0]!.id, { REPETITIONS: 10, LOAD_KG: 50 });
      await record(bench[1]!.id, { REPETITIONS: 10, LOAD_KG: 50 });
      session = await record(bench[2]!.id, { REPETITIONS: 7, LOAD_KG: 50 });
      const actual = setsOf(session, 0).map((s) =>
        Object.fromEntries(s.measurements.map((m) => [m.kind, m.finalValue])),
      );
      expect(actual).toEqual([
        { REPETITIONS: 10, LOAD_KG: 50 },
        { REPETITIONS: 10, LOAD_KG: 50 },
        { REPETITIONS: 7, LOAD_KG: 50 },
      ]);
      expect(setsOf(session, 0)[2]!.plannedTarget).toBe(10); // plan kept beside the actual value
      expect(setsOf(session, 0)[2]!.measurements[0]).toMatchObject({ source: 'MANUAL', confidence: null });
    });

    it('a corrected value keeps the first entry as measured, the new one as final, edited', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      const set = setsOf(session, 0)[0]!;
      await record(set.id, { REPETITIONS: 8, LOAD_KG: 50 });
      now = T0 + MIN;
      const after = await record(set.id, { REPETITIONS: 7, LOAD_KG: 50 });
      expect(setsOf(after, 0)[0]!.measurements).toEqual([
        {
          kind: 'LOAD_KG',
          measuredValue: 50,
          finalValue: 50,
          wasEdited: false,
          source: 'MANUAL',
          confidence: null,
        },
        {
          kind: 'REPETITIONS',
          measuredValue: 8,
          finalValue: 7,
          wasEdited: true,
          source: 'MANUAL',
          confidence: null,
        },
      ]);
      await expect(
        db.runAsync("UPDATE set_measurements SET measured_value = 99 WHERE kind = 'REPETITIONS'", []),
      ).rejects.toThrow(/never rewritten/);
    });

    it('invalid values are refused and nothing is written (made > attempts, missing load, out of range)', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      const before = await tables(['session_sets', 'set_measurements']);
      expect(await recordSet(db, setsOf(session, 2)[0]!.id, { MADE: 8, ATTEMPTS: 6 }, deps())).toEqual({
        ok: false,
        errors: { MADE: 'MADE_OVER_ATTEMPTS' },
      });
      expect(await recordSet(db, setsOf(session, 0)[0]!.id, { REPETITIONS: 10 }, deps())).toEqual({
        ok: false,
        errors: { LOAD_KG: 'REQUIRED' },
      });
      expect(await recordSet(db, setsOf(session, 1)[0]!.id, { DURATION_S: -3, LOAD_KG: 16 }, deps())).toEqual(
        {
          ok: false,
          errors: { DURATION_S: 'INVALID' },
        },
      );
      expect(await tables(['session_sets', 'set_measurements'])).toEqual(before);
    });

    it('every planned set performed → COMPLETED; then read-only', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      for (const set of setsOf(session, 0)) await record(set.id, { REPETITIONS: 10, LOAD_KG: 50 });
      for (const set of setsOf(session, 1)) await record(set.id, { DURATION_S: 40, LOAD_KG: 16 });
      for (const set of setsOf(session, 2)) await record(set.id, { MADE: 7, ATTEMPTS: 10 });
      now = T0 + 50 * MIN;
      const done = await finishSession(db, session.id, { clock });
      expect(done).toMatchObject({ status: 'COMPLETED', endedAt: T0 + 50 * MIN });
      const frozen = await tables(['training_sessions', 'session_sets', 'set_measurements']);
      await expect(record(setsOf(done, 0)[0]!.id, { REPETITIONS: 12, LOAD_KG: 50 })).rejects.toMatchObject({
        rule: 'SESSION_CLOSED',
      });
      await expect(addSet(db, done.exercises[0]!.id, deps())).rejects.toBeInstanceOf(TrainingRuleError);
      await expect(abandonSession(db, done.id, { clock })).rejects.toMatchObject({ rule: 'SESSION_CLOSED' });
      // SQL itself refuses changes to a finished session.
      await expect(db.runAsync('UPDATE set_measurements SET final_value = 1', [])).rejects.toThrow(
        /read-only/,
      );
      await expect(db.runAsync("UPDATE session_sets SET status = 'SKIPPED'", [])).rejects.toThrow(
        /read-only/,
      );
      await expect(db.runAsync("UPDATE training_sessions SET status = 'PARTIAL'", [])).rejects.toThrow(
        /read-only/,
      );
      await expect(db.runAsync('DELETE FROM training_sessions', [])).rejects.toThrow(/never deleted/);
      await expect(db.runAsync('DELETE FROM set_measurements', [])).rejects.toThrow(/never deleted/);
      expect(await tables(['training_sessions', 'session_sets', 'set_measurements'])).toEqual(frozen);
    });

    it('a skipped planned set → PARTIAL; an extra set never makes up for it', async () => {
      const { template } = await buildTemplate();
      let session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      const bench = setsOf(session, 0);
      await record(bench[0]!.id, { REPETITIONS: 10, LOAD_KG: 50 });
      await skipSet(db, bench[1]!.id, { clock });
      await expect(skipSet(db, bench[0]!.id, { clock })).rejects.toMatchObject({
        rule: 'SET_ALREADY_RECORDED',
      });
      session = await addSet(db, session.exercises[0]!.id, deps());
      const extra = setsOf(session, 0)[3]!;
      expect(extra).toMatchObject({ setNumber: 4, planned: false, plannedTarget: null, plannedLoadKg: null });
      await record(extra.id, { REPETITIONS: 12, LOAD_KG: 40 });
      for (const set of [bench[2]!, ...setsOf(session, 1), ...setsOf(session, 2)]) {
        await skipSet(db, set.id, { clock });
      }
      const finished = await finishSession(db, session.id, { clock });
      expect(finished.status).toBe('PARTIAL');
      expect(setsOf(finished, 0).map((s) => s.status)).toEqual(['DONE', 'SKIPPED', 'SKIPPED', 'DONE']);
    });

    it('nothing performed cannot be finished; it can be abandoned (what was recorded stays)', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      await expect(finishSession(db, session.id, { clock })).rejects.toMatchObject({
        rule: 'NOTHING_PERFORMED',
      });
      now = T0 + 3 * MIN;
      expect(await abandonSession(db, session.id, { clock })).toMatchObject({
        status: 'ABANDONED',
        endedAt: T0 + 3 * MIN,
      });
    });

    it('one session in progress per player (another player is independent)', async () => {
      const { template } = await buildTemplate();
      await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      const before = await tables(['planned_workouts', 'training_sessions']);
      await expect(
        planAndStart(db, { playerId: gal, templateId: template.id }, deps()),
      ).rejects.toMatchObject({
        rule: 'SESSION_IN_PROGRESS',
      });
      expect(await tables(['planned_workouts', 'training_sessions'])).toEqual(before); // rolled back
      expect((await planAndStart(db, { playerId: noa, templateId: template.id }, deps())).playerId).toBe(noa);
    });

    it('the session shows its own snapshot even after the exercise is renamed or made inactive', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      await updateCustomExercise(db, march, { ...MARCH, name: 'Renamed' }, { clock });
      await setExerciseActive(db, march, false, { clock });
      expect((await getSession(db, session.id))!.exercises[1]!.exercise.name).toEqual({
        he: 'Kettlebell March',
        en: 'Kettlebell March',
      });
    });

    it('lists planned (not started) and sessions, newest first', async () => {
      const { template } = await buildTemplate();
      const first = await planWorkout(db, { playerId: gal, templateId: template.id }, deps());
      now = T0 + MIN;
      const second = await planWorkout(db, { playerId: gal, templateId: template.id }, deps());
      now = T0 + 2 * MIN;
      const session = await startSession(db, first.id, deps());
      const overview = await listTraining(db, gal);
      expect(overview.planned.map((p) => p.id)).toEqual([second.id]);
      expect(overview.sessions.map((s) => s.id)).toEqual([session.id]);
      expect(await listTraining(db, noa)).toEqual({ planned: [], sessions: [] });
    });
  });

  describe('measurement source is per measurement (future camera / device / sensor)', () => {
    it('one set may mix a manual load with a camera-counted rep count + confidence; manual never has a confidence', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      const set = setsOf(session, 0)[0]!;
      await db.runAsync(
        `INSERT INTO set_measurements VALUES ('m-load', ?, 'LOAD_KG', 50, 50, 0, 'MANUAL', NULL, 0, 0),
                                             ('m-reps', ?, 'REPETITIONS', 9, 9, 0, 'CAMERA', 0.97, 0, 0)`,
        [set.id, set.id],
      );
      await db.runAsync("UPDATE session_sets SET status = 'DONE' WHERE id = ?", [set.id]);
      expect(setsOf((await getSession(db, session.id))!, 0)[0]!.measurements).toEqual([
        {
          kind: 'LOAD_KG',
          measuredValue: 50,
          finalValue: 50,
          wasEdited: false,
          source: 'MANUAL',
          confidence: null,
        },
        {
          kind: 'REPETITIONS',
          measuredValue: 9,
          finalValue: 9,
          wasEdited: false,
          source: 'CAMERA',
          confidence: 0.97,
        },
      ]);
      const other = setsOf(session, 0)[1]!.id;
      await expect(
        db.runAsync(
          `INSERT INTO set_measurements VALUES ('x', ?, 'REPETITIONS', 9, 9, 0, 'MANUAL', 0.5, 0, 0)`,
          [other],
        ),
      ).rejects.toThrow(/CHECK/);
      await expect(
        db.runAsync(
          `INSERT INTO set_measurements VALUES ('y', ?, 'REPETITIONS', 9, 9, 0, 'CAMERA', 1.5, 0, 0)`,
          [other],
        ),
      ).rejects.toThrow(/CHECK/);
      await expect(
        db.runAsync(
          `INSERT INTO set_measurements VALUES ('z', ?, 'REPETITIONS', 9, 9, 0, 'GUESS', NULL, 0, 0)`,
          [other],
        ),
      ).rejects.toThrow(/CHECK/);
    });
  });

  it('training never touches Self-Assessment, the Calendar, Players or the exercise library rows', async () => {
    const other = () =>
      tables(['players', 'player_sports', 'self_assessments', 'self_assessment_ratings', 'calendar_events']);
    const before = await other();
    const library = await tables(['exercises']);
    const { template } = await buildTemplate();
    const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
    await record(setsOf(session, 0)[0]!.id, { REPETITIONS: 10, LOAD_KG: 50 });
    await finishSession(db, session.id, { clock });
    expect(await other()).toEqual(before);
    expect(await tables(['exercises'])).toEqual(library);
  });

  describe('malformed stored data fails the whole read', () => {
    it('an unknown session status, set status or measurement kind', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      await db.execAsync('DROP TRIGGER session_sets_closed_update'); // simulating corruption only
      await db.runAsync("UPDATE session_sets SET status = 'MAYBE'", []);
      await expect(getSession(db, session.id)).rejects.toBeInstanceOf(TrainingDataError);
      await db.runAsync("UPDATE session_sets SET status = 'PENDING'", []);
      await db.runAsync("UPDATE training_sessions SET status = 'PAUSED', ended_at = started_at", []);
      await expect(getSession(db, session.id)).rejects.toMatchObject({
        field: 'session.status',
        reason: 'UNKNOWN_CODE',
      });
    });

    it('a performed set without measurements', async () => {
      const { template } = await buildTemplate();
      const session = await planAndStart(db, { playerId: gal, templateId: template.id }, deps());
      await db.runAsync("UPDATE session_sets SET status = 'DONE' WHERE id = ?", [setsOf(session, 0)[0]!.id]);
      await expect(listTraining(db, gal)).rejects.toMatchObject({ field: 'set.measurements' });
    });
  });
});
