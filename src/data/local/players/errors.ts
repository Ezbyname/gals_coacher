/**
 * Stored player data that cannot be parsed (corruption, a writer bug, schema
 * drift). Reads fail as a whole with this error; nothing is silently skipped.
 * Carries stable codes only — never user-facing (localized) text.
 */
export type PlayerDataField =
  | 'id'
  | 'familyId'
  | 'name'
  | 'dateOfBirth'
  | 'heightCm'
  | 'createdAt'
  | 'updatedAt'
  | 'basketballAssignment'
  | 'basketballProfile'
  | 'primaryPosition'
  | 'secondaryPosition'
  | 'dominantHand'
  | 'experience'
  | 'weeklyFrequency'
  | 'localFamily';

export type PlayerDataReason = 'INVALID_VALUE' | 'UNKNOWN_CODE' | 'INVALID_RELATIONSHIP' | 'MISSING_ROW';

export class PlayerDataError extends Error {
  readonly field: PlayerDataField;
  readonly reason: PlayerDataReason;
  /** The stored player id when known (it may itself be the malformed value). */
  readonly playerId: string | null;

  constructor(field: PlayerDataField, reason: PlayerDataReason, playerId: string | null) {
    super(
      `Malformed stored player data: ${field} ${reason}${playerId === null ? '' : ` (player ${playerId})`}`,
    );
    this.name = 'PlayerDataError';
    this.field = field;
    this.reason = reason;
    this.playerId = playerId;
  }
}

/** An update targeted a player id that does not exist. Nothing was written. */
export class PlayerNotFoundError extends Error {
  readonly playerId: string;

  constructor(playerId: string) {
    super(`Player not found: ${playerId}`);
    this.name = 'PlayerNotFoundError';
    this.playerId = playerId;
  }
}
