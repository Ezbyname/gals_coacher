/**
 * Sports are data, not code branches. V1 ships BASKETBALL only; the other keys
 * exist so the core never has to assume a single sport.
 */
export const SPORTS = [
  'BASKETBALL',
  'FOOTBALL',
  'SURFING',
  'RUNNING',
  'GENERAL_FITNESS',
  'SWIMMING',
  'TENNIS',
] as const;

export type SportKey = (typeof SPORTS)[number];

export const V1_ENABLED_SPORTS: readonly SportKey[] = ['BASKETBALL'];
