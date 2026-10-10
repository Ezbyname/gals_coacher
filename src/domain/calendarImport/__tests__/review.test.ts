import { calendarDate } from '../../calendarDate';
import {
  buildCandidates,
  candidateIssues,
  findDuplicateMatches,
  findPossibleDuplicates,
  reviewSummary,
  type ImportCandidate,
  type ImportIssueCode,
  type ReviewDecisions,
} from '../review';
import { parseSchedule } from '../parseSchedule';
import { canShowPreviousWeek, importWeekContaining, importWeekTiming, nextImportWeek, shiftImportWeek, dateInWeek } from '../week';
import { WHATSAPP_EXAMPLE_1, WHATSAPP_EXAMPLE_2 } from './whatsappFixtures';

const today = calendarDate(2026, 10, 9)!; // Friday
const week = nextImportWeek(today); // Sun 11 – Sat 17 Oct 2026
const candidatesOf = (text: string, type = 'TEAM_TRAINING') =>
  buildCandidates(parseSchedule(text, { weekStart: week.start }).sessions, week, type);
const issuesOf = (cs: readonly ImportCandidate[], duplicates: ReadonlySet<string> = new Set()) =>
  new Map(cs.map((c) => [c.key, candidateIssues(c, week, { duplicate: duplicates.has(c.key) })]));
const decisions = (removed: string[] = [], kept: Record<string, ImportIssueCode[]> = {}): ReviewDecisions => ({
  removed: new Set(removed),
  keptAnyway: new Map(Object.entries(kept).map(([k, v]) => [k, new Set(v)])),
});

describe('CTI-16 week: next Sunday–Saturday (Israel week)', () => {
  it('from Friday 9 Oct 2026 the default is Sun 11 – Sat 17 Oct', () => {
    expect(week).toEqual({ start: { year: 2026, month: 10, day: 11 }, end: { year: 2026, month: 10, day: 17 } });
  });
  it('on a Sunday the default is the FOLLOWING week; on Saturday the next day starts it', () => {
    expect(nextImportWeek(calendarDate(2026, 10, 11)!).start).toEqual({ year: 2026, month: 10, day: 18 });
    expect(nextImportWeek(calendarDate(2026, 10, 17)!).start).toEqual({ year: 2026, month: 10, day: 18 });
  });
  it('other weeks are one step away; weekdays map into the chosen week', () => {
    expect(shiftImportWeek(week, -1)).toEqual(importWeekContaining(today));
    expect(dateInWeek(week, 1)).toEqual({ year: 2026, month: 10, day: 12 });
    expect(dateInWeek(week, 6)).toEqual({ year: 2026, month: 10, day: 17 });
  });
});

describe('CTI-28 week timing; CTI-32 no week before the current one (owner 2026-10-10)', () => {
  it('FUTURE / STARTED / PAST', () => {
    expect(importWeekTiming(week, today)).toBe('FUTURE');
    expect(importWeekTiming(week, calendarDate(2026, 10, 13)!)).toBe('STARTED');
    expect(importWeekTiming(week, calendarDate(2026, 10, 20)!)).toBe('PAST');
    // The current week is the earliest that may be chosen (owner 2026-10-10).
    expect(canShowPreviousWeek(week, today)).toBe(true);
    expect(canShowPreviousWeek(shiftImportWeek(week, -1), today)).toBe(false);
  });
  it('a past week still yields candidates with the dates of that week', () => {
    const past = shiftImportWeek(week, -2);
    const cs = buildCandidates(parseSchedule('יום שני 18:00-19:00', { weekStart: past.start }).sessions, past, 'GYM');
    expect(cs[0]!.date).toEqual({ year: 2026, month: 9, day: 28 });
  });
});

describe('example 1 → candidates (CTI-01, CTI-15, CTI-07)', () => {
  const cs = candidatesOf(WHATSAPP_EXAMPLE_1);

  it('dates in the chosen week: Mon 12, Wed 14, Thu 15, Fri 16 Oct; all READY', () => {
    expect(cs.map((c) => c.date.day)).toEqual([12, 14, 15, 16]);
    const summary = reviewSummary(cs, issuesOf(cs), decisions());
    expect(summary.canConfirm).toBe(true);
    expect(summary.includedKeys).toHaveLength(4);
  });

  it('CTI-15: the batch type is applied to every candidate; no title is invented', () => {
    expect(cs.every((c) => c.type === 'TEAM_TRAINING' && c.title === null)).toBe(true);
  });

  it('CTI-07 (count): 4 detected → remove Thursday → exactly 3 included ("Add 3 trainings")', () => {
    const thursday = cs.find((c) => c.date.day === 15)!.key;
    const summary = reviewSummary(cs, issuesOf(cs), decisions([thursday]));
    expect(summary.includedKeys).toEqual(cs.filter((c) => c.key !== thursday).map((c) => c.key));
    expect(summary.canConfirm).toBe(true);
  });
});

describe('example 2 → missing end time (CTI-04, CTI-05, CTI-08, CTI-09)', () => {
  const cs = candidatesOf(WHATSAPP_EXAMPLE_2);
  const tue = cs[1]!;

  it('CTI-04: Tuesday is END_TIME_MISSING (REVIEW: a decision is needed) and stops the import until decided', () => {
    expect(candidateIssues(tue, week)).toContain('END_TIME_MISSING');
    const summary = reviewSummary(cs, issuesOf(cs), decisions());
    expect(summary.canConfirm).toBe(false);
    expect([...summary.needsReview.keys()]).toEqual([tue.key]);
  });

  it('an end may be unknown (e.g. a game): "keep without end time" resolves it; the end stays null', () => {
    expect(reviewSummary(cs, issuesOf(cs), decisions([], { [tue.key]: ['END_TIME_MISSING'] })).canConfirm).toBe(true);
    expect(tue.end).toBeNull();
  });

  it('CTI-05: the user enters an end time → the candidate is valid', () => {
    const fixed = cs.map((c) => (c.key === tue.key ? { ...c, end: { hour: 18, minute: 0 } } : c));
    expect(reviewSummary(fixed, issuesOf(fixed), decisions()).canConfirm).toBe(true);
  });

  it('CTI-08: a removed incomplete candidate no longer blocks ("Add 2 trainings")', () => {
    const summary = reviewSummary(cs, issuesOf(cs), decisions([tue.key]));
    expect(summary.includedKeys).toHaveLength(2);
    expect(summary.canConfirm).toBe(true);
  });

  it('CTI-09: undoing the removal brings the candidate — and its blocking issue — back', () => {
    const removed = decisions([tue.key]);
    const undone: ReviewDecisions = { ...removed, removed: new Set() };
    expect(reviewSummary(cs, issuesOf(cs), undone).canConfirm).toBe(false);
  });

  it('an end before the start blocks; "keep anyway" never clears a BLOCKING issue', () => {
    const bad = cs.map((c) => (c.key === tue.key ? { ...c, end: { hour: 16, minute: 0 } } : c));
    expect(candidateIssues(bad[1]!, week)).toContain('END_NOT_AFTER_START');
    const kept = decisions([], { [tue.key]: ['END_NOT_AFTER_START'] });
    expect(reviewSummary(bad, issuesOf(bad), kept).canConfirm).toBe(false);
  });
});

describe('CTI-27 per-candidate Activity Type', () => {
  const cs = candidatesOf(WHATSAPP_EXAMPLE_2);
  const tue = cs[1]!;

  it('a suggestion different from the batch type is visible (INFO) and never applied silently', () => {
    expect(tue.type).toBe('TEAM_TRAINING');
    expect(tue.suggestedType).toBe('GAME');
    expect(candidateIssues(tue, week)).toContain('SUGGESTED_TYPE_DIFFERS');
  });

  it('the user may change one candidate; the others keep the batch type; INFO never blocks', () => {
    const changed = cs.map((c) => (c.key === tue.key ? { ...c, type: 'GAME', end: { hour: 18, minute: 0 } } : c));
    expect(changed.map((c) => c.type)).toEqual(['TEAM_TRAINING', 'GAME', 'TEAM_TRAINING']);
    expect(candidateIssues(changed[1]!, week)).not.toContain('SUGGESTED_TYPE_DIFFERS');
    expect(reviewSummary(cs.map((c) => ({ ...c, end: c.end ?? { hour: 18, minute: 0 } })), issuesOf(cs.map((c) => ({ ...c, end: c.end ?? { hour: 18, minute: 0 } }))), decisions()).canConfirm).toBe(true);
  });

  it('OTHER needs a title (existing CalendarEvent rule): BLOCKING until the user gives one', () => {
    const other = { ...tue, type: 'OTHER', end: { hour: 18, minute: 0 } };
    expect(candidateIssues(other, week)).toContain('TITLE_REQUIRED');
    expect(candidateIssues({ ...other, title: 'משחק אימון' }, week)).not.toContain('TITLE_REQUIRED');
  });
});

describe('CTI-11 explicit date vs chosen week (REVIEW: keep anyway or remove)', () => {
  it('a date outside the week is DATE_OUTSIDE_WEEK; "keep anyway" lets it through', () => {
    const cs = candidatesOf('21/10 18:00-19:00');
    expect(cs[0]!.date).toEqual({ year: 2026, month: 10, day: 21 });
    expect(candidateIssues(cs[0]!, week)).toEqual(['DATE_OUTSIDE_WEEK']);
    expect(reviewSummary(cs, issuesOf(cs), decisions()).canConfirm).toBe(false);
    expect(reviewSummary(cs, issuesOf(cs), decisions([], { s1: ['DATE_OUTSIDE_WEEK'] })).canConfirm).toBe(true);
  });

  it('weekday and date disagree → WEEKDAY_DATE_MISMATCH (the date is used, the user decides)', () => {
    const cs = candidatesOf('יום שני 14/10 18:00-19:00'); // 14 Oct 2026 is a Wednesday
    expect(cs[0]!.date.day).toBe(14);
    expect(candidateIssues(cs[0]!, week)).toEqual(['WEEKDAY_DATE_MISMATCH']);
    expect(candidateIssues(candidatesOf('יום רביעי 14/10 18:00-19:00')[0]!, week)).toEqual([]);
  });
});

describe('CTI-25 possible duplicates (warning only, never dropped)', () => {
  const cs = candidatesOf(WHATSAPP_EXAMPLE_1);
  const monday = calendarDate(2026, 10, 12)!;

  it('same date + same type + overlapping time → POSSIBLE_DUPLICATE (REVIEW)', () => {
    const existing = [{ date: monday, start: { hour: 19, minute: 0 }, end: { hour: 20, minute: 30 }, type: 'TEAM_TRAINING' }];
    const dups = findPossibleDuplicates(cs, existing);
    expect([...dups]).toEqual([cs[0]!.key]);
    const issues = issuesOf(cs, dups);
    expect(issues.get(cs[0]!.key)).toEqual(['POSSIBLE_DUPLICATE']);
    expect(reviewSummary(cs, issues, decisions()).canConfirm).toBe(false);
    expect(reviewSummary(cs, issues, decisions([], { [cs[0]!.key]: ['POSSIBLE_DUPLICATE'] })).canConfirm).toBe(true);
    expect(reviewSummary(cs, issues, decisions([cs[0]!.key])).includedKeys).toHaveLength(3);
  });

  it('two legitimate trainings on one day are not duplicates (other time, or other type)', () => {
    const morning = [{ date: monday, start: { hour: 7, minute: 0 }, end: { hour: 8, minute: 0 }, type: 'TEAM_TRAINING' }];
    const gym = [{ date: monday, start: { hour: 18, minute: 40 }, end: { hour: 20, minute: 10 }, type: 'GYM' }];
    expect(findPossibleDuplicates(cs, morning).size).toBe(0);
    expect(findPossibleDuplicates(cs, gym).size).toBe(0);
  });

  it('starts within 15 minutes count when an end is missing; a repeat inside the paste is flagged on both', () => {
    const noEnd = [{ date: monday, start: { hour: 18, minute: 30 }, end: null, type: 'TEAM_TRAINING' }];
    expect([...findPossibleDuplicates(cs, noEnd)]).toEqual([cs[0]!.key]);
    const twice = candidatesOf('יום שני 18:40-20:10\nיום שני 18:40-20:10');
    expect([...findPossibleDuplicates(twice, [])].sort()).toEqual(['s1', 's2']);
    expect(findPossibleDuplicates(candidatesOf('יום שני 08:00-09:00 ו 18:00-19:30'), []).size).toBe(0);
  });
});

describe('duplicate matches show both sides; an edited date is the user decision', () => {
  const cs = candidatesOf(WHATSAPP_EXAMPLE_1);
  const monday = calendarDate(2026, 10, 12)!;

  it('an existing event is reported with its own values', () => {
    const event = { id: 'e1', title: 'Team', date: monday, start: { hour: 18, minute: 30 }, end: { hour: 20, minute: 0 }, type: 'TEAM_TRAINING' };
    expect(findDuplicateMatches(cs, [event]).get(cs[0]!.key)).toEqual({ kind: 'EXISTING', event });
  });

  it('a repeat inside the paste points at the other candidate', () => {
    const twice = candidatesOf('יום שני 18:40-20:10\nיום שני 18:40-20:10');
    const m = findDuplicateMatches(twice, []);
    expect(m.get('s2')).toEqual({ kind: 'IN_IMPORT', otherKey: 's1' });
    expect(m.get('s1')).toEqual({ kind: 'IN_IMPORT', otherKey: 's2' });
  });

  it('after the user edits the date, the message weekday is no longer compared', () => {
    const [c] = candidatesOf('יום שני 14/10 18:00-19:00');
    expect(candidateIssues(c!, week)).toEqual(['WEEKDAY_DATE_MISMATCH']);
    expect(candidateIssues({ ...c!, dateFrom: 'EDITED' }, week)).toEqual([]);
  });
});

describe('data boundary', () => {
  it('candidates carry only CalendarEvent values — nothing about workouts or sessions', () => {
    const keys = Object.keys(candidatesOf(WHATSAPP_EXAMPLE_1)[0]!).sort();
    expect(keys).toEqual(
      ['date', 'dateFrom', 'details', 'end', 'key', 'line', 'location', 'sourceText', 'start', 'suggestedType', 'textWeekday', 'title', 'type'].sort(),
    );
  });
});
