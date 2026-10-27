import { defaultComparisonPolicy, type ComparisonPolicy } from '../comparison';
import type { ExerciseMeasurement } from '../exercise/exercise';
import { resolveTimeSemantics, storableTimeSemantics, type TimeSemantics } from '../exercise/timeSemantics';

import type { PreviousExercisePerformance, PreviousSet } from './previousPerformance';
import { adaptPrescription, type MeasurementKind, type Prescription } from './training';

/**
 * TRAINING-PROGRESSION-002 — DETERMINISTIC PROGRESSION SUGGESTIONS. Pure: no database, no clock (the caller passes `nowMs` and the stale limit),
 * no React, no randomness, no AI. The same history always gives the same answer.
 *
 * A suggestion is only an offer. It carries a ready `Prescription` that the Builder may put into the NEW draft after an explicit
 * "Apply suggestion"; nothing here writes a plan, a session or a result. History is read-only input.
 *
 * PLANNED != ACTUAL: the previous PLAN is the anchor and the actual results only prove that the plan was met. A measured value is never copied
 * into a future goal (a missed time goal never becomes a slower goal; a cap is never a goal).
 *
 * The step tables, ceilings, noise threshold and the 42-day limit are deterministic PRODUCT DEFAULTS for V1: they are not equipment increments,
 * not a scientific prescription and not a claim that the suggested value is "the right one". The user can always edit before Save.
 *
 * COMPARISON CONTEXT (what makes two occurrences comparable). The history lookup matches the exact `exercise_id` plus the equal
 * `measurement_type`, and this function additionally requires the same set count, reps / time target, planned load and time meaning.
 * DISTANCE is part of the exercise identity: a TIME exercise over a fixed distance is defined by `measurement.distanceM` in the built-in
 * catalog (SPRINT_10M = 10, SPRINT_20M = 20, SPRINT_30M_FLYING = 30, ROW_500M = 500) and a different distance is a DIFFERENT `exercise_id`.
 * Custom exercises cannot declare a distance (it is always null), so nothing user-made can vary it either. Exact `exercise_id` matching
 * therefore enforces distance comparability, and no distance field is read here (a catalog test pins every id -> distance pair).
 */

// ------------------------------------------------------------------------------------------------------------------ product defaults
/** Evidence older than this is stale (product rule; the pure function receives it as an argument so tests are deterministic). */
export const STALE_AFTER_DAYS = 42;
export const REPS_CEILING = 30;
export const DURATION_CEILING_S = 180;
const DAY_MS = 86_400_000;

/** Product default load step (kg) by the PLANNED load; not an equipment increment. */
export function loadStepKg(plannedLoadKg: number): number {
  if (plannedLoadKg < 10) return 0.5;
  if (plannedLoadKg < 20) return 1;
  if (plannedLoadKg < 100) return 2.5;
  return 5;
}
const repsStep = (target: number): number => (target < 10 ? 1 : 2);
const durationStep = (target: number): number => (target < 60 ? 5 : 10);

// ------------------------------------------------------------------------------------------------------------------------------ DTO
export const NO_SUGGESTION_REASONS = [
  'NO_TARGET',
  'NO_LOAD',
  'NON_UNIFORM_PLAN',
  'SETS_NOT_COMPLETE',
  'TARGET_NOT_MET',
  'ACTUAL_DIFFERS_FROM_PLAN',
  'STALE_EVIDENCE',
  'INSUFFICIENT_EVIDENCE',
  'EVIDENCE_NOT_COMPARABLE',
  'AT_CEILING',
  'WITHIN_NOISE',
  'CAP_IS_NOT_A_GOAL',
  'TIME_WITH_LOAD_NO_RULE',
  'DURATION_WITH_LOAD_NO_RULE',
  'NOT_A_PROGRESSION_METRIC',
  'UNSUPPORTED_MEASUREMENT',
  'INVALID_SUGGESTION',
] as const;
export type NoSuggestionReason = (typeof NO_SUGGESTION_REASONS)[number];

/** Why a suggestion exists (maps to the explanation shown to the user). */
export type SuggestionBasis = 'REPS_LOAD_TWO_WORKOUTS' | 'REPS_ONE_WORKOUT' | 'TIME_GOAL_TWO_WORKOUTS' | 'DURATION_ONE_WORKOUT';

/** What the evidence consisted of: one entry per examined occurrence, newest first; `results` / `loadsKg` are the DONE PLANNED sets' FINAL values. */
export interface ProgressionEvidence {
  readonly occurrences: readonly {
    readonly sessionId: string;
    readonly startedAt: number;
    readonly plannedSets: number;
    readonly plannedTarget: number | null;
    readonly plannedLoadKg: number | null;
    readonly results: readonly number[];
    readonly loadsKg: readonly (number | null)[];
  }[];
}

interface Base {
  readonly evidence: ProgressionEvidence;
}
export interface SuggestionFound extends Base {
  readonly status: 'SUGGESTION';
  readonly changedField: 'load' | 'target';
  readonly currentValue: number;
  readonly suggestedValue: number;
  readonly reasonCode: SuggestionBasis;
  /** The previous plan with ONLY the changed field replaced: what "Apply suggestion" puts into the draft. */
  readonly prescription: Prescription;
  /** How many comparable workouts the suggestion rests on (1 or 2). */
  readonly workouts: number;
}
export interface NoSuggestion extends Base {
  readonly status: 'NO_SUGGESTION';
  readonly changedField: null;
  readonly currentValue: null;
  readonly suggestedValue: null;
  readonly reasonCode: NoSuggestionReason;
}
export type ProgressionSuggestion = SuggestionFound | NoSuggestion;

export interface SuggestionInput {
  /** The Player's eligible occurrences of this exercise (same measurement type), NEWEST FIRST (as the lookup returns them); only the first needed are read. */
  readonly occurrences: readonly PreviousExercisePerformance[];
  /** The exercise as defined now. */
  readonly current: ExerciseMeasurement;
  readonly nowMs: number;
  readonly staleAfterDays: number;
}

// -------------------------------------------------------------------------------------------------------------------------- helpers
const valueOf = (s: PreviousSet, kind: MeasurementKind): number | null => s.values.find((v) => v.kind === kind)?.finalValue ?? null; // FINAL value, never the measured one
const same = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function evidenceOf(list: readonly PreviousExercisePerformance[], kind: MeasurementKind | null): ProgressionEvidence {
  return {
    occurrences: list.map((p) => {
      const done = p.sets.filter((s) => s.planned && s.status === 'DONE');
      return {
        sessionId: p.sessionId,
        startedAt: p.startedAt,
        plannedSets: p.previousPlan.sets,
        plannedTarget: p.previousPlan.target,
        plannedLoadKg: p.previousPlan.loadKg,
        results: kind === null ? [] : done.map((s) => valueOf(s, kind)).filter((v): v is number => v !== null),
        loadsKg: done.map((s) => valueOf(s, 'LOAD_KG')),
      };
    }),
  };
}

const none = (reasonCode: NoSuggestionReason, list: readonly PreviousExercisePerformance[], kind: MeasurementKind | null): NoSuggestion => ({
  status: 'NO_SUGGESTION',
  changedField: null,
  currentValue: null,
  suggestedValue: null,
  reasonCode,
  evidence: evidenceOf(list, kind),
});

const direction = (m: ExerciseMeasurement): ComparisonPolicy | null => m.comparison ?? defaultComparisonPolicy(m.type);

type Rule = {
  /** Occurrences the rule needs. */
  readonly need: 1 | 2;
  readonly kind: MeasurementKind;
  /** The result must be >= target (reps, duration) or <= target (time goal). */
  readonly met: (result: number, target: number) => boolean;
  /** The actual load must equal the planned load (reps + load only). */
  readonly loadMustMatch: boolean;
};

/** The first reason an occurrence cannot be evidence under `rule` (null = it is). Order: plan shape, completeness, load match, target met. */
function occurrenceProblem(p: PreviousExercisePerformance, current: ExerciseMeasurement, rule: Rule): NoSuggestionReason | null {
  const plan = p.previousPlan;
  if (!plan.uniform) return 'NON_UNIFORM_PLAN';
  if (plan.target === null) return 'NO_TARGET';
  if (rule.loadMustMatch && plan.loadKg === null) return 'NO_LOAD';
  if (!rule.loadMustMatch && plan.loadKg !== null && !current.usesLoad) return 'EVIDENCE_NOT_COMPARABLE';
  const planned = p.sets.filter((s) => s.planned);
  const complete = planned.length === plan.sets && planned.every((s) => s.status === 'DONE' && valueOf(s, rule.kind) !== null);
  if (!complete) return 'SETS_NOT_COMPLETE';
  if (rule.loadMustMatch && !planned.every((s) => same(valueOf(s, 'LOAD_KG'), plan.loadKg))) return 'ACTUAL_DIFFERS_FROM_PLAN';
  if (!planned.every((s) => rule.met(valueOf(s, rule.kind)!, plan.target!))) return 'TARGET_NOT_MET';
  return null;
}

/** The same planned prescription across the window (sets, target, load; TIME also the time meaning). */
function comparable(list: readonly PreviousExercisePerformance[], current: ExerciseMeasurement): boolean {
  const first = list[0]!.previousPlan;
  return list.every((p) => {
    const pl = p.previousPlan;
    return (
      pl.sets === first.sets &&
      same(pl.target, first.target) &&
      same(pl.loadKg, first.loadKg) &&
      resolveTimeSemantics(current.type, pl.timeSemantics) === resolveTimeSemantics(current.type, first.timeSemantics)
    );
  });
}

function offer(
  list: readonly PreviousExercisePerformance[],
  current: ExerciseMeasurement,
  kind: MeasurementKind,
  field: 'load' | 'target',
  suggested: number,
  basis: SuggestionBasis,
): ProgressionSuggestion {
  const plan = list[0]!.previousPlan;
  const wanted: Prescription = {
    sets: plan.sets,
    target: field === 'target' ? suggested : plan.target,
    loadKg: field === 'load' ? suggested : plan.loadKg,
    restSec: plan.restSec,
    timeSemantics: storableTimeSemantics(current.type, plan.timeSemantics as TimeSemantics | null),
  };
  const adapted = adaptPrescription(current, wanted);
  // an invalid result (above the limits, a field the exercise cannot take now) is never offered, never silently adjusted
  if (adapted === null || adapted.target !== wanted.target || adapted.loadKg !== wanted.loadKg) return none('INVALID_SUGGESTION', list, kind);
  return {
    status: 'SUGGESTION',
    changedField: field,
    currentValue: field === 'load' ? plan.loadKg! : plan.target!,
    suggestedValue: suggested,
    reasonCode: basis,
    prescription: adapted,
    workouts: list.length,
    evidence: evidenceOf(list, kind),
  };
}

// ------------------------------------------------------------------------------------------------------------------------- the engine
export function suggestProgression(input: SuggestionInput): ProgressionSuggestion {
  const { current, occurrences } = input;
  const type = current.type;
  const all = occurrences;
  const gate = (reason: NoSuggestionReason) => none(reason, all.slice(0, 1), null);

  // 1) measurement-level gates (nothing is looked up for these)
  if (type === 'DISTANCE' || type === 'MADE_ATTEMPTS' || type === 'RATING' || type === 'COMPLETION') return gate('UNSUPPORTED_MEASUREMENT');
  let rule: Rule;
  let basis: SuggestionBasis;
  if (type === 'TIME') {
    if (current.usesLoad) return gate('TIME_WITH_LOAD_NO_RULE');
    const meaning = resolveTimeSemantics('TIME', all[0]?.previousPlan.timeSemantics ?? null);
    if (meaning === 'COMPLETION_TIME_CAP') return gate('CAP_IS_NOT_A_GOAL');
    if (meaning !== 'PERFORMANCE_GOAL_TIME') return gate('NOT_A_PROGRESSION_METRIC');
    rule = { need: 2, kind: 'TIME_S', met: (r, g) => r <= g, loadMustMatch: false };
    basis = 'TIME_GOAL_TWO_WORKOUTS';
  } else if (type === 'DURATION') {
    if (direction(current) !== 'HIGHER_IS_BETTER') return gate('NOT_A_PROGRESSION_METRIC');
    if (current.usesLoad) return gate('DURATION_WITH_LOAD_NO_RULE');
    rule = { need: 1, kind: 'DURATION_S', met: (r, d) => r >= d, loadMustMatch: false };
    basis = 'DURATION_ONE_WORKOUT';
  } else {
    // REPETITIONS: with a load two workouts, without a load one
    rule = { need: current.usesLoad ? 2 : 1, kind: 'REPETITIONS', met: (r, t) => r >= t, loadMustMatch: current.usesLoad };
    basis = current.usesLoad ? 'REPS_LOAD_TWO_WORKOUTS' : 'REPS_ONE_WORKOUT';
  }

  // 2) evidence: the newest occurrence first; nothing older is consulted for a reason the newest already decides
  if (all.length === 0) return none('INSUFFICIENT_EVIDENCE', [], rule.kind);
  const window = all.slice(0, rule.need);
  const age = (p: PreviousExercisePerformance) => (input.nowMs - p.startedAt) / DAY_MS;
  if (age(window[0]!) > input.staleAfterDays) return none('STALE_EVIDENCE', window, rule.kind);
  for (const p of window) {
    const problem = occurrenceProblem(p, current, rule);
    if (problem !== null) return none(problem, window, rule.kind);
  }
  if (window.length < rule.need) return none('INSUFFICIENT_EVIDENCE', window, rule.kind);
  if (window.some((p) => age(p) > input.staleAfterDays)) return none('STALE_EVIDENCE', window, rule.kind);
  if (!comparable(window, current)) return none('EVIDENCE_NOT_COMPARABLE', window, rule.kind);

  // 3) the proposal
  const plan = window[0]!.previousPlan;
  if (type === 'TIME') {
    const goal = plan.target!;
    const slowest = Math.max(...window.flatMap((p) => p.sets.filter((s) => s.planned).map((s) => valueOf(s, 'TIME_S')!)));
    // round UP to 0.1 s (never a goal faster than what was demonstrated); the scaling guards float noise (14.8 * 10 = 148.00000000000003)
    const proven = Math.ceil(Math.round(slowest * 1e6) / 1e5) / 10;
    if (goal - proven < Math.max(0.1, 0.02 * goal) - 1e-9) return none('WITHIN_NOISE', window, rule.kind);
    return offer(window, current, rule.kind, 'target', proven, basis);
  }
  if (type === 'DURATION') {
    const d = plan.target!;
    if (d >= DURATION_CEILING_S) return none('AT_CEILING', window, rule.kind);
    return offer(window, current, rule.kind, 'target', Math.min(round3(d + durationStep(d)), DURATION_CEILING_S), basis);
  }
  if (current.usesLoad) return offer(window, current, rule.kind, 'load', round3(plan.loadKg! + loadStepKg(plan.loadKg!)), basis);
  const t = plan.target!;
  if (t >= REPS_CEILING) return none('AT_CEILING', window, rule.kind);
  return offer(window, current, rule.kind, 'target', Math.min(t + repsStep(t), REPS_CEILING), basis);
}
