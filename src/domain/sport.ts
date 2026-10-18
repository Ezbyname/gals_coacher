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

/**
 * SPORT-CONTENT-001: the sports the built-in CONTENT catalog (Exercises, taxonomy domains, professional workouts)
 * covers. This is catalog metadata only: a Player's sport assignment and a CalendarEvent's sport stay on
 * V1_ENABLED_SPORTS, so a Player can receive a Football or Surfing workout without being assigned the sport.
 */
export const CONTENT_SPORTS: readonly SportKey[] = ['BASKETBALL', 'FOOTBALL', 'SURFING'];
