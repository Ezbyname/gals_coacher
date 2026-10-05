import {
  BASKETBALL_SELF_ASSESSMENT_CATEGORIES,
  type BasketballSelfAssessmentCategory,
} from '@/domain/basketball/selfAssessment';
import {
  SelfAssessmentDataError,
  SelfAssessmentSportNotAssignedError,
} from '@/data/local/selfAssessments/errors';
import { PlayerNotFoundError, SportInactiveError } from '@/data/local/players/errors';
import { ltr } from '@/i18n/bidi';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** Self-assessment is Basketball-only today (PRODUCT_SPEC §67). */
export const SELF_ASSESSMENT_SPORT = 'BASKETBALL';
export const CATEGORIES = BASKETBALL_SELF_ASSESSMENT_CATEGORIES;
export const RATING_MAX = 5;

/** The translated name of a Basketball self-assessment category code. */
export function categoryLabel(t: T, category: string): string {
  return t(`basketball.selfAssessmentCategory.${category as BasketballSelfAssessmentCategory}`);
}

/** One answer as `n/5`, kept left-to-right inside Hebrew text. */
export function ratingText(rating: number): string {
  return ltr(`${rating}/${RATING_MAX}`);
}

/** Storage / data errors → a localized, user-safe message (raw details are only logged). */
export function selfAssessmentErrorMessage(e: unknown, fallback: TranslationKey): TranslationKey {
  if (e instanceof PlayerNotFoundError) return 'selfAssessment.errors.playerNotFound';
  if (e instanceof SelfAssessmentSportNotAssignedError) return 'selfAssessment.errors.noBasketball';
  if (e instanceof SportInactiveError) return 'selfAssessment.errors.inactive';
  if (e instanceof SelfAssessmentDataError) return 'selfAssessment.errors.dataInvalid';
  return fallback;
}
