import type { ExerciseMeasurement } from '@/domain/exercise/exercise';
import type { MeasurementType } from '@/domain/measurement';
import { PlayerArchivedError } from '@/data/local/players/errors';
import { TrainingDataError, TrainingNotFoundError, TrainingRuleError } from '@/data/local/training/errors';
import type { Measurement, SessionSet, TrainingSession } from '@/data/local/training/trainingRepository';
import type { MeasurementKind, Prescription, SessionStatus } from '@/domain/training/training';
import { ltr } from '@/i18n/bidi';
import type { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';

type T = ReturnType<typeof useI18n>['t'];

/** A number as people write it: at most two decimals, no trailing zeros. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The label of the target field for this measurement type (none for RATING / COMPLETION). */
export function targetLabelKey(type: MeasurementType): TranslationKey | null {
  const keys: Partial<Record<MeasurementType, TranslationKey>> = {
    REPETITIONS: 'training.targetReps',
    DURATION: 'training.targetDuration',
    TIME: 'training.targetTime',
    DISTANCE: 'training.targetDistance',
    MADE_ATTEMPTS: 'training.targetAttempts',
  };
  return keys[type] ?? null;
}

/** A target value in the measurement's unit: 10 · 40 s · 20 m · 10 attempts. */
function targetText(t: T, type: MeasurementType, value: number): string {
  const n = formatNumber(value);
  if (type === 'DURATION' || type === 'TIME') return t('training.unit.seconds', { n });
  if (type === 'DISTANCE') return t('training.unit.metres', { n });
  if (type === 'MADE_ATTEMPTS') return t('training.unit.attempts', { n });
  return t('training.unit.reps', { n });
}

const kg = (t: T, value: number) => t('training.unit.kg', { n: formatNumber(value) });

/** One set as planned: "10 @ 50 kg", "40 s", "10 attempts"; null when the plan has no target or load. */
export function plannedSetText(
  t: T,
  measurement: ExerciseMeasurement,
  target: number | null,
  loadKg: number | null,
): string | null {
  const value = target === null ? null : targetText(t, measurement.type, target);
  if (value !== null && loadKg !== null) return t('training.withLoad', { value, load: kg(t, loadKg) });
  if (value !== null) return value;
  return loadKg !== null ? kg(t, loadKg) : null;
}

/** A whole prescription: "3 × 10 @ 50 kg · rest 90 s". */
export function prescriptionText(t: T, measurement: ExerciseMeasurement, p: Prescription): string {
  const one = plannedSetText(t, measurement, p.target, p.loadKg);
  const main =
    one === null
      ? t('training.setsOnly', { sets: p.sets })
      : t('training.setsTimes', { sets: p.sets, value: one });
  return p.restSec === null
    ? main
    : t('training.joined', { a: main, b: t('training.restPart', { seconds: p.restSec }) });
}

function valueOf(t: T, kind: MeasurementKind, value: number): string {
  const n = formatNumber(value);
  switch (kind) {
    case 'DURATION_S':
    case 'TIME_S':
      return t('training.unit.seconds', { n });
    case 'DISTANCE_M':
      return t('training.unit.metres', { n });
    case 'LOAD_KG':
      return t('training.unit.kg', { n });
    case 'RATING':
      return t('training.unit.rating', { n });
    case 'COMPLETED':
      return t('training.unit.done');
    default:
      return t('training.unit.reps', { n });
  }
}

/**
 * What was actually done in one set, from its final values: "7 @ 50 kg",
 * "7/10", "4.38 s". `final: false` shows the first (measured) entry instead.
 */
export function actualSetText(t: T, measurements: readonly Measurement[], final = true): string {
  const get = (kind: MeasurementKind) => {
    const m = measurements.find((x) => x.kind === kind);
    return m === undefined ? undefined : final ? m.finalValue : m.measuredValue;
  };
  const made = get('MADE');
  const attempts = get('ATTEMPTS');
  let main: string;
  if (made !== undefined && attempts !== undefined) {
    // A made / attempts pair always reads left to right, also in Hebrew (8/10, never 10/8).
    main = ltr(`${formatNumber(made)}/${formatNumber(attempts)}`);
  } else {
    const kind = measurements.map((m) => m.kind).find((k) => k !== 'LOAD_KG');
    main = kind === undefined ? '' : valueOf(t, kind, get(kind)!);
  }
  const load = get('LOAD_KG');
  if (load === undefined) return main;
  return main === '' ? kg(t, load) : t('training.withLoad', { value: main, load: kg(t, load) });
}

export function sessionStatusLabel(t: T, status: SessionStatus): string {
  return t(`training.status.${status}`);
}

/** Planned sets performed, plus extra sets performed. */
export function performedCounts(session: TrainingSession) {
  const sets: SessionSet[] = session.exercises.flatMap((e) => [...e.sets]);
  return {
    planned: sets.filter((s) => s.planned).length,
    done: sets.filter((s) => s.planned && s.status === 'DONE').length,
    extra: sets.filter((s) => !s.planned && s.status === 'DONE').length,
  };
}

export function performedText(t: T, session: TrainingSession): string {
  const c = performedCounts(session);
  const text = t('training.setsPerformed', { done: c.done, planned: c.planned });
  return c.extra > 0 ? t('training.extraPerformed', { text, extra: c.extra }) : text;
}

/** A user-safe message for a failed training write. */
export function trainingErrorMessage(e: unknown): TranslationKey {
  if (e instanceof TrainingRuleError) {
    const keys: Record<TrainingRuleError['rule'], TranslationKey> = {
      TEMPLATE_INACTIVE: 'training.errors.templateInactive',
      PLAN_ALREADY_STARTED: 'training.errors.planStarted',
      SESSION_IN_PROGRESS: 'training.errors.inProgress',
      SESSION_CLOSED: 'training.errors.sessionClosed',
      NOTHING_PERFORMED: 'training.errors.nothingPerformed',
      SET_ALREADY_RECORDED: 'training.errors.changeFailed',
      BLOCK_INACTIVE: 'training.errors.blockInactive',
      EXERCISE_INACTIVE: 'training.errors.exerciseInactive',
      PLAN_EMPTY: 'training.errors.planEmpty',
      POSITION_OUT_OF_RANGE: 'training.errors.positionOutOfRange',
      ASSIGNMENT_INVALID: 'training.errors.changeFailed',
    };
    return keys[e.rule];
  }
  if (e instanceof PlayerArchivedError) return 'training.errors.playerArchived';
  if (e instanceof TrainingNotFoundError) return 'training.errors.notFound';
  if (e instanceof TrainingDataError) return 'training.errors.loadFailed';
  return 'training.errors.changeFailed';
}

export const workoutsPath = '/workouts';
export const newBlockPath = '/workouts/blocks/new';
/** A NEW block that starts with this Exercise (Exercise Details → Add to block → New block). */
export const newBlockWithExercisePath = (exerciseId: string) =>
  ({ pathname: '/workouts/blocks/new', params: { exerciseId } }) as const;
export const addToBlockPath = (exerciseId: string) => `/exercises/${exerciseId}/add-to-block` as const;
export const blockPath = (id: string) => `/workouts/blocks/${id}` as const;
/** QB-WORKOUT-BUILDER-001C: Exercise / Block Details -> Add to workout. */
export type AssignKind = 'EXERCISE' | 'BLOCK' | 'PROFESSIONAL';
export const addToWorkoutPath = (kind: AssignKind, id: string) => ({ pathname: '/workouts/add-to-workout', params: { kind, id } }) as const;
export const professionalListPath = '/workouts/professional';
/** TRAINING-BLOCKS-001: the Training Blocks list, one block, and the Add-program-to-player flow. */
export const trainingBlocksPath = '/workouts/training-blocks';
export const trainingBlockPath = (id: string) => `/workouts/training-blocks/${id}` as const;
export const assignTrainingBlockPath = (id: string) => ({ pathname: '/workouts/training-blocks/assign', params: { blockId: id } }) as const;
export const professionalPath = (id: string) => `/workouts/professional/${id}` as const;
export const newTemplatePath = '/workouts/templates/new';
export const templatePath = (id: string) => `/workouts/templates/${id}` as const;
export const trainingPath = (playerId: string) => `/children/${playerId}/training` as const;
export const chooseWorkoutPath = (playerId: string) => `/children/${playerId}/training/new` as const;
export const builderPath = (playerId: string) => `/children/${playerId}/training/builder/new` as const;
/** The Builder for a NEW workout that starts with this Exercise / Block (still a local draft until Save). */
export const seededBuilderPath = (playerId: string, kind: AssignKind, id: string) =>
  ({ pathname: '/children/[id]/training/builder/new', params: { id: playerId, seedKind: kind, seedId: id } }) as const;
/** QB-WORKOUT-BUILDER-001D: schedule (or reschedule) a planned workout. */
export const scheduleWorkoutPath = (playerId: string, planId: string) => `/children/${playerId}/training/schedule/${planId}` as const;
export const editPlanPath = (playerId: string, planId: string) => `/children/${playerId}/training/builder/${planId}` as const;
export const planPath = (playerId: string, planId: string) =>
  `/children/${playerId}/training/plan/${planId}` as const;
export const sessionPath = (playerId: string, sessionId: string) =>
  `/children/${playerId}/training/session/${sessionId}` as const;
