/**
 * Stored exercise data that cannot be parsed (corruption, a writer bug, schema
 * drift). Reads fail as a whole; nothing is skipped or repaired. Stable codes
 * only — never user-facing text.
 */
export type ExerciseDataField =
  | 'id'
  | 'builtin'
  | 'active'
  | 'name'
  | 'difficulty'
  | 'measurement'
  | 'categories'
  | 'muscles'
  | 'equipment'
  | 'sports'
  | 'instructions'
  | 'tutorialUrl'
  | 'createdAt'
  | 'updatedAt';
export type ExerciseDataReason = 'INVALID_VALUE' | 'UNKNOWN_CODE' | 'MISSING_ROW';

export class ExerciseDataError extends Error {
  readonly field: ExerciseDataField;
  readonly reason: ExerciseDataReason;
  readonly exerciseId: string | null;

  constructor(field: ExerciseDataField, reason: ExerciseDataReason, exerciseId: string | null) {
    super(
      `Malformed stored exercise: ${field} ${reason}${exerciseId === null ? '' : ` (exercise ${exerciseId})`}`,
    );
    this.name = 'ExerciseDataError';
    this.field = field;
    this.reason = reason;
    this.exerciseId = exerciseId;
  }
}

/** No exercise with this id. Nothing was written. */
export class ExerciseNotFoundError extends Error {
  readonly exerciseId: string;
  constructor(exerciseId: string) {
    super(`Exercise ${exerciseId} not found`);
    this.name = 'ExerciseNotFoundError';
    this.exerciseId = exerciseId;
  }
}

/** Built-in (curated) exercises cannot be edited — only made inactive / active. Nothing was written. */
export class BuiltinExerciseReadOnlyError extends Error {
  readonly exerciseId: string;
  constructor(exerciseId: string) {
    super(`Built-in exercise ${exerciseId} cannot be edited`);
    this.name = 'BuiltinExerciseReadOnlyError';
    this.exerciseId = exerciseId;
  }
}
