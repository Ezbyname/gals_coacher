/**
 * Exercise taxonomy (TRAIN-001): stable codes, persisted / referenced as-is;
 * labels come from i18n. Sport-neutral — basketball drills are data that use
 * these codes plus an ExerciseSport association, never a separate model.
 * Codes are validated in the domain, never with a SQL CHECK list.
 */

/** WHY an exercise is trained (an exercise may serve several). */
export const TRAINING_CATEGORIES = [
  'WARMUP',
  'MOBILITY',
  'FLEXIBILITY',
  'STRENGTH',
  'HYPERTROPHY',
  'POWER',
  'PLYOMETRIC',
  'SPEED',
  'AGILITY',
  'CONDITIONING',
  'CARDIO',
  'HIIT',
  'CORE',
  'STABILITY',
  'COOLDOWN',
  'BASKETBALL_SKILL',
  'BASKETBALL_SHOOTING',
  'BASKETBALL_CONDITIONING',
] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

/** Muscle groups (an exercise has primary and secondary ones). */
export const MUSCLE_GROUPS = [
  'CHEST',
  'UPPER_BACK',
  'LATS',
  'LOWER_BACK',
  'SHOULDERS',
  'BICEPS',
  'TRICEPS',
  'FOREARMS_GRIP',
  'ABDOMINALS',
  'OBLIQUES',
  'LOWER_CORE',
  'GLUTES',
  'QUADRICEPS',
  'HAMSTRINGS',
  'CALVES',
  'HIP_STABILIZERS',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * Body areas, for coarse filtering. Each muscle group belongs to exactly one
 * area; FULL_BODY and POSTERIOR_CHAIN are declared per exercise (they span areas).
 */
export const BODY_AREAS = ['UPPER_BODY', 'CORE', 'LOWER_BODY', 'POSTERIOR_CHAIN', 'FULL_BODY'] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const MUSCLE_AREA: Record<MuscleGroup, 'UPPER_BODY' | 'CORE' | 'LOWER_BODY'> = {
  CHEST: 'UPPER_BODY',
  UPPER_BACK: 'UPPER_BODY',
  LATS: 'UPPER_BODY',
  SHOULDERS: 'UPPER_BODY',
  BICEPS: 'UPPER_BODY',
  TRICEPS: 'UPPER_BODY',
  FOREARMS_GRIP: 'UPPER_BODY',
  LOWER_BACK: 'CORE',
  ABDOMINALS: 'CORE',
  OBLIQUES: 'CORE',
  LOWER_CORE: 'CORE',
  GLUTES: 'LOWER_BODY',
  QUADRICEPS: 'LOWER_BODY',
  HAMSTRINGS: 'LOWER_BODY',
  CALVES: 'LOWER_BODY',
  HIP_STABILIZERS: 'LOWER_BODY',
};

/** The posterior chain, for the POSTERIOR_CHAIN area. */
export const POSTERIOR_CHAIN_MUSCLES: readonly MuscleGroup[] = [
  'HAMSTRINGS',
  'GLUTES',
  'LOWER_BACK',
  'CALVES',
];

/** Athletic movement patterns (balance a program later). */
export const MOVEMENT_PATTERNS = [
  'SQUAT',
  'HINGE',
  'LUNGE',
  'PUSH',
  'PULL',
  'CARRY',
  'ROTATION',
  'ANTI_ROTATION',
  'JUMP',
  'SPRINT',
  'CHANGE_OF_DIRECTION',
  'THROW',
  'LOCOMOTION',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

/**
 * A coaching / programming attribute of the exercise — never a score of the
 * athlete, and never by itself a rule about who may do it.
 */
export const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const isOneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isTrainingCategory = isOneOf(TRAINING_CATEGORIES);
export const isMuscleGroup = isOneOf(MUSCLE_GROUPS);
export const isBodyArea = isOneOf(BODY_AREAS);
export const isMovementPattern = isOneOf(MOVEMENT_PATTERNS);
export const isDifficulty = isOneOf(DIFFICULTIES);
