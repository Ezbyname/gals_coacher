/**
 * Basketball-specific player profile (PRODUCT_SPEC §65). Kept out of the
 * generic Player domain. Codes are persisted as-is; labels come from i18n.
 * Every field is optional — a completely empty profile is valid.
 */
export const PRIMARY_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'MULTIPLE', 'NOT_SURE'] as const;
export const SECONDARY_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export const DOMINANT_HANDS = ['RIGHT', 'LEFT', 'BOTH'] as const;
export const EXPERIENCE_LEVELS = ['LESS_THAN_ONE_YEAR', 'ONE_TO_TWO_YEARS', 'THREE_PLUS_YEARS'] as const;
export const WEEKLY_FREQUENCIES = ['ZERO_TO_ONE', 'TWO_TO_THREE', 'FOUR_TO_FIVE', 'SIX_PLUS'] as const;

export type PrimaryPosition = (typeof PRIMARY_POSITIONS)[number];
export type SecondaryPosition = (typeof SECONDARY_POSITIONS)[number];
export type DominantHand = (typeof DOMINANT_HANDS)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type WeeklyFrequency = (typeof WEEKLY_FREQUENCIES)[number];

export interface BasketballProfile {
  readonly primaryPosition: PrimaryPosition | null;
  readonly secondaryPosition: SecondaryPosition | null;
  readonly dominantHand: DominantHand | null;
  readonly experience: ExperienceLevel | null;
  readonly weeklyFrequency: WeeklyFrequency | null;
}

export const EMPTY_BASKETBALL_PROFILE: BasketballProfile = {
  primaryPosition: null,
  secondaryPosition: null,
  dominantHand: null,
  experience: null,
  weeklyFrequency: null,
};

/** Unchecked codes (from a form or from storage). `null`/omitted means empty. */
export type BasketballProfileInput = { readonly [K in keyof BasketballProfile]?: string | null };

export type BasketballProfileErrors = {
  primaryPosition?: 'UNKNOWN_CODE';
  secondaryPosition?: 'UNKNOWN_CODE' | 'REQUIRES_SPECIFIC_PRIMARY' | 'SAME_AS_PRIMARY';
  dominantHand?: 'UNKNOWN_CODE';
  experience?: 'UNKNOWN_CODE';
  weeklyFrequency?: 'UNKNOWN_CODE';
};

export type BasketballProfileValidation =
  | { readonly ok: true; readonly value: BasketballProfile }
  | { readonly ok: false; readonly errors: BasketballProfileErrors };

const UNKNOWN = Symbol('unknown');

function readCode<T extends string>(
  codes: readonly T[],
  value: string | null | undefined,
): T | null | typeof UNKNOWN {
  if (value === null || value === undefined) return null;
  return (codes as readonly string[]).includes(value) ? (value as T) : UNKNOWN;
}

/**
 * Secondary position is optional; when set it must be a specific position
 * (PG–C), differ from the primary, and the primary must itself be a specific
 * position (not empty, MULTIPLE or NOT_SURE).
 */
export function validateBasketballProfile(input: BasketballProfileInput): BasketballProfileValidation {
  const errors: BasketballProfileErrors = {};

  const primaryPosition = readCode(PRIMARY_POSITIONS, input.primaryPosition);
  const secondaryPosition = readCode(SECONDARY_POSITIONS, input.secondaryPosition);
  const dominantHand = readCode(DOMINANT_HANDS, input.dominantHand);
  const experience = readCode(EXPERIENCE_LEVELS, input.experience);
  const weeklyFrequency = readCode(WEEKLY_FREQUENCIES, input.weeklyFrequency);

  if (primaryPosition === UNKNOWN) errors.primaryPosition = 'UNKNOWN_CODE';
  if (dominantHand === UNKNOWN) errors.dominantHand = 'UNKNOWN_CODE';
  if (experience === UNKNOWN) errors.experience = 'UNKNOWN_CODE';
  if (weeklyFrequency === UNKNOWN) errors.weeklyFrequency = 'UNKNOWN_CODE';

  if (secondaryPosition === UNKNOWN) {
    errors.secondaryPosition = 'UNKNOWN_CODE';
  } else if (secondaryPosition !== null && primaryPosition !== UNKNOWN) {
    if (primaryPosition === null || primaryPosition === 'MULTIPLE' || primaryPosition === 'NOT_SURE') {
      errors.secondaryPosition = 'REQUIRES_SPECIFIC_PRIMARY';
    } else if (secondaryPosition === primaryPosition) {
      errors.secondaryPosition = 'SAME_AS_PRIMARY';
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    primaryPosition === UNKNOWN ||
    secondaryPosition === UNKNOWN ||
    dominantHand === UNKNOWN ||
    experience === UNKNOWN ||
    weeklyFrequency === UNKNOWN
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { primaryPosition, secondaryPosition, dominantHand, experience, weeklyFrequency },
  };
}
