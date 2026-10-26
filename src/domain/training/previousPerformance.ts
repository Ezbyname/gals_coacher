import type { ExerciseMeasurement } from '../exercise/exercise';
import { storableTimeSemantics, type TimeSemantics } from '../exercise/timeSemantics';

import {
  adaptPrescription,
  resultKinds,
  type MeasurementKind,
  type Prescription,
  type SessionPurpose,
  type SessionStatus,
  type SetStatus,
} from './training';

/**
 * TRAINING-PROGRESSION-001 — PREVIOUS PERFORMANCE: what a Player really did last time with an exercise, offered as READ-ONLY input to a NEW
 * Builder draft. Pure: no database, no clock, no React. Nothing here mutates a plan, a session or a result; "Repeat last plan" and
 * "Use last performance as baseline" only compute a `Prescription` for the caller to put into a draft the user can still edit.
 *
 * PLANNED != ACTUAL: `previousPlan` and `sets` (the actuals) are separate and never merged into one value.
 * Deterministic and user-controlled: there is NO automatic progression (no percentage, no +reps, no better time, no RIR, no deload).
 */

// ------------------------------------------------------------------------------------------------------------------ input shapes
/** The part of a stored TrainingSession this module reads (structurally the domain `TrainingSession`; kept minimal so tests need no database). */
export interface PerformanceSession {
  readonly id: string;
  readonly playerId: string;
  readonly plannedWorkoutId: string | null;
  readonly name: string;
  readonly purpose: SessionPurpose;
  readonly status: SessionStatus;
  readonly startedAt: number;
  readonly exercises: readonly PerformanceExercise[];
}
export interface PerformanceExercise {
  readonly position: number;
  readonly exercise: { readonly exerciseId: string; readonly measurement: ExerciseMeasurement };
  readonly restSec: number | null;
  readonly timeSemantics?: TimeSemantics;
  readonly sets: readonly PerformanceSet[];
}
export interface PerformanceSet {
  readonly setNumber: number;
  readonly planned: boolean;
  readonly plannedTarget: number | null;
  readonly plannedLoadKg: number | null;
  readonly status: SetStatus;
  readonly measurements: readonly { kind: MeasurementKind; finalValue: number; measuredValue: number; wasEdited: boolean }[];
}

// --------------------------------------------------------------------------------------------------------------------------- DTO
export interface PreviousSetValue {
  readonly kind: MeasurementKind;
  readonly finalValue: number;
  readonly measuredValue: number;
  readonly edited: boolean;
}
/** One set of the previous occurrence, ACTUAL side (`values`) with the plan's own per-set values kept apart. */
export interface PreviousSet {
  readonly setNumber: number;
  /** False = an extra set the plan did not contain. */
  readonly planned: boolean;
  readonly status: SetStatus;
  readonly values: readonly PreviousSetValue[];
  readonly plannedTarget: number | null;
  readonly plannedLoadKg: number | null;
}
export interface PreviousPlan {
  readonly sets: number;
  readonly target: number | null;
  readonly loadKg: number | null;
  readonly restSec: number | null;
  readonly timeSemantics: TimeSemantics | null;
  /** True when every planned set carried the same target and load, i.e. the uniform `Prescription` model can represent the plan. */
  readonly uniform: boolean;
}
export interface PreviousExercisePerformance {
  readonly sessionId: string;
  readonly sessionName: string;
  readonly startedAt: number;
  readonly sessionStatus: SessionStatus;
  readonly plannedWorkoutId: string | null;
  /** How many times this exercise (with this measurement type) appears in that session; context only. */
  readonly occurrencesInSession: number;
  readonly exerciseId: string;
  readonly measurementType: ExerciseMeasurement['type'];
  readonly usesLoad: boolean;
  readonly previousPlan: PreviousPlan;
  readonly sets: readonly PreviousSet[];
}

// ----------------------------------------------------------------------------------------------------------------------- selector
const ELIGIBLE_STATUSES: readonly SessionStatus[] = ['COMPLETED', 'PARTIAL'];

const primaryKind = (m: ExerciseMeasurement): MeasurementKind => resultKinds(m)[0]!;

/** The DONE PLANNED sets that hold a stored primary result (extra sets never count). */
function donePlannedSets(e: PerformanceExercise): PerformanceSet[] {
  const kind = primaryKind(e.exercise.measurement);
  return e.sets.filter((s) => s.planned && s.status === 'DONE' && s.measurements.some((m) => m.kind === kind));
}

/**
 * The occurrence of `exerciseId` (with the compatible measurement type) this session offers as a Last Performance, or null.
 * The session must be a COMPLETED / PARTIAL TRAINING session; an occurrence qualifies only through at least one DONE PLANNED set with a
 * stored primary result (an extra set alone never qualifies). With several occurrences the one with the most DONE PLANNED sets wins;
 * a tie goes to the later exercise position.
 */
export function performanceFromSession(
  session: PerformanceSession,
  exerciseId: string,
  measurementType: ExerciseMeasurement['type'],
): PreviousExercisePerformance | null {
  if (session.purpose !== 'TRAINING' || !ELIGIBLE_STATUSES.includes(session.status)) return null;
  const matches = session.exercises.filter((e) => e.exercise.exerciseId === exerciseId && e.exercise.measurement.type === measurementType);
  let best: { e: PerformanceExercise; done: number } | null = null;
  for (const e of matches) {
    const done = donePlannedSets(e).length;
    if (done === 0) continue;
    if (best === null || done > best.done || (done === best.done && e.position > best.e.position)) best = { e, done };
  }
  return best === null ? null : toDto(session, best.e, matches.length);
}

/** The newest eligible occurrence over a Player's sessions (newest first not required: the order is applied here, by start time then id). */
export function lastPerformance(
  sessions: readonly PerformanceSession[],
  playerId: string,
  exerciseId: string,
  measurementType: ExerciseMeasurement['type'],
): PreviousExercisePerformance | null {
  const ordered = sessions
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  for (const s of ordered) {
    const found = performanceFromSession(s, exerciseId, measurementType);
    if (found !== null) return found;
  }
  return null;
}

function toDto(session: PerformanceSession, e: PerformanceExercise, occurrences: number): PreviousExercisePerformance {
  const m = e.exercise.measurement;
  const planned = e.sets.filter((s) => s.planned);
  const first = planned[0]!;
  const uniform = planned.every((s) => s.plannedTarget === first.plannedTarget && s.plannedLoadKg === first.plannedLoadKg);
  return {
    sessionId: session.id,
    sessionName: session.name,
    startedAt: session.startedAt,
    sessionStatus: session.status,
    plannedWorkoutId: session.plannedWorkoutId,
    occurrencesInSession: occurrences,
    exerciseId: e.exercise.exerciseId,
    measurementType: m.type,
    usesLoad: m.usesLoad,
    previousPlan: {
      sets: planned.length,
      target: uniform ? first.plannedTarget : null,
      loadKg: uniform ? first.plannedLoadKg : null,
      restSec: e.restSec,
      timeSemantics: e.timeSemantics ?? null,
      uniform,
    },
    sets: [...e.sets]
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => ({
        setNumber: s.setNumber,
        planned: s.planned,
        status: s.status,
        plannedTarget: s.plannedTarget,
        plannedLoadKg: s.plannedLoadKg,
        values: s.measurements.map((x) => ({ kind: x.kind, finalValue: x.finalValue, measuredValue: x.measuredValue, edited: x.wasEdited })),
      })),
  };
}

// -------------------------------------------------------------------------------------------------------------- baseline functions
export type BaselineDisabledReason =
  /** The previous planned sets used different prescriptions: the uniform model cannot represent them (history stays visible). */
  | 'NON_UNIFORM_PLAN'
  /** This measurement type's result is display-only in V1 (distance, made / attempts, rating, completion). */
  | 'UNSUPPORTED_MEASUREMENT'
  /** A measured TIME is never a new goal or cap; nothing else (no load) is left to use. */
  | 'TIMED_RESULT_NOT_A_GOAL'
  /** The previous values do not fit the exercise as it is defined now (never silently dropped in the actual baseline). */
  | 'NOT_APPLICABLE_NOW';

export type BaselineResult = { readonly ok: true; readonly prescription: Prescription } | { readonly ok: false; readonly reason: BaselineDisabledReason };

const disabled = (reason: BaselineDisabledReason): BaselineResult => ({ ok: false, reason });

/**
 * REPEAT LAST PLAN: the previous PLANNED prescription (sets, target, load, rest, time semantics), nothing from the actuals. It goes
 * through the existing `adaptPrescription`, so a field that does not apply to the exercise as defined now is dropped, never invented.
 * Disabled when the previous planned sets disagreed (the uniform Prescription model cannot represent them): nothing is normalised.
 */
export function repeatPlan(dto: PreviousExercisePerformance, current: ExerciseMeasurement): BaselineResult {
  if (!dto.previousPlan.uniform) return disabled('NON_UNIFORM_PLAN');
  return adapt(
    current,
    {
      sets: dto.previousPlan.sets,
      target: dto.previousPlan.target,
      loadKg: dto.previousPlan.loadKg,
      restSec: dto.previousPlan.restSec,
      timeSemantics: storableTimeSemantics(current.type, dto.previousPlan.timeSemantics),
    },
    false,
  );
}

/**
 * USE LAST PERFORMANCE AS BASELINE (REPETITIONS and DURATION, with or without a load; TIME with a load: the load only).
 *  - sets  = the previous PLANNED set count (extra sets are history only);  rest and time semantics are copied from the previous plan.
 *  - Only DONE PLANNED sets count; SKIPPED / PENDING / extra sets contribute nothing and nothing is inferred for them.
 *  - Equal actual load on every DONE set (or none at all): target = the minimum primary result, load = that common load.
 *  - Different actual loads: the real DONE set with the minimum primary result (a tie goes to the later set) supplies BOTH its result
 *    and its load, so the baseline is a tuple that really happened (target and load are never taken from different sets).
 *  - TIME never becomes a goal, a cap or a target: the previous planned target and meaning stay; only the load (the minimum actual load) is used.
 *  - DISTANCE, MADE / ATTEMPTS, RATING and COMPLETION actuals are display-only in V1.
 */
export function useActualPerformance(dto: PreviousExercisePerformance, current: ExerciseMeasurement): BaselineResult {
  const type = current.type;
  if (type === 'DISTANCE' || type === 'MADE_ATTEMPTS' || type === 'RATING' || type === 'COMPLETION') return disabled('UNSUPPORTED_MEASUREMENT');
  const kind = type === 'REPETITIONS' ? 'REPETITIONS' : type === 'DURATION' ? 'DURATION_S' : 'TIME_S';
  const done = dto.sets.filter((s) => s.planned && s.status === 'DONE' && s.values.some((v) => v.kind === kind));
  const valueOf = (s: PreviousSet, k: MeasurementKind) => s.values.find((v) => v.kind === k)?.finalValue ?? null;
  const loads = done.map((s) => valueOf(s, 'LOAD_KG'));
  const withLoad = loads.filter((l): l is number => l !== null);

  if (type === 'TIME') {
    // a measured time is display-only: keep the previous plan's target and meaning, take only the actual load
    if (!current.usesLoad || withLoad.length === 0) return disabled('TIMED_RESULT_NOT_A_GOAL');
    if (!dto.previousPlan.uniform) return disabled('NON_UNIFORM_PLAN');
    return adapt(
      current,
      {
        sets: dto.previousPlan.sets,
        target: dto.previousPlan.target,
        loadKg: Math.min(...withLoad),
        restSec: dto.previousPlan.restSec,
        timeSemantics: storableTimeSemantics(type, dto.previousPlan.timeSemantics),
      },
      true,
    );
  }

  if (done.length === 0) return disabled('NOT_APPLICABLE_NOW');
  const allSameLoad = loads.every((l) => l === loads[0]);
  let target: number;
  let load: number | null;
  if (allSameLoad) {
    target = Math.min(...done.map((s) => valueOf(s, kind)!));
    load = loads[0] ?? null;
  } else {
    // one REAL set: the minimum primary result, a tie to the later set number; both values come from that same set
    const pick = [...done].sort((a, b) => valueOf(a, kind)! - valueOf(b, kind)! || b.setNumber - a.setNumber)[0]!;
    target = valueOf(pick, kind)!;
    load = valueOf(pick, 'LOAD_KG');
  }
  return adapt(
    current,
    {
      sets: dto.previousPlan.sets,
      target,
      loadKg: current.usesLoad ? load : null,
      restSec: dto.previousPlan.restSec,
      timeSemantics: storableTimeSemantics(type, dto.previousPlan.timeSemantics),
    },
    true,
  );
}

/** Through the existing adaptation. `strict`: a target / load the exercise cannot take is a refusal, not a silent drop. */
function adapt(current: ExerciseMeasurement, wanted: Prescription, strict: boolean): BaselineResult {
  const adapted = adaptPrescription(current, wanted);
  if (adapted === null) return disabled('NOT_APPLICABLE_NOW');
  if (strict && (adapted.target !== wanted.target || adapted.loadKg !== wanted.loadKg)) return disabled('NOT_APPLICABLE_NOW');
  return { ok: true, prescription: adapted };
}
