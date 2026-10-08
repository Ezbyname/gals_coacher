/**
 * Stored taxonomy data that cannot be parsed (corruption, a writer bug, schema
 * drift). Reads fail as a whole; nothing is skipped or repaired. Stable codes
 * only — never user-facing text.
 */
export type TaxonomyDataField = 'id' | 'builtin' | 'active' | 'createdAt' | 'updatedAt' | 'membership';
export type TaxonomyDataReason = 'INVALID_VALUE' | 'UNKNOWN_CODE' | 'MISSING_ROW' | 'UNSUPPORTED';

export class TaxonomyDataError extends Error {
  readonly field: TaxonomyDataField;
  readonly reason: TaxonomyDataReason;
  readonly key: string | null;

  constructor(field: TaxonomyDataField, reason: TaxonomyDataReason, key: string | null) {
    super(`Malformed stored taxonomy: ${field} ${reason}${key === null ? '' : ` (${key})`}`);
    this.name = 'TaxonomyDataError';
    this.field = field;
    this.reason = reason;
    this.key = key;
  }
}

/** No taxonomy node with this key. Nothing was written. */
export class TaxonomyNodeNotFoundError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Taxonomy node ${key} not found`);
    this.name = 'TaxonomyNodeNotFoundError';
    this.key = key;
  }
}

/** Why a custom exercise's classification was refused. Nothing was written. */
export type ClassificationRefusal =
  | 'EXERCISE_NOT_FOUND'
  | 'BUILTIN_EXERCISE' // built-in exercises are classified by the curated taxonomy only
  | 'UNKNOWN_NODE'
  | 'INACTIVE_NODE'; // a NEW membership needs an active node (existing ones are kept)

export class ClassificationRefusedError extends Error {
  readonly reason: ClassificationRefusal;
  readonly subject: string;
  constructor(reason: ClassificationRefusal, subject: string) {
    super(`Classification refused: ${reason} (${subject})`);
    this.name = 'ClassificationRefusedError';
    this.reason = reason;
    this.subject = subject;
  }
}
