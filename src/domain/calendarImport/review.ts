import { requiresTitle, type ActivityTypeId, type BuiltinActivityType } from '../activityType';
import { sameDate, weekdayOf, type Weekday } from '../calendarView';
import type { CalendarDate } from '../calendarDate';
import type { ParsedSession, ParsedTime } from './parseSchedule';
import { dateInWeek, isInWeek, type ImportWeek } from './week';

/**
 * CAL-TEXT-IMPORT-001A — the reviewable form of a parsed schedule.
 *
 * A CANDIDATE is one session the user will see in the Preview, with the values
 * that would be written (date, times, location, details, type) and the ISSUES
 * that stop it — or ask about it — before anything is saved. Nothing here
 * writes; the Preview's reviewed values are what a later slice saves.
 *
 * Issue severity:
 *  - BLOCKING: an included candidate cannot be confirmed until it is fixed
 *    (or the candidate is removed). No "keep without end time" in V1.
 *  - REVIEW: the user must decide — "Keep anyway" or Remove — never decided
 *    for them (date outside the week, weekday/date disagree, possible duplicate).
 *  - INFO: shown, never blocks (a different suggested type).
 */

export interface ImportCandidate {
  readonly key: string;
  readonly line: number;
  readonly sourceText: string;
  readonly date: CalendarDate;
  /**
   * Where the date came from: the weekday in the chosen week, a date written in
   * the text, or the user's own edit in the Preview (then it is the user's
   * decision and is no longer compared with the message's weekday).
   */
  readonly dateFrom: 'WEEKDAY' | 'EXPLICIT_DATE' | 'EDITED';
  /** The weekday the text named (kept to show a weekday / date disagreement). */
  readonly textWeekday: Weekday | null;
  readonly start: ParsedTime;
  readonly end: ParsedTime | null;
  readonly location: string | null;
  readonly details: string | null;
  /** null unless the user gives one (OTHER needs one); the parser never invents a title. */
  readonly title: string | null;
  /** The batch default unless the user changed it for this candidate. */
  readonly type: ActivityTypeId;
  readonly suggestedType: BuiltinActivityType | null;
}

export type ImportIssueCode =
  | 'END_TIME_MISSING'
  | 'END_NOT_AFTER_START'
  | 'TITLE_REQUIRED'
  | 'DATE_OUTSIDE_WEEK'
  | 'WEEKDAY_DATE_MISMATCH'
  | 'POSSIBLE_DUPLICATE'
  | 'SUGGESTED_TYPE_DIFFERS';

export type ImportIssueSeverity = 'BLOCKING' | 'REVIEW' | 'INFO';

export const ISSUE_SEVERITY: Readonly<Record<ImportIssueCode, ImportIssueSeverity>> = {
  END_TIME_MISSING: 'BLOCKING',
  END_NOT_AFTER_START: 'BLOCKING',
  TITLE_REQUIRED: 'BLOCKING',
  DATE_OUTSIDE_WEEK: 'REVIEW',
  WEEKDAY_DATE_MISMATCH: 'REVIEW',
  POSSIBLE_DUPLICATE: 'REVIEW',
  SUGGESTED_TYPE_DIFFERS: 'INFO',
};

export function toMinutes(t: ParsedTime): number {
  return t.hour * 60 + t.minute;
}

/** Sessions → candidates for the chosen week and batch type (dates resolved, nothing else decided). */
export function buildCandidates(
  sessions: readonly ParsedSession[],
  week: ImportWeek,
  batchType: ActivityTypeId,
): ImportCandidate[] {
  return sessions.map((s) => ({
    key: s.key,
    line: s.line,
    sourceText: s.sourceText,
    date: s.explicitDate ?? dateInWeek(week, s.weekday!),
    dateFrom: s.explicitDate !== null ? 'EXPLICIT_DATE' : 'WEEKDAY',
    textWeekday: s.weekday,
    start: s.start,
    end: s.end,
    location: s.location,
    details: s.details,
    title: null,
    type: batchType,
    suggestedType: s.suggestedType,
  }));
}

/**
 * The issues of one candidate as it is NOW (call again after every edit).
 * `duplicate` comes from findPossibleDuplicates.
 */
export function candidateIssues(
  c: ImportCandidate,
  week: ImportWeek,
  options: { readonly duplicate?: boolean } = {},
): ImportIssueCode[] {
  const issues: ImportIssueCode[] = [];
  if (c.end === null) issues.push('END_TIME_MISSING');
  else if (toMinutes(c.end) <= toMinutes(c.start)) issues.push('END_NOT_AFTER_START');
  if (requiresTitle(c.type) && (c.title === null || c.title.trim().length === 0)) issues.push('TITLE_REQUIRED');
  if (!isInWeek(week, c.date)) issues.push('DATE_OUTSIDE_WEEK');
  if (c.dateFrom === 'EXPLICIT_DATE' && c.textWeekday !== null && weekdayOf(c.date) !== c.textWeekday) {
    issues.push('WEEKDAY_DATE_MISMATCH');
  }
  if (options.duplicate) issues.push('POSSIBLE_DUPLICATE');
  if (c.suggestedType !== null && c.suggestedType !== c.type) issues.push('SUGGESTED_TYPE_DIFFERS');
  return issues;
}

// ---------------------------------------------------------------- duplicates

/** An event already in the Player's calendar, as local wall-clock values (converted by the caller). */
export interface ExistingSlot {
  readonly date: CalendarDate;
  readonly start: ParsedTime;
  readonly end: ParsedTime | null;
  readonly type: ActivityTypeId;
  /** The stored event (for showing both sides of a possible duplicate). */
  readonly id?: string;
  readonly title?: string | null;
}

/** What a candidate may duplicate: an event already in the calendar, or another line of this paste. */
export type DuplicateMatch =
  | { readonly kind: 'EXISTING'; readonly event: ExistingSlot }
  | { readonly kind: 'IN_IMPORT'; readonly otherKey: string };

/** Starts this close (minutes) count as "the same time" when an end is missing. */
export const DUPLICATE_START_TOLERANCE_MIN = 15;

function looksSame(a: ExistingSlot, b: ExistingSlot): boolean {
  if (!sameDate(a.date, b.date) || a.type !== b.type) return false;
  const as = toMinutes(a.start);
  const bs = toMinutes(b.start);
  if (Math.abs(as - bs) <= DUPLICATE_START_TOLERANCE_MIN) return true;
  if (a.end === null || b.end === null) return false;
  return as < toMinutes(b.end) && bs < toMinutes(a.end);
}

/**
 * Candidate keys that look like an event already in the calendar, or like
 * another candidate of this paste: same local date AND same type AND
 * overlapping times (or starts within 15 minutes). Conservative and only a
 * WARNING: two different trainings on one day (different times, or a
 * different type) are never flagged, and nothing is ever dropped.
 */
export function findPossibleDuplicates(
  candidates: readonly ImportCandidate[],
  existing: readonly ExistingSlot[],
): Set<string> {
  return new Set(findDuplicateMatches(candidates, existing).keys());
}

/**
 * The same rule, with WHAT each flagged candidate looks like — so the Preview
 * can show both sides ("from the import" and "already in the calendar"). An
 * existing event is preferred over a repeat inside the paste.
 */
export function findDuplicateMatches(
  candidates: readonly ImportCandidate[],
  existing: readonly ExistingSlot[],
): Map<string, DuplicateMatch> {
  const matches = new Map<string, DuplicateMatch>();
  candidates.forEach((c, i) => {
    const event = existing.find((e) => looksSame(c, e));
    if (event) matches.set(c.key, { kind: 'EXISTING', event });
    for (let j = 0; j < i; j++) {
      const other = candidates[j]!;
      if (looksSame(c, other)) {
        if (!matches.has(c.key)) matches.set(c.key, { kind: 'IN_IMPORT', otherKey: other.key });
        if (!matches.has(other.key)) matches.set(other.key, { kind: 'IN_IMPORT', otherKey: c.key });
      }
    }
  });
  return matches;
}

// ------------------------------------------------------------------ summary

/** The user's decisions in the Preview (removed = excluded from the batch; nothing is deleted). */
export interface ReviewDecisions {
  readonly removed: ReadonlySet<string>;
  /** Candidate key → REVIEW issues the user chose to keep anyway. */
  readonly keptAnyway: ReadonlyMap<string, ReadonlySet<ImportIssueCode>>;
}

export interface ReviewSummary {
  readonly includedKeys: readonly string[];
  /** Included candidates that still stop the import, with what stops them. */
  readonly needsReview: ReadonlyMap<string, readonly ImportIssueCode[]>;
  /** True when at least one candidate is included and none of them is stopped. */
  readonly canConfirm: boolean;
}

/**
 * What "Add N trainings" means right now. Only INCLUDED candidates count —
 * a removed candidate never blocks (its missing end time no longer matters).
 */
export function reviewSummary(
  candidates: readonly ImportCandidate[],
  issuesByKey: ReadonlyMap<string, readonly ImportIssueCode[]>,
  decisions: ReviewDecisions,
): ReviewSummary {
  const includedKeys = candidates.map((c) => c.key).filter((k) => !decisions.removed.has(k));
  const needsReview = new Map<string, readonly ImportIssueCode[]>();
  for (const key of includedKeys) {
    const kept = decisions.keptAnyway.get(key);
    const open = (issuesByKey.get(key) ?? []).filter((code) => {
      const severity = ISSUE_SEVERITY[code];
      if (severity === 'INFO') return false;
      if (severity === 'REVIEW') return !(kept?.has(code) ?? false);
      return true;
    });
    if (open.length > 0) needsReview.set(key, open);
  }
  return { includedKeys, needsReview, canConfirm: includedKeys.length > 0 && needsReview.size === 0 };
}
