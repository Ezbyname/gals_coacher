/**
 * Stored calendar data that cannot be parsed (corruption, a writer bug,
 * schema drift). Reads fail as a whole with this error; nothing is skipped,
 * repaired or defaulted. Stable codes only — never user-facing text.
 */
export type CalendarEventDataField =
  | 'id'
  | 'playerId'
  | 'type'
  | 'sport'
  | 'startAt'
  | 'endAt'
  | 'title'
  | 'notes'
  | 'location'
  | 'source'
  | 'importBatchId'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt'
  | 'completionSource';

export type CalendarEventDataReason = 'INVALID_VALUE' | 'UNKNOWN_CODE' | 'INVALID_RELATIONSHIP';

export class CalendarEventDataError extends Error {
  readonly field: CalendarEventDataField;
  readonly reason: CalendarEventDataReason;
  /** The stored event id when known (it may itself be the malformed value). */
  readonly eventId: string | null;

  constructor(field: CalendarEventDataField, reason: CalendarEventDataReason, eventId: string | null) {
    super(
      `Malformed stored calendar event: ${field} ${reason}${eventId === null ? '' : ` (event ${eventId})`}`,
    );
    this.name = 'CalendarEventDataError';
    this.field = field;
    this.reason = reason;
    this.eventId = eventId;
  }
}

/** An event was given a sport the Player is not assigned to. Nothing was written. */
export class CalendarSportNotAssignedError extends Error {
  readonly playerId: string;
  readonly sport: string;

  constructor(playerId: string, sport: string) {
    super(`Player ${playerId} has no ${sport} assignment for a calendar event`);
    this.name = 'CalendarSportNotAssignedError';
    this.playerId = playerId;
    this.sport = sport;
  }
}

/** No event with this id belongs to this Player. Nothing was written. */
export class CalendarEventNotFoundError extends Error {
  readonly playerId: string;
  readonly eventId: string;

  constructor(playerId: string, eventId: string) {
    super(`Calendar event ${eventId} not found for player ${playerId}`);
    this.name = 'CalendarEventNotFoundError';
    this.playerId = playerId;
    this.eventId = eventId;
  }
}

/**
 * QB-WORKOUT-BUILDER-001D: a rule refused scheduling / unscheduling a PlannedWorkout. Nothing was written.
 * - PLAN_NOT_FOUND / NOT_SCHEDULED: no such workout / it has no calendar event.
 * - PLAYER_MISMATCH: the workout belongs to another Player.
 * - PLAN_ALREADY_STARTED: a workout that already has a TrainingSession cannot be newly scheduled.
 * - PLAN_EMPTY: a workout with nothing in it can never start, so it is not scheduled.
 * - ALREADY_SCHEDULED: a workout has at most one calendar event.
 * - SCHEDULE_LOCKED: the workout already has a TrainingSession (any status); its scheduled WHEN is part of the history.
 */
export type WorkoutScheduleReason =
  | 'PLAN_NOT_FOUND'
  | 'PLAYER_MISMATCH'
  | 'PLAN_ALREADY_STARTED'
  | 'PLAN_EMPTY'
  | 'ALREADY_SCHEDULED'
  | 'NOT_SCHEDULED'
  | 'SCHEDULE_LOCKED';

export class WorkoutScheduleError extends Error {
  readonly reason: WorkoutScheduleReason;
  readonly planId: string;

  constructor(reason: WorkoutScheduleReason, planId: string) {
    super(`Workout ${planId} cannot be scheduled: ${reason}`);
    this.name = 'WorkoutScheduleError';
    this.reason = reason;
    this.planId = planId;
  }
}
