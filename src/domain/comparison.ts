import type { MeasurementType } from './measurement';

/**
 * HOW improvement is evaluated for an exercise's results. Deliberately separate
 * from MeasurementType (WHAT was measured): the same measurement type can need
 * different comparison rules in different exercises.
 *
 * - LOWER_IS_BETTER / HIGHER_IS_BETTER: a single scalar final result.
 * - CUSTOM: exercise-specific logic decides (e.g. shooting, where 1/1 = 100%
 *   must not beat 18/20 = 90%). That logic and its thresholds are product
 *   rules not yet defined — see PRODUCT_SPEC §24 and §27.
 * - NOT_RANKED: results are recorded but never compared.
 */
export const COMPARISON_POLICIES = [
  'LOWER_IS_BETTER',
  'HIGHER_IS_BETTER',
  'CUSTOM',
  'NOT_RANKED',
] as const;

export type ComparisonPolicy = (typeof COMPARISON_POLICIES)[number];

/**
 * Defaults only where the measurement type alone decides the answer. `null`
 * means the exercise must declare its policy explicitly.
 */
const DEFAULTS: Record<MeasurementType, ComparisonPolicy | null> = {
  TIME: 'LOWER_IS_BETTER',
  // A held plank (longer is better) and a timed drill (shorter is better) can both be DURATION.
  DURATION: null,
  REPETITIONS: 'HIGHER_IS_BETTER',
  // made/attempts is two numbers; comparing them needs a sample-size rule.
  MADE_ATTEMPTS: 'CUSTOM',
  // e.g. throw distance (higher) vs. distance from a target (lower).
  DISTANCE: null,
  // Skill rating (higher) vs. fatigue / discomfort / effort (lower or not ranked).
  RATING: null,
  COMPLETION: 'NOT_RANKED',
};

export function defaultComparisonPolicy(type: MeasurementType): ComparisonPolicy | null {
  return DEFAULTS[type];
}

/**
 * The policy used for an exercise: its explicit policy if set, otherwise the
 * measurement type's default. Throws when neither exists, so an exercise
 * can never be compared with a guessed rule.
 */
export function resolveComparisonPolicy(
  type: MeasurementType,
  explicitPolicy?: ComparisonPolicy | null,
): ComparisonPolicy {
  const policy = explicitPolicy ?? DEFAULTS[type];
  if (!policy) {
    throw new Error(
      `Measurement type ${type} has no default comparison policy; the exercise must declare one.`,
    );
  }
  return policy;
}

export function isComparisonPolicy(value: unknown): value is ComparisonPolicy {
  return typeof value === 'string' && (COMPARISON_POLICIES as readonly string[]).includes(value);
}
