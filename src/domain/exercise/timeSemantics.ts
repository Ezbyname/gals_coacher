import type { MeasurementType } from '../measurement';

/**
 * What a seconds value MEANS in ONE prescription (TRAINING-BLOCKS-001). The meaning belongs to the prescription — to the copied
 * plan item and to the session exercise it starts — and is stored with them (schema v22), so history never changes meaning:
 *
 *   DURATION_TARGET        how long to do it: a plank for 30 s, run intervals of 45 s, a shuttle run worked for 30 s.
 *   PERFORMANCE_GOAL_TIME  a goal time for a timed task. This is what a TIME value meant before the cap existed ("Goal time"),
 *                          so a stored TIME value with no explicit meaning resolves to it.
 *   COMPLETION_TIME_CAP    the athlete COMPLETES a fixed course or distance and records the actual time; the configured value is
 *                          only a recording cap — never a performance goal, never a pass / fail line. A real result above the
 *                          cap is recorded as it is.
 *
 * Nothing is inferred from the exercise id: the same exercise (a 20 m sprint) can be a goal time in an old custom workout and a
 * cap in a new Training Block. Only a prescription that explicitly says so is a cap.
 */
export const TIME_SEMANTICS = ['DURATION_TARGET', 'PERFORMANCE_GOAL_TIME', 'COMPLETION_TIME_CAP'] as const;
export type TimeSemantics = (typeof TIME_SEMANTICS)[number];

export const isTimeSemantics = (value: unknown): value is TimeSemantics => (TIME_SEMANTICS as readonly unknown[]).includes(value);

/**
 * The meaning of the seconds value of one prescription; null when the measurement has no seconds value.
 *   DURATION measurement            → DURATION_TARGET (always)
 *   TIME measurement, no stored one → PERFORMANCE_GOAL_TIME (the historical "Goal time")
 *   TIME measurement, stored one    → that one
 */
export function resolveTimeSemantics(type: MeasurementType, stored: TimeSemantics | null | undefined): TimeSemantics | null {
  if (type === 'DURATION') return 'DURATION_TARGET';
  if (type === 'TIME') return stored ?? 'PERFORMANCE_GOAL_TIME';
  return null;
}

/** The value worth storing with a prescription: only a TIME prescription carries an explicit meaning; everything else is null. */
export function storableTimeSemantics(type: MeasurementType, value: TimeSemantics | null | undefined): TimeSemantics | null {
  return type === 'TIME' && value != null && isTimeSemantics(value) ? value : null;
}
