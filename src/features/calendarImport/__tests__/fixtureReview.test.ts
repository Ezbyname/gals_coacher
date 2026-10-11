import { calendarDate } from '@/domain/calendarDate';
import type { ExistingSlot } from '@/domain/calendarImport';
import { findHeader, fixtureCandidates, readFixtures, readWorkbook } from '@/domain/scheduleImport';
import { buildXlsx, FIXTURE_HEADER, FIXTURE_ROWS, HOF } from '@/test-support/buildXlsx';

import { acknowledge, acknowledgeAll, removeCandidate, reviewedBatch, reviewFromCandidates, viewOf } from '../importReview';

/** CAL-SCHEDULE-IMPORT-002B — an Excel fixture source through the SAME review rules as text. */
const today = calendarDate(2026, 10, 11)!;
const hofGames = () => {
  const wb = readWorkbook(buildXlsx([{ name: '2026', rows: [FIXTURE_HEADER, ...FIXTURE_ROWS] }]));
  const header = findHeader(wb.sheets[0]!);
  if (!header.ok) throw new Error('header');
  return fixtureCandidates(readFixtures(wb.sheets[0]!, header, false).fixtures, { name: HOF, code: '12157' }, 'GAME');
};
const keyOnDay = (s: { candidates: readonly { key: string; date: { day: number; month: number } }[] }, month: number, day: number) =>
  s.candidates.find((c) => c.date.month === month && c.date.day === day)!.key;

describe('fixture review (no week: explicit dates are authoritative)', () => {
  it('dates far from any week are NOT flagged; every start-only game asks about its end', () => {
    const s = reviewFromCandidates(hofGames(), [], today);
    expect(s.week).toBeNull();
    const v = viewOf(s);
    for (const codes of v.issues.values()) expect(codes).not.toContain('DATE_OUTSIDE_WEEK');
    const future = s.candidates.filter((c) => c.date.month !== 10 || c.date.day !== 1);
    for (const c of future) expect(v.open.get(c.key)).toEqual(['END_TIME_MISSING']);
  });

  it('the past fixture is BLOCKING: keep-all / keep-anyway cannot pass it — Remove (or Edit Date) only', () => {
    const s = reviewFromCandidates(hofGames(), [], today);
    const past = keyOnDay(s, 10, 1);
    expect(viewOf(s).open.get(past)).toEqual(['END_TIME_MISSING', 'DATE_IN_PAST']);
    const kept = acknowledgeAll(acknowledge(s, past, 'DATE_IN_PAST'), 'END_TIME_MISSING');
    expect(viewOf(kept).open.get(past)).toEqual(['DATE_IN_PAST']);
    expect(viewOf(kept).summary.canConfirm).toBe(false);
    expect(viewOf(removeCandidate(kept, past)).summary.canConfirm).toBe(true);
  });

  it('"Keep all without end time" = one explicit decision; ends stay NULL (never invented); BLOCKING codes are refused', () => {
    const s = removeCandidate(reviewFromCandidates(hofGames(), [], today), keyOnDay(reviewFromCandidates(hofGames(), [], today), 10, 1));
    expect(viewOf(s).summary.canConfirm).toBe(false);
    const kept = acknowledgeAll(s, 'END_TIME_MISSING');
    const v = viewOf(kept);
    expect(v.summary.includedKeys.filter((k) => v.open.has(k))).toEqual([]);
    expect(viewOf(kept).summary.canConfirm).toBe(true);
    expect(reviewedBatch(kept).map((c) => c.end)).toEqual([null, null, null]);
    expect(acknowledgeAll(s, 'DATE_IN_PAST')).toBe(s);
  });

  it('keep-all skips a removed game (it stays unacknowledged if restored)', () => {
    const s = reviewFromCandidates(hofGames(), [], today);
    const away = keyOnDay(s, 10, 22);
    const kept = acknowledgeAll(removeCandidate(s, away), 'END_TIME_MISSING');
    expect(kept.acknowledged.has(away)).toBe(false);
  });

  it('an existing event at the same time is the usual possible-duplicate review', () => {
    const existing: ExistingSlot = { id: 'e1', title: 'משחק', date: calendarDate(2026, 10, 29)!, start: { hour: 19, minute: 0 }, end: null, type: 'GAME' };
    const s = reviewFromCandidates(hofGames(), [existing], today);
    const home = keyOnDay(s, 10, 29);
    const v = viewOf(s);
    expect(v.duplicates.get(home)).toEqual({ kind: 'EXISTING', event: existing });
    expect(v.open.get(home)).toEqual(expect.arrayContaining(['POSSIBLE_DUPLICATE']));
  });
});
