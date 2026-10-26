import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCustomExercise, getExercise, updateCustomExercise } from '@/data/local/exercises/exerciseRepository';
import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { findPreviousPerformance } from '@/data/local/training/previousPerformanceRepository';
import { savePlannedWorkout, type SaveEntry } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { abandonSession, addSet, finishSession, recordSet, skipSet, startSession } from '@/data/local/training/trainingRepository';
import { professionalWorkout } from '@/domain/training/professional';
import { repeatPlan, useActualPerformance, type BaselineResult } from '@/domain/training/previousPerformance';
import type { Prescription, SetValues } from '@/domain/training/training';
import { exerciseEntryOf, importTemplate, itemOf, prescriptionPatch, toSaveEntries, type DEntry } from '@/features/training/builderDraft';
import { snapshotOf } from '@/data/local/training/trainingRepository';
import type { ExerciseMeasurement } from '@/domain/exercise/exercise';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

/**
 * TRAINING-PROGRESSION-001 — Python QA scenario EXPORT. Not a product test: when PROG_QA_OUT is set it performs the scenarios through the app's REAL
 * repositories on a REAL schema-v23 SQLite engine (planned workouts, sessions, recorded / skipped / extra / edited sets, closed in every way),
 * asks the app's read-only lookup and the two baseline functions for their answers, builds NEW plans from those baselines exactly as the Builder
 * saves them, and writes database snapshots (before the reads, after the reads, after the new plans) plus manifest.json and outputs.json.
 * The Python suite (product_qa/tests/training_progression) re-derives every answer independently from the SQLite rows and compares.
 */
const OUT = process.env.PROG_QA_OUT;
const run = OUT ? describe : describe.skip;
type Db = ReturnType<typeof openNodeSqlite>;

let t = new Date(2026, 9, 1, 8).getTime();
const clock = { wallNow: () => (t += 60_000), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
const rx = (sets: number, target: number | null, loadKg: number | null = null, extra: Partial<Prescription> = {}): Prescription => ({ sets, target, loadKg, restSec: 90, ...extra });
const ent = (exerciseId: string, prescription: Prescription): SaveEntry => ({ kind: 'EXERCISE', exerciseId, prescription });
type Act = SetValues | 'SKIP' | 'PENDING' | { extra: SetValues } | { edit: [SetValues, SetValues] };

const snapshotDb = (db: Db, file: string) => {
  mkdirSync(OUT!, { recursive: true });
  db.raw.exec(`VACUUM INTO '${join(OUT!, file).replace(/\\/g, '/').replace(/'/g, "''")}'`);
};

run('training progression QA scenario export', () => {
  it('performs the scenarios, asks the app, builds NEW plans from the baselines, and writes the files', async () => {
    const db: Db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    const mkPlayer = async (name: string) => {
      const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
      if (!r.ok) throw new Error('seed');
      return r.profile.player.id;
    };
    const D = await mkPlayer('Daniel');
    const N = await mkPlayer('Noa');
    const exercises = await listExercises(db);

    async function setPurpose(sessionId: string, purpose: 'BASELINE' | 'REASSESSMENT') {
      // FIXTURE TECHNIQUE: the app only creates TRAINING sessions and a trigger keeps purpose immutable; lift that one trigger for the statement.
      const trigger = (await db.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'training_sessions_closed'"))!.sql;
      await db.execAsync('DROP TRIGGER training_sessions_closed');
      await db.runAsync('UPDATE training_sessions SET purpose = ? WHERE id = ?', [purpose, sessionId]);
      await db.execAsync(trigger);
    }
    async function perform(player: string, entries: SaveEntry[], acts: Act[][], o: { name?: string; close?: 'FINISH' | 'ABANDON' | 'OPEN'; purpose?: 'BASELINE' | 'REASSESSMENT'; nonUniform?: { exercise: number; setNumber: number; target: number } } = {}) {
      const saved = await savePlannedWorkout(db, { planId: null, playerId: player, name: o.name ?? 'Session', entries }, deps);
      if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
      let session = await startSession(db, saved.plan.id, deps);
      if (o.purpose) await setPurpose(session.id, o.purpose);
      for (const [e, list] of acts.entries()) {
        for (const [s, a] of list.entries()) {
          const setId = () => session.exercises[e]!.sets[s]!.id;
          if (a === 'PENDING') continue;
          if (a === 'SKIP') session = await skipSet(db, setId(), deps);
          else if ('extra' in a) {
            session = await addSet(db, session.exercises[e]!.id, deps);
            const r = await recordSet(db, session.exercises[e]!.sets.at(-1)!.id, a.extra, deps);
            if (!r.ok) throw new Error(JSON.stringify(r.errors));
          } else if ('edit' in a) {
            await recordSet(db, setId(), a.edit[0], deps);
            const r = await recordSet(db, setId(), a.edit[1], deps);
            if (!r.ok) throw new Error(JSON.stringify(r.errors));
          } else {
            const r = await recordSet(db, setId(), a, deps);
            if (!r.ok) throw new Error(JSON.stringify(r.errors));
          }
        }
      }
      if (o.nonUniform) {
        const trigger = (await db.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'session_sets_closed_update'"))!.sql;
        await db.execAsync('DROP TRIGGER session_sets_closed_update');
        await db.runAsync('UPDATE session_sets SET planned_target = ? WHERE set_number = ? AND session_exercise_id = ?', [o.nonUniform.target, o.nonUniform.setNumber, session.exercises[o.nonUniform.exercise]!.id]);
        await db.execAsync(trigger);
      }
      const close = o.close ?? 'FINISH';
      if (close === 'FINISH') await finishSession(db, session.id, deps);
      if (close === 'ABANDON') await abandonSession(db, session.id, deps);
      return { sessionId: session.id, planId: saved.plan.id };
    }
    const rl = (r: number, l: number): SetValues => ({ REPETITIONS: r, LOAD_KG: l });
    const rep = (r: number): SetValues => ({ REPETITIONS: r });
    const dur = (s: number, l?: number): SetValues => (l === undefined ? { DURATION_S: s } : { DURATION_S: s, LOAD_KG: l });
    const M = (type: ExerciseMeasurement['type'], usesLoad: boolean): ExerciseMeasurement => ({ type, comparison: null, usesLoad, distanceM: null });

    const scenarios: { id: string; player: string; exerciseId: string; measurement: ExerciseMeasurement; note: string }[] = [];
    const sc = (id: string, player: string, exerciseId: string, measurement: ExerciseMeasurement, note: string) => scenarios.push({ id, player, exerciseId, measurement, note });
    const sessions: Record<string, string> = {};

    // ------------------------------------------------------------------ Daniel (the Builder's Player)
    sessions.bench = (await perform(D, [ent('BARBELL_BENCH_PRESS', rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(8, 40), { extra: rl(6, 40) }]], { name: 'Push day' })).sessionId;
    sc('BENCH', D, 'BARBELL_BENCH_PRESS', M('REPETITIONS', true), 'planned 3 x 10 @ 40 kg; actual 10 / 10 / 8 @ 40 plus an extra set 6 @ 40');
    sessions.skip = (await perform(D, [ent('PUSH_UP', rx(3, 10))], [[rep(10), 'SKIP', rep(9)]], { name: 'Skip day' })).sessionId;
    sc('SKIP', D, 'PUSH_UP', M('REPETITIONS', false), 'planned 3 x 10; actual 10, skipped, 9');
    sessions.partial = (await perform(D, [ent('LEG_PRESS', rx(3, 10, 100)), ent('PLANK', rx(1, 30))], [[rl(10, 100), 'PENDING', 'PENDING'], ['SKIP']], { name: 'Partial day' })).sessionId;
    sc('PARTIAL', D, 'LEG_PRESS', M('REPETITIONS', true), 'a PARTIAL session: one DONE set, two PENDING sets');
    sessions.varload = (await perform(D, [ent('DUMBBELL_BENCH_PRESS', rx(3, 10, 40))], [[rl(12, 30), rl(10, 40), rl(8, 50)]], { name: 'Variable load' })).sessionId;
    sc('VARLOAD', D, 'DUMBBELL_BENCH_PRESS', M('REPETITIONS', true), 'actual 12 @ 30, 10 @ 40, 8 @ 50: the baseline must be the REAL tuple 8 @ 50');
    sessions.sled = (await perform(D, [ent('SLED_PUSH', rx(2, 20, 50, { timeSemantics: 'COMPLETION_TIME_CAP' }))], [[{ TIME_S: 6.12, LOAD_KG: 60 }, { TIME_S: 7.5, LOAD_KG: 55 }]], { name: 'Sled day' })).sessionId;
    sc('SLED', D, 'SLED_PUSH', M('TIME', true), 'TIME + LOAD: planned 2 x 20 @ 50 cap; actual 6.12 s @ 60 and 7.5 s @ 55');
    sessions.farmer = (await perform(D, [ent('FARMER_CARRY', rx(2, 30, 16))], [[dur(30, 16), dur(26, 16)]], { name: 'Carry day' })).sessionId;
    sc('FARMER', D, 'FARMER_CARRY', M('DURATION', true), 'DURATION + LOAD: planned 2 x 30 s @ 16; actual 30 s @ 16 and 26 s @ 16');
    sessions.goal = (await perform(D, [ent('SPRINT_10M', rx(2, 2.5, null, { timeSemantics: 'PERFORMANCE_GOAL_TIME' }))], [[{ TIME_S: 2.41 }, { TIME_S: 2.7 }]], { name: 'Goal sprints' })).sessionId;
    sc('GOAL', D, 'SPRINT_10M', M('TIME', false), 'goal time 2.5 s; actual 2.41 and 2.70');
    sessions.cap = (await perform(D, [ent('SPRINT_20M', rx(2, 15, null, { timeSemantics: 'COMPLETION_TIME_CAP' }))], [[{ TIME_S: 16.2 }, { TIME_S: 14.8 }]], { name: 'Cap sprints' })).sessionId;
    sc('CAP', D, 'SPRINT_20M', M('TIME', false), 'cap 15 s; actual 16.20 (above the cap) and 14.80');
    sessions.manual = (await perform(D, [ent('GOBLET_SQUAT', rx(3, 10))], [[rl(10, 12), rl(10, 12), rl(9, 12)]], { name: 'Manual squat' })).sessionId;
    sc('MANUAL', D, 'GOBLET_SQUAT', M('REPETITIONS', true), 'a MANUAL plan: 3 x 10, actual 10 / 10 / 9 @ 12');
    sessions.dup = (await perform(D, [ent('GLUTE_BRIDGE', rx(1, 10)), ent('GLUTE_BRIDGE', rx(3, 12))], [[rep(10)], [rep(12), rep(12), rep(11)]], { name: 'Bridges' })).sessionId;
    sc('DUP', D, 'GLUTE_BRIDGE', M('REPETITIONS', false), 'the same exercise twice in one session: 1 DONE planned set vs 3');
    sessions.edit = (await perform(D, [ent('BODYWEIGHT_SQUAT', rx(2, 15))], [[{ edit: [rep(14), rep(15)] }, rep(16)]], { name: 'Edited' })).sessionId;
    sc('EDIT', D, 'BODYWEIGHT_SQUAT', M('REPETITIONS', false), 'set 1 recorded 14 then corrected to 15; set 2 is 16');
    sessions.made = (await perform(D, [ent('FREE_THROWS', rx(2, 10))], [[{ MADE: 7, ATTEMPTS: 10 }, { MADE: 8, ATTEMPTS: 10 }]], { name: 'Shooting' })).sessionId;
    sc('MADE', D, 'FREE_THROWS', M('MADE_ATTEMPTS', false), 'made / attempts pairs 7/10 and 8/10');
    sessions.nonuniform = (await perform(D, [ent('DEAD_BUG', rx(2, 10))], [[rep(10), rep(8)]], { name: 'Odd plan', nonUniform: { exercise: 0, setNumber: 2, target: 8 } })).sessionId;
    sc('NONUNIFORM', D, 'DEAD_BUG', M('REPETITIONS', false), 'the planned sets disagree (target 10 and 8): Repeat must be disabled');
    // eligibility exclusions on one exercise (STEP_UP): an eligible old session, then four newer ones that must NOT qualify
    sessions.stepOld = (await perform(D, [ent('STEP_UP', rx(3, 10))], [[rl(10, 10), rl(10, 10), rl(10, 10)]], { name: 'Step eligible' })).sessionId;
    await perform(D, [ent('STEP_UP', rx(3, 20))], [[rl(20, 10), rl(20, 10), rl(20, 10)]], { name: 'Step abandoned', close: 'ABANDON' });
    await perform(D, [ent('STEP_UP', rx(3, 30))], [[rl(30, 10), rl(30, 10), rl(30, 10)]], { name: 'Step baseline', purpose: 'BASELINE' });
    await perform(D, [ent('STEP_UP', rx(3, 40))], [[rl(40, 10), rl(40, 10), rl(40, 10)]], { name: 'Step reassessment', purpose: 'REASSESSMENT' });
    sc('STEP', D, 'STEP_UP', M('REPETITIONS', true), 'eligible 3 x 10; newer ABANDONED / BASELINE / REASSESSMENT sessions must be ignored (an IN_PROGRESS one is added last)');
    // extra-only: an older eligible plank, then a newer occurrence whose planned sets were skipped and only an extra set was done
    await perform(D, [ent('PLANK', rx(2, 30))], [[dur(30), dur(28)]], { name: 'Plank eligible' });
    await perform(D, [ent('PLANK', rx(2, 30))], [['SKIP', 'SKIP', { extra: dur(45) }]], { name: 'Plank extra only' });
    sc('PLANK', D, 'PLANK', M('DURATION', false), 'the newest occurrence has only an EXTRA set done: not eligible, the older one is used');
    // identity: a custom exercise with the SAME name as a built-in is a different exercise
    const custom = await createCustomExercise(db, { name: 'Plank', categories: ['CORE'], primaryMuscles: ['ABDOMINALS'], secondaryMuscles: [], difficulty: 'BEGINNER', sports: [], equipment: [], measurementType: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: false, instructions: '', tutorialUrl: '' }, deps);
    if (!custom.ok) throw new Error('custom ' + JSON.stringify(custom.errors));
    const customId = custom.exercise.id;
    await perform(D, [ent(customId, rx(1, 99))], [[dur(99)]], { name: 'Custom plank' });
    sc('CUSTOM_PLANK', D, customId, M('DURATION', false), 'a custom exercise NAMED Plank: identity is the id, never the name');
    // measurement compatibility: a custom exercise measured in REPETITIONS, later redefined as DURATION
    const mixed = await createCustomExercise(db, { name: 'Mixed move', categories: ['CORE'], primaryMuscles: ['ABDOMINALS'], secondaryMuscles: [], difficulty: 'BEGINNER', sports: [], equipment: [], measurementType: 'REPETITIONS', comparison: 'HIGHER_IS_BETTER', usesLoad: false, instructions: '', tutorialUrl: '' }, deps);
    if (!mixed.ok) throw new Error('mixed');
    await perform(D, [ent(mixed.exercise.id, rx(1, 12))], [[rep(12)]], { name: 'Mixed as reps' });
    const redefined = await updateCustomExercise(db, mixed.exercise.id, { name: 'Mixed move', categories: ['CORE'], primaryMuscles: ['ABDOMINALS'], secondaryMuscles: [], difficulty: 'BEGINNER', sports: [], equipment: [], measurementType: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: false, instructions: '', tutorialUrl: '' }, deps);
    if (!redefined.ok) throw new Error('redefine');
    await perform(D, [ent(mixed.exercise.id, rx(1, 40))], [[dur(40)]], { name: 'Mixed as duration' });
    sc('MIXED_REPS', D, mixed.exercise.id, M('REPETITIONS', false), 'queried as REPETITIONS: the newer DURATION occurrence is incompatible and is skipped');
    sc('MIXED_DURATION', D, mixed.exercise.id, M('DURATION', false), 'queried as DURATION: the newer occurrence');
    sc('NONE_D', D, 'BIRD_DOG', M('REPETITIONS', false), 'never performed by Daniel (Noa did it)');

    // ------------------------------------------------------------------ Noa (another Player; newer data for the same exercises)
    await perform(N, [ent('BARBELL_BENCH_PRESS', rx(3, 8, 80))], [[rl(8, 80), rl(8, 80), rl(8, 80)]], { name: 'Noa push' });
    sc('BENCH_N', N, 'BARBELL_BENCH_PRESS', M('REPETITIONS', true), "Noa's own bench (newer than Daniel's)");
    await perform(N, [ent('BIRD_DOG', rx(2, 10))], [[rep(10), rep(10)]], { name: 'Noa bird dog' });
    // a TEMPLATE-derived plan (Full Body A imported through the Builder's own import) vs the MANUAL plan above: same dosage, same actuals
    const imported = importTemplate([], professionalWorkout('GYM-BEG-FULLBODY-A')!, exercises, 'en', (() => { let k = 0; return () => `k${k++}`; })());
    if (!imported.ok) throw new Error('import');
    const templatePlan = await savePlannedWorkout(db, { planId: null, playerId: N, name: 'Noa Full Body A', entries: toSaveEntries(imported.entries) }, deps);
    if (!templatePlan.ok) throw new Error('template plan');
    let ts = await startSession(db, templatePlan.plan.id, deps);
    const goblet = ts.exercises.findIndex((e) => e.exercise.exerciseId === 'GOBLET_SQUAT');
    for (const [s, v] of [rl(10, 12), rl(10, 12), rl(9, 12)].entries()) await recordSet(db, ts.exercises[goblet]!.sets[s]!.id, v, deps);
    ts = (await finishSession(db, ts.id, deps)) as typeof ts;
    sc('TEMPLATE', N, 'GOBLET_SQUAT', M('REPETITIONS', true), 'a TEMPLATE-derived plan (Full Body A, goblet squat 3 x 10) performed as 10 / 10 / 9 @ 12');

    // Daniel's open session LAST (one in-progress session per Player): it must be ignored by the lookup
    await perform(D, [ent('STEP_UP', rx(3, 50))], [[rl(50, 10)]], { name: 'Step in progress', close: 'OPEN' });

    snapshotDb(db, 'before_read.db');

    // ------------------------------------------------------------------ the app's answers
    const outputs: Record<string, unknown> = {};
    const results: Record<string, { dto: unknown; repeat: BaselineResult | null; baseline: BaselineResult | null }> = {};
    for (const s of scenarios) {
      const dto = await findPreviousPerformance(db, s.player, { exerciseId: s.exerciseId, measurementType: s.measurement.type });
      const repeat = dto ? repeatPlan(dto, s.measurement) : null;
      const baseline = dto ? useActualPerformance(dto, s.measurement) : null;
      results[s.id] = { dto, repeat, baseline };
      outputs[s.id] = results[s.id];
    }
    snapshotDb(db, 'after_read.db');

    // ------------------------------------------------------------------ NEW plans from the baselines, saved exactly as the Builder saves a draft
    const newPlans: { scenario: string; mode: 'REPEAT' | 'BASELINE'; planId: string; name: string; player: string }[] = [];
    for (const s of scenarios) {
      for (const mode of ['REPEAT', 'BASELINE'] as const) {
        const r = mode === 'REPEAT' ? results[s.id]!.repeat : results[s.id]!.baseline;
        if (!r || !r.ok) continue;
        const exercise = (await getExercise(db, s.exerciseId))!;
        const entry: DEntry = exerciseEntryOf('k', exercise);
        const patched: DEntry = { ...entry, items: [{ ...itemOf(snapshotOf(exercise), r.prescription), ...prescriptionPatch(r.prescription) }] };
        const name = `NEXT ${s.id} ${mode}`.slice(0, 35);
        const saved = await savePlannedWorkout(db, { planId: null, playerId: s.player, name, entries: toSaveEntries([patched]) }, deps);
        if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
        newPlans.push({ scenario: s.id, mode, planId: saved.plan.id, name, player: s.player });
      }
    }
    snapshotDb(db, 'after_apply.db');
    snapshotDb(db, 'main.db');

    mkdirSync(OUT!, { recursive: true });
    writeFileSync(join(OUT!, 'manifest.json'), JSON.stringify({ players: { daniel: D, noa: N }, scenarios, sessions, newPlans, customExerciseId: customId, schema: 23 }, null, 2), 'utf8');
    writeFileSync(join(OUT!, 'outputs.json'), JSON.stringify(outputs, null, 2), 'utf8');
    await db.closeAsync();
  }, 120000);
});
