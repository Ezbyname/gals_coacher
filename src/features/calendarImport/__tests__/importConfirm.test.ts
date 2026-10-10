import { calendarDate } from '@/domain/calendarDate';
import { nextImportWeek, type ExistingSlot } from '@/domain/calendarImport';
import { WHATSAPP_EXAMPLE_1, WHATSAPP_EXAMPLE_2 } from '@/domain/calendarImport/__tests__/whatsappFixtures';

import { candidateInput, prepareImport, type ConfirmContext } from '../importConfirm';
import { acknowledge, analyzeSchedule, editCandidate, removeCandidate, type ImportReviewState } from '../importReview';

const week = nextImportWeek(calendarDate(2026, 10, 9)!); // Sun 11 – Sat 17 Oct 2026
const DANIEL = '11111111-1111-4111-8111-111111111111';
const ctx: ConfirmContext = {
  playerId: DANIEL,
  analyzedFor: DANIEL,
  activeTypes: new Set(['TEAM_TRAINING', 'GAME', 'GYM', 'OTHER']),
  sports: ['BASKETBALL'],
  sport: 'BASKETBALL',
  today: calendarDate(2026, 10, 9)!,
};
const local = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return ms;
  const d = new Date(ms);
  return [d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};
const example2KeptWithoutEnd = (): ImportReviewState => {
  const s = analyzeSchedule(WHATSAPP_EXAMPLE_2, week, 'TEAM_TRAINING', []);
  return acknowledge(s, s.candidates[1]!.key, 'END_TIME_MISSING');
};

describe('prepareImport (001D) — the reviewed Preview is authoritative; checked structurally before any write', () => {
  it('example 1: four inputs in message order, exact local times, location as data, the batch sport, nothing invented', () => {
    const r = prepareImport(analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', []), ctx);
    if (!r.ok) throw new Error('expected ok');
    expect(r.keys).toEqual(['s1', 's2', 's3', 's4']);
    expect(r.inputs.map((i) => [local(i.startAt), local(i.endAt)])).toEqual([
      [[10, 12, 18, 40], [10, 12, 20, 10]],
      [[10, 14, 17, 10], [10, 14, 18, 40]],
      [[10, 15, 18, 40], [10, 15, 20, 10]],
      [[10, 16, 14, 30], [10, 16, 16, 0]],
    ]);
    expect(r.inputs.every((i) => i.location === 'עין כרמל' && i.type === 'TEAM_TRAINING' && i.sport === 'BASKETBALL')).toBe(true);
    expect(r.inputs.every((i) => i.title === null)).toBe(true); // the parser never invents a title
  });

  it('"Keep without end time" → endAt NULL (approved); without that decision → nothing is written', () => {
    const kept = prepareImport(example2KeptWithoutEnd(), ctx);
    if (!kept.ok) throw new Error('expected ok');
    expect(kept.inputs[1]!.endAt).toBeNull();
    expect(local(kept.inputs[1]!.startAt)).toEqual([10, 13, 16, 30]);

    const undecided = prepareImport(analyzeSchedule(WHATSAPP_EXAMPLE_2, week, 'TEAM_TRAINING', []), ctx);
    expect(undecided).toMatchObject({ ok: false, batch: null });
    if (undecided.ok) throw new Error('expected refusal');
    expect(undecided.candidates.get('s2')).toEqual(['UNRESOLVED_REVIEW', 'END_NOT_CONFIRMED']);
  });

  it('uses the user edits, never the text: type override, edited location / details, explicit date kept outside the week', () => {
    let s = example2KeptWithoutEnd();
    const tue = s.candidates[1]!;
    s = editCandidate(s, tue.key, { date: tue.date, start: tue.start, end: null, location: 'אולם העירוני', type: 'GAME', details: 'נגד העומר', title: null });
    const r = prepareImport(s, ctx);
    if (!r.ok) throw new Error('expected ok');
    expect(r.inputs[1]).toMatchObject({ type: 'GAME', location: 'אולם העירוני', notes: 'נגד העומר', endAt: null });
    expect(r.inputs[0]!.type).toBe('TEAM_TRAINING'); // the override stays on its own candidate

    let out = analyzeSchedule('21/10 18:00-19:00', week, 'TEAM_TRAINING', []);
    expect(prepareImport(out, ctx).ok).toBe(false); // outside the week, not yet decided
    out = acknowledge(out, 's1', 'DATE_OUTSIDE_WEEK');
    const anyway = prepareImport(out, ctx);
    if (!anyway.ok) throw new Error('expected ok');
    expect(local(anyway.inputs[0]!.startAt)).toEqual([10, 21, 18, 0]); // never moved into the week
  });

  it('duplicates: Keep anyway → included; Remove → excluded; undecided → nothing written (no new duplicate search)', () => {
    const existing: ExistingSlot[] = [
      { date: calendarDate(2026, 10, 12)!, start: { hour: 18, minute: 30 }, end: { hour: 20, minute: 0 }, type: 'TEAM_TRAINING' },
    ];
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', existing);
    expect(prepareImport(s, ctx)).toMatchObject({ ok: false });
    const keep = prepareImport(acknowledge(s, 's1', 'POSSIBLE_DUPLICATE'), ctx);
    expect(keep.ok && keep.keys).toEqual(['s1', 's2', 's3', 's4']);
    const removed = prepareImport(removeCandidate(s, 's1'), ctx);
    expect(removed.ok && removed.keys).toEqual(['s2', 's3', 's4']);
  });

  it('refuses the whole batch: stale Player, nothing included, unavailable type / sport, end not after start', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', []);
    expect(prepareImport(s, { ...ctx, analyzedFor: '22222222-2222-4222-8222-222222222222' })).toMatchObject({ ok: false, batch: 'STALE_PLAYER' });
    const none = ['s1', 's2', 's3', 's4'].reduce(removeCandidate, s);
    expect(prepareImport(none, ctx)).toMatchObject({ ok: false, batch: 'NOTHING_INCLUDED' });
    expect(prepareImport(s, { ...ctx, sports: [] })).toMatchObject({ ok: false, batch: 'SPORT_UNAVAILABLE' });
    expect(prepareImport(s, { ...ctx, sport: null }).ok).toBe(true); // no sport is a valid choice

    const typeGone = prepareImport(s, { ...ctx, activeTypes: new Set(['GAME']) });
    if (typeGone.ok) throw new Error('expected refusal');
    expect([...typeGone.candidates.keys()]).toEqual(['s1', 's2', 's3', 's4']);
    expect(typeGone.candidates.get('s3')).toEqual(['TYPE_UNAVAILABLE']);

    const c = s.candidates[2]!;
    const backwards = editCandidate(s, c.key, { date: c.date, start: { hour: 20, minute: 0 }, end: { hour: 19, minute: 0 }, location: c.location, type: c.type, details: null, title: null });
    const r = prepareImport(backwards, ctx);
    if (r.ok) throw new Error('expected refusal');
    expect(r.candidates.get('s3')).toContain('END_NOT_AFTER_START');
  });

  it('a date that has passed by save time is never written (today or later only)', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', []);
    const r = prepareImport(s, { ...ctx, today: calendarDate(2026, 10, 15)! }); // Mon 12 and Wed 14 are now past
    if (r.ok) throw new Error('expected refusal');
    expect([...r.candidates.keys()]).toEqual(['s1', 's2']);
    expect(r.candidates.get('s1')).toEqual(['DATE_IN_PAST']);
    expect(prepareImport(s, { ...ctx, today: calendarDate(2026, 10, 12)! }).ok).toBe(true); // today itself is fine
  });

  it('a local time that does not exist is never normalized into another time', () => {
    const s = analyzeSchedule(WHATSAPP_EXAMPLE_1, week, 'TEAM_TRAINING', []);
    const c = { ...s.candidates[0]!, date: { year: 2026, month: 2, day: 31 } };
    expect(candidateInput(c, null)).toBeNull();
  });
});
