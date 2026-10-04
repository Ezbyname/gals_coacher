/**
 * Stored self-assessment data that cannot be parsed (corruption, a writer bug,
 * schema drift). A history read fails as a whole with this error; nothing is
 * skipped, repaired or defaulted. Stable codes only — never user-facing text.
 */
export type SelfAssessmentDataField = 'id' | 'playerId' | 'sport' | 'takenAt' | 'ratings';

export type SelfAssessmentDataReason =
  | 'INVALID_VALUE'
  | 'UNSUPPORTED_SPORT'
  | 'NO_RATINGS'
  | 'MISSING_CATEGORY'
  | 'UNKNOWN_CATEGORY'
  | 'DUPLICATE_CATEGORY'
  | 'INVALID_RATING'
  /** The assessment's player or (player, sport) assignment does not exist. */
  | 'INVALID_RELATIONSHIP';

export class SelfAssessmentDataError extends Error {
  readonly field: SelfAssessmentDataField;
  readonly reason: SelfAssessmentDataReason;
  /** The stored assessment id when known (it may itself be the malformed value). */
  readonly assessmentId: string | null;
  /** The category concerned, for category / rating problems. */
  readonly category: string | null;

  constructor(
    field: SelfAssessmentDataField,
    reason: SelfAssessmentDataReason,
    assessmentId: string | null,
    category: string | null = null,
  ) {
    super(
      `Malformed stored self-assessment: ${field} ${reason}` +
        (category === null ? '' : ` (category ${category})`) +
        (assessmentId === null ? '' : ` (assessment ${assessmentId})`),
    );
    this.name = 'SelfAssessmentDataError';
    this.field = field;
    this.reason = reason;
    this.assessmentId = assessmentId;
    this.category = category;
  }
}

/**
 * A self-assessment was requested for a sport the player is not assigned to
 * (e.g. a player without Basketball). Nothing was written.
 */
export class SelfAssessmentSportNotAssignedError extends Error {
  readonly playerId: string;
  readonly sport: string;

  constructor(playerId: string, sport: string) {
    super(`Player ${playerId} has no ${sport} assignment for a self-assessment`);
    this.name = 'SelfAssessmentSportNotAssignedError';
    this.playerId = playerId;
    this.sport = sport;
  }
}
