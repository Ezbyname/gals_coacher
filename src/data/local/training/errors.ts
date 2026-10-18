import type { LocalizedText } from '@/domain/exercise/exercise';

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
  | 'professionalWorkout'
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
 * - PLAN_EMPTY (QB-WORKOUT-BUILDER-001A): a planned workout with nothing in it cannot be started.
 * - POSITION_OUT_OF_RANGE: a composition edit named an entry index that does not exist (nothing is clamped).
 * - ASSIGNMENT_INVALID (QB-WORKOUT-BUILDER-001C): an assignment with no Player, the same Player twice, or a bad new-workout name.
 * - BLOCK_INACTIVE / EXERCISE_INACTIVE (QB-BLOCK-LIBRARY): inactive means "not available for NEW use" —
 *   a hidden Block or an inactive Exercise cannot be newly added to a composition.
 */
export type TrainingRule =
  | 'TEMPLATE_INACTIVE'
  | 'PLAN_ALREADY_STARTED'
  | 'SESSION_IN_PROGRESS'
  | 'SESSION_CLOSED'
  | 'NOTHING_PERFORMED'
  | 'SET_ALREADY_RECORDED'
  | 'BLOCK_INACTIVE'
  | 'EXERCISE_INACTIVE'
  | 'PLAN_EMPTY'
  | 'POSITION_OUT_OF_RANGE'
  | 'ASSIGNMENT_INVALID';

export class TrainingRuleError extends Error {
  readonly rule: TrainingRule;
  constructor(rule: TrainingRule) {
    super(`Training rule refused the write: ${rule}`);
    this.name = 'TrainingRuleError';
    this.rule = rule;
  }
}

/**
 * QB-WORKOUT-BUILDER-001C: a multi-Player assignment was refused because of ONE Player. The whole assignment is ONE
 * transaction, so nothing was written for ANY Player. `cause` is the underlying rule / not-found / archived error.
 */
export class AssignmentFailedError extends Error {
  readonly playerId: string;
  readonly cause: unknown;
  constructor(playerId: string, cause: unknown) {
    super(`Assignment refused for player ${playerId}`);
    this.name = 'AssignmentFailedError';
    this.playerId = playerId;
    this.cause = cause;
  }
}

/** What a Template contains that is no longer available for new use. */
export interface UnavailableItems {
  readonly blocks: readonly { readonly id: string; readonly name: string }[];
  readonly exercises: readonly { readonly id: string; readonly name: LocalizedText }[];
}

/**
 * QB safety gate S2: a NEW plan cannot be made from a Template that still contains a hidden Block or an
 * inactive Exercise — nothing is silently added or left out. The user resolves it (edit the Template or
 * restore the items) first. Nothing was written; existing plans and sessions are never touched.
 */
export class TemplateUnavailableItemsError extends Error {
  readonly templateId: string;
  readonly unavailable: UnavailableItems;
  constructor(templateId: string, unavailable: UnavailableItems) {
    super(`Template ${templateId} contains items that are no longer available`);
    this.name = 'TemplateUnavailableItemsError';
    this.templateId = templateId;
    this.unavailable = unavailable;
  }
}
