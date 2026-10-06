/**
 * Training persistence errors (TRAIN-002). Stable codes only — never
 * user-facing text; screens map them to localized messages.
 */
export type TrainingDataReason = 'INVALID_VALUE' | 'UNKNOWN_CODE' | 'MISSING_ROW';

/** Stored training data that cannot be parsed. Reads fail as a whole; nothing is repaired. */
export class TrainingDataError extends Error {
  readonly field: string;
  readonly reason: TrainingDataReason;
  readonly rowId: string | null;
  constructor(field: string, reason: TrainingDataReason, rowId: string | null) {
    super(`Malformed stored training data: ${field} ${reason}${rowId === null ? '' : ` (${rowId})`}`);
    this.name = 'TrainingDataError';
    this.field = field;
    this.reason = reason;
    this.rowId = rowId;
  }
}

export type TrainingEntity =
  | 'block'
  | 'template'
  | 'player'
  | 'plannedWorkout'
  | 'session'
  | 'sessionExercise'
  | 'set'
  | 'exercise';

/** The referenced row does not exist. Nothing was written. */
export class TrainingNotFoundError extends Error {
  readonly entity: TrainingEntity;
  readonly id: string;
  constructor(entity: TrainingEntity, id: string) {
    super(`${entity} ${id} not found`);
    this.name = 'TrainingNotFoundError';
    this.entity = entity;
    this.id = id;
  }
}

/**
 * A training rule refused the write. Nothing was written.
 * - TEMPLATE_INACTIVE: an inactive template cannot be planned.
 * - PLAN_ALREADY_STARTED: a planned workout is performed at most once.
 * - SESSION_IN_PROGRESS: the player already has a session in progress.
 * - SESSION_CLOSED: a finished session is read-only.
 * - NOTHING_PERFORMED: a session with no performed set cannot be finished (abandon it).
 * - SET_ALREADY_RECORDED: a performed set cannot be skipped.
 */
export type TrainingRule =
  | 'TEMPLATE_INACTIVE'
  | 'PLAN_ALREADY_STARTED'
  | 'SESSION_IN_PROGRESS'
  | 'SESSION_CLOSED'
  | 'NOTHING_PERFORMED'
  | 'SET_ALREADY_RECORDED';

export class TrainingRuleError extends Error {
  readonly rule: TrainingRule;
  constructor(rule: TrainingRule) {
    super(`Training rule refused the write: ${rule}`);
    this.name = 'TrainingRuleError';
    this.rule = rule;
  }
}
