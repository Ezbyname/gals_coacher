import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCustomExercise, getExercise } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { findRecentPerformances } from '@/data/local/training/previousPerformanceRepository';
import { savePlannedWorkout, type SaveEntry } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { abandonSession, addSet, finishSession, recordSet, skipSet, snapshotOf, startSession } from '@/data/local/training/trainingRepository';
import type { ExerciseMeasurement } from '@/domain/exercise/exercise';
import { STALE_AFTER_DAYS, suggestProgression, type ProgressionSuggestion } from '@/domain/training/progressionSuggestion';
import type { Prescription, SetValues } from '@/domain/training/training';
import { exerciseEntryOf, itemOf, prescriptionPatch, toSaveEntries, type DEntry } from '@/features/training/builderDraft';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

/**
 * TRAINING-PROGRESSION-002 — Python QA scenario EXPORT. Not a product test: when SUG_QA_OUT is set it performs the scenarios through the app's REAL
 * repositories on a REAL schema-v23 SQLite engine (one Player per scenario unless a scenario is about Player isolation), asks the app's read-only
 * N<=2 lookup and the pure suggestion engine for their answers, builds NEW plans from every suggestion exactly as the Builder saves an applied draft,
 * and writes database snapshots (before the reads, after the reads, after the applied plans) plus manifest.json and outputs.json.
 * The Python suite (product_qa/tests/training_progression_suggestions) re-derives every answer independently from the SQLite rows and compares.
 */
const OUT = process.env.SUG_QA_OUT;
const run = OUT ? describe : describe.skip;
type Db = ReturnType<typeof openNodeSqlite>;
const DAY = 86_400_000;

let t = new Date(2026, 8, 1, 8).getTime();
const clock = { wallNow: () => (t += 60_000), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
const rx = (sets: number, target: number | null, loadKg: number | null = null, extra: Partial<Prescription> = {}): Prescription => ({ sets, target, loadKg, restSec: 90, ...extra });
type Act = SetValues | 'SKIP' | 'PENDING' | { extra: SetValues } | { edit: [SetValues, SetValues] };
interface Workout {
  entries: SaveEntry[];
  acts: Act[][];
  close?: 'FINISH' | 'ABANDON' | 'OPEN';
  purpose?: 'BASELINE' | 'REASSESSMENT';
  /** Days to let pass before this workout starts (default 3). */
  gapDays?: number;
}

const snapshotDb = (db: Db, file: string) => {
  mkdirSync(OUT!, { recursive: true });
  db.raw.exec(`VACUUM INTO '${join(OUT!, file).replace(/\\/g, '/').replace(/'/g, "''")}'`);
};

run('training progression suggestion QA scenario export', () => {
  it('performs the scenarios, asks the app, applies every suggestion as a NEW plan, and writes the files', async () => {
    const db: Db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    const mkPlayer = async (name: string) => {
      const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
      if (!r.ok) throw new Error('seed ' + name);
      return r.profile.player.id;
    };

    async function setPurpose(sessionId: string, purpose: 'BASELINE' | 'REASSESSMENT') {
      // FIXTURE TECHNIQUE: the app only creates TRAINING sessions and a trigger keeps purpose immutable; lift that one trigger for the statement.
      const trigger = (await db.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'training_sessions_closed'"))!.sql;
      await db.execAsync('DROP TRIGGER training_sessions_closed');
      await db.runAsync('UPDATE training_sessions SET purpose = ? WHERE id = ?', [purpose, sessionId]);
      await db.execAsync(trigger);
    }
    async function perform(player: string, w: Workout, name: string) {
      t += (w.gapDays ?? 3) * DAY;
      const saved = await savePlannedWorkout(db, { planId: null, playerId: player, name, entries: w.entries }, deps);
      if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
      let session = await startSession(db, saved.plan.id, deps);
      if (w.purpose) await setPurpose(session.id, w.purpose);
      for (const [e, list] of w.acts.entries()) {
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
      const close = w.close ?? 'FINISH';
      if (close === 'FINISH') await finishSession(db, session.id, deps);
      if (close === 'ABANDON') await abandonSession(db, session.id, deps);
      return session.id;
    }
    const custom = async (name: string, measurementType: 'DURATION' | 'DISTANCE' | 'RATING' | 'COMPLETION', comparison: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NOT_RANKED') => {
      const r = await createCustomExercise(db, { name, categories: ['CORE'], primaryMuscles: ['ABDOMINALS'], secondaryMuscles: [], difficulty: 'BEGINNER', sports: [], equipment: [], measurementType, comparison, usesLoad: false, instructions: '', tutorialUrl: '' }, deps);
      if (!r.ok) throw new Error('custom ' + name + JSON.stringify(r.errors));
      return r.exercise.id;
    };

    const rl = (r: number, l: number): SetValues => ({ REPETITIONS: r, LOAD_KG: l });
    const rep = (r: number): SetValues => ({ REPETITIONS: r });
    const tm = (s: number): SetValues => ({ TIME_S: s });
    const dur = (s: number, l?: number): SetValues => (l === undefined ? { DURATION_S: s } : { DURATION_S: s, LOAD_KG: l });
    const ent = (exerciseId: string, prescription: Prescription): SaveEntry => ({ kind: 'EXERCISE', exerciseId, prescription });
    const BENCH = 'BARBELL_BENCH_PRESS';
    const benchW = (load: number, planLoad: number, reps: number[], extra: Partial<Workout> = {}, target = 10): Workout => ({
      entries: [ent(BENCH, rx(reps.length, target, planLoad))],
      acts: [reps.map((r) => rl(r, load))],
      ...extra,
    });
    const good = (load = 40, extra: Partial<Workout> = {}): Workout => benchW(load, load, [10, 10, 10], extra);
    const stepScenario = (load: number): Workout[] => [good(load), good(load)];

    interface Scenario {
      id: string;
      player: string;
      queryPlayer: string;
      exerciseId: string;
      measurement: ExerciseMeasurement;
      nowMs: number;
      sessions: string[];
      note: string;
    }
    const scenarios: Scenario[] = [];
    const scn = async (id: string, exerciseId: string, workouts: Workout[], note: string, o: { query?: 'OTHER'; nowAfterDays?: number; nowEdge42?: boolean; player?: string } = {}) => {
      const player = o.player ?? (await mkPlayer(`P-${id}`.slice(0, 30)));
      const sessions: string[] = [];
      for (const [i, w] of workouts.entries()) sessions.push(await perform(player, w, `${id} #${i + 1}`.slice(0, 35)));
      const queryPlayer = o.query === 'OTHER' ? await mkPlayer(`Q-${id}`.slice(0, 30)) : player;
      let nowMs = t + (o.nowAfterDays ?? 2) * DAY;
      if (o.nowEdge42) {
        const oldest = (await db.getFirstAsync<{ started_at: number }>('SELECT min(started_at) AS started_at FROM training_sessions WHERE id IN (' + sessions.map(() => '?').join(',') + ')', sessions))!.started_at;
        nowMs = oldest + 42 * DAY;
      }
      const exercise = (await getExercise(db, exerciseId))!;
      scenarios.push({ id, player, queryPlayer, exerciseId, measurement: exercise.measurement, nowMs, sessions, note });
    };

    // ---------------------------------------------------------------- REPETITIONS + LOAD needs TWO comparable workouts
    await scn('N2_ONE', BENCH, [good()], 'ONE successful workout (3 x 10 @ 40, all 10): no suggestion');
    await scn('N2_OWNER', BENCH, [good(), benchW(40, 40, [11, 10, 10])], "the owner's example: workout 1 = 10 / 10 / 10, workout 2 = 11 / 10 / 10, both planned 3 x 10 @ 40");
    await scn('N2_LOAD', BENCH, [good(42.5), good()], 'the second occurrence has a different planned load (42.5 vs 40)');
    await scn('N2_MISS', BENCH, [good(), benchW(40, 40, [10, 9, 10])], 'the second occurrence misses one set (9 < 10)');
    await scn('N2_MISS_OLD', BENCH, [benchW(40, 40, [10, 9, 10]), good()], 'the OLDER occurrence misses one set');
    await scn('N2_TARGET', BENCH, [benchW(40, 40, [8, 8, 8], {}, 8), good()], 'the two occurrences used different reps targets (8 vs 10)');
    await scn('N2_SETS', BENCH, [{ entries: [ent(BENCH, rx(2, 10, 40))], acts: [[rl(10, 40), rl(10, 40)]] }, good()], 'the two occurrences used different set counts (2 vs 3)');
    await scn('SKIPPED', BENCH, [good(), { entries: [ent(BENCH, rx(3, 10, 40))], acts: [[rl(10, 40), 'SKIP', rl(10, 40)]] }], 'a skipped planned set invalidates the newest occurrence');
    await scn('VARLOAD', BENCH, [good(), { entries: [ent(BENCH, rx(3, 10, 40))], acts: [[rl(12, 30), rl(10, 40), rl(10, 50)]] }], 'actual loads 30 / 40 / 50 against a planned 40');
    await scn('EXTRAS', BENCH, [{ ...good(), acts: [[rl(10, 40), rl(10, 40), rl(10, 40), { extra: rl(3, 10) }]] }, { ...good(), acts: [[rl(10, 40), rl(10, 40), rl(10, 40), { extra: rl(2, 10) }]] }], 'extra sets in both workouts are ignored: still a suggestion, still 3 planned sets');
    await scn('EXTRA_NOT_A_SET', BENCH, [good(), { entries: [ent(BENCH, rx(3, 10, 40))], acts: [[rl(10, 40), 'SKIP', rl(10, 40), { extra: rl(12, 40) }]] }], 'an extra set cannot stand in for a skipped planned set');
    await scn('EDIT_UP', BENCH, [good(), { entries: [ent(BENCH, rx(3, 10, 40))], acts: [[{ edit: [rl(9, 40), rl(10, 40)] }, rl(10, 40), rl(10, 40)]] }], 'a set recorded as 9 and corrected to 10: the FINAL value counts');
    await scn('EDIT_DOWN', BENCH, [good(), { entries: [ent(BENCH, rx(3, 10, 40))], acts: [[{ edit: [rl(12, 40), rl(9, 40)] }, rl(10, 40), rl(10, 40)]] }], 'a set recorded as 12 and corrected to 9: the FINAL value counts');
    await scn(
      'PARTIAL_OK',
      BENCH,
      [good(), { entries: [ent(BENCH, rx(3, 10, 40)), ent('PUSH_UP', rx(2, 10))], acts: [[rl(10, 40), rl(10, 40), rl(10, 40)], ['PENDING', 'PENDING']] }],
      'the newest session is PARTIAL (another exercise left pending) but THIS exercise occurrence is complete',
    );
    await scn(
      'PARTIAL_SETS',
      BENCH,
      [good(), { entries: [ent(BENCH, rx(3, 10, 40))], acts: [[rl(10, 40), 'PENDING', 'PENDING']] }],
      'the newest occurrence has only one DONE planned set (two PENDING)',
    );
    await scn(
      'EXCLUDED',
      BENCH,
      [
        good(),
        good(),
        { entries: [ent(BENCH, rx(3, 20, 80))], acts: [[rl(20, 80), rl(20, 80), rl(20, 80)]], close: 'ABANDON' },
        { entries: [ent(BENCH, rx(3, 30, 90))], acts: [[rl(30, 90), rl(30, 90), rl(30, 90)]], purpose: 'BASELINE' },
        { entries: [ent(BENCH, rx(3, 40, 95))], acts: [[rl(40, 95), rl(40, 95), rl(40, 95)]], purpose: 'REASSESSMENT' },
        { entries: [ent(BENCH, rx(3, 50, 99))], acts: [[rl(50, 99)]], close: 'OPEN' },
      ],
      'two eligible workouts, then ABANDONED / BASELINE / REASSESSMENT / IN_PROGRESS sessions with very different numbers: they are ignored',
    );
    await scn('STALE_NEWEST', BENCH, [good(), good()], 'both workouts are older than 42 days', { nowAfterDays: 43 });
    await scn('STALE_OLDER', BENCH, [good(), { ...good(), gapDays: 50 }], 'the newest is recent but the OLDER workout is 53 days old', { nowAfterDays: 3 });
    await scn('STALE_EDGE', BENCH, [good(), { ...good(), gapDays: 30 }], 'the older workout is exactly 42 days old: not stale', { nowEdge42: true });
    // another Player's identical workouts never count
    const other = await mkPlayer('Owner of the history');
    await perform(other, good(), 'ISO #1');
    await perform(other, good(), 'ISO #2');
    {
      const asker = await mkPlayer('Q-ISO');
      const exercise = (await getExercise(db, BENCH))!;
      scenarios.push({ id: 'ISOLATION', player: other, queryPlayer: asker, exerciseId: BENCH, measurement: exercise.measurement, nowMs: t + 2 * DAY, sessions: [], note: "another Player's two perfect workouts: this Player has none" });
    }

    // ---------------------------------------------------------------- the load step table (planned load -> next)
    for (const [label, load] of [['5', 5], ['9_5', 9.5], ['10', 10], ['19', 19], ['20', 20], ['97_5', 97.5], ['100', 100], ['250', 250], ['998', 998]] as const) {
      await scn(`STEP_${label}`, BENCH, stepScenario(load), `two perfect workouts at ${load} kg`);
    }

    // ---------------------------------------------------------------- REPETITIONS without a load: ONE workout
    const bw = (target: number, reps: number[]): Workout => ({ entries: [ent('PUSH_UP', rx(reps.length, target))], acts: [reps.map(rep)] });
    await scn('RN_8', 'PUSH_UP', [bw(8, [8, 9, 8])], 'push-ups, target 8, all reached');
    await scn('RN_10', 'PUSH_UP', [bw(10, [10, 11, 10])], 'target 10');
    await scn('RN_29', 'PUSH_UP', [bw(29, [29, 30, 29])], 'target 29: +2 is clamped to the ceiling of 30');
    await scn('RN_30', 'PUSH_UP', [bw(30, [30, 31])], 'target 30: at the ceiling');
    await scn('RN_MISS', 'PUSH_UP', [bw(10, [10, 9, 10])], 'one set below the target');
    await scn('RN_SKIP', 'PUSH_UP', [{ entries: [ent('PUSH_UP', rx(3, 10))], acts: [[rep(10), 'SKIP', rep(10)]] }], 'a skipped planned set');

    // ---------------------------------------------------------------- TIME
    const sprint = (goal: number, times: number[], semantics: 'PERFORMANCE_GOAL_TIME' | 'COMPLETION_TIME_CAP' = 'PERFORMANCE_GOAL_TIME', gapDays?: number): Workout => ({
      entries: [ent('SPRINT_20M', rx(times.length, goal, null, { timeSemantics: semantics }))],
      acts: [times.map(tm)],
      ...(gapDays === undefined ? {} : { gapDays }),
    });
    await scn('T_OK', 'SPRINT_20M', [sprint(15, [14.2, 14.5]), sprint(15, [14.4, 14.3])], 'goal 15 s met twice; slowest 14.5');
    await scn('T_ROUND', 'SPRINT_20M', [sprint(15, [14.01, 14.2]), sprint(15, [14.43, 14.3])], 'slowest 14.43 rounds UP to 14.5, never down to 14.4');
    await scn('T_NOISE', 'SPRINT_20M', [sprint(15, [14.8]), sprint(15, [14.8])], 'improvement 0.2 s < max(0.1, 2% of 15 = 0.3): within noise');
    await scn('T_EDGE', 'SPRINT_20M', [sprint(15, [14.7]), sprint(15, [14.7])], 'improvement exactly 0.3 s qualifies');
    await scn('T_MISS', 'SPRINT_20M', [sprint(15, [14.2]), sprint(15, [16.2])], 'goal 15 s, actual 16.20 in the newest workout: never a slower goal');
    await scn('T_ONE', 'SPRINT_20M', [sprint(15, [14.2])], 'one workout only');
    await scn('T_GOALS', 'SPRINT_20M', [sprint(14, [13.2]), sprint(15, [14.2])], 'two different goals in the window');
    await scn('T_CAP', 'SPRINT_20M', [sprint(20, [10], 'COMPLETION_TIME_CAP'), sprint(20, [10], 'COMPLETION_TIME_CAP')], 'a COMPLETION_TIME_CAP is never a goal');
    await scn('T_LOAD', 'SLED_PUSH', [{ entries: [ent('SLED_PUSH', rx(2, 20, 50))], acts: [[{ TIME_S: 6.12, LOAD_KG: 50 }, { TIME_S: 7.5, LOAD_KG: 50 }]] }, { entries: [ent('SLED_PUSH', rx(2, 20, 50))], acts: [[{ TIME_S: 6, LOAD_KG: 50 }, { TIME_S: 7, LOAD_KG: 50 }]] }], 'TIME with a load (sled push)');

    // ---------------------------------------------------------------- CONTEXT: another distance is another exercise id (PY-SUG-CONTEXT-01)
    {
      const at = (id: 'SPRINT_10M' | 'SPRINT_20M' | 'SPRINT_30M_FLYING', goal: number, time: number): Workout => ({ entries: [ent(id, rx(1, goal))], acts: [[tm(time)]] });
      // ONE Player, interleaved TIME history over three distances; each exact id has two comparable workouts of its own
      const ctxPlayer = await mkPlayer('P-CONTEXT');
      await scn('CTX_10M', 'SPRINT_10M', [at('SPRINT_10M', 8, 7.2), at('SPRINT_20M', 15, 14.4), at('SPRINT_30M_FLYING', 20, 19), at('SPRINT_10M', 8, 7.2), at('SPRINT_20M', 15, 14.2)], 'one Player, 10 m / 20 m / 30 m runs interleaved: only the two 10 m workouts are evidence for SPRINT_10M', { player: ctxPlayer });
      const exercise = (await getExercise(db, 'SPRINT_20M'))!;
      const sessions = scenarios.find((x) => x.id === 'CTX_10M')!.sessions;
      scenarios.push({ id: 'CTX_20M', player: ctxPlayer, queryPlayer: ctxPlayer, exerciseId: 'SPRINT_20M', measurement: exercise.measurement, nowMs: t + 2 * DAY, sessions, note: 'the same Player, asked for SPRINT_20M: only the two 20 m workouts are evidence' });
      const thirty = (await getExercise(db, 'SPRINT_30M_FLYING'))!;
      scenarios.push({ id: 'CTX_30M', player: ctxPlayer, queryPlayer: ctxPlayer, exerciseId: 'SPRINT_30M_FLYING', measurement: thirty.measurement, nowMs: t + 2 * DAY, sessions, note: 'the same Player, asked for SPRINT_30M_FLYING: ONE workout only (mixing distances would make it two)' });
      // a second Player: one workout per distance; mixing them would look like two workouts of one exercise
      await scn('CTX_LONE', 'SPRINT_10M', [at('SPRINT_10M', 8, 7.2), at('SPRINT_20M', 8, 7.2)], 'one 10 m and one 20 m workout (same goal and time): a single occurrence of SPRINT_10M');
    }

    // ---------------------------------------------------------------- CONTEXT: the planned REST must match across two workouts (PY-SUG-CONTEXT-02)
    {
      const benchRest = (rest: number): Workout => ({ entries: [ent(BENCH, rx(3, 10, 40, { restSec: rest }))], acts: [[rl(10, 40), rl(10, 40), rl(10, 40)]] });
      const tenRest = (rest: number): Workout => ({ entries: [ent('SPRINT_10M', rx(1, 8, null, { restSec: rest }))], acts: [[tm(7.2)]] });
      await scn('REST_RL_DIFF', BENCH, [benchRest(60), benchRest(120)], '3 x 10 @ 40 kg twice, all 10 / 10 / 10 at 40, but rest 60 s then 120 s');
      await scn('REST_RL_SAME', BENCH, [benchRest(60), benchRest(60)], 'control: 3 x 10 @ 40 kg twice with the SAME rest (60 s)');
      await scn('REST_T_DIFF', 'SPRINT_10M', [tenRest(60), tenRest(180)], 'goal 8.0 s met twice (7.2 s) but rest 60 s then 180 s');
      await scn('REST_T_SAME', 'SPRINT_10M', [tenRest(60), tenRest(60)], 'control: goal 8.0 s met twice with the SAME rest (60 s)');
    }

    // ---------------------------------------------------------------- DURATION
    const hold = await custom('Hold test', 'DURATION', 'HIGHER_IS_BETTER');
    const drill = await custom('Timed drill test', 'DURATION', 'LOWER_IS_BETTER');
    const holdW = (id: string, target: number, secs: number[]): Workout => ({ entries: [ent(id, rx(secs.length, target))], acts: [secs.map((s) => dur(s))] });
    await scn('D_OK', hold, [holdW(hold, 30, [30, 32])], 'hold target 30 s, both sets reached');
    await scn('D_60', hold, [holdW(hold, 60, [60, 65])], 'target 60 s: the step is 10 s');
    await scn('D_175', hold, [holdW(hold, 175, [175, 180])], 'target 175 s: +5 is clamped to the ceiling of 180');
    await scn('D_CEIL', hold, [holdW(hold, 180, [180, 185])], 'target at the 180 s ceiling');
    await scn('D_MISS', hold, [holdW(hold, 30, [30, 29])], 'one set shorter than the target');
    await scn('D_LOWER', drill, [holdW(drill, 45, [45])], 'LOWER_IS_BETTER duration: a dose, not a score');
    await scn('D_LOAD', 'FARMER_CARRY', [{ entries: [ent('FARMER_CARRY', rx(2, 30, 16))], acts: [[dur(30, 16), dur(32, 16)]] }], 'DURATION with a load (farmer carry)');

    // ---------------------------------------------------------------- unsupported measurement types
    const dist = await custom('Distance test', 'DISTANCE', 'HIGHER_IS_BETTER');
    const rating = await custom('Rating test', 'RATING', 'HIGHER_IS_BETTER');
    const done = await custom('Completion test', 'COMPLETION', 'NOT_RANKED');
    const unsup = (id: string, target: number | null, v: SetValues): Workout[] => [{ entries: [ent(id, rx(1, target))], acts: [[v]] }, { entries: [ent(id, rx(1, target))], acts: [[v]] }];
    await scn('U_DIST', dist, unsup(dist, 10, { DISTANCE_M: 12 }), 'DISTANCE: display only');
    await scn('U_MADE', 'FREE_THROWS', unsup('FREE_THROWS', 10, { MADE: 7, ATTEMPTS: 10 }), 'MADE / ATTEMPTS: display only');
    await scn('U_RATING', rating, unsup(rating, null, { RATING: 4 }), 'RATING has no progression target');
    await scn('U_DONE', done, unsup(done, null, { COMPLETED: 1 }), 'COMPLETION has no progression target');

    snapshotDb(db, 'before_read.db');

    // ---------------------------------------------------------------- the app's answers
    const outputs: Record<string, { suggestion: ProgressionSuggestion; occurrences: number }> = {};
    for (const s of scenarios) {
      const found = (await findRecentPerformances(db, s.queryPlayer, [{ exerciseId: s.exerciseId, measurementType: s.measurement.type }])).get(`${s.exerciseId}|${s.measurement.type}`)!;
      outputs[s.id] = { occurrences: found.length, suggestion: suggestProgression({ occurrences: found, current: s.measurement, nowMs: s.nowMs, staleAfterDays: STALE_AFTER_DAYS }) };
    }
    snapshotDb(db, 'after_read.db');

    // ---------------------------------------------------------------- APPLY: a NEW plan from every suggestion, saved exactly as the Builder saves an applied draft
    const applied: { scenario: string; planId: string; name: string; player: string; prescription: Prescription }[] = [];
    for (const s of scenarios) {
      const r = outputs[s.id]!.suggestion;
      if (r.status !== 'SUGGESTION') continue;
      const exercise = (await getExercise(db, s.exerciseId))!;
      const entry: DEntry = exerciseEntryOf('k', exercise);
      const patched: DEntry = { ...entry, items: [{ ...itemOf(snapshotOf(exercise), r.prescription), ...prescriptionPatch(r.prescription) }] };
      const name = `NEXT ${s.id}`.slice(0, 35);
      const saved = await savePlannedWorkout(db, { planId: null, playerId: s.queryPlayer, name, entries: toSaveEntries([patched]) }, deps);
      if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
      applied.push({ scenario: s.id, planId: saved.plan.id, name, player: s.queryPlayer, prescription: r.prescription });
    }
    snapshotDb(db, 'after_apply.db');
    snapshotDb(db, 'main.db');

    mkdirSync(OUT!, { recursive: true });
    writeFileSync(join(OUT!, 'manifest.json'), JSON.stringify({ scenarios, applied, staleAfterDays: STALE_AFTER_DAYS, schema: 23 }, null, 2), 'utf8');
    writeFileSync(join(OUT!, 'outputs.json'), JSON.stringify(outputs, null, 2), 'utf8');
    await db.closeAsync();
  }, 240000);
});
