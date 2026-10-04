import { BASKETBALL_SELF_ASSESSMENT_CATEGORIES } from './basketball/selfAssessment';
import type { Uuid } from './ids';
import { SPORTS, type SportKey } from './sport';

/**
 * Self-assessment (PRODUCT_SPEC §67, ARCHITECTURE §9): the athlete's own
 * perception, one 1–5 answer per category of a sport. Sport-neutral; the
 * category lists are sport data. It is not a measurement or a result (no
 * MeasurementType, no comparison policy) and nothing here derives a total,
 * average, level or score from the answers.
 */

/** The only valid answers. No 0, no "not sure". */
export const SELF_RATINGS = [1, 2, 3, 4, 5] as const;
export type SelfRating = (typeof SELF_RATINGS)[number];

export function isSelfRating(value: unknown): value is SelfRating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export interface SelfAssessmentRating {
  /** A category code of the assessment's sport (e.g. BASKETBALL `SHOOTING`). */
  readonly category: string;
  readonly rating: SelfRating;
}

/** A completed, immutable self-assessment. */
export interface SelfAssessment {
  readonly id: Uuid;
  readonly playerId: Uuid;
  readonly sport: SportKey;
  /** Epoch milliseconds (device wall clock when it was taken). */
  readonly takenAt: number;
  /** Exactly one answer per category of the sport, in the sport's category order. */
  readonly ratings: readonly SelfAssessmentRating[];
}

/** Sports that have a self-assessment, with their ordered categories. Basketball only today. */
const CATEGORIES_BY_SPORT: Partial<Record<SportKey, readonly string[]>> = {
  BASKETBALL: BASKETBALL_SELF_ASSESSMENT_CATEGORIES,
};

/** The ordered categories of a sport's self-assessment, or null when the sport has none. */
export function selfAssessmentCategories(sport: SportKey): readonly string[] | null {
  return CATEGORIES_BY_SPORT[sport] ?? null;
}

/** Raw answers (from a form or from storage). An unanswered category is omitted or null. */
export interface SelfAssessmentInput {
  readonly sport: string;
  readonly takenAt: number;
  readonly ratings: readonly { readonly category: string; readonly rating?: number | null }[];
}

/** Validated fields, ready to persist; ids are added by the repository. */
export interface SelfAssessmentCore {
  readonly sport: SportKey;
  readonly takenAt: number;
  readonly ratings: readonly SelfAssessmentRating[];
}

/**
 * Per-category problems, keyed by category code:
 * - `MISSING`: a category of the sport has no answer (absent, null or undefined);
 * - `INVALID_RATING`: the answer is not a whole number 1–5;
 * - `DUPLICATE`: the category was answered more than once;
 * - `UNKNOWN_CATEGORY`: not a category of this sport.
 */
export type SelfAssessmentCategoryError = 'MISSING' | 'INVALID_RATING' | 'DUPLICATE' | 'UNKNOWN_CATEGORY';

export type SelfAssessmentErrors = {
  sport?: 'UNSUPPORTED_SPORT';
  takenAt?: 'INVALID_TIMESTAMP';
  ratings?: 'EMPTY';
  categories?: Readonly<Record<string, SelfAssessmentCategoryError>>;
};

export type SelfAssessmentValidation =
  | { readonly ok: true; readonly value: SelfAssessmentCore }
  | { readonly ok: false; readonly errors: SelfAssessmentErrors };

function supportedSport(sport: string): SportKey | null {
  if (!(SPORTS as readonly string[]).includes(sport)) return null;
  return selfAssessmentCategories(sport as SportKey) === null ? null : (sport as SportKey);
}

/**
 * A completed self-assessment: the sport has a self-assessment, every one of
 * its categories is answered exactly once with a whole number 1–5, and
 * nothing else is present. Input order does not matter; the result lists the
 * answers in the sport's category order. `takenAt` is supplied by the caller
 * (never read from a clock here) and must be a whole number of milliseconds,
 * like the other stored timestamps.
 */
export function validateSelfAssessment(input: SelfAssessmentInput): SelfAssessmentValidation {
  const errors: SelfAssessmentErrors = {};

  if (!Number.isSafeInteger(input.takenAt)) errors.takenAt = 'INVALID_TIMESTAMP';
  if (input.ratings.length === 0) errors.ratings = 'EMPTY';

  const sport = supportedSport(input.sport);
  if (sport === null) {
    errors.sport = 'UNSUPPORTED_SPORT';
    return { ok: false, errors };
  }

  const categories = selfAssessmentCategories(sport)!;
  // A Map, not a plain object: category codes are arbitrary strings, and a key
  // such as "__proto__" would not become an own property of `{}`.
  const problems = new Map<string, SelfAssessmentCategoryError>();
  const answers = new Map<string, SelfRating>();
  const seen = new Set<string>();

  for (const { category, rating } of input.ratings) {
    if (!categories.includes(category)) {
      problems.set(category, 'UNKNOWN_CATEGORY');
    } else if (seen.has(category)) {
      problems.set(category, 'DUPLICATE');
    } else if (rating === null || rating === undefined) {
      problems.set(category, 'MISSING');
    } else if (!isSelfRating(rating)) {
      problems.set(category, 'INVALID_RATING');
    } else {
      answers.set(category, rating);
    }
    seen.add(category);
  }
  for (const category of categories) {
    if (!seen.has(category)) problems.set(category, 'MISSING');
  }

  // Object.fromEntries defines own data properties, so every key (even "__proto__") is kept.
  if (problems.size > 0) errors.categories = Object.fromEntries(problems);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      sport,
      takenAt: input.takenAt,
      ratings: categories.map((category) => ({ category, rating: answers.get(category)! })),
    },
  };
}
