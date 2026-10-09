import { calendarDate } from '@/domain/calendarDate';
import { nextImportWeek, type ExistingSlot } from '@/domain/calendarImport';
import { WHATSAPP_EXAMPLE_1, WHATSAPP_EXAMPLE_2 } from '@/domain/calendarImport/__tests__/whatsappFixtures';

import { devPrefillText } from '../devPrefill';
import {
  acknowledge,
  analyzeSchedule,
  editCandidate,
  removeCandidate,
  restoreCandidate,
  reviewedBatch,
  viewOf,
  type CandidateEdit,
} from '../importReview';

const week = nextImportWeek(calendarDate(2026, 10, 9)!); // Sun 11 – Sat 17 Oct 2026
const monday = calendarDate(2026, 10, 12)!;
const edit = (c: { date: CandidateEdit['date']; start: CandidateEdit['start'] }, patch: Partial<CandidateEdit>): CandidateEdit => ({
  date: c.date,
  start: c.start,
  end: null,
  location: null,
  type: 'TEAM_TRAINING',
  details: null,
  title: null,
  ...patch,
});

describe('import review state (001C, pure — nothing is written)', () => {
  it('example 1: four READY candidates; "Continue with 4"', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', []);
    const v = viewOf(s);
    expect(s.candidates.map((c) => c.date.day)).toEqual([12, 14, 15, 16]);
    expect(v.open.size).toBe(0);
    expect(v.summary).toMatchObject({ canConfirm: true });
    expect(v.summary.includedKeys).toHaveLength(4);
  });

  it('example 2: Tuesday blocks; remove → 2 included and confirmable; undo → blocked again', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_2, week, 'TEAM_TRAINING', []);
    const tue = s.candidates[1]!.key;
    expect(viewOf(s).open.get(tue)).toEqual(['END_TIME_MISSING']);
    expect(viewOf(s).summary.canConfirm).toBe(false);
    const removed = removeCandidate(s, tue);
    expect(viewOf(removed).summary.includedKeys).toHaveLength(2);
    expect(viewOf(removed).summary.canConfirm).toBe(true);
    const back = restoreCandidate(removed, tue);
    expect(viewOf(back).summary.canConfirm).toBe(false);
    expect(back.candidates[1]).toEqual(s.candidates[1]); // the same candidate, values kept
  });

  it('editing in an end time fixes Tuesday; an end before the start blocks; the suggestion stays INFO', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_2, week, 'TEAM_TRAINING', []);
    const tue = s.candidates[1]!;
    const fixed = editCandidate(s, tue.key, edit(tue, { end: { hour: 18, minute: 0 }, location: tue.location, details: tue.details }));
    expect(viewOf(fixed).open.has(tue.key)).toBe(false);
    expect(viewOf(fixed).issues.get(tue.key)).toEqual(['SUGGESTED_TYPE_DIFFERS']);
    expect(viewOf(fixed).summary.canConfirm).toBe(true);
    const backwards = editCandidate(s, tue.key, edit(tue, { end: { hour: 16, minute: 0 } }));
    expect(viewOf(backwards).open.get(tue.key)).toEqual(['END_NOT_AFTER_START']);
    // A BLOCKING issue can never be acknowledged away.
    expect(acknowledge(backwards, tue.key, 'END_NOT_AFTER_START')).toBe(backwards);
  });

  it('per-candidate type: only the edited candidate changes; OTHER asks for a title', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_2, week, 'TEAM_TRAINING', []);
    const tue = s.candidates[1]!;
    const game = editCandidate(s, tue.key, edit(tue, { end: { hour: 18, minute: 0 }, type: 'GAME' }));
    expect(game.candidates.map((c) => c.type)).toEqual(['TEAM_TRAINING', 'GAME', 'TEAM_TRAINING']);
    expect(viewOf(game).issues.get(tue.key)).toEqual([]);
    const other = editCandidate(s, tue.key, edit(tue, { end: { hour: 18, minute: 0 }, type: 'OTHER' }));
    expect(viewOf(other).open.get(tue.key)).toEqual(['TITLE_REQUIRED']);
  });

  it('weekday/date mismatch → "Use 14/10" resolves it; editing the date makes it the user decision', () => {
    const s = analyzeSchedule('יום רביעי 13/10 18:00-19:00', week, 'TEAM_TRAINING', []);
    const c = s.candidates[0]!;
    expect(viewOf(s).open.get(c.key)).toEqual(['WEEKDAY_DATE_MISMATCH']);
    expect(viewOf(acknowledge(s, c.key, 'WEEKDAY_DATE_MISMATCH')).summary.canConfirm).toBe(true);
    const moved = editCandidate(s, c.key, edit(c, { date: calendarDate(2026, 10, 14)!, end: { hour: 19, minute: 0 } }));
    expect(moved.candidates[0]!.dateFrom).toBe('EDITED');
    expect(viewOf(moved).open.has(c.key)).toBe(false);
  });

  it('a date outside the week → "Use 21/10 anyway" resolves it; the date is never moved', () => {
    const s = analyzeSchedule('21/10 18:00-19:00', week, 'TEAM_TRAINING', []);
    const c = s.candidates[0]!;
    expect(c.date).toEqual({ year: 2026, month: 10, day: 21 });
    expect(viewOf(s).open.get(c.key)).toEqual(['DATE_OUTSIDE_WEEK']);
    expect(viewOf(acknowledge(s, c.key, 'DATE_OUTSIDE_WEEK')).summary.canConfirm).toBe(true);
  });

  it('a possible duplicate shows the existing event; keep anyway or remove; a removed candidate duplicates nothing', () => {
    const existing: ExistingSlot = { id: 'e1', title: null, date: monday, start: { hour: 18, minute: 30 }, end: { hour: 20, minute: 0 }, type: 'TEAM_TRAINING' };
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', [existing]);
    const mon = s.candidates[0]!.key;
    const v = viewOf(s);
    expect(v.duplicates.get(mon)).toEqual({ kind: 'EXISTING', event: existing });
    expect(v.open.get(mon)).toEqual(['POSSIBLE_DUPLICATE']);
    expect(viewOf(acknowledge(s, mon, 'POSSIBLE_DUPLICATE')).summary.canConfirm).toBe(true);
    expect(viewOf(removeCandidate(s, mon)).summary).toMatchObject({ canConfirm: true });

    const twice = analyzeSchedule('יום שני 18:40-20:10\nיום שני 18:40-20:10', week, 'TEAM_TRAINING', []);
    expect(viewOf(removeCandidate(twice, 's1')).duplicates.size).toBe(0);
  });

  it('the reviewed batch is exactly the included candidates with their reviewed values', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', []);
    const batch = reviewedBatch(removeCandidate(s, s.candidates[2]!.key));
    expect(batch.map((c) => c.date.day)).toEqual([12, 14, 16]);
  });
});

describe('QA-only Hebrew pre-fill gate', () => {
  it('a production build (isDev false) ignores qaText, whatever it holds', () => {
    for (const param of ['יום שני 18:40-20:10', ['x'], '', undefined, 42]) {
      expect(devPrefillText(param, false)).toBeNull();
    }
  });
  it('a development build uses a non-empty string (first value of a repeated param)', () => {
    expect(devPrefillText(WHATSAPP_EXAMPLE_2, true)).toBe(WHATSAPP_EXAMPLE_2);
    expect(devPrefillText(['a', 'b'], true)).toBe('a');
    expect(devPrefillText('', true)).toBeNull();
    expect(devPrefillText(7, true)).toBeNull();
  });
});
