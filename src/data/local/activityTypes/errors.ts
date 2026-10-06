/**
 * Stored Activity Type data that cannot be parsed (corruption, a writer bug,
 * schema drift). Reads fail as a whole; nothing is skipped or repaired.
 * Stable codes only — never user-facing text.
 */
export type ActivityTypeDataField = 'id' | 'builtin' | 'name' | 'active' | 'createdAt' | 'updatedAt';
export type ActivityTypeDataReason = 'INVALID_VALUE' | 'UNKNOWN_CODE';

export class ActivityTypeDataError extends Error {
  readonly field: ActivityTypeDataField;
  readonly reason: ActivityTypeDataReason;
  readonly typeId: string | null;

  constructor(field: ActivityTypeDataField, reason: ActivityTypeDataReason, typeId: string | null) {
    super(`Malformed stored activity type: ${field} ${reason}${typeId === null ? '' : ` (type ${typeId})`}`);
    this.name = 'ActivityTypeDataError';
    this.field = field;
    this.reason = reason;
    this.typeId = typeId;
  }
}

/** No Activity Type with this id exists. Nothing was written. */
export class ActivityTypeNotFoundError extends Error {
  readonly typeId: string;

  constructor(typeId: string) {
    super(`Activity type ${typeId} not found`);
    this.name = 'ActivityTypeNotFoundError';
    this.typeId = typeId;
  }
}

/**
 * A NEW use of an inactive Activity Type (a new event, or changing an event to
 * it). Existing events keep an inactive type without this error. Nothing was written.
 */
export class ActivityTypeInactiveError extends Error {
  readonly typeId: string;

  constructor(typeId: string) {
    super(`Activity type ${typeId} is inactive`);
    this.name = 'ActivityTypeInactiveError';
    this.typeId = typeId;
  }
}
