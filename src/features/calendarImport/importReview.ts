import type { ActivityTypeId } from '@/domain/activityType';
import type { CalendarDate } from '@/domain/calendarDate';
import {
  buildCandidates,
  candidateIssues,
  findDuplicateMatches,
  ISSUE_SEVERITY,
  parseSchedule,
  reviewSummary,
  type DuplicateMatch,
  type ExistingSlot,
  type ImportCandidate,
  type ImportIssueCode,
  type ImportWeek,
  type ParsedTime,
  type ReviewSummary,
  type UnparsedLine,
} from '@/domain/calendarImport';

/**
 * CAL-TEXT-IMPORT-001C — the Preview's state, as plain data and pure
 * functions (tested without React). Nothing here writes: existing events are
 * READ by the screen and passed in; saving the reviewed batch is 001D.
 */
export interface ImportReviewState {
  /** The weekly-text week; null for a fixture source (each candidate has its own explicit date). */
  readonly week: ImportWeek | null;
  /** The candidates with the user's edits applied (message order). */
  readonly candidates: readonly ImportCandidate[];
  readonly unparsed: readonly UnparsedLine[];
  /** Excluded from the batch (still shown, collapsed, with Undo). Nothing is deleted. */
  readonly removed: ReadonlySet<string>;
  /** REVIEW issues the user resolved for a candidate ("Use 14/10", "Keep anyway"). */
  readonly acknowledged: ReadonlyMap<string, ReadonlySet<ImportIssueCode>>;
  /** The Player's events already in the calendar (read once at Analyze). */
  readonly existing: readonly ExistingSlot[];
  /** The device's local date at Analyze: earlier dates cannot be imported (null only in pure tests). */
  readonly today: CalendarDate | null;
}

export interface ImportReviewView {
  readonly issues: ReadonlyMap<string, readonly ImportIssueCode[]>;
  /** Issues still open for a candidate: BLOCKING ones and REVIEW ones not yet resolved (INFO excluded). */
  readonly open: ReadonlyMap<string, readonly ImportIssueCode[]>;
  readonly duplicates: ReadonlyMap<string, DuplicateMatch>;
  readonly summary: ReviewSummary;
}

export function analyzeSchedule(
  text: string,
  week: ImportWeek,
  typeId: ActivityTypeId,
  existing: readonly ExistingSlot[],
  today: CalendarDate | null = null,
): ImportReviewState {
  const parsed = parseSchedule(text, { weekStart: week.start });
  return {
    week,
    candidates: buildCandidates(parsed.sessions, week, typeId),
    unparsed: parsed.unparsed,
    removed: new Set(),
    acknowledged: new Map(),
    existing,
    today,
  };
}

/** Everything the Preview shows, recomputed from the current state (after every edit / decision). */
export function viewOf(state: ImportReviewState): ImportReviewView {
  // Duplicates only between INCLUDED candidates (a removed one cannot duplicate anything).
  const included = state.candidates.filter((c) => !state.removed.has(c.key));
  const duplicates = findDuplicateMatches(included, state.existing);
  const issues = new Map(
    state.candidates.map((c) => [c.key, candidateIssues(c, state.week, { duplicate: duplicates.has(c.key), today: state.today })] as const),
  );
  const summary = reviewSummary(state.candidates, issues, {
    removed: state.removed,
    keptAnyway: state.acknowledged,
  });
  const open = new Map<string, ImportIssueCode[]>();
  for (const [key, codes] of issues) {
    const ack = state.acknowledged.get(key);
    const still = codes.filter((code) => {
      const severity = ISSUE_SEVERITY[code];
      return severity === 'BLOCKING' || (severity === 'REVIEW' && !(ack?.has(code) ?? false));
    });
    if (still.length > 0) open.set(key, still);
  }
  return { issues, open, duplicates, summary };
}

/**
 * The reviewable state for candidates an import SOURCE produced (CAL-SCHEDULE-IMPORT-002:
 * e.g. the games of the Player's team in an Excel fixture file). No week: explicit dates
 * are authoritative. Same review rules, decisions, Confirm and batch write as text.
 */
export function reviewFromCandidates(
  candidates: readonly ImportCandidate[],
  existing: readonly ExistingSlot[],
  today: CalendarDate | null,
): ImportReviewState {
  return { week: null, candidates, unparsed: [], removed: new Set(), acknowledged: new Map(), existing, today };
}

/**
 * One explicit decision for many candidates: acknowledge a REVIEW issue on every
 * INCLUDED candidate that currently has it (e.g. "Keep all without end time" —
 * their end stays NULL; nothing is invented). BLOCKING issues cannot be.
 */
export function acknowledgeAll(state: ImportReviewState, code: ImportIssueCode): ImportReviewState {
  if (ISSUE_SEVERITY[code] !== 'REVIEW') return state;
  const view = viewOf(state);
  let next = state;
  for (const key of view.summary.includedKeys) {
    if ((view.issues.get(key) ?? []).includes(code)) next = acknowledge(next, key, code);
  }
  return next;
}

export function removeCandidate(state: ImportReviewState, key: string): ImportReviewState {
  return { ...state, removed: new Set([...state.removed, key]) };
}

/** Undo Remove: the same candidate, with its values and decisions, back in the batch. */
export function restoreCandidate(state: ImportReviewState, key: string): ImportReviewState {
  const removed = new Set(state.removed);
  removed.delete(key);
  return { ...state, removed };
}

/** The user resolved a REVIEW issue ("Use 14/10 anyway", "Keep anyway"). BLOCKING issues cannot be acknowledged. */
export function acknowledge(state: ImportReviewState, key: string, code: ImportIssueCode): ImportReviewState {
  if (ISSUE_SEVERITY[code] !== 'REVIEW') return state;
  const acknowledged = new Map(state.acknowledged);
  acknowledged.set(key, new Set([...(acknowledged.get(key) ?? []), code]));
  return { ...state, acknowledged };
}

/** What the inline editor may change. */
export interface CandidateEdit {
  readonly date: CalendarDate;
  readonly start: ParsedTime;
  readonly end: ParsedTime | null;
  readonly location: string | null;
  readonly type: ActivityTypeId;
  readonly details: string | null;
  readonly title: string | null;
}

const blank = (s: string | null) => (s === null || s.trim().length === 0 ? null : s.trim());
const sameDay = (a: CalendarDate, b: CalendarDate) => a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * Applies a finished inline edit. A changed date becomes the user's decision
 * (`EDITED`: no longer compared with the message's weekday). Issues are
 * recomputed by viewOf — nothing is accepted on the user's behalf.
 */
export function editCandidate(state: ImportReviewState, key: string, edit: CandidateEdit): ImportReviewState {
  const candidates = state.candidates.map((c) =>
    c.key !== key
      ? c
      : {
          ...c,
          date: edit.date,
          dateFrom: sameDay(c.date, edit.date) ? c.dateFrom : ('EDITED' as const),
          start: edit.start,
          end: edit.end,
          location: blank(edit.location),
          type: edit.type,
          details: blank(edit.details),
          title: blank(edit.title),
        },
  );
  return { ...state, candidates };
}

/** The reviewed batch as it would be confirmed (001D saves exactly this). */
export function reviewedBatch(state: ImportReviewState): ImportCandidate[] {
  return state.candidates.filter((c) => !state.removed.has(c.key));
}
