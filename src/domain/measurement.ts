/**
 * WHAT was measured for an exercise. This is sport-agnostic: basketball,
 * football, surfing etc. all reuse these types. Never add sport-specific values
 * here. HOW results are compared lives separately in ./comparison.ts.
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

export function isMeasurementType(value: unknown): value is MeasurementType {
  return typeof value === 'string' && (MEASUREMENT_TYPES as readonly string[]).includes(value);
}
