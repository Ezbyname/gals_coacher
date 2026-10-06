import type { ComparisonPolicy } from '@/domain/comparison';
import type { EquipmentId, EquipmentOption } from '@/domain/exercise/equipment';
import { exerciseComparison, type Exercise, type ExerciseMeasurement } from '@/domain/exercise/exercise';
import type {
  BodyArea,
  Difficulty,
  MovementPattern,
  MuscleGroup,
  TrainingCategory,
} from '@/domain/exercise/taxonomy';
import type { MeasurementType } from '@/domain/measurement';
import type { Language } from '@/i18n/languages';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** Taxonomy codes → translated labels (the codes are what is stored). */
export const categoryLabel = (t: T, code: TrainingCategory) => t(`exercises.category.${code}`);
export const muscleLabel = (t: T, code: MuscleGroup) => t(`exercises.muscle.${code}`);
export const areaLabel = (t: T, code: BodyArea) => t(`exercises.area.${code}`);
export const patternLabel = (t: T, code: MovementPattern) => t(`exercises.pattern.${code}`);
export const difficultyLabel = (t: T, code: Difficulty) => t(`exercises.difficultyLevel.${code}`);
export const equipmentLabel = (t: T, code: EquipmentId) => t(`exercises.equipmentItem.${code}`);
export const measurementTypeLabel = (t: T, code: MeasurementType) =>
  t(`exercises.measurementTypeLabel.${code}`);
export const comparisonLabel = (t: T, code: ComparisonPolicy) => t(`exercises.comparisonLabel.${code}`);

/** A built-in name in the app language; a custom name exactly as entered. */
export const exerciseName = (exercise: Pick<Exercise, 'name'>, language: Language) => exercise.name[language];

/**
 * How an exercise is measured, in coaching words: "Reps × load (kg)",
 * "Time over 20 m — faster is better", "Makes / attempts"…
 */
export function measurementStyle(t: T, measurement: ExerciseMeasurement): string {
  switch (measurement.type) {
    case 'REPETITIONS':
      return t(measurement.usesLoad ? 'exercises.style.repsLoad' : 'exercises.style.reps');
    case 'DURATION':
      if (measurement.usesLoad) return t('exercises.style.durationLoad');
      return t(
        exerciseComparison(measurement) === 'HIGHER_IS_BETTER'
          ? 'exercises.style.hold'
          : 'exercises.style.work',
      );
    case 'TIME':
      return measurement.distanceM !== null
        ? t('exercises.style.timeOver', { distance: measurement.distanceM })
        : t('exercises.style.time');
    case 'MADE_ATTEMPTS':
      return t('exercises.style.madeAttempts');
    case 'DISTANCE':
      return t('exercises.style.distance');
    case 'RATING':
      return t('exercises.style.rating');
    case 'COMPLETION':
      return t('exercises.style.completion');
  }
}

/** One option's items joined: "Barbell + Bench + Squat rack". */
export function equipmentOptionText(t: T, option: EquipmentOption): string {
  return option.map((item) => equipmentLabel(t, item)).join(t('exercises.equipmentAnd'));
}

/** "No equipment", or the alternatives: "Kettlebell or Dumbbells". */
export function equipmentSummary(t: T, options: readonly EquipmentOption[]): string {
  if (options.length === 0 || options.some((option) => option.length === 0))
    return t('exercises.noEquipment');
  return options.map((option) => equipmentOptionText(t, option)).join(` ${t('exercises.equipmentOr')} `);
}
