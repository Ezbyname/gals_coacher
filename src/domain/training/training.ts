import type { TimeSemantics } from '../exercise/timeSemantics';
import { isComparisonPolicy, type ComparisonPolicy } from '../comparison';
import { loadApplies, type ExerciseMeasurement, type LocalizedText } from '../exercise/exercise';
import { isMeasurementType, type MeasurementType } from '../measurement';

/**
 * The training system (TRAIN-002, ARCHITECTURE §15, PRODUCT_SPEC §72):
 * reusable Workout Blocks and Templates → a FROZEN Planned Workout → a
 * separate Training Session whose sets keep the planned prescription next to
 * the actual objective measurements. Sport-neutral; the planned values are
 * never copied into the actual ones.
 */

/** The approved Title limit (owner may change), as for activity types and exercises. */
export const WORKOUT_NAME_MAX_LENGTH = 35;
/** Technical input bounds (not product rules): they only reject typos. */
export const MAX_SETS = 99;
export const MAX_REST_SEC = 3600;
const MAX_REPS = 9999;
const MAX_SECONDS = 86_400;
const MAX_METRES = 100_000;
const MAX_LOAD_KG = 1000;

/** What a plan or a session shows for an exercise — copied when planned, never re-read. */
export interface ExerciseSnapshot {
  readonly exerciseId: string;
  readonly name: LocalizedText;
  readonly measurement: ExerciseMeasurement;
}

/**
 * A prescription for one exercise: sets × target, at a load, with rest.
 * `target` is in the measurement's unit — reps (REPETITIONS), seconds
 * (DURATION, and a goal time for TIME), metres (DISTANCE), attempts per set
 * (MADE_ATTEMPTS); none for RATING / COMPLETION. `loadKg` only when the
 * exercise uses a load.
 */
export interface Prescription {
  readonly sets: number;
  readonly target: number | null;
  readonly loadKg: number | null;
  readonly restSec: number | null;
  /**
   * TRAINING-BLOCKS-001: what the seconds value of a TIME exercise means in THIS prescription. Absent / null = legacy (the
   * historical "Goal time"). Stored with the plan item and copied to the session exercise, never derived from the exercise.
   */
  readonly timeSemantics?: TimeSemantics | null;
}

export type PrescriptionField = 'sets' | 'target' | 'loadKg' | 'restSec';
export type PrescriptionErrors = Partial<
  Record<PrescriptionField, 'REQUIRED' | 'INVALID' | 'NOT_APPLICABLE'>
>;

export function targetApplies(type: MeasurementType): boolean {
  return type !== 'RATING' && type !== 'COMPLETION';
}

/** Whole numbers only where a fraction is meaningless (reps, attempts, a held duration in seconds is allowed fractional). */
function targetIsInteger(type: MeasurementType): boolean {
  return type === 'REPETITIONS' || type === 'MADE_ATTEMPTS';
}

const isWhole = (n: number) => Number.isSafeInteger(n);
const positive = (n: number | null, max: number): boolean =>
  n !== null && Number.isFinite(n) && n > 0 && n <= max;

export function validatePrescription(
  measurement: ExerciseMeasurement,
  p: Prescription,
): { ok: true } | { ok: false; errors: PrescriptionErrors } {
  const errors: PrescriptionErrors = {};
  if (!isWhole(p.sets) || p.sets < 1 || p.sets > MAX_SETS) errors.sets = 'INVALID';
  if (p.target !== null) {
    if (!targetApplies(measurement.type)) errors.target = 'NOT_APPLICABLE';
    else if (
      !positive(p.target, targetMax(measurement.type)) ||
      (targetIsInteger(measurement.type) && !isWhole(p.target))
    ) {
      errors.target = 'INVALID';
    }
  }
  if (p.loadKg !== null) {
    if (!measurement.usesLoad) errors.loadKg = 'NOT_APPLICABLE';
    else if (!positive(p.loadKg, MAX_LOAD_KG)) errors.loadKg = 'INVALID';
  }
  if (p.restSec !== null && (!isWhole(p.restSec) || p.restSec < 0 || p.restSec > MAX_REST_SEC)) {
    errors.restSec = 'INVALID';
  }
  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}

function targetMax(type: MeasurementType): number {
  if (type === 'DISTANCE') return MAX_METRES;
  if (type === 'DURATION' || type === 'TIME') return MAX_SECONDS;
  return MAX_REPS;
}

/**
 * A reusable block follows its exercise's CURRENT definition: when the
 * exercise was edited since (e.g. it no longer uses a load, or its
 * measurement changed), a target / load that no longer applies is dropped
 * (the user sets it again). Sets and rest never depend on the measurement;
 * if they are malformed the stored row is corrupt (null). Plans and sessions
 * never use this — they keep their frozen snapshot.
 */
export function adaptPrescription(
  measurement: ExerciseMeasurement,
  stored: Prescription,
): Prescription | null {
  const base = { ...stored, target: null, loadKg: null };
  if (!validatePrescription(measurement, base).ok) return null;
  const withTarget = { ...base, target: stored.target };
  const target = validatePrescription(measurement, withTarget).ok ? stored.target : null;
  const withLoad = { ...base, loadKg: stored.loadKg };
  const loadKg = validatePrescription(measurement, withLoad).ok ? stored.loadKg : null;
  return { ...base, target, loadKg };
}

/** The exercise's own defaults as a starting prescription (the user may change everything). */
export function defaultPrescription(
  measurement: ExerciseMeasurement,
  defaults: { sets: number; target: number | null; restSec: number } | null,
): Prescription {
  return {
    sets: defaults?.sets ?? 3,
    target: targetApplies(measurement.type) ? (defaults?.target ?? null) : null,
    loadKg: null,
    restSec: defaults?.restSec ?? null,
  };
}

// ---------------------------------------------------------------- results

/**
 * One kind of objective value recorded for a set. A set holds one
 * measurement per kind; each carries its own source (and confidence), so a
 * set may mix a manually entered load with a camera-counted rep count later.
 */
export const MEASUREMENT_KINDS = [
  'REPETITIONS',
  'DURATION_S',
  'TIME_S',
  'DISTANCE_M',
  'MADE',
  'ATTEMPTS',
  'LOAD_KG',
  'RATING',
  'COMPLETED',
] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];
export function isMeasurementKind(value: unknown): value is MeasurementKind {
  return typeof value === 'string' && (MEASUREMENT_KINDS as readonly string[]).includes(value);
}

/** Where a value came from. Only MANUAL is produced today; the others are reserved. */
export const MEASUREMENT_SOURCES = ['MANUAL', 'CAMERA', 'DEVICE', 'SENSOR'] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];
export function isMeasurementSource(value: unknown): value is MeasurementSource {
  return typeof value === 'string' && (MEASUREMENT_SOURCES as readonly string[]).includes(value);
}

/** The kinds a performed set of this exercise records, in display order. */
export function resultKinds(measurement: ExerciseMeasurement): MeasurementKind[] {
  const main: Record<MeasurementType, MeasurementKind[]> = {
    REPETITIONS: ['REPETITIONS'],
    DURATION: ['DURATION_S'],
    TIME: ['TIME_S'],
    DISTANCE: ['DISTANCE_M'],
    MADE_ATTEMPTS: ['MADE', 'ATTEMPTS'],
    RATING: ['RATING'],
    COMPLETION: ['COMPLETED'],
  };
  return [
    ...main[measurement.type],
    ...(measurement.usesLoad && loadApplies(measurement.type) ? ['LOAD_KG' as const] : []),
  ];
}

/**
 * The rating scale for RATING exercises. OPEN PRODUCT DECISION (owner):
 * 1–10 is a placeholder bound; no built-in exercise uses RATING today.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 10;

export type SetValues = Partial<Record<MeasurementKind, number>>;
export type SetValueError = 'REQUIRED' | 'INVALID' | 'MADE_OVER_ATTEMPTS';
export type SetValueErrors = Partial<Record<MeasurementKind, SetValueError>>;

/**
 * Validates what the user entered for one set: exactly the exercise's kinds,
 * each in range. Values are kept as entered — never adjusted toward the plan.
 */
export function validateSetValues(
  measurement: ExerciseMeasurement,
  values: SetValues,
): { ok: true; values: Record<string, number> } | { ok: false; errors: SetValueErrors } {
  const kinds = resultKinds(measurement);
  const errors: SetValueErrors = {};
  const out: Record<string, number> = {};
  for (const kind of kinds) {
    const value = values[kind];
    if (value === undefined || value === null) {
      errors[kind] = 'REQUIRED';
      continue;
    }
    if (!valueInRange(kind, value)) {
      errors[kind] = 'INVALID';
      continue;
    }
    out[kind] = value;
  }
  for (const kind of Object.keys(values)) {
    if (!(kinds as string[]).includes(kind)) errors[kind as MeasurementKind] = 'INVALID';
  }
  if (out.MADE !== undefined && out.ATTEMPTS !== undefined && out.MADE > out.ATTEMPTS) {
    errors.MADE = 'MADE_OVER_ATTEMPTS';
  }
  return Object.keys(errors).length === 0 ? { ok: true, values: out } : { ok: false, errors };
}

function valueInRange(kind: MeasurementKind, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  switch (kind) {
    case 'REPETITIONS':
    case 'MADE':
      return isWhole(v) && v >= 0 && v <= MAX_REPS;
    case 'ATTEMPTS':
      return isWhole(v) && v >= 1 && v <= MAX_REPS;
    case 'DURATION_S':
    case 'TIME_S':
      return v > 0 && v <= MAX_SECONDS;
    case 'DISTANCE_M':
      return v > 0 && v <= MAX_METRES;
    case 'LOAD_KG':
      return v >= 0 && v <= MAX_LOAD_KG;
    case 'RATING':
      return isWhole(v) && v >= RATING_MIN && v <= RATING_MAX;
    case 'COMPLETED':
      return v === 1;
  }
}

/** Confidence of a non-manual measurement: 0–1; a manual value has none. */
export function isValidConfidence(source: MeasurementSource, confidence: number | null): boolean {
  if (source === 'MANUAL') return confidence === null;
  return confidence === null || (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1);
}

/**
 * Parses a typed number: `,` or `.` as the decimal mark; `m:ss` (or
 * `h:mm:ss`) as seconds for time-like kinds. Returns null when it is not a
 * number (the caller reports it).
 */
export function parseEntry(text: string, kind: MeasurementKind): number | null {
  const raw = text.trim().replace(',', '.');
  if (raw.length === 0) return null;
  if ((kind === 'DURATION_S' || kind === 'TIME_S') && raw.includes(':')) {
    const parts = raw.split(':');
    if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    const nums = parts.map(Number);
    if (nums.slice(1).some((n) => n >= 60)) return null;
    return nums.reduce((total, n) => total * 60 + n, 0);
  }
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  return Number(raw);
}

// ---------------------------------------------------------------- sessions

export const SESSION_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'ABANDONED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value);
}

export const SET_STATUSES = ['PENDING', 'DONE', 'SKIPPED'] as const;
export type SetStatus = (typeof SET_STATUSES)[number];
export function isSetStatus(value: unknown): value is SetStatus {
  return typeof value === 'string' && (SET_STATUSES as readonly string[]).includes(value);
}

/** Why a session's purpose exists (ARCHITECTURE §12); TRAIN-002 records TRAINING only. */
export const SESSION_PURPOSES = ['TRAINING', 'BASELINE', 'REASSESSMENT'] as const;
export type SessionPurpose = (typeof SESSION_PURPOSES)[number];
export function isSessionPurpose(value: unknown): value is SessionPurpose {
  return typeof value === 'string' && (SESSION_PURPOSES as readonly string[]).includes(value);
}

/**
 * The status a session gets when the user finishes it: COMPLETED when every
 * PLANNED set was performed, PARTIAL when at least one set was performed but
 * a planned one was not. Nothing performed cannot be finished (null) — the
 * user abandons instead. Extra sets never make up for a missing planned one.
 */
export function finishedStatus(
  sets: readonly { planned: boolean; status: SetStatus }[],
): 'COMPLETED' | 'PARTIAL' | null {
  if (!sets.some((s) => s.status === 'DONE')) return null;
  return sets.every((s) => !s.planned || s.status === 'DONE') ? 'COMPLETED' : 'PARTIAL';
}

export function isClosed(status: SessionStatus): boolean {
  return status !== 'IN_PROGRESS';
}

/** Rebuilds a measurement description from stored columns (fails with null when malformed). */
export function storedMeasurement(row: {
  measurement_type: unknown;
  comparison_policy: unknown;
  uses_load: unknown;
  distance_m: unknown;
}): ExerciseMeasurement | null {
  const { measurement_type: type, comparison_policy: comparison, uses_load: usesLoad } = row;
  const distance = row.distance_m;
  if (!isMeasurementType(type)) return null;
  if (comparison !== null && !isComparisonPolicy(comparison)) return null;
  if (usesLoad !== 0 && usesLoad !== 1) return null;
  if (distance !== null && (typeof distance !== 'number' || !(distance > 0))) return null;
  return {
    type,
    comparison: comparison as ComparisonPolicy | null,
    usesLoad: usesLoad === 1,
    distanceM: distance as number | null,
  };
}
