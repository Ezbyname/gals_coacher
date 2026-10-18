import { isUuid } from '../ids';
import {
  isComparisonPolicy,
  resolveComparisonPolicy,
  type ComparisonPolicy,
  defaultComparisonPolicy,
} from '../comparison';
import { isMeasurementType, type MeasurementType } from '../measurement';
import { SPORTS, type SportKey } from '../sport';

import {
  doableWith,
  isEquipmentId,
  needsNoEquipment,
  type EquipmentId,
  type EquipmentOption,
} from './equipment';
import {
  MUSCLE_AREA,
  POSTERIOR_CHAIN_MUSCLES,
  isDifficulty,
  isMuscleGroup,
  isTrainingCategory,
  type BodyArea,
  type Difficulty,
  type MovementPattern,
  type MuscleGroup,
  type TrainingCategory,
} from './taxonomy';

/** Text in both app languages (built-in catalog content). */
export type LocalizedText = { readonly he: string; readonly en: string };

/**
 * HOW an exercise is measured — within the approved MeasurementType (WHAT is
 * measured, ARCHITECTURE §9): a load and a fixed distance are CONDITIONS of a
 * set, not new measurement types.
 *   Bench Press  = REPETITIONS, usesLoad      → reps at a load
 *   Plank        = DURATION (higher is better) → seconds held
 *   20 m Sprint  = TIME, distanceM 20          → seconds over 20 m
 *   Free Throws  = MADE_ATTEMPTS               → makes / attempts
 *   Broad Jump   = DISTANCE (higher is better) → metres / centimetres
 * Results always store measured / final / edited (ARCHITECTURE §5); a future
 * camera or sensor fills the same measurement with another source.
 */
export interface ExerciseMeasurement {
  readonly type: MeasurementType;
  /** Required when the type has no default policy (DURATION, DISTANCE, RATING). */
  readonly comparison: ComparisonPolicy | null;
  /** A set records an external load (kg) as its condition (see loadApplies). */
  readonly usesLoad: boolean;
  /** A TIME exercise over a fixed distance (metres), e.g. a 20 m sprint. */
  readonly distanceM: number | null;
}

/** Suggested starting prescription (the builder may change everything). */
export interface ExerciseDefaults {
  readonly sets: number;
  /** In the measurement's unit: reps, seconds, attempts, rounds… */
  readonly target: number | null;
  readonly restSec: number;
}

/** A complete exercise / drill definition (built-in or custom). */
export interface ExerciseDefinition {
  readonly id: string;
  /** Built-in: localized; custom: the user's text in both slots (never translated). */
  readonly name: LocalizedText;
  readonly categories: readonly TrainingCategory[];
  readonly primaryMuscles: readonly MuscleGroup[];
  readonly secondaryMuscles: readonly MuscleGroup[];
  /** Areas beyond the muscles' own (FULL_BODY, POSTERIOR_CHAIN). */
  readonly extraAreas: readonly ('FULL_BODY' | 'POSTERIOR_CHAIN')[];
  readonly movementPatterns: readonly MovementPattern[];
  readonly difficulty: Difficulty;
  /** ExerciseSport association: empty = general athletic training. */
  readonly sports: readonly SportKey[];
  /** Alternatives (see equipment.ts); empty = bodyweight. */
  readonly equipment: readonly EquipmentOption[];
  readonly measurement: ExerciseMeasurement;
  readonly defaults: ExerciseDefaults | null;
  readonly instructions: LocalizedText | null;
  readonly cues: readonly LocalizedText[];
  readonly mistakes: readonly LocalizedText[];
  /** Coaching safety note (not medical advice). */
  readonly safety: LocalizedText | null;
  readonly tutorialUrl: string | null;
}

/** A library entry: a definition plus where it comes from and whether it is offered. */
export interface Exercise extends ExerciseDefinition {
  readonly builtin: boolean;
  /** Inactive: hidden from NEW selection; every historical use stays valid. */
  readonly active: boolean;
}

/** The body areas an exercise trains (from its primary muscles, plus declared spanning areas). */
export function bodyAreasOf(exercise: Pick<ExerciseDefinition, 'primaryMuscles' | 'extraAreas'>): BodyArea[] {
  const areas = new Set<BodyArea>(exercise.primaryMuscles.map((muscle) => MUSCLE_AREA[muscle]));
  for (const area of exercise.extraAreas) areas.add(area);
  if (exercise.primaryMuscles.filter((m) => POSTERIOR_CHAIN_MUSCLES.includes(m)).length >= 2) {
    areas.add('POSTERIOR_CHAIN');
  }
  return [...areas];
}

/** The comparison actually used for results (never guessed — throws if undeclared where required). */
export function exerciseComparison(measurement: ExerciseMeasurement): ComparisonPolicy {
  return resolveComparisonPolicy(measurement.type, measurement.comparison);
}

// ---------------------------------------------------------------------------
// Filtering (search + filters). Every dimension: empty = all; values inside a
// dimension combine with OR; dimensions combine with AND.

export interface ExerciseFilter {
  readonly query: string;
  readonly categories: readonly TrainingCategory[];
  /** Muscle groups (primary or secondary) or body areas. */
  readonly muscles: readonly MuscleGroup[];
  readonly areas: readonly BodyArea[];
  readonly difficulties: readonly Difficulty[];
  readonly sports: readonly SportKey[];
  /** Only exercises needing no equipment at all. */
  readonly bodyweightOnly: boolean;
  /** null: equipment not considered; a set: only exercises doable with exactly this equipment. */
  readonly available: readonly EquipmentId[] | null;
  /** Inactive exercises are hidden unless asked for. */
  readonly includeInactive: boolean;
}

export const NO_EXERCISE_FILTER: ExerciseFilter = {
  query: '',
  categories: [],
  muscles: [],
  areas: [],
  difficulties: [],
  sports: [],
  bodyweightOnly: false,
  available: null,
  includeInactive: false,
};

/** Case-, accent- and spacing-insensitive text for search (Hebrew and English). */
export function searchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-֑ͯ-ׇ]/g, '') // Latin accents, Hebrew niqqud / cantillation
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesExerciseFilter(exercise: Exercise, filter: ExerciseFilter): boolean {
  const any = <T>(wanted: readonly T[], has: readonly T[]) =>
    wanted.length === 0 || wanted.some((w) => has.includes(w));
  if (!exercise.active && !filter.includeInactive) return false;
  const query = searchKey(filter.query);
  if (query.length > 0 && !searchKey(`${exercise.name.he} ${exercise.name.en}`).includes(query)) return false;
  if (!any(filter.categories, exercise.categories)) return false;
  if (!any(filter.muscles, [...exercise.primaryMuscles, ...exercise.secondaryMuscles])) return false;
  if (!any(filter.areas, bodyAreasOf(exercise))) return false;
  if (!any(filter.difficulties, [exercise.difficulty])) return false;
  if (!any(filter.sports, exercise.sports)) return false;
  if (filter.bodyweightOnly && !needsNoEquipment(exercise.equipment)) return false;
  if (filter.available !== null && !doableWith(exercise.equipment, filter.available)) return false;
  return true;
}

/**
 * One collator per language, created on first use and reused. A collator is
 * immutable, so reuse cannot go stale. Calling `localeCompare(…, language)`
 * per comparison builds the locale machinery every time — on Android that cost
 * 1.2–4.5 s and a GC storm to sort ~130 exercises (PERF-FOUNDATION-001); the
 * reused collator gives the same order in ~30 ms.
 */
const collators = new Map<'he' | 'en', Intl.Collator>();
function collatorFor(language: 'he' | 'en'): Intl.Collator {
  let collator = collators.get(language);
  if (collator === undefined) {
    collator = new Intl.Collator(language);
    collators.set(language, collator);
  }
  return collator;
}

/** Matching exercises, ordered by name in the given language (then id). Pure. */
export function filterExercises(
  exercises: readonly Exercise[],
  filter: ExerciseFilter,
  language: 'he' | 'en',
): Exercise[] {
  const collator = collatorFor(language);
  return exercises
    .filter((exercise) => matchesExerciseFilter(exercise, filter))
    .sort(
      (a, b) =>
        collator.compare(a.name[language], b.name[language]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

// ---------------------------------------------------------------------------
// Custom exercises

/** The longest custom exercise name — the owner-approved Title limit (shown in the same lists). */
export const EXERCISE_NAME_MAX_LENGTH = 35;
/** Free-text instructions of a custom exercise. */
export const EXERCISE_INSTRUCTIONS_MAX_LENGTH = 1000;

/** What the user enters for a custom exercise (unchecked). */
export interface CustomExerciseInput {
  readonly name: string;
  readonly categories: readonly string[];
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly difficulty: string | null;
  readonly sports: readonly string[];
  readonly equipment: readonly (readonly string[])[];
  readonly measurementType: string | null;
  readonly comparison: string | null;
  readonly usesLoad: boolean;
  readonly instructions: string;
  readonly tutorialUrl: string;
}

export type CustomExerciseErrors = {
  name?: 'REQUIRED' | 'TOO_LONG' | 'DUPLICATE';
  categories?: 'REQUIRED' | 'UNKNOWN_CODE';
  primaryMuscles?: 'REQUIRED' | 'UNKNOWN_CODE';
  secondaryMuscles?: 'UNKNOWN_CODE' | 'OVERLAPS_PRIMARY';
  difficulty?: 'REQUIRED';
  sports?: 'UNKNOWN_CODE';
  equipment?: 'UNKNOWN_CODE' | 'EMPTY_OPTION';
  measurementType?: 'REQUIRED';
  comparison?: 'REQUIRED' | 'UNKNOWN_CODE';
  usesLoad?: 'NOT_FOR_TYPE';
  instructions?: 'TOO_LONG';
  tutorialUrl?: 'INVALID_URL';
};

/** A validated custom definition (id / timestamps / active added by the repository). */
export type CustomExerciseCore = Omit<
  ExerciseDefinition,
  'id' | 'cues' | 'mistakes' | 'safety' | 'defaults' | 'extraAreas' | 'movementPatterns'
>;

const uniq = <T>(values: readonly T[]) => [...new Set(values)];

/** Basketball skill / shooting drills train a skill, not a muscle group: muscles are optional for them. */
export const SKILL_CATEGORIES: readonly TrainingCategory[] = [
  'BASKETBALL_SKILL',
  'BASKETBALL_SHOOTING',
  'FOOTBALL_SKILL',
  'FOOTBALL_SHOOTING',
  'SURF_SKILL',
];
export function isSkillOnly(categories: readonly string[]): boolean {
  return (
    categories.length > 0 && categories.every((c) => (SKILL_CATEGORIES as readonly string[]).includes(c))
  );
}

/**
 * A load (kg) is a condition of a set for reps, holds / carries and timed
 * work (e.g. a sled push) — never for makes / attempts, ratings or completion.
 */
export function loadApplies(type: MeasurementType): boolean {
  return type === 'REPETITIONS' || type === 'DURATION' || type === 'TIME' || type === 'DISTANCE';
}

/**
 * Validates a custom exercise. Text is trimmed (nothing else is rewritten); a
 * custom name is shown exactly as entered in both languages (never
 * translated). Codes must be known; a load only applies to repetitions; a
 * type without a default comparison (DURATION, DISTANCE, RATING) needs one;
 * a tutorial link must be http(s). Duplicate names (case-insensitive, among
 * custom exercises) are refused.
 */
export function validateCustomExercise(
  input: CustomExerciseInput,
  existingCustomNames: readonly string[],
): { ok: true; value: CustomExerciseCore } | { ok: false; errors: CustomExerciseErrors } {
  const errors: CustomExerciseErrors = {};
  const name = input.name.trim();
  if (name.length === 0) errors.name = 'REQUIRED';
  else if (name.length > EXERCISE_NAME_MAX_LENGTH) errors.name = 'TOO_LONG';
  else if (
    existingCustomNames.some((other) => other.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
  ) {
    errors.name = 'DUPLICATE';
  }

  const categories = uniq(input.categories);
  if (categories.length === 0) errors.categories = 'REQUIRED';
  else if (!categories.every(isTrainingCategory)) errors.categories = 'UNKNOWN_CODE';

  const primary = uniq(input.primaryMuscles);
  if (primary.length === 0 && !isSkillOnly(categories)) errors.primaryMuscles = 'REQUIRED';
  else if (!primary.every(isMuscleGroup)) errors.primaryMuscles = 'UNKNOWN_CODE';
  const secondary = uniq(input.secondaryMuscles);
  if (!secondary.every(isMuscleGroup)) errors.secondaryMuscles = 'UNKNOWN_CODE';
  else if (secondary.some((m) => primary.includes(m))) errors.secondaryMuscles = 'OVERLAPS_PRIMARY';

  if (!isDifficulty(input.difficulty)) errors.difficulty = 'REQUIRED';

  const sports = uniq(input.sports);
  if (!sports.every((s) => (SPORTS as readonly string[]).includes(s))) errors.sports = 'UNKNOWN_CODE';

  const equipment = input.equipment.map((option) => uniq(option));
  if (equipment.some((option) => option.length === 0)) errors.equipment = 'EMPTY_OPTION';
  else if (!equipment.every((option) => option.every(isEquipmentId))) errors.equipment = 'UNKNOWN_CODE';

  const type = isMeasurementType(input.measurementType) ? input.measurementType : null;
  if (type === null) errors.measurementType = 'REQUIRED';
  let comparison: ComparisonPolicy | null = null;
  if (input.comparison !== null && input.comparison !== '') {
    if (isComparisonPolicy(input.comparison)) comparison = input.comparison;
    else errors.comparison = 'UNKNOWN_CODE';
  }
  if (type !== null && comparison === null && defaultComparisonPolicy(type) === null && !errors.comparison) {
    errors.comparison = 'REQUIRED';
  }
  if (input.usesLoad && type !== null && !loadApplies(type)) errors.usesLoad = 'NOT_FOR_TYPE';

  const instructions = input.instructions.trim();
  if (instructions.length > EXERCISE_INSTRUCTIONS_MAX_LENGTH) errors.instructions = 'TOO_LONG';
  const tutorialUrl = input.tutorialUrl.trim();
  if (tutorialUrl.length > 0 && !/^https?:\/\/\S+$/i.test(tutorialUrl)) errors.tutorialUrl = 'INVALID_URL';

  if (Object.keys(errors).length > 0 || type === null || !isDifficulty(input.difficulty)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      name: { he: name, en: name },
      categories: categories as TrainingCategory[],
      primaryMuscles: primary as MuscleGroup[],
      secondaryMuscles: secondary as MuscleGroup[],
      difficulty: input.difficulty,
      sports: sports as SportKey[],
      equipment: equipment as EquipmentId[][],
      measurement: { type, comparison, usesLoad: input.usesLoad, distanceM: null },
      instructions: instructions.length > 0 ? { he: instructions, en: instructions } : null,
      tutorialUrl: tutorialUrl.length > 0 ? tutorialUrl : null,
    },
  };
}

/** A custom exercise id is a client UUID; a built-in id is a catalog code. */
export function isCustomExerciseId(id: string): boolean {
  return isUuid(id);
}
