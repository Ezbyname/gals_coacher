import type { SetStatus } from './training';

/**
 * TRAINING-STOPWATCH-001 — live execution progress, DERIVED from the SessionSet states (PENDING / DONE / SKIPPED). Nothing
 * here is persisted and no state is duplicated: the same sets always give the same answer. Planned and extra sets are
 * counted separately — an extra set is never added to the planned denominator ("3 / 3 planned" + "1 extra", never "4 / 3").
 */
interface SetLike {
  readonly id: string;
  readonly setNumber: number;
  readonly planned: boolean;
  readonly status: SetStatus;
}
interface ExerciseLike {
  readonly id: string;
  readonly position: number;
  readonly sets: readonly SetLike[];
}

export type ExerciseProgressState =
  /** A planned set is still pending. */
  | 'IN_PROGRESS'
  /** Every planned set is DONE and nothing extra is pending. */
  | 'COMPLETED'
  /** Nothing is pending any more, but at least one planned set was skipped. */
  | 'COMPLETED_WITH_SKIPPED'
  /** Every planned set was resolved but an explicitly added extra set is still pending: NOT "completed" yet. */
  | 'PLANNED_DONE_EXTRA_PENDING';

export interface ExerciseProgress {
  readonly planned: number;
  readonly plannedDone: number;
  readonly plannedSkipped: number;
  readonly plannedPending: number;
  readonly extraDone: number;
  readonly extraSkipped: number;
  readonly extraPending: number;
  /** Skipped sets of any kind. */
  readonly skipped: number;
  readonly state: ExerciseProgressState;
}

export function exerciseProgress(sets: readonly SetLike[]): ExerciseProgress {
  const count = (planned: boolean, status: SetStatus) => sets.filter((s) => s.planned === planned && s.status === status).length;
  const plannedDone = count(true, 'DONE');
  const plannedSkipped = count(true, 'SKIPPED');
  const plannedPending = count(true, 'PENDING');
  const extraDone = count(false, 'DONE');
  const extraSkipped = count(false, 'SKIPPED');
  const extraPending = count(false, 'PENDING');
  let state: ExerciseProgressState;
  if (plannedPending > 0) state = 'IN_PROGRESS';
  else if (extraPending > 0) state = 'PLANNED_DONE_EXTRA_PENDING';
  else state = plannedSkipped > 0 ? 'COMPLETED_WITH_SKIPPED' : 'COMPLETED';
  return {
    planned: plannedDone + plannedSkipped + plannedPending,
    plannedDone,
    plannedSkipped,
    plannedPending,
    extraDone,
    extraSkipped,
    extraPending,
    skipped: plannedSkipped + extraSkipped,
    state,
  };
}

export interface WorkoutProgress {
  readonly plannedSets: number;
  readonly plannedDone: number;
  readonly skipped: number;
  readonly extraDone: number;
  readonly extraPending: number;
  readonly exercises: number;
  /** Exercises whose state is COMPLETED (no skipped planned set, nothing pending). */
  readonly exercisesCompleted: number;
}

export function workoutProgress(exercises: readonly ExerciseLike[]): WorkoutProgress {
  const parts = exercises.map((e) => exerciseProgress(e.sets));
  const sum = (pick: (p: ExerciseProgress) => number) => parts.reduce((total, p) => total + pick(p), 0);
  return {
    plannedSets: sum((p) => p.planned),
    plannedDone: sum((p) => p.plannedDone),
    skipped: sum((p) => p.skipped),
    extraDone: sum((p) => p.extraDone),
    extraPending: sum((p) => p.extraPending),
    exercises: exercises.length,
    exercisesCompleted: parts.filter((p) => p.state === 'COMPLETED').length,
  };
}

/**
 * The set to hint as "Next": the first PENDING planned set in workout order (exercise order, then set number); when no
 * planned set is pending, the first pending extra set. A visual hint only — the athlete may perform sets in any order.
 */
export function nextSetId(exercises: readonly ExerciseLike[]): string | null {
  const ordered = [...exercises].sort((a, b) => a.position - b.position);
  for (const wantPlanned of [true, false]) {
    for (const e of ordered) {
      const hit = [...e.sets].sort((a, b) => a.setNumber - b.setNumber).find((s) => s.planned === wantPlanned && s.status === 'PENDING');
      if (hit) return hit.id;
    }
  }
  return null;
}
