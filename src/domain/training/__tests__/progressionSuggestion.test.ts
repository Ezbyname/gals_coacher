import type { ExerciseMeasurement } from '../../exercise/exercise';
import { performanceFromSession, type PerformanceExercise, type PerformanceSet, type PreviousExercisePerformance } from '../previousPerformance';
import { loadStepKg, suggestProgression, STALE_AFTER_DAYS, type ProgressionSuggestion } from '../progressionSuggestion';
import type { MeasurementKind, SetStatus } from '../training';

/** TRAINING-PROGRESSION-002 S0 — the pure engine. DTOs are built through 001's own selector from real-shaped sessions. */
const REPS: ExerciseMeasurement = { type: 'REPETITIONS', comparison: null, usesLoad: false, distanceM: null };
const REPS_LOAD: ExerciseMeasurement = { ...REPS, usesLoad: true };
const TIME: ExerciseMeasurement = { type: 'TIME', comparison: null, usesLoad: false, distanceM: null };
const TIME_LOAD: ExerciseMeasurement = { ...TIME, usesLoad: true };
const HOLD: ExerciseMeasurement = { type: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: false, distanceM: null };
const HOLD_LOAD: ExerciseMeasurement = { ...HOLD, usesLoad: true };
const DOSE: ExerciseMeasurement = { type: 'DURATION', comparison: 'LOWER_IS_BETTER', usesLoad: false, distanceM: null };
const UNDECLARED: ExerciseMeasurement = { type: 'DURATION', comparison: null, usesLoad: false, distanceM: null };
const DISTANCE: ExerciseMeasurement = { type: 'DISTANCE', comparison: 'HIGHER_IS_BETTER', usesLoad: false, distanceM: null };
const MADE: ExerciseMeasurement = { type: 'MADE_ATTEMPTS', comparison: null, usesLoad: false, distanceM: null };
const RATING: ExerciseMeasurement = { type: 'RATING', comparison: 'HIGHER_IS_BETTER', usesLoad: false, distanceM: null };
const COMPLETION: ExerciseMeasurement = { type: 'COMPLETION', comparison: null, usesLoad: false, distanceM: null };

const DAY = 86_400_000;
const NOW = 100 * DAY;
type V = Partial<Record<MeasurementKind, number>>;
const set = (n: number, status: SetStatus, values: V = {}, o: { planned?: boolean; target?: number | null; load?: number | null; edited?: Partial<Record<MeasurementKind, number>> } = {}): PerformanceSet => ({
  setNumber: n,
  planned: o.planned ?? true,
  plannedTarget: o.planned === false ? null : o.target === undefined ? 10 : o.target,
  plannedLoadKg: o.planned === false ? null : o.load === undefined ? null : o.load,
  status,
  measurements: Object.entries(values).map(([kind, v]) => ({ kind: kind as MeasurementKind, finalValue: v!, measuredValue: o.edited?.[kind as MeasurementKind] ?? v!, wasEdited: o.edited?.[kind as MeasurementKind] !== undefined })),
});
let n = 0;
/** One eligible occurrence of exercise X, `daysAgo` before NOW. */
function occ(m: ExerciseMeasurement, sets: PerformanceSet[], daysAgo = 3, o: { semantics?: PerformanceExercise['timeSemantics']; status?: 'COMPLETED' | 'PARTIAL'; rest?: number } = {}): PreviousExercisePerformance {
  const e: PerformanceExercise = { position: 0, exercise: { exerciseId: 'X', measurement: m }, restSec: o.rest ?? 90, ...(o.semantics ? { timeSemantics: o.semantics } : {}), sets };
  const dto = performanceFromSession(
    { id: `s${String(n++).padStart(3, '0')}`, playerId: 'p1', plannedWorkoutId: 'plan', name: 'W', purpose: 'TRAINING', status: o.status ?? 'COMPLETED', startedAt: NOW - daysAgo * DAY, exercises: [e] },
    'X',
    m.type,
  );
  if (!dto) throw new Error('fixture is not an eligible occurrence');
  return dto;
}
const run = (current: ExerciseMeasurement, occurrences: PreviousExercisePerformance[], extra: { nowMs?: number; staleAfterDays?: number } = {}): ProgressionSuggestion =>
  suggestProgression({ occurrences, current, nowMs: extra.nowMs ?? NOW, staleAfterDays: extra.staleAfterDays ?? STALE_AFTER_DAYS });
const reason = (s: ProgressionSuggestion) => (s.status === 'NO_SUGGESTION' ? s.reasonCode : `SUGGESTION:${s.changedField}=${s.suggestedValue}`);

/** 3 x 10 @ 40: every set DONE with the given reps (and load). */
const bench = (reps: number[], load = 40, o: { target?: number; planLoad?: number } = {}) =>
  reps.map((r, i) => set(i + 1, 'DONE', { REPETITIONS: r, LOAD_KG: load }, { target: o.target ?? 10, load: o.planLoad ?? 40 }));
const benchOcc = (reps: number[], days = 3, load = 40, o: { target?: number; planLoad?: number } = {}) => occ(REPS_LOAD, bench(reps, load, o), days);

describe('REPETITIONS + LOAD needs TWO comparable workouts (PS-RL)', () => {
  it("PS-RL-01: the owner's example: 3 x 10 @ 40, two qualifying workouts -> Consider 42.5 kg", () => {
    const s = run(REPS_LOAD, [benchOcc([11, 10, 10], 3), benchOcc([10, 10, 10], 10)]);
    expect(s).toMatchObject({ status: 'SUGGESTION', changedField: 'load', currentValue: 40, suggestedValue: 42.5, reasonCode: 'REPS_LOAD_TWO_WORKOUTS', workouts: 2 });
    if (s.status !== 'SUGGESTION') throw new Error();
    expect(s.prescription).toEqual({ sets: 3, target: 10, loadKg: 42.5, restSec: 90, timeSemantics: null });
    expect(s.evidence.occurrences).toHaveLength(2);
  });
  it('PS-RL-02: ONE qualifying workout alone is INSUFFICIENT_EVIDENCE (no fall back to one occurrence)', () => {
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10])]))).toBe('INSUFFICIENT_EVIDENCE');
    expect(reason(run(REPS_LOAD, []))).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('PS-RL-03: the second workout has a different planned load / target / set count -> EVIDENCE_NOT_COMPARABLE', () => {
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 3, 42.5, { planLoad: 42.5 }), benchOcc([10, 10, 10], 10)]))).toBe('EVIDENCE_NOT_COMPARABLE');
    expect(reason(run(REPS_LOAD, [benchOcc([8, 8, 8], 3, 40, { target: 8 }), benchOcc([10, 10, 10], 10)]))).toBe('EVIDENCE_NOT_COMPARABLE');
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10], 3), benchOcc([10, 10, 10], 10)]))).toBe('EVIDENCE_NOT_COMPARABLE');
  });
  it('PS-RL-04: any workout that misses one set -> TARGET_NOT_MET, whichever of the two it is', () => {
    expect(reason(run(REPS_LOAD, [benchOcc([10, 9, 10], 3), benchOcc([10, 10, 10], 10)]))).toBe('TARGET_NOT_MET');
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 3), benchOcc([10, 10, 9], 10)]))).toBe('TARGET_NOT_MET');
  });
  it('PS-RL-05: a skipped or pending planned set invalidates its workout (SETS_NOT_COMPLETE); skipped is never 0 or success', () => {
    const skipped = occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 }), set(2, 'SKIPPED', {}, { load: 40 }), set(3, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 })], 3);
    const pending = occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 }), set(2, 'PENDING', {}, { load: 40 })], 3, { status: 'PARTIAL' });
    expect(reason(run(REPS_LOAD, [skipped, benchOcc([10, 10, 10], 10)]))).toBe('SETS_NOT_COMPLETE');
    expect(reason(run(REPS_LOAD, [pending, benchOcc([10, 10, 10], 10)]))).toBe('SETS_NOT_COMPLETE');
  });
  it('PS-RL-06: the actual load differs from the plan, or varies between sets -> ACTUAL_DIFFERS_FROM_PLAN', () => {
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 3, 45), benchOcc([10, 10, 10], 10)]))).toBe('ACTUAL_DIFFERS_FROM_PLAN');
    const varying = occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 12, LOAD_KG: 30 }, { load: 40 }), set(2, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 }), set(3, 'DONE', { REPETITIONS: 10, LOAD_KG: 50 }, { load: 40 })], 3);
    expect(reason(run(REPS_LOAD, [varying, benchOcc([10, 10, 10], 10)]))).toBe('ACTUAL_DIFFERS_FROM_PLAN');
  });
  it('PS-RL-07: extra sets are ignored: neither evidence nor a blocker nor a higher set count', () => {
    const withExtra = (days: number) => occ(REPS_LOAD, [...bench([10, 10, 10]), set(4, 'DONE', { REPETITIONS: 3, LOAD_KG: 10 }, { planned: false })], days);
    const s = run(REPS_LOAD, [withExtra(3), withExtra(10)]);
    expect(s).toMatchObject({ status: 'SUGGESTION', suggestedValue: 42.5 });
    if (s.status === 'SUGGESTION') expect(s.prescription.sets).toBe(3);
    // an extra set cannot stand in for a missing planned one
    const missing = occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 }), set(2, 'SKIPPED', {}, { load: 40 }), set(3, 'DONE', { REPETITIONS: 12, LOAD_KG: 40 }, { planned: false })], 3);
    expect(reason(run(REPS_LOAD, [missing, benchOcc([10, 10, 10], 10)]))).toBe('SETS_NOT_COMPLETE');
  });
  it('PS-RL-08: no target / no load / non-uniform plan', () => {
    const noTarget = (d: number) => occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { target: null, load: 40 })], d);
    expect(reason(run(REPS_LOAD, [noTarget(3), noTarget(10)]))).toBe('NO_TARGET');
    const noLoad = (d: number) => occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 10 }, { target: 10, load: null })], d);
    expect(reason(run(REPS_LOAD, [noLoad(3), noLoad(10)]))).toBe('NO_LOAD');
    const mixed = occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { target: 10, load: 40 }), set(2, 'DONE', { REPETITIONS: 10, LOAD_KG: 42.5 }, { target: 10, load: 42.5 })], 3);
    expect(reason(run(REPS_LOAD, [mixed, benchOcc([10, 10, 10], 10)]))).toBe('NON_UNIFORM_PLAN');
  });
  it('PS-RL-09: an edited result counts by its FINAL value (the measured one is ignored)', () => {
    const edited = occ(
      REPS_LOAD,
      [
        set(1, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40, edited: { REPETITIONS: 7 } }),
        set(2, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 }),
        set(3, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 }),
      ],
      3,
    );
    expect(reason(run(REPS_LOAD, [edited, benchOcc([10, 10, 10], 10)]))).toBe('SUGGESTION:load=42.5');
    const lowered = occ(REPS_LOAD, [set(1, 'DONE', { REPETITIONS: 9, LOAD_KG: 40 }, { load: 40, edited: { REPETITIONS: 12 } }), set(2, 'DONE', { REPETITIONS: 10, LOAD_KG: 40 }, { load: 40 })], 3);
    expect(reason(run(REPS_LOAD, [lowered, benchOcc([10, 10], 10)]))).toBe('TARGET_NOT_MET');
  });
  it('PS-RL-10: a PARTIAL session is acceptable when the exercise occurrence itself is complete', () => {
    const partial = occ(REPS_LOAD, bench([10, 10, 10]), 3, { status: 'PARTIAL' });
    expect(reason(run(REPS_LOAD, [partial, benchOcc([10, 10, 10], 10)]))).toBe('SUGGESTION:load=42.5');
  });
});

describe('load step table (PS-STEP)', () => {
  it('PS-STEP-01: the product-default boundaries', () => {
    expect([0.5, 9.5, 9.99].map(loadStepKg)).toEqual([0.5, 0.5, 0.5]);
    expect([10, 19.5].map(loadStepKg)).toEqual([1, 1]);
    expect([20, 40, 99.5].map(loadStepKg)).toEqual([2.5, 2.5, 2.5]);
    expect([100, 250].map(loadStepKg)).toEqual([5, 5]);
  });
  it.each([
    [5, 5.5],
    [9.5, 10],
    [10, 11],
    [19, 20],
    [20, 22.5],
    [97.5, 100],
    [100, 105],
    [0.5, 1],
  ])('PS-STEP-02: planned %s kg -> %s kg', (load, expected) => {
    const two = [benchOcc([10, 10, 10], 3, load, { planLoad: load }), benchOcc([10, 10, 10], 10, load, { planLoad: load })];
    expect(reason(run(REPS_LOAD, two))).toBe(`SUGGESTION:load=${expected}`);
  });
  it('PS-STEP-03: a result above the valid limit (1000 kg) is INVALID_SUGGESTION, never clamped', () => {
    const two = [benchOcc([10, 10, 10], 3, 998, { planLoad: 998 }), benchOcc([10, 10, 10], 10, 998, { planLoad: 998 })];
    expect(reason(run(REPS_LOAD, two))).toBe('INVALID_SUGGESTION');
  });
});

describe('REPETITIONS without a load: ONE workout (PS-R)', () => {
  const pushUps = (reps: number[], target: number, days = 3) => occ(REPS, reps.map((r, i) => set(i + 1, 'DONE', { REPETITIONS: r }, { target })), days);
  it.each([
    [8, 9],
    [9, 10],
    [10, 12],
    [20, 22],
    [28, 30],
    [29, 30],
  ])('PS-R-01: target %s -> %s', (target, expected) => {
    const s = run(REPS, [pushUps([target, target + 1, target], target)]);
    expect(reason(s)).toBe(`SUGGESTION:target=${expected}`);
    if (s.status === 'SUGGESTION') expect(s).toMatchObject({ reasonCode: 'REPS_ONE_WORKOUT', workouts: 1 });
  });
  it('PS-R-02: at or above the ceiling of 30 -> AT_CEILING; a missed set -> TARGET_NOT_MET; skipped -> SETS_NOT_COMPLETE', () => {
    expect(reason(run(REPS, [pushUps([30, 30], 30)]))).toBe('AT_CEILING');
    expect(reason(run(REPS, [pushUps([31, 35], 30)]))).toBe('AT_CEILING');
    expect(reason(run(REPS, [pushUps([10, 9], 10)]))).toBe('TARGET_NOT_MET');
    expect(reason(run(REPS, [occ(REPS, [set(1, 'DONE', { REPETITIONS: 10 }), set(2, 'SKIPPED')])]))).toBe('SETS_NOT_COMPLETE');
  });
  it('PS-R-03: the set count never changes', () => {
    const s = run(REPS, [pushUps([10, 10, 10, 10], 10)]);
    if (s.status !== 'SUGGESTION') throw new Error();
    expect(s.prescription).toEqual({ sets: 4, target: 12, loadKg: null, restSec: 90, timeSemantics: null });
  });
});

describe('TIME performance goal: TWO workouts (PS-T)', () => {
  const sprint = (times: number[], goal: number, days: number, semantics?: 'PERFORMANCE_GOAL_TIME' | 'COMPLETION_TIME_CAP') =>
    occ(TIME, times.map((t, i) => set(i + 1, 'DONE', { TIME_S: t }, { target: goal })), days, semantics ? { semantics } : {});
  it('PS-T-01: both workouts met the goal 15 s: the slowest proven time, rounded UP to 0.1 s, if it improves the goal enough', () => {
    const s = run(TIME, [sprint([14.2, 14.5], 15, 3), sprint([14.4, 14.3], 15, 10)]);
    expect(s).toMatchObject({ status: 'SUGGESTION', changedField: 'target', currentValue: 15, suggestedValue: 14.5, reasonCode: 'TIME_GOAL_TWO_WORKOUTS', workouts: 2 });
    const up = run(TIME, [sprint([14.01, 14.2], 15, 3), sprint([14.43, 14.3], 15, 10)]);
    expect(up).toMatchObject({ status: 'SUGGESTION', suggestedValue: 14.5 }); // 14.43 -> 14.5, never 14.4
  });
  it('PS-T-02: noise boundary max(0.1 s, 2%): improvement of exactly 0.1 s on a 4 s goal qualifies, 0.09 s does not; 2% of 15 s = 0.3', () => {
    expect(run(TIME, [sprint([3.9], 4, 3), sprint([3.9], 4, 10)])).toMatchObject({ status: 'SUGGESTION', suggestedValue: 3.9 });
    expect(reason(run(TIME, [sprint([3.91], 4, 3), sprint([3.91], 4, 10)]))).toBe('WITHIN_NOISE');
    expect(reason(run(TIME, [sprint([14.8], 15, 3), sprint([14.8], 15, 10)]))).toBe('WITHIN_NOISE'); // 0.2 < 0.3
    expect(run(TIME, [sprint([14.7], 15, 3), sprint([14.7], 15, 10)])).toMatchObject({ status: 'SUGGESTION', suggestedValue: 14.7 }); // 0.3 >= 0.3
    expect(reason(run(TIME, [sprint([15], 15, 3), sprint([15], 15, 10)]))).toBe('WITHIN_NOISE');
  });
  it('PS-T-03: ONE workout alone is INSUFFICIENT_EVIDENCE; a different goal in the window is EVIDENCE_NOT_COMPARABLE', () => {
    expect(reason(run(TIME, [sprint([14.2], 15, 3)]))).toBe('INSUFFICIENT_EVIDENCE');
    expect(reason(run(TIME, [sprint([13.2], 14, 3), sprint([14.2], 15, 10)]))).toBe('EVIDENCE_NOT_COMPARABLE');
  });
  it('PS-T-04: a MISSED goal (15 s goal, 16.2 s actual) never suggests, and 16.2 is never offered as a goal', () => {
    const s = run(TIME, [sprint([16.2], 15, 3), sprint([14.2], 15, 10)]);
    expect(s).toMatchObject({ status: 'NO_SUGGESTION', reasonCode: 'TARGET_NOT_MET', suggestedValue: null });
    expect(reason(run(TIME, [sprint([14.2], 15, 3), sprint([15.4], 15, 10)]))).toBe('TARGET_NOT_MET');
  });
  it('PS-T-05: a COMPLETION_TIME_CAP is never a goal: CAP_IS_NOT_A_GOAL whatever the actuals', () => {
    expect(reason(run(TIME, [sprint([10], 20, 3, 'COMPLETION_TIME_CAP'), sprint([10], 20, 10, 'COMPLETION_TIME_CAP')]))).toBe('CAP_IS_NOT_A_GOAL');
    expect(reason(run(TIME, []))).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('PS-T-06: TIME with a load (SLED_PUSH) has no rule', () => {
    const sled = (d: number) => occ(TIME_LOAD, [set(1, 'DONE', { TIME_S: 6, LOAD_KG: 50 }, { target: 20, load: 50 })], d);
    expect(reason(run(TIME_LOAD, [sled(3), sled(10)]))).toBe('TIME_WITH_LOAD_NO_RULE');
  });
});

describe('DURATION: only HIGHER_IS_BETTER, ONE workout (PS-D)', () => {
  const hold = (secs: number[], target: number, days = 3, m = HOLD) => occ(m, secs.map((s, i) => set(i + 1, 'DONE', { DURATION_S: s }, { target })), days);
  it.each([
    [30, 35],
    [55, 60],
    [60, 70],
    [170, 180],
    [175, 180],
  ])('PS-D-01: hold target %s s -> %s s', (target, expected) => {
    expect(reason(run(HOLD, [hold([target, target + 5], target)]))).toBe(`SUGGESTION:target=${expected}`);
  });
  it('PS-D-02: at the 180 s ceiling -> AT_CEILING; a short hold -> TARGET_NOT_MET', () => {
    expect(reason(run(HOLD, [hold([180, 185], 180)]))).toBe('AT_CEILING');
    expect(reason(run(HOLD, [hold([30, 29], 30)]))).toBe('TARGET_NOT_MET');
  });
  it('PS-D-03: LOWER_IS_BETTER or undeclared direction is a dose, not a score: NOT_A_PROGRESSION_METRIC', () => {
    expect(reason(run(DOSE, [hold([45], 45, 3, DOSE)]))).toBe('NOT_A_PROGRESSION_METRIC');
    expect(reason(run(UNDECLARED, [hold([45], 45, 3, UNDECLARED)]))).toBe('NOT_A_PROGRESSION_METRIC');
  });
  it('PS-D-04: DURATION with a load has no rule', () => {
    expect(reason(run(HOLD_LOAD, [occ(HOLD_LOAD, [set(1, 'DONE', { DURATION_S: 40, LOAD_KG: 20 }, { target: 30, load: 20 })])]))).toBe('DURATION_WITH_LOAD_NO_RULE');
  });
});

describe('unsupported types, staleness, determinism (PS-X)', () => {
  it.each([
    ['DISTANCE', DISTANCE, { DISTANCE_M: 12 }],
    ['MADE_ATTEMPTS', MADE, { MADE: 7, ATTEMPTS: 10 }],
    ['RATING', RATING, { RATING: 4 }],
    ['COMPLETION', COMPLETION, { COMPLETED: 1 }],
  ] as const)('PS-X-01: %s never suggests', (_name, m, values) => {
    const o = occ(m, [set(1, 'DONE', values as V, { target: m.type === 'RATING' || m.type === 'COMPLETION' ? null : 10 })]);
    expect(reason(run(m, [o, o]))).toBe('UNSUPPORTED_MEASUREMENT');
  });
  it('PS-X-02: stale evidence (> 42 days): the newest, or the older of the two', () => {
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 43), benchOcc([10, 10, 10], 50)]))).toBe('STALE_EVIDENCE');
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 3), benchOcc([10, 10, 10], 43)]))).toBe('STALE_EVIDENCE');
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 3), benchOcc([10, 10, 10], 42)]))).toBe('SUGGESTION:load=42.5'); // exactly 42 days is not stale
    expect(reason(run(REPS_LOAD, [benchOcc([10, 10, 10], 3), benchOcc([10, 10, 10], 43)], { staleAfterDays: 60 }))).toBe('SUGGESTION:load=42.5'); // the limit is an argument
  });
  it('PS-X-03: deterministic and pure: same input, same output; the input is not modified', () => {
    const input = [benchOcc([11, 10, 10], 3), benchOcc([10, 10, 10], 10)];
    const frozen = JSON.stringify(input);
    expect(run(REPS_LOAD, input)).toEqual(run(REPS_LOAD, input));
    expect(JSON.stringify(input)).toBe(frozen);
  });
  it('PS-X-04: a miss is a HOLD, never a decrease', () => {
    const s = run(REPS_LOAD, [benchOcc([6, 5, 4], 3), benchOcc([6, 5, 4], 10)]);
    expect(s).toMatchObject({ status: 'NO_SUGGESTION', reasonCode: 'TARGET_NOT_MET', suggestedValue: null });
  });
  it('PS-X-05: the evidence summary lists the examined sessions and their DONE planned results', () => {
    const s = run(REPS_LOAD, [benchOcc([11, 10, 10], 3), benchOcc([10, 10, 10], 10)]);
    expect(s.evidence.occurrences.map((e) => e.results)).toEqual([[11, 10, 10], [10, 10, 10]]);
    expect(s.evidence.occurrences[0]).toMatchObject({ plannedSets: 3, plannedTarget: 10, plannedLoadKg: 40, loadsKg: [40, 40, 40] });
  });
});

describe('planned REST is part of the two-workout comparison (PS-REST)', () => {
  const benchRest = (days: number, rest: number) => occ(REPS_LOAD, bench([10, 10, 10]), days, { rest });
  const sprintRest = (days: number, rest: number) => occ(TIME, [set(1, 'DONE', { TIME_S: 7.2 }, { target: 8 })], days, { rest });
  it('PS-REST-01: REP+LOAD, same sets / target / load but rest 60 s vs 120 s -> EVIDENCE_NOT_COMPARABLE, no 42.5 kg', () => {
    expect(reason(run(REPS_LOAD, [benchRest(3, 120), benchRest(10, 60)]))).toBe('EVIDENCE_NOT_COMPARABLE');
    expect(reason(run(REPS_LOAD, [benchRest(3, 60), benchRest(10, 120)]))).toBe('EVIDENCE_NOT_COMPARABLE');
  });
  it('PS-REST-02: REP+LOAD with the same rest (60 s and 60 s) still gives the N=2 suggestion', () => {
    const s = run(REPS_LOAD, [benchRest(3, 60), benchRest(10, 60)]);
    expect(s).toMatchObject({ status: 'SUGGESTION', changedField: 'load', suggestedValue: 42.5 });
    if (s.status === 'SUGGESTION') expect(s.prescription.restSec).toBe(60);
  });
  it('PS-REST-03: TIME goal, same goal / context but rest 60 s vs 180 s -> EVIDENCE_NOT_COMPARABLE, not combined into a lower goal', () => {
    expect(reason(run(TIME, [sprintRest(3, 60), sprintRest(10, 180)]))).toBe('EVIDENCE_NOT_COMPARABLE');
  });
  it('PS-REST-04: TIME goal with the same rest still gives the goal suggestion', () => {
    expect(run(TIME, [sprintRest(3, 60), sprintRest(10, 60)])).toMatchObject({ status: 'SUGGESTION', changedField: 'target', currentValue: 8, suggestedValue: 7.2 });
  });
  it('PS-REST-05: N=1 rules compare no rest across occurrences: reps-without-load and DURATION are unchanged', () => {
    expect(run(REPS, [occ(REPS, [set(1, 'DONE', { REPETITIONS: 10 })], 3, { rest: 30 }), occ(REPS, [set(1, 'DONE', { REPETITIONS: 10 })], 10, { rest: 120 })])).toMatchObject({ status: 'SUGGESTION', suggestedValue: 12, workouts: 1 });
  });
});
