import type { ExerciseMeasurement } from '../../exercise/exercise';
import {
  lastPerformance,
  performanceFromSession,
  repeatPlan,
  useActualPerformance,
  type PerformanceExercise,
  type PerformanceSession,
  type PerformanceSet,
} from '../previousPerformance';
import type { MeasurementKind, SessionPurpose, SessionStatus, SetStatus } from '../training';

/** TRAINING-PROGRESSION-001 P0 — the pure selector, the DTO and both baseline functions. */
const REPS: ExerciseMeasurement = { type: 'REPETITIONS', comparison: null, usesLoad: false, distanceM: null };
const REPS_LOAD: ExerciseMeasurement = { ...REPS, usesLoad: true };
const DURATION: ExerciseMeasurement = { type: 'DURATION', comparison: null, usesLoad: false, distanceM: null };
const DURATION_LOAD: ExerciseMeasurement = { ...DURATION, usesLoad: true };
const TIME: ExerciseMeasurement = { type: 'TIME', comparison: null, usesLoad: false, distanceM: null };
const TIME_LOAD: ExerciseMeasurement = { ...TIME, usesLoad: true };
const DISTANCE: ExerciseMeasurement = { type: 'DISTANCE', comparison: null, usesLoad: false, distanceM: null };
const MADE: ExerciseMeasurement = { type: 'MADE_ATTEMPTS', comparison: null, usesLoad: false, distanceM: null };

type V = Partial<Record<MeasurementKind, number>>;
const set = (n: number, status: SetStatus, values: V = {}, o: { planned?: boolean; target?: number | null; load?: number | null; edited?: Partial<Record<MeasurementKind, number>> } = {}): PerformanceSet => ({
  setNumber: n,
  planned: o.planned ?? true,
  plannedTarget: o.planned === false ? null : o.target === undefined ? 10 : o.target,
  plannedLoadKg: o.planned === false ? null : o.load === undefined ? null : o.load,
  status,
  measurements: Object.entries(values).map(([kind, v]) => ({ kind: kind as MeasurementKind, finalValue: v!, measuredValue: o.edited?.[kind as MeasurementKind] ?? v!, wasEdited: o.edited?.[kind as MeasurementKind] !== undefined })),
});
const ex = (id: string, m: ExerciseMeasurement, sets: PerformanceSet[], position = 0, o: { rest?: number | null; semantics?: PerformanceExercise['timeSemantics'] } = {}): PerformanceExercise => ({
  position,
  exercise: { exerciseId: id, measurement: m },
  restSec: o.rest === undefined ? 60 : o.rest,
  ...(o.semantics ? { timeSemantics: o.semantics } : {}),
  sets,
});
let n = 0;
const session = (exercises: PerformanceExercise[], o: { player?: string; status?: SessionStatus; purpose?: SessionPurpose; at?: number; name?: string } = {}): PerformanceSession => ({
  id: `s${String(n++).padStart(3, '0')}`,
  playerId: o.player ?? 'p1',
  plannedWorkoutId: 'plan',
  name: o.name ?? 'Upper',
  purpose: o.purpose ?? 'TRAINING',
  status: o.status ?? 'COMPLETED',
  startedAt: o.at ?? 1000,
  exercises,
});
const bench = (sets: PerformanceSet[], o: Parameters<typeof ex>[4] = {}, position = 0) => ex('BENCH', REPS_LOAD, sets, position, o);
const rep = (v: number) => ({ REPETITIONS: v });
const repLoad = (v: number, l: number) => ({ REPETITIONS: v, LOAD_KG: l });

describe('selector: Last Performance (PP-SEL)', () => {
  const done3 = () => [set(1, 'DONE', repLoad(10, 40), { load: 40 }), set(2, 'DONE', repLoad(10, 40), { load: 40 }), set(3, 'DONE', repLoad(8, 40), { load: 40 })];

  it('newest eligible COMPLETED / PARTIAL TRAINING occurrence of the same Player wins; older ones are not used', () => {
    const old = session([bench(done3())], { at: 1000, name: 'Old' });
    const recent = session([bench([set(1, 'DONE', repLoad(12, 50), { load: 50 })])], { at: 2000, name: 'Recent', status: 'PARTIAL' });
    const found = lastPerformance([old, recent], 'p1', 'BENCH', 'REPETITIONS');
    expect([found?.sessionName, found?.sessionStatus]).toEqual(['Recent', 'PARTIAL']);
  });

  it("another Player's performance is never selected (PP-SEL-02)", () => {
    const theirs = session([bench(done3())], { player: 'p2', at: 5000 });
    const mine = session([bench([set(1, 'DONE', repLoad(5, 20), { load: 20 })])], { player: 'p1', at: 1000 });
    expect(lastPerformance([theirs, mine], 'p1', 'BENCH', 'REPETITIONS')?.sessionId).toBe(mine.id);
    expect(lastPerformance([theirs], 'p1', 'BENCH', 'REPETITIONS')).toBeNull();
  });

  it.each([
    ['IN_PROGRESS', { status: 'IN_PROGRESS' as const }],
    ['ABANDONED', { status: 'ABANDONED' as const }],
    ['BASELINE', { purpose: 'BASELINE' as const }],
    ['REASSESSMENT', { purpose: 'REASSESSMENT' as const }],
  ])('a %s session is never eligible and the search continues backwards', (_label, o) => {
    const older = session([bench(done3())], { at: 1000, name: 'Eligible' });
    const newer = session([bench(done3())], { at: 2000, ...o });
    expect(lastPerformance([older, newer], 'p1', 'BENCH', 'REPETITIONS')?.sessionName).toBe('Eligible');
    expect(lastPerformance([newer], 'p1', 'BENCH', 'REPETITIONS')).toBeNull();
  });

  it('skipped-only, pending-only and extra-only occurrences are not eligible; the previous eligible one is used', () => {
    const eligible = session([bench(done3())], { at: 1000, name: 'Eligible' });
    const skipped = session([bench([set(1, 'SKIPPED'), set(2, 'SKIPPED')])], { at: 2000 });
    const pending = session([bench([set(1, 'PENDING'), set(2, 'PENDING')])], { at: 3000, status: 'PARTIAL' });
    const extraOnly = session([bench([set(1, 'SKIPPED'), set(2, 'DONE', repLoad(10, 40), { planned: false })])], { at: 4000, status: 'PARTIAL' });
    expect(lastPerformance([eligible, skipped, pending, extraOnly], 'p1', 'BENCH', 'REPETITIONS')?.sessionName).toBe('Eligible');
    expect(lastPerformance([skipped, pending, extraOnly], 'p1', 'BENCH', 'REPETITIONS')).toBeNull();
  });

  it('matches by exercise id and compatible measurement type, never by name; an incompatible type is skipped, not converted', () => {
    const asDuration = session([ex('BENCH', DURATION, [set(1, 'DONE', { DURATION_S: 30 })])], { at: 2000 });
    const asReps = session([bench(done3())], { at: 1000, name: 'Reps' });
    expect(lastPerformance([asReps, asDuration], 'p1', 'BENCH', 'REPETITIONS')?.sessionName).toBe('Reps');
    expect(lastPerformance([asDuration], 'p1', 'BENCH', 'REPETITIONS')).toBeNull();
    expect(lastPerformance([asReps], 'p1', 'OTHER', 'REPETITIONS')).toBeNull();
  });

  it('with the same exercise twice in one session the occurrence with the most DONE PLANNED sets wins; extras do not count; a tie goes to the later position', () => {
    const warm = bench([set(1, 'DONE', repLoad(10, 20), { load: 20 })], {}, 0);
    const main = bench([set(1, 'DONE', repLoad(8, 40), { load: 40 }), set(2, 'DONE', repLoad(8, 40), { load: 40 })], {}, 3);
    expect(performanceFromSession(session([warm, main]), 'BENCH', 'REPETITIONS')).toMatchObject({ occurrencesInSession: 2, previousPlan: { sets: 2 } });
    const extras = bench([set(1, 'DONE', repLoad(10, 20), { load: 20 }), set(2, 'DONE', repLoad(1, 1), { planned: false }), set(3, 'DONE', repLoad(1, 1), { planned: false }), set(4, 'DONE', repLoad(1, 1), { planned: false })], {}, 0);
    expect(performanceFromSession(session([extras, main]), 'BENCH', 'REPETITIONS')?.previousPlan.sets).toBe(2); // 1 DONE planned (+3 extras) < 2
    const a = bench([set(1, 'DONE', repLoad(10, 20), { load: 20 })], {}, 1);
    const b = bench([set(1, 'DONE', repLoad(9, 25), { load: 25 })], {}, 4);
    const tie = performanceFromSession(session([a, b]), 'BENCH', 'REPETITIONS')!;
    expect(tie.sets[0]!.values.find((v) => v.kind === 'REPETITIONS')!.finalValue).toBe(9); // the later position
  });

  it('ties between sessions started at the same time are broken by id, newest first (deterministic)', () => {
    const a = session([bench(done3())], { at: 1000, name: 'A' });
    const b = session([bench(done3())], { at: 1000, name: 'B' });
    const first = lastPerformance([a, b], 'p1', 'BENCH', 'REPETITIONS');
    const second = lastPerformance([b, a], 'p1', 'BENCH', 'REPETITIONS');
    expect(first?.sessionId).toBe(second?.sessionId);
  });
});

describe('DTO: planned and actual stay separate (PP-DTO)', () => {
  const s = session([bench([set(1, 'DONE', repLoad(10, 42.5), { load: 40 }), set(2, 'SKIPPED', {}, { load: 40 }), set(3, 'PENDING', {}, { load: 40 }), set(4, 'DONE', repLoad(6, 40), { planned: false })], { rest: 90 })], { name: 'Push day', at: 7777 });
  const dto = performanceFromSession(s, 'BENCH', 'REPETITIONS')!;

  it('carries the context, the previous PLAN (3 planned sets, 40 kg, rest 90) and the ACTUAL history separately', () => {
    expect(dto).toMatchObject({ sessionName: 'Push day', startedAt: 7777, plannedWorkoutId: 'plan', exerciseId: 'BENCH', measurementType: 'REPETITIONS', usesLoad: true });
    expect(dto.previousPlan).toEqual({ sets: 3, target: 10, loadKg: 40, restSec: 90, timeSemantics: null, uniform: true });
    expect(dto.sets.map((x) => [x.setNumber, x.planned, x.status])).toEqual([[1, true, 'DONE'], [2, true, 'SKIPPED'], [3, true, 'PENDING'], [4, false, 'DONE']]);
    expect(dto.sets[0]!.values).toEqual([
      { kind: 'REPETITIONS', finalValue: 10, measuredValue: 10, edited: false },
      { kind: 'LOAD_KG', finalValue: 42.5, measuredValue: 42.5, edited: false },
    ]);
    expect(dto.previousPlan.loadKg).not.toBe(dto.sets[0]!.values[1]!.finalValue); // the planned 40 is not the actual 42.5
  });

  it('a skipped or pending set carries no value at all (nothing is fabricated)', () => {
    expect(dto.sets[1]!.values).toEqual([]);
    expect(dto.sets[2]!.values).toEqual([]);
  });

  it('an edited value exposes the FINAL value and the original measurement', () => {
    const edited = performanceFromSession(session([ex('PUSH', REPS, [set(1, 'DONE', rep(9), { edited: { REPETITIONS: 8 } })])]), 'PUSH', 'REPETITIONS')!;
    expect(edited.sets[0]!.values[0]).toEqual({ kind: 'REPETITIONS', finalValue: 9, measuredValue: 8, edited: true });
  });

  it('planned sets that disagree make the plan non-uniform (not representable)', () => {
    const odd = performanceFromSession(session([ex('PUSH', REPS, [set(1, 'DONE', rep(10), { target: 10 }), set(2, 'DONE', rep(8), { target: 8 })])]), 'PUSH', 'REPETITIONS')!;
    expect(odd.previousPlan).toMatchObject({ uniform: false, target: null, loadKg: null, sets: 2 });
  });
});

describe('Repeat last plan copies ONLY the previous plan (PP-REP)', () => {
  const dto = performanceFromSession(session([bench([set(1, 'DONE', repLoad(10, 42.5), { load: 40 }), set(2, 'DONE', repLoad(10, 42.5), { load: 40 }), set(3, 'SKIPPED', {}, { load: 40 }), set(4, 'DONE', repLoad(9, 99), { planned: false })], { rest: 90 })]), 'BENCH', 'REPETITIONS')!;

  it('sets, target, load and rest come from the plan; no actual value is used (42.5 / 99 never appear)', () => {
    expect(repeatPlan(dto, REPS_LOAD)).toEqual({ ok: true, prescription: { sets: 3, target: 10, loadKg: 40, restSec: 90, timeSemantics: null } });
  });

  it('a field the exercise no longer supports is dropped through the existing adaptation (never invented)', () => {
    expect(repeatPlan(dto, REPS)).toEqual({ ok: true, prescription: { sets: 3, target: 10, loadKg: null, restSec: 90, timeSemantics: null } });
  });

  it('is DISABLED when the previous planned sets disagreed; nothing is normalised', () => {
    const odd = performanceFromSession(session([ex('PUSH', REPS, [set(1, 'DONE', rep(10), { target: 10 }), set(2, 'DONE', rep(8), { target: 8 })])]), 'PUSH', 'REPETITIONS')!;
    expect(repeatPlan(odd, REPS)).toEqual({ ok: false, reason: 'NON_UNIFORM_PLAN' });
  });

  it('copies rest and the time semantics: a cap stays a cap, a goal stays a goal, legacy stays legacy', () => {
    const mk = (semantics?: 'COMPLETION_TIME_CAP' | 'PERFORMANCE_GOAL_TIME') =>
      performanceFromSession(session([ex('SPRINT', TIME, [set(1, 'DONE', { TIME_S: 16.2 }, { target: 15 }), set(2, 'DONE', { TIME_S: 12.41 }, { target: 15 })], 0, { rest: 120, semantics })]), 'SPRINT', 'TIME')!;
    expect(repeatPlan(mk('COMPLETION_TIME_CAP'), TIME)).toEqual({ ok: true, prescription: { sets: 2, target: 15, loadKg: null, restSec: 120, timeSemantics: 'COMPLETION_TIME_CAP' } });
    expect(repeatPlan(mk('PERFORMANCE_GOAL_TIME'), TIME)).toMatchObject({ prescription: { target: 15, timeSemantics: 'PERFORMANCE_GOAL_TIME' } });
    expect(repeatPlan(mk(), TIME)).toMatchObject({ prescription: { target: 15, timeSemantics: null } });
  });
});

describe('Use last performance as baseline (PP-USE)', () => {
  const dtoOf = (sets: PerformanceSet[], m: ExerciseMeasurement = REPS, o: Parameters<typeof ex>[4] = {}) => performanceFromSession(session([ex('X', m, sets, 0, o)]), 'X', m.type)!;

  it('10 / 10 / 8 reps -> 3 x 8 (the minimum); the extra set is history only', () => {
    const dto = dtoOf([set(1, 'DONE', rep(10)), set(2, 'DONE', rep(10)), set(3, 'DONE', rep(8)), set(4, 'DONE', rep(3), { planned: false })]);
    expect(useActualPerformance(dto, REPS)).toEqual({ ok: true, prescription: { sets: 3, target: 8, loadKg: null, restSec: 60, timeSemantics: null } });
  });

  it('a skipped / pending set contributes nothing: no zero, no planned target; the set count stays the planned 4', () => {
    const dto = dtoOf([set(1, 'DONE', rep(10)), set(2, 'SKIPPED'), set(3, 'PENDING'), set(4, 'DONE', rep(9))]);
    expect(useActualPerformance(dto, REPS)).toMatchObject({ ok: true, prescription: { sets: 4, target: 9 } });
  });

  it('DURATION: the minimum duration; FINAL (edited) values are used', () => {
    const dto = dtoOf([set(1, 'DONE', { DURATION_S: 30 }), set(2, 'DONE', { DURATION_S: 28.4 }, { edited: { DURATION_S: 27 } })], DURATION, { rest: 45 });
    expect(useActualPerformance(dto, DURATION)).toEqual({ ok: true, prescription: { sets: 2, target: 28.4, loadKg: null, restSec: 45, timeSemantics: null } });
  });

  it('REPETITIONS + LOAD: the same actual load on every DONE set -> minimum reps at that load', () => {
    const dto = dtoOf([set(1, 'DONE', repLoad(10, 40), { load: 40 }), set(2, 'DONE', repLoad(10, 40), { load: 40 }), set(3, 'DONE', repLoad(8, 40), { load: 40 })], REPS_LOAD);
    expect(useActualPerformance(dto, REPS_LOAD)).toMatchObject({ ok: true, prescription: { sets: 3, target: 8, loadKg: 40 } });
  });

  it('different actual loads: ONE real set supplies BOTH values (never min reps with min load from other sets)', () => {
    const dto = dtoOf([set(1, 'DONE', repLoad(12, 30), { load: 40 }), set(2, 'DONE', repLoad(10, 40), { load: 40 }), set(3, 'DONE', repLoad(8, 50), { load: 40 })], REPS_LOAD);
    const r = useActualPerformance(dto, REPS_LOAD);
    expect(r).toMatchObject({ ok: true, prescription: { target: 8, loadKg: 50 } }); // the real tuple 8 @ 50, not 8 @ 30
    expect(r.ok && r.prescription.loadKg).not.toBe(30);
  });

  it('a tie on the minimum result goes to the LATER set', () => {
    const dto = dtoOf([set(1, 'DONE', repLoad(8, 30), { load: 40 }), set(2, 'DONE', repLoad(8, 45), { load: 40 }), set(3, 'DONE', repLoad(10, 50), { load: 40 })], REPS_LOAD);
    expect(useActualPerformance(dto, REPS_LOAD)).toMatchObject({ prescription: { target: 8, loadKg: 45 } });
  });

  it('if the selected set has no actual load the load stays EMPTY (the planned load is never substituted)', () => {
    const dto = dtoOf([set(1, 'DONE', repLoad(10, 40), { load: 40 }), set(2, 'DONE', rep(8), { load: 40 })], REPS_LOAD);
    expect(useActualPerformance(dto, REPS_LOAD)).toMatchObject({ ok: true, prescription: { target: 8, loadKg: null } });
  });

  it('DURATION + LOAD (FARMER_CARRY) keeps the pair; the duration is not dropped', () => {
    const dto = dtoOf([set(1, 'DONE', { DURATION_S: 30, LOAD_KG: 16 }, { load: 16 }), set(2, 'DONE', { DURATION_S: 25, LOAD_KG: 16 }, { load: 16 })], DURATION_LOAD);
    expect(useActualPerformance(dto, DURATION_LOAD)).toMatchObject({ ok: true, prescription: { sets: 2, target: 25, loadKg: 16 } });
  });

  it('TIME + LOAD (SLED_PUSH): only the actual LOAD is used (the minimum); the target and its meaning stay as planned; the time is display-only', () => {
    const dto = dtoOf([set(1, 'DONE', { TIME_S: 6.12, LOAD_KG: 60 }, { target: 20, load: 50 }), set(2, 'DONE', { TIME_S: 7.5, LOAD_KG: 55 }, { target: 20, load: 50 })], TIME_LOAD, { semantics: 'COMPLETION_TIME_CAP' });
    const r = useActualPerformance(dto, TIME_LOAD);
    expect(r).toEqual({ ok: true, prescription: { sets: 2, target: 20, loadKg: 55, restSec: 60, timeSemantics: 'COMPLETION_TIME_CAP' } });
  });

  it('TIME without a load: an actual time never becomes a goal or a cap -> disabled', () => {
    const dto = dtoOf([set(1, 'DONE', { TIME_S: 16.2 }, { target: 15 })], TIME, { semantics: 'COMPLETION_TIME_CAP' });
    expect(useActualPerformance(dto, TIME)).toEqual({ ok: false, reason: 'TIMED_RESULT_NOT_A_GOAL' });
    // the actual stays in the history, the cap in the plan
    expect(dto.sets[0]!.values[0]!.finalValue).toBe(16.2);
    expect(repeatPlan(dto, TIME)).toMatchObject({ prescription: { target: 15, timeSemantics: 'COMPLETION_TIME_CAP' } });
  });

  it.each([
    ['DISTANCE', DISTANCE, { DISTANCE_M: 40 }],
    ['MADE_ATTEMPTS', MADE, { MADE: 7, ATTEMPTS: 10 }],
  ])('%s is display-only: no actual baseline (Repeat still works)', (_n, m, v) => {
    const dto = dtoOf([set(1, 'DONE', v, { target: 10 })], m);
    expect(useActualPerformance(dto, m)).toEqual({ ok: false, reason: 'UNSUPPORTED_MEASUREMENT' });
    expect(repeatPlan(dto, m)).toMatchObject({ ok: true });
    expect(dto.sets[0]!.values.map((x) => x.kind).sort()).toEqual(Object.keys(v).sort()); // a made / attempts pair is kept intact
  });

  it('a result that cannot be a target (0 reps) is refused, not silently dropped', () => {
    const dto = dtoOf([set(1, 'DONE', rep(0))]);
    expect(useActualPerformance(dto, REPS)).toEqual({ ok: false, reason: 'NOT_APPLICABLE_NOW' });
  });

  it('is pure: applying either function never changes the DTO', () => {
    const dto = dtoOf([set(1, 'DONE', repLoad(10, 40), { load: 40 })], REPS_LOAD);
    const before = JSON.stringify(dto);
    repeatPlan(dto, REPS_LOAD);
    useActualPerformance(dto, REPS_LOAD);
    expect(JSON.stringify(dto)).toBe(before);
  });
});
