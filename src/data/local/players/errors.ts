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
  | 'teamName'
  | 'archivedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'basketballProfile'
  | 'primaryPosition'
  | 'secondaryPosition'
  | 'dominantHand'
  | 'experience'
  | 'weeklyFrequency'
  | 'sportActive'
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

/**
 * The Player has this sport only historically: its assignment exists but is
 * inactive. History stays readable; nothing new can be recorded for the sport
 * (e.g. a self-assessment or a calendar event) until it is reactivated.
 * Distinct from "not assigned" (the Player never had the sport). Nothing was
 * written.
 */
export class SportInactiveError extends Error {
  readonly playerId: string;
  readonly sport: string;

  constructor(playerId: string, sport: string) {
    super(`Sport ${sport} is inactive for player ${playerId}`);
    this.name = 'SportInactiveError';
    this.playerId = playerId;
    this.sport = sport;
  }
}

/** New Player-owned activity was attempted for an archived Player (PLAYER-ARCHIVE-001). Nothing was written. */
export class PlayerArchivedError extends Error {
  readonly playerId: string;

  constructor(playerId: string) {
    super(`Player is archived: ${playerId}`);
    this.name = 'PlayerArchivedError';
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
