/**
 * How an exercise is measured. This is sport-agnostic: basketball, football,
 * surfing etc. all reuse these types. Never add sport-specific values here.
 * See docs/ARCHITECTURE.md §"Generic domain, specialized UX".
 */
export const MEASUREMENT_TYPES = [
  'TIME',
  'DURATION',
  'REPETITIONS',
  'MADE_ATTEMPTS',
  'DISTANCE',
  'RATING',
  'COMPLETION',
] as const;

export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

/** Whether a smaller final value is a better result (e.g. sprint time). */
export type ResultDirection = 'LOWER_IS_BETTER' | 'HIGHER_IS_BETTER' | 'NOT_RANKED';

const DIRECTION: Record<MeasurementType, ResultDirection> = {
  // TIME = "how fast did you complete it" (sprint, slalom).
  TIME: 'LOWER_IS_BETTER',
  // DURATION = "how long did you hold/sustain it" (plank, wall sit).
  DURATION: 'HIGHER_IS_BETTER',
  REPETITIONS: 'HIGHER_IS_BETTER',
  MADE_ATTEMPTS: 'HIGHER_IS_BETTER',
  DISTANCE: 'HIGHER_IS_BETTER',
  RATING: 'HIGHER_IS_BETTER',
  COMPLETION: 'NOT_RANKED',
};

export function resultDirection(type: MeasurementType): ResultDirection {
  return DIRECTION[type];
}

export function isMeasurementType(value: unknown): value is MeasurementType {
  return typeof value === 'string' && (MEASUREMENT_TYPES as readonly string[]).includes(value);
}
