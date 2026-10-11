import { isActivityTypeId, requiresTitle, type ActivityTypeId, type ActivityTypeRef } from './activityType';
import { isUuid, type Uuid } from './ids';
import { V1_ENABLED_SPORTS, type SportKey } from './sport';

/**
 * A planned item in a Player's schedule (PRODUCT_SPEC §51, ARCHITECTURE §14):
 * something that is going to happen, never what happened. A CalendarEvent is
 * not a TrainingSession and never creates, completes or skips one.
 * Sport-neutral; one-off events only (no recurrence in Slice 1.3).
 */

/**
 * Who explicitly marked an event completed (CAL-COMP-001). Today only the
 * person using this device; later sources (e.g. a Coach, an import) are new
 * codes, not a new model. Stable codes, persisted as-is.
 */
export const CALENDAR_COMPLETION_SOURCES = ['LOCAL_USER'] as const;
export type CalendarCompletionSource = (typeof CALENDAR_COMPLETION_SOURCES)[number];

export function isCalendarCompletionSource(value: unknown): value is CalendarCompletionSource {
  return typeof value === 'string' && (CALENDAR_COMPLETION_SOURCES as readonly string[]).includes(value);
}

/**
 * An explicit "this happened" mark on a planned event. Separate from the
 * schedule: it never changes startAt / endAt (or any other field), and the
 * passing of time never sets it. Not a TrainingSession and not a result.
 */
export interface CalendarCompletion {
  /** Epoch milliseconds when the user marked it (not when the event took place). */
  readonly completedAt: number;
  readonly source: CalendarCompletionSource;
}

/**
 * Where an event came from when it was not entered by hand (CAL-TEXT-IMPORT-001,
 * schema v13). NULL = entered by hand / created before provenance existed — not
 * reinterpreted. New origins (e.g. another import format) are new codes here; the
 * database deliberately does not restrict the value set (no migration per code).
 */
export const CALENDAR_EVENT_SOURCES = ['TEXT_IMPORT'] as const;
export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number];

export function isCalendarEventSource(value: unknown): value is CalendarEventSource {
  return typeof value === 'string' && (CALENDAR_EVENT_SOURCES as readonly string[]).includes(value);
}

/** Sources whose events always belong to an import batch (one confirmed import = one batch id). */
export function sourceRequiresBatch(source: CalendarEventSource): boolean {
  return source === 'TEXT_IMPORT';
}

/**
 * Provenance of an event, written once at creation and never edited:
 * both null for a hand-entered event; for an imported one, its source and the
 * id shared by every event of that confirmed import (never inferred from
 * dates, types, titles or locations).
 */
export interface CalendarEventProvenance {
  readonly source: CalendarEventSource | null;
  readonly importBatchId: Uuid | null;
}

export interface CalendarEvent {
  readonly id: Uuid;
  readonly playerId: Uuid;
  /**
   * The event's Activity Type id (ACTIVITY-001): a built-in code or a custom
   * type's UUID — the only stored identity of its type.
   */
  readonly type: ActivityTypeId;
  /** That type as the catalog has it now (label data, active state). Read-only; never stored on the event. */
  readonly activityType: ActivityTypeRef;
  /** Independent of `type`; null when the event has no sport. */
  readonly sport: SportKey | null;
  /** Epoch milliseconds (an absolute instant). */
  readonly startAt: number;
  /** Epoch milliseconds, after `startAt`; null when no end was given. */
  readonly endAt: number | null;
  /** Trimmed; null when blank. Required for OTHER. */
  readonly title: string | null;
  /** Trimmed; null when blank. */
  readonly notes: string | null;
  /** Where it takes place (schema v13): trimmed; null when blank or unknown. First-class data, never folded into notes. */
  readonly location: string | null;
  /** See CalendarEventProvenance: null for events entered by hand. */
  readonly source: CalendarEventSource | null;
  /** The confirmed import this event was created by; null otherwise. */
  readonly importBatchId: Uuid | null;
  /** Epoch milliseconds; set once. */
  readonly createdAt: number;
  /** Epoch milliseconds; set on create and on every edit (not by completion). */
  readonly updatedAt: number;
  /** null: not completed. Only an explicit user action sets or clears it. */
  readonly completion: CalendarCompletion | null;
}

/** What the user enters (unchecked codes; text not yet trimmed). */
export interface CalendarEventInput {
  readonly type: string;
  readonly sport?: string | null;
  readonly startAt: number;
  readonly endAt?: number | null;
  readonly title?: string | null;
  readonly notes?: string | null;
  /** Omitted (undefined) on an edit = keep the stored location; null / blank = no location. */
  readonly location?: string | null;
}

/** Validated user fields, ready to persist; ids and timestamps are added by the repository. */
export interface CalendarEventCore {
  readonly type: ActivityTypeId;
  readonly sport: SportKey | null;
  readonly startAt: number;
  readonly endAt: number | null;
  readonly title: string | null;
  readonly notes: string | null;
  readonly location: string | null;
}

export type CalendarEventErrors = {
  type?: 'UNKNOWN_TYPE';
  sport?: 'UNSUPPORTED_SPORT';
  startAt?: 'INVALID_TIMESTAMP';
  endAt?: 'INVALID_TIMESTAMP' | 'NOT_AFTER_START';
  title?: 'INVALID_VALUE' | 'REQUIRED_FOR_OTHER' | 'TOO_LONG';
  notes?: 'INVALID_VALUE';
  location?: 'INVALID_VALUE' | 'TOO_LONG';
  createdAt?: 'INVALID_TIMESTAMP';
  updatedAt?: 'INVALID_TIMESTAMP';
};

export type CalendarEventValidation =
  | { readonly ok: true; readonly value: CalendarEventCore }
  | { readonly ok: false; readonly errors: CalendarEventErrors };

const INVALID = Symbol('invalid');

/** Trimmed text, null when absent or blank; INVALID when not a string. */
function readText(value: unknown): string | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return INVALID;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Sports a calendar event may carry today (the repository also checks the Player's assignment). */
function readSport(value: unknown): SportKey | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && (V1_ENABLED_SPORTS as readonly string[]).includes(value)
    ? (value as SportKey)
    : INVALID;
}

/** The longest title a user may enter (characters, counted after trimming). */
export const CALENDAR_TITLE_MAX_LENGTH = 100;

/** The longest location a user may enter (characters, after trimming). Owner may change it here. */
export const CALENDAR_LOCATION_MAX_LENGTH = 80;

/**
 * Validates what the user entered. Nothing is clamped or normalized except
 * trimming text (blank → null). Timestamps must be whole milliseconds (safe
 * integers); an end, when given, must be after the start. OTHER needs a
 * non-blank title; every other type may leave it empty. A title has at most
 * CALENDAR_TITLE_MAX_LENGTH characters — except that an edit may keep the
 * title already stored (`storedTitle`) unchanged: a longer title saved before
 * the limit existed is never truncated or rejected just for being kept. The
 * input is never modified.
 */
export function validateCalendarEvent(
  input: CalendarEventInput,
  options: { readonly storedTitle?: string | null; readonly storedLocation?: string | null } = {},
): CalendarEventValidation {
  const fields = validateFields(input);
  const title = readText(input.title);
  const titleTooLong =
    typeof title === 'string' &&
    title.length > CALENDAR_TITLE_MAX_LENGTH &&
    title !== (options.storedTitle ?? null);
  const location = readText(input.location);
  const locationTooLong =
    typeof location === 'string' &&
    location.length > CALENDAR_LOCATION_MAX_LENGTH &&
    location !== (options.storedLocation ?? null);
  if (!titleTooLong && !locationTooLong) return fields;
  const errors: CalendarEventErrors = fields.ok ? {} : { ...fields.errors };
  if (titleTooLong && errors.title === undefined) errors.title = 'TOO_LONG';
  if (locationTooLong && errors.location === undefined) errors.location = 'TOO_LONG';
  return { ok: false, errors };
}

/** The field rules shared by user input and stored records (no title-length limit). */
function validateFields(input: CalendarEventInput): CalendarEventValidation {
  const errors: CalendarEventErrors = {};

  // Well-formed id only; whether it exists / is active is the repository's check.
  const type = isActivityTypeId(input.type) ? input.type : null;
  if (type === null) errors.type = 'UNKNOWN_TYPE';

  const sport = readSport(input.sport);
  if (sport === INVALID) errors.sport = 'UNSUPPORTED_SPORT';

  const startAt = input.startAt;
  const startValid = Number.isSafeInteger(startAt);
  if (!startValid) errors.startAt = 'INVALID_TIMESTAMP';

  const endAt = input.endAt ?? null;
  if (endAt !== null) {
    if (!Number.isSafeInteger(endAt)) errors.endAt = 'INVALID_TIMESTAMP';
    else if (startValid && endAt <= startAt) errors.endAt = 'NOT_AFTER_START';
  }

  const title = readText(input.title);
  if (title === INVALID) errors.title = 'INVALID_VALUE';
  else if (type !== null && requiresTitle(type) && title === null) errors.title = 'REQUIRED_FOR_OTHER';

  const notes = readText(input.notes);
  if (notes === INVALID) errors.notes = 'INVALID_VALUE';

  const location = readText(input.location);
  if (location === INVALID) errors.location = 'INVALID_VALUE';

  if (
    Object.keys(errors).length > 0 ||
    type === null ||
    sport === INVALID ||
    title === INVALID ||
    notes === INVALID ||
    location === INVALID
  ) {
    return { ok: false, errors };
  }
  return { ok: true, value: { type, sport, startAt, endAt, title, notes, location } };
}

export type CalendarEventProvenanceError = 'UNKNOWN_SOURCE' | 'INVALID_BATCH_ID' | 'BATCH_WITHOUT_SOURCE' | 'BATCH_REQUIRED';

/**
 * Provenance rules (written by the import path only): a batch id is a UUID and
 * never appears without a source; a source that groups events (TEXT_IMPORT)
 * always has one; an unknown source code is refused (validated here, not by a
 * database CHECK, so new codes need no migration).
 */
export function validateProvenance(
  source: unknown,
  importBatchId: unknown,
): { ok: true; value: CalendarEventProvenance } | { ok: false; error: CalendarEventProvenanceError } {
  if (source === null && importBatchId === null) return { ok: true, value: { source: null, importBatchId: null } };
  if (source === null) return { ok: false, error: 'BATCH_WITHOUT_SOURCE' };
  if (!isCalendarEventSource(source)) return { ok: false, error: 'UNKNOWN_SOURCE' };
  if (importBatchId === null) {
    return sourceRequiresBatch(source)
      ? { ok: false, error: 'BATCH_REQUIRED' }
      : { ok: true, value: { source, importBatchId: null } };
  }
  if (typeof importBatchId !== 'string' || !isUuid(importBatchId)) return { ok: false, error: 'INVALID_BATCH_ID' };
  return { ok: true, value: { source, importBatchId } };
}

/** A stored event's fields plus its timestamps (used when reading or writing a full record). */
export type CalendarEventRecordValidation =
  | { readonly ok: true; readonly value: CalendarEventCore & { createdAt: number; updatedAt: number } }
  | { readonly ok: false; readonly errors: CalendarEventErrors };

/**
 * A STORED event's fields plus `createdAt` / `updatedAt` (whole milliseconds).
 * Stored data is not held to the input-only title limit: history saved before
 * the limit existed stays readable.
 */
export function validateCalendarEventRecord(
  input: CalendarEventInput & { readonly createdAt: number; readonly updatedAt: number },
): CalendarEventRecordValidation {
  const fields = validateFields(input);
  const errors: CalendarEventErrors = fields.ok ? {} : { ...fields.errors };
  if (!Number.isSafeInteger(input.createdAt)) errors.createdAt = 'INVALID_TIMESTAMP';
  if (!Number.isSafeInteger(input.updatedAt)) errors.updatedAt = 'INVALID_TIMESTAMP';
  if (!fields.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...fields.value, createdAt: input.createdAt, updatedAt: input.updatedAt } };
}

export type AgendaSection = 'CURRENT_OR_UPCOMING' | 'PAST';

/**
 * Where an event belongs at `now` (epoch ms, from `Clock.wallNow()`): with an
 * end, it stays current or upcoming until the end has passed (an event in
 * progress is never Past); without an end, until its start has passed.
 */
export function agendaSection(
  event: { readonly startAt: number; readonly endAt: number | null },
  now: number,
): AgendaSection {
  const until = event.endAt ?? event.startAt;
  return until >= now ? 'CURRENT_OR_UPCOMING' : 'PAST';
}

type AgendaItem = { readonly id: string; readonly startAt: number; readonly endAt: number | null };

const byStartThenId = (a: AgendaItem, b: AgendaItem) =>
  a.startAt - b.startAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The agenda's two sections at `now`, in their display order: Current &
 * upcoming by start ascending (nearest first), Past by start descending
 * (most recent first); equal starts are ordered by id (ascending / descending)
 * so the order never depends on input order. The input is not modified.
 */
export function splitAgenda<T extends AgendaItem>(
  events: readonly T[],
  now: number,
): { readonly currentOrUpcoming: T[]; readonly past: T[] } {
  const currentOrUpcoming = events.filter((e) => agendaSection(e, now) === 'CURRENT_OR_UPCOMING');
  const past = events.filter((e) => agendaSection(e, now) === 'PAST');
  return {
    currentOrUpcoming: currentOrUpcoming.sort(byStartThenId),
    past: past.sort((a, b) => byStartThenId(b, a)),
  };
}
