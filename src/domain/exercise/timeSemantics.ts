import type { MeasurementType } from '../measurement';

/**
 * What a seconds value MEANS for an Exercise (TRAINING-BLOCKS-001, final content review).
 *
 *   DURATION_TARGET        the value is how long to do the exercise: a plank for 30 s, run intervals of 45 s, jump rope for 40 s.
 *   COMPLETION_TIME_CAP    the athlete COMPLETES a course or distance and records the actual time; the configured value is only a
 *                          recording cap — never a performance goal (a 10 m sprint with a 5 s cap).
 *
 * `measurement == TIME` does NOT imply a cap: the rule would be wrong for anything that is not an explicitly classified
 * completion-time drill. Every other Exercise — including every existing one, and every user-created one — keeps the plain
 * duration / goal-time wording it always had. The classification is registry metadata keyed by the stable exercise id (a plan
 * item and a session item keep that id, so a copied plan and a session read the same semantics); no database column is involved.
 */
export type TimeSemantics = 'DURATION_TARGET' | 'COMPLETION_TIME_CAP';

/**
 * The genuine completion-time performance drills (distance or course, actual time recorded). Deliberately small: an exercise is
 * added only when its seconds value really is a cap on a recorded completion time. The published Basketball course drills
 * (cone dribble slalom, defensive slides, lane agility, court sprints) are NOT listed, so their wording is unchanged.
 */
export const COMPLETION_TIME_CAP_EXERCISES: readonly string[] = [
  'SPRINT_10M',
  'SPRINT_20M',
  'SPRINT_30M_FLYING',
  'T_DRILL',
  'PRO_AGILITY_5_10_5',
  'SHUTTLE_RUN',
  'ROW_500M',
  'SLED_PUSH',
];

/** null when the measurement has no seconds value at all (repetitions, distance, attempts…). */
export function timeSemantics(exerciseId: string | null | undefined, type: MeasurementType): TimeSemantics | null {
  if (type !== 'TIME' && type !== 'DURATION') return null;
  return type === 'TIME' && exerciseId != null && COMPLETION_TIME_CAP_EXERCISES.includes(exerciseId) ? 'COMPLETION_TIME_CAP' : 'DURATION_TARGET';
}
