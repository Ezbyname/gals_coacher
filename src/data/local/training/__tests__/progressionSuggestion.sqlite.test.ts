import { createSequentialIdService } from '@/services/ids/IdService';
import { STALE_AFTER_DAYS, suggestProgression, type ProgressionSuggestion } from '@/domain/training/progressionSuggestion';
import type { Prescription, SetValues } from '@/domain/training/training';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { findPreviousPerformance, findRecentPerformances } from '../previousPerformanceRepository';
import { savePlannedWorkout, type SaveEntry } from '../plannedWorkoutCompositionRepository';
import { abandonSession, addSet, finishSession, recordSet, skipSet, startSession, type TrainingSession } from '../trainingRepository';

/** TRAINING-PROGRESSION-002 S1 — the N<=2 read-only history lookup and the suggestion on real SQLite (schema v23), through the app's real repositories. */
let t = 0;
const clock = { wallNow: () => (t += 60_000), monotonicNow: () => 0 };
let ids = createSequentialIdService();
const deps = () => ({ ids, clock });
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let p1: string;
let p2: string;

beforeEach(async () => {
  t = new Date(2026, 9, 1).getTime();
  ids = createSequentialIdService();
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const mk = async (name: string) => {
    const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps());
    if (!r.ok) throw new Error('seed');
    return r.profile.player.id;
  };
  p1 = await mk('Daniel');
  p2 = await mk('Noa');
});
afterEach(() => db.closeAsync());

const rx = (sets: number, target: number | null, loadKg: number | null = null, extra: Partial<Prescription> = {}): Prescription => ({ sets, target, loadKg, restSec: 60, ...extra });
const ex = (exerciseId: string, prescription: Prescription): SaveEntry => ({ kind: 'EXERCISE', exerciseId, prescription });
type Plan = (SetValues | 'SKIP' | 'PENDING' | { extra: SetValues })[][];

/** FIXTURE TECHNIQUE (as in 001): a reserved purpose is written by lifting the immutable-purpose trigger for one statement and restoring it exactly. */
async function setPurpose(sessionId: string, purpose: 'BASELINE' | 'REASSESSMENT') {
  const trigger = (await db.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'training_sessions_closed'"))!.sql;
  await db.execAsync('DROP TRIGGER training_sessions_closed');
  await db.runAsync('UPDATE training_sessions SET purpose = ? WHERE id = ?', [purpose, sessionId]);
  await db.execAsync(trigger);
}

/** Plan `entries`, start it, act out `plan[exerciseIndex][setIndex]`, then close it. */
async function perform(playerId: string, entries: SaveEntry[], plan: Plan, close: 'FINISH' | 'ABANDON' | 'LEAVE_OPEN' = 'FINISH', purpose?: 'BASELINE' | 'REASSESSMENT') {
  const saved = await savePlannedWorkout(db, { planId: null, playerId, name: 'Upper', entries }, deps());
  if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
  let session: TrainingSession = await startSession(db, saved.plan.id, deps());
  if (purpose) await setPurpose(session.id, purpose);
  for (const [e, sets] of plan.entries()) {
    for (const [s, action] of sets.entries()) {
      if (typeof action === 'object' && 'extra' in action) {
        session = await addSet(db, session.exercises[e]!.id, deps());
        const extra = session.exercises[e]!.sets.at(-1)!;
        const r = await recordSet(db, extra.id, action.extra, deps());
        if (!r.ok) throw new Error(JSON.stringify(r.errors));
        continue;
      }
      const id = session.exercises[e]!.sets[s]!.id;
      if (action === 'SKIP') session = await skipSet(db, id, deps());
      else if (action !== 'PENDING') {
        const r = await recordSet(db, id, action as SetValues, deps());
        if (!r.ok) throw new Error(JSON.stringify(r.errors));
      }
    }
  }
  if (close === 'FINISH') await finishSession(db, session.id, deps());
  if (close === 'ABANDON') await abandonSession(db, session.id, deps());
  return { sessionId: session.id, planId: saved.plan.id };
}
const BENCH = 'BARBELL_BENCH_PRESS';
const rl = (r: number, l: number): SetValues => ({ REPETITIONS: r, LOAD_KG: l });
const REPS_LOAD = { type: 'REPETITIONS' as const, comparison: null, usesLoad: true, distanceM: null };
const REPS = { ...REPS_LOAD, usesLoad: false };
const TIME = { type: 'TIME' as const, comparison: null, usesLoad: false, distanceM: 20 };
const q = (exerciseId: string, measurementType: 'REPETITIONS' | 'DURATION' | 'TIME') => ({ exerciseId, measurementType });
const tables = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements', 'workout_blocks', 'workout_templates', 'user_workout_templates'];
const dump = async () => JSON.stringify(await Promise.all(tables.map((tb) => db.getAllAsync(`SELECT * FROM ${tb} ORDER BY rowid`))));
const suggest = async (playerId: string, exerciseId: string, current: typeof REPS_LOAD | typeof TIME, nowMs = t): Promise<ProgressionSuggestion> => {
  const found = (await findRecentPerformances(db, playerId, [q(exerciseId, current.type)])).get(`${exerciseId}|${current.type}`)!;
  return suggestProgression({ occurrences: found, current, nowMs, staleAfterDays: STALE_AFTER_DAYS });
};
const good = () => perform(p1, [ex(BENCH, rx(3, 10, 40, { restSec: 90 }))], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);

describe('progression history + suggestion on real SQLite (PSQ)', () => {
  it("PSQ-01: the owner's example: 3 x 10 @ 40, two qualifying workouts -> Consider 42.5 kg", async () => {
    const first = await good();
    const second = await perform(p1, [ex(BENCH, rx(3, 10, 40, { restSec: 90 }))], [[rl(11, 40), rl(10, 40), rl(10, 40)]]);
    const found = (await findRecentPerformances(db, p1, [q(BENCH, 'REPETITIONS')])).get(`${BENCH}|REPETITIONS`)!;
    expect(found.map((f) => f.sessionId)).toEqual([second.sessionId, first.sessionId]);
    const s = await suggest(p1, BENCH, REPS_LOAD);
    expect(s).toMatchObject({ status: 'SUGGESTION', changedField: 'load', currentValue: 40, suggestedValue: 42.5, workouts: 2 });
    if (s.status === 'SUGGESTION') expect(s.prescription).toEqual({ sets: 3, target: 10, loadKg: 42.5, restSec: 90, timeSemantics: null });
  });

  it('PSQ-02: one qualifying workout alone -> INSUFFICIENT_EVIDENCE; nothing performed -> an empty array', async () => {
    expect((await findRecentPerformances(db, p1, [q(BENCH, 'REPETITIONS')])).get(`${BENCH}|REPETITIONS`)).toEqual([]);
    await good();
    expect(await suggest(p1, BENCH, REPS_LOAD)).toMatchObject({ status: 'NO_SUGGESTION', reasonCode: 'INSUFFICIENT_EVIDENCE' });
  });

  it('PSQ-03: the first element is exactly the Last Performance of 001; the window never exceeds two', async () => {
    await good();
    await good();
    const third = await good();
    const found = (await findRecentPerformances(db, p1, [q(BENCH, 'REPETITIONS')], 5)).get(`${BENCH}|REPETITIONS`)!;
    expect(found).toHaveLength(2);
    expect(found[0]).toEqual(await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')));
    expect(found[0]!.sessionId).toBe(third.sessionId);
  });

  it('PSQ-04: ABANDONED / IN_PROGRESS / BASELINE / REASSESSMENT sessions are not evidence; the two eligible ones form the window', async () => {
    const a = await good();
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40)]], 'ABANDON');
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40)]], 'FINISH', 'BASELINE');
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40)]], 'FINISH', 'REASSESSMENT');
    expect(await suggest(p1, BENCH, REPS_LOAD)).toMatchObject({ status: 'NO_SUGGESTION', reasonCode: 'INSUFFICIENT_EVIDENCE' });
    const b = await good();
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40)]], 'LEAVE_OPEN'); // one session stays IN_PROGRESS
    const s = await suggest(p1, BENCH, REPS_LOAD);
    expect(s).toMatchObject({ status: 'SUGGESTION', suggestedValue: 42.5 });
    expect(s.evidence.occurrences.map((e) => e.sessionId)).toEqual([b.sessionId, a.sessionId]);
  });

  it("PSQ-05: another Player's workouts never count", async () => {
    await perform(p2, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await perform(p2, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await good();
    expect(await suggest(p1, BENCH, REPS_LOAD)).toMatchObject({ status: 'NO_SUGGESTION', reasonCode: 'INSUFFICIENT_EVIDENCE' });
    expect(await suggest(p2, BENCH, REPS_LOAD)).toMatchObject({ status: 'SUGGESTION' });
  });

  it('PSQ-06: a skipped set, a missed set, a different plan and an extra set (ignored) are judged from the stored rows', async () => {
    await good();
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), 'SKIP', rl(10, 40)]]);
    expect(await suggest(p1, BENCH, REPS_LOAD)).toMatchObject({ reasonCode: 'SETS_NOT_COMPLETE' });
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(9, 40), rl(10, 40)]]);
    expect(await suggest(p1, BENCH, REPS_LOAD)).toMatchObject({ reasonCode: 'TARGET_NOT_MET' });
    await perform(p1, [ex(BENCH, rx(3, 10, 45))], [[rl(10, 45), rl(10, 45), rl(10, 45), { extra: rl(2, 45) }]]);
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(10, 40), { extra: rl(1, 40) }]]);
    expect(await suggest(p1, BENCH, REPS_LOAD)).toMatchObject({ reasonCode: 'EVIDENCE_NOT_COMPARABLE' });
  });

  it('PSQ-07: TIME goal over two stored workouts; stale evidence; a missed goal', async () => {
    const sprint = (time: number) => perform(p1, [ex('SPRINT_20M', rx(1, 15, null, { restSec: 60 }))], [[{ TIME_S: time }]]);
    await sprint(14.2);
    await sprint(14.2);
    expect(await suggest(p1, 'SPRINT_20M', TIME)).toMatchObject({ status: 'SUGGESTION', changedField: 'target', currentValue: 15, suggestedValue: 14.2 });
    expect(await suggest(p1, 'SPRINT_20M', TIME, t + 43 * 86_400_000)).toMatchObject({ reasonCode: 'STALE_EVIDENCE' });
    await sprint(16.2);
    expect(await suggest(p1, 'SPRINT_20M', TIME)).toMatchObject({ status: 'NO_SUGGESTION', reasonCode: 'TARGET_NOT_MET', suggestedValue: null });
  });

  it('PSQ-08: an edited result is judged by its FINAL value', async () => {
    const saved = await savePlannedWorkout(db, { planId: null, playerId: p1, name: 'Edit', entries: [ex('PUSH_UP', rx(2, 10))] }, deps());
    if (!saved.ok) throw new Error('save');
    const session = await startSession(db, saved.plan.id, deps());
    const [first, second] = session.exercises[0]!.sets;
    await recordSet(db, first!.id, { REPETITIONS: 7 }, deps());
    await recordSet(db, second!.id, { REPETITIONS: 10 }, deps());
    await db.runAsync("UPDATE set_measurements SET final_value = 10, was_edited = 1 WHERE set_id = ? AND kind = 'REPETITIONS'", [first!.id]);
    await finishSession(db, session.id, deps());
    expect(await suggest(p1, 'PUSH_UP', REPS)).toMatchObject({ status: 'SUGGESTION', changedField: 'target', currentValue: 10, suggestedValue: 12 });
  });

  it('PSQ-09: lookup + suggestion perform no write; every table stays byte-for-byte identical', async () => {
    await good();
    await good();
    const before = await dump();
    const readOnly = {
      runAsync: async () => {
        throw new Error('a write was attempted by the suggestion lookup');
      },
      getFirstAsync: db.getFirstAsync.bind(db),
      getAllAsync: db.getAllAsync.bind(db),
      withTransactionAsync: async () => {
        throw new Error('a transaction was opened by the suggestion lookup');
      },
    };
    const found = (await findRecentPerformances(readOnly as never, p1, [q(BENCH, 'REPETITIONS')])).get(`${BENCH}|REPETITIONS`)!;
    suggestProgression({ occurrences: found, current: REPS_LOAD, nowMs: t, staleAfterDays: STALE_AFTER_DAYS });
    expect(await dump()).toBe(before);
  });

  it('PSQ-10: Apply + Save creates a NEW plan; the historical plans, sessions and results are untouched', async () => {
    await good();
    await good();
    const s = await suggest(p1, BENCH, REPS_LOAD);
    if (s.status !== 'SUGGESTION') throw new Error('expected a suggestion');
    const before = JSON.parse(await dump()) as unknown[][];
    const created = await savePlannedWorkout(db, { planId: null, playerId: p1, name: 'Next', entries: [ex(BENCH, s.prescription)] }, deps());
    if (!created.ok) throw new Error('save');
    expect(created.plan.items[0]!.prescription).toMatchObject({ sets: 3, target: 10, loadKg: 42.5 });
    const after = JSON.parse(await dump()) as unknown[][];
    for (const i of [2, 3, 4, 5]) expect(after[i]).toEqual(before[i]); // sessions, session exercises, sets, measurements
    expect(after[0]!.slice(0, before[0]!.length)).toEqual(before[0]); // the old plans, unchanged
    expect(after[0]!.length).toBe(before[0]!.length + 1);
  });
});
