/**
 * Basketball self-assessment categories (PRODUCT_SPEC §67). Subjective: how
 * the athlete sees themselves, never an objective measurement. Codes are
 * persisted as-is; labels come from i18n. The order is part of the product
 * contract (it is the presentation and history order).
 */
export const BASKETBALL_SELF_ASSESSMENT_CATEGORIES = [
  'SHOOTING',
  'BALL_HANDLING',
  'PASSING',
  'FINISHING',
  'DEFENSE',
  'SPEED',
] as const;

export type BasketballSelfAssessmentCategory = (typeof BASKETBALL_SELF_ASSESSMENT_CATEGORIES)[number];
