import { createSequentialIdService } from '@/services/ids/IdService';
import { repeatPlan, useActualPerformance } from '@/domain/training/previousPerformance';
import type { Prescription, SetValues } from '@/domain/training/training';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { findPreviousPerformance, findPreviousPerformances, performanceKey } from '../previousPerformanceRepository';
import { savePlannedWorkout, type SaveEntry } from '../plannedWorkoutCompositionRepository';
import { abandonSession, addSet, finishSession, recordSet, skipSet, startSession, type TrainingSession } from '../trainingRepository';

/** TRAINING-PROGRESSION-001 P1 — the read-only lookup on real SQLite (schema v23), through the app's real repositories. */
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

/**
 * FIXTURE TECHNIQUE: the app only creates TRAINING sessions (BASELINE / REASSESSMENT are reserved) and a trigger keeps `purpose` immutable, so a
 * reserved purpose is written by lifting that one trigger for the statement and restoring it exactly as stored.
 */
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
const q = (exerciseId: string, measurementType: 'REPETITIONS' | 'DURATION' | 'TIME' | 'MADE_ATTEMPTS') => ({ exerciseId, measurementType });
const tables = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements', 'workout_blocks', 'workout_templates', 'user_workout_templates'];
const dump = async () => JSON.stringify(await Promise.all(tables.map((tb) => db.getAllAsync(`SELECT * FROM ${tb} ORDER BY rowid`))));

describe('Last Performance on real SQLite (PQ-01…)', () => {
  it('PQ-01: planned 3 x 10 @ 40, actual 10 / 10 / 8 @ 40 plus an extra set: plan and actual are separate; the extra is history only', async () => {
    const { sessionId } = await perform(p1, [ex(BENCH, rx(3, 10, 40, { restSec: 90 }))], [[rl(10, 40), rl(10, 40), rl(8, 40), { extra: rl(6, 40) }]]);
    const dto = (await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')))!;
    expect(dto.sessionId).toBe(sessionId);
    expect(dto.previousPlan).toEqual({ sets: 3, target: 10, loadKg: 40, restSec: 90, timeSemantics: null, uniform: true });
    expect(dto.sets.map((s) => [s.setNumber, s.planned, s.status])).toEqual([[1, true, 'DONE'], [2, true, 'DONE'], [3, true, 'DONE'], [4, false, 'DONE']]);
    expect(repeatPlan(dto, { type: 'REPETITIONS', comparison: null, usesLoad: true, distanceM: null })).toEqual({ ok: true, prescription: { sets: 3, target: 10, loadKg: 40, restSec: 90, timeSemantics: null } });
    expect(useActualPerformance(dto, { type: 'REPETITIONS', comparison: null, usesLoad: true, distanceM: null })).toMatchObject({ ok: true, prescription: { sets: 3, target: 8, loadKg: 40 } });
  });

  it("PQ-02: another Player's performance is never selected", async () => {
    await perform(p2, [ex(BENCH, rx(3, 10, 80))], [[rl(10, 80), rl(10, 80), rl(10, 80)]]);
    expect(await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS'))).toBeNull();
    const mine = await perform(p1, [ex(BENCH, rx(1, 5, 20))], [[rl(5, 20)]]);
    expect((await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')))!.sessionId).toBe(mine.sessionId);
    expect((await findPreviousPerformance(db, p2, q(BENCH, 'REPETITIONS')))!.previousPlan.loadKg).toBe(80);
  });

  it('PQ-03: ABANDONED, IN_PROGRESS, BASELINE and REASSESSMENT sessions are excluded; the earlier eligible one is used', async () => {
    const good = await perform(p1, [ex(BENCH, rx(1, 5, 20))], [[rl(5, 20)]]);
    await perform(p1, [ex(BENCH, rx(1, 5, 30))], [[rl(5, 30)]], 'ABANDON');
    await perform(p1, [ex(BENCH, rx(1, 5, 40))], [[rl(5, 40)]], 'FINISH', 'BASELINE');
    await perform(p1, [ex(BENCH, rx(1, 5, 50))], [[rl(5, 50)]], 'FINISH', 'REASSESSMENT');
    await perform(p1, [ex(BENCH, rx(1, 5, 60))], [[rl(5, 60)]], 'LEAVE_OPEN');
    expect((await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')))!.sessionId).toBe(good.sessionId);
  });

  it('PQ-04: skipped-only, pending-only and extra-only occurrences are excluded', async () => {
    const good = await perform(p1, [ex(BENCH, rx(1, 5, 20))], [[rl(5, 20)]]);
    await perform(p1, [ex(BENCH, rx(2, 5, 30)), ex('PUSH_UP', rx(1, 10))], [['SKIP', 'SKIP'], [{ REPETITIONS: 10 }]]);
    await perform(p1, [ex(BENCH, rx(2, 5, 30)), ex('PUSH_UP', rx(1, 10))], [['PENDING', 'PENDING'], [{ REPETITIONS: 10 }]]);
    await perform(p1, [ex(BENCH, rx(2, 5, 30))], [['SKIP', 'SKIP', { extra: rl(7, 30) }]]);
    expect((await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')))!.sessionId).toBe(good.sessionId);
  });

  it('PQ-05: a measurement type that does not match is not selected (identity is the exercise id plus the compatible type)', async () => {
    await perform(p1, [ex(BENCH, rx(1, 5, 20))], [[rl(5, 20)]]);
    expect(await findPreviousPerformance(db, p1, q(BENCH, 'DURATION'))).toBeNull();
    expect(await findPreviousPerformance(db, p1, q('PUSH_UP', 'REPETITIONS'))).toBeNull();
  });

  it('PQ-06: the same exercise twice in one session: the occurrence with the most DONE PLANNED sets wins (extras do not count)', async () => {
    await perform(p1, [ex(BENCH, rx(1, 10, 20)), ex(BENCH, rx(2, 8, 40))], [[rl(10, 20), { extra: rl(1, 1) }, { extra: rl(1, 1) }, { extra: rl(1, 1) }], [rl(8, 40), rl(7, 40)]]);
    const dto = (await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')))!;
    expect(dto.occurrencesInSession).toBe(2);
    expect(dto.previousPlan).toMatchObject({ sets: 2, target: 8, loadKg: 40 });
  });

  it('PQ-07: an edited result exposes the FINAL value (the baseline uses it) and the original measurement', async () => {
    const saved = await savePlannedWorkout(db, { planId: null, playerId: p1, name: 'Edit', entries: [ex('PUSH_UP', rx(2, 10))] }, deps());
    if (!saved.ok) throw new Error('save');
    const session = await startSession(db, saved.plan.id, deps());
    const [first, second] = session.exercises[0]!.sets;
    await recordSet(db, first!.id, { REPETITIONS: 8 }, deps());
    await recordSet(db, first!.id, { REPETITIONS: 9 }, deps()); // a later different value: final 9, measured 8, edited
    await recordSet(db, second!.id, { REPETITIONS: 12 }, deps());
    await finishSession(db, session.id, deps());
    const dto = (await findPreviousPerformance(db, p1, q('PUSH_UP', 'REPETITIONS')))!;
    expect(dto.sets[0]!.values[0]).toEqual({ kind: 'REPETITIONS', finalValue: 9, measuredValue: 8, edited: true });
    expect(useActualPerformance(dto, { type: 'REPETITIONS', comparison: null, usesLoad: false, distanceM: null })).toMatchObject({ ok: true, prescription: { sets: 2, target: 9 } });
  });

  it('PQ-08: TIME + LOAD (SLED_PUSH): both kinds are kept; the load is used, the time is display-only; the planned cap stays', async () => {
    await perform(p1, [ex('SLED_PUSH', rx(2, 20, 50, { timeSemantics: 'COMPLETION_TIME_CAP' }))], [[{ TIME_S: 6.12, LOAD_KG: 60 }, { TIME_S: 7.5, LOAD_KG: 55 }]]);
    const dto = (await findPreviousPerformance(db, p1, q('SLED_PUSH', 'TIME')))!;
    expect(dto.sets[0]!.values.map((v) => v.kind).sort()).toEqual(['LOAD_KG', 'TIME_S']);
    expect(dto.previousPlan).toMatchObject({ target: 20, loadKg: 50, timeSemantics: 'COMPLETION_TIME_CAP' });
    expect(useActualPerformance(dto, { type: 'TIME', comparison: null, usesLoad: true, distanceM: null })).toMatchObject({ ok: true, prescription: { target: 20, loadKg: 55, timeSemantics: 'COMPLETION_TIME_CAP' } });
  });

  it('PQ-09: DURATION + LOAD (FARMER_CARRY) and a goal-time TIME (SPRINT_10M): the pair is kept; an actual time is never a goal or cap', async () => {
    await perform(p1, [ex('FARMER_CARRY', rx(2, 30, 16)), ex('SPRINT_10M', rx(2, 2.5, null, { timeSemantics: 'PERFORMANCE_GOAL_TIME' }))], [[{ DURATION_S: 30, LOAD_KG: 16 }, { DURATION_S: 26, LOAD_KG: 16 }], [{ TIME_S: 2.41 }, { TIME_S: 2.7 }]]);
    const carry = (await findPreviousPerformance(db, p1, q('FARMER_CARRY', 'DURATION')))!;
    expect(useActualPerformance(carry, { type: 'DURATION', comparison: null, usesLoad: true, distanceM: null })).toMatchObject({ ok: true, prescription: { sets: 2, target: 26, loadKg: 16 } });
    const sprint = (await findPreviousPerformance(db, p1, q('SPRINT_10M', 'TIME')))!;
    expect(sprint.previousPlan).toMatchObject({ target: 2.5, timeSemantics: 'PERFORMANCE_GOAL_TIME' });
    expect(useActualPerformance(sprint, { type: 'TIME', comparison: null, usesLoad: false, distanceM: 10 })).toEqual({ ok: false, reason: 'TIMED_RESULT_NOT_A_GOAL' });
  });

  it('PQ-10: MADE / ATTEMPTS keeps the pair intact and is display-only', async () => {
    await perform(p1, [ex('FREE_THROWS', rx(2, 10))], [[{ MADE: 7, ATTEMPTS: 10 }, { MADE: 8, ATTEMPTS: 10 }]]);
    const dto = (await findPreviousPerformance(db, p1, q('FREE_THROWS', 'MADE_ATTEMPTS')))!;
    expect(dto.sets.map((s) => s.values.map((v) => [v.kind, v.finalValue]))).toEqual([[['ATTEMPTS', 10], ['MADE', 7]], [['ATTEMPTS', 10], ['MADE', 8]]]);
    expect(useActualPerformance(dto, { type: 'MADE_ATTEMPTS', comparison: null, usesLoad: false, distanceM: null })).toEqual({ ok: false, reason: 'UNSUPPORTED_MEASUREMENT' });
  });

  it('PQ-11: a batch answers several exercises in one pass and returns null where there is nothing', async () => {
    await perform(p1, [ex(BENCH, rx(1, 5, 20)), ex('PUSH_UP', rx(1, 10))], [[rl(5, 20)], [{ REPETITIONS: 10 }]]);
    const res = await findPreviousPerformances(db, p1, [q(BENCH, 'REPETITIONS'), q('PUSH_UP', 'REPETITIONS'), q('PLANK', 'DURATION'), q(BENCH, 'REPETITIONS')]);
    expect([...res.keys()].sort()).toEqual([performanceKey(q(BENCH, 'REPETITIONS')), performanceKey(q('PLANK', 'DURATION')), performanceKey(q('PUSH_UP', 'REPETITIONS'))].sort());
    expect(res.get(performanceKey(q('PLANK', 'DURATION')))).toBeNull();
    expect(res.get(performanceKey(q(BENCH, 'REPETITIONS')))).not.toBeNull();
  });
});

describe('the lookup and the baselines never write (PQ-12…)', () => {
  it('PQ-12: reading and computing baselines performs no write statement and leaves every table byte-for-byte identical', async () => {
    await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(8, 40), { extra: rl(5, 40) }]]);
    const before = await dump();
    const readOnly = {
      runAsync: async () => {
        throw new Error('a write was attempted by the history lookup');
      },
      getFirstAsync: db.getFirstAsync.bind(db),
      getAllAsync: db.getAllAsync.bind(db),
      withTransactionAsync: async () => {
        throw new Error('a transaction was opened by the history lookup');
      },
    };
    const dto = (await findPreviousPerformance(readOnly as never, p1, q(BENCH, 'REPETITIONS')))!;
    const m = { type: 'REPETITIONS' as const, comparison: null, usesLoad: true, distanceM: null };
    repeatPlan(dto, m);
    useActualPerformance(dto, m);
    expect(await dump()).toBe(before);
  });

  it('PQ-13: a NEW plan made from the baseline is a new PlannedWorkout; the old plan, its session and results are untouched', async () => {
    const old = await perform(p1, [ex(BENCH, rx(3, 10, 40))], [[rl(10, 40), rl(10, 40), rl(8, 40)]]);
    const before = await dump();
    const dto = (await findPreviousPerformance(db, p1, q(BENCH, 'REPETITIONS')))!;
    const r = useActualPerformance(dto, { type: 'REPETITIONS', comparison: null, usesLoad: true, distanceM: null });
    if (!r.ok) throw new Error('baseline');
    const created = await savePlannedWorkout(db, { planId: null, playerId: p1, name: 'Next', entries: [ex(BENCH, r.prescription)] }, deps());
    if (!created.ok) throw new Error('save');
    expect(created.plan.id).not.toBe(old.planId);
    const after = JSON.parse(await dump()) as unknown[][];
    const was = JSON.parse(before) as unknown[][];
    // every pre-existing row of every table is unchanged; only the new plan (and its item) were added
    for (const [i, rows] of was.entries()) expect(after[i]!.slice(0, rows.length)).toEqual(rows);
    expect(after[0]!.length).toBe(was[0]!.length + 1);
    expect(after[1]!.length).toBe(was[1]!.length + 1);
    expect(after[2]!.length).toBe(was[2]!.length); // no new session
    expect(created.plan.items[0]!.prescription).toMatchObject({ sets: 3, target: 8, loadKg: 40 });
  });
});
