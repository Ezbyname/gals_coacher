import type { CalendarEvent } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';

import {
  newEventValues,
  nextQuarterHour,
  sportsOf,
  toEventInput,
  valuesFromEvent,
} from '../calendarFormValues';
import { isInProgress } from '../formatEventTime';

const local = (y: number, mo: number, d: number, h: number, mi: number, s = 0, ms = 0) =>
  new Date(y, mo - 1, d, h, mi, s, ms).getTime();

describe('nextQuarterHour (default start of a new event)', () => {
  it.each([
    ['18:10 → 18:15', local(2026, 10, 5, 18, 10, 20), { hour: 18, minute: 15 }],
    ['18:14:59.999 → 18:15', local(2026, 10, 5, 18, 14, 59, 999), { hour: 18, minute: 15 }],
    [
      'exactly 18:15 → 18:30 (never now, never the past)',
      local(2026, 10, 5, 18, 15),
      { hour: 18, minute: 30 },
    ],
    ['18:50 → 19:00', local(2026, 10, 5, 18, 50), { hour: 19, minute: 0 }],
  ])('%s', (_label, now, time) => {
    expect(nextQuarterHour(now)).toEqual({ year: 2026, month: 10, day: 5, ...time });
  });

  it('rolls over midnight and the year on the local calendar', () => {
    expect(nextQuarterHour(local(2026, 12, 31, 23, 50))).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
    });
  });

  it('a new event: no type, no sport, no end, empty text', () => {
    expect(newEventValues(local(2026, 10, 5, 18, 10))).toEqual({
      type: null,
      sport: null,
      start: { year: 2026, month: 10, day: 5, hour: 18, minute: 15 },
      end: null,
      title: '',
      notes: '',
    });
  });
});

describe('form values ↔ repository input', () => {
  const event: CalendarEvent = {
    id: '00000000-0000-4000-8000-000000000001' as Uuid,
    playerId: '00000000-0000-4000-8000-000000000002' as Uuid,
    type: 'GAME',
    sport: 'BASKETBALL',
    startAt: local(2026, 10, 6, 18, 0),
    endAt: local(2026, 10, 7, 0, 30),
    title: 'Cup',
    notes: null,
    createdAt: 1,
    updatedAt: 2,
    activityType: { id: 'GAME', builtin: 'GAME', name: null, active: true },
    completion: null,
  };

  it('a saved event round-trips through its local wall times unchanged', () => {
    const values = valuesFromEvent(event);
    expect(values).toEqual({
      type: 'GAME',
      sport: 'BASKETBALL',
      start: { year: 2026, month: 10, day: 6, hour: 18, minute: 0 },
      end: { year: 2026, month: 10, day: 7, hour: 0, minute: 30 },
      title: 'Cup',
      notes: '',
    });
    expect(toEventInput(values)).toEqual({
      ok: true,
      input: {
        type: 'GAME',
        sport: 'BASKETBALL',
        startAt: event.startAt,
        endAt: event.endAt,
        title: 'Cup',
        notes: '',
      },
    });
  });

  it('passes raw text and an unchosen type through: the domain decides (no UI rules duplicated)', () => {
    const values = { ...valuesFromEvent(event), type: null, title: '  ', end: null };
    expect(toEventInput(values)).toMatchObject({ ok: true, input: { type: '', title: '  ', endAt: null } });
  });

  it('a local time that does not exist is reported for that field; nothing else is checked here', () => {
    const impossible = { year: 2026, month: 2, day: 30, hour: 10, minute: 0 }; // stands in for a DST gap
    expect(toEventInput({ ...valuesFromEvent(event), start: impossible })).toEqual({
      ok: false,
      errors: { start: 'TIME_DOES_NOT_EXIST' },
    });
    expect(toEventInput({ ...valuesFromEvent(event), end: impossible })).toEqual({
      ok: false,
      errors: { end: 'TIME_DOES_NOT_EXIST' },
    });
  });

  it('sports a new event can carry: only ACTIVE assignments; an edited event keeps its own sport', () => {
    const active = { sports: [{ sport: 'BASKETBALL' as const, active: true }] };
    const inactive = { sports: [{ sport: 'BASKETBALL' as const, active: false }] };
    expect(sportsOf(active)).toEqual(['BASKETBALL']);
    expect(sportsOf({ sports: [] })).toEqual([]);
    expect(sportsOf(inactive)).toEqual([]);
    // Editing a historical Basketball event: Basketball stays offered (keep or clear).
    expect(sportsOf(inactive, 'BASKETBALL')).toEqual(['BASKETBALL']);
    expect(sportsOf(active, 'BASKETBALL')).toEqual(['BASKETBALL']); // never twice
    expect(sportsOf(inactive, null)).toEqual([]);
  });
});

describe('isInProgress ("Now" label, from timestamps only)', () => {
  const now = 1_000_000;
  it.each([
    ['started, ends later', { startAt: now - 1, endAt: now + 1 }, true],
    ['started, ends exactly now', { startAt: now - 1, endAt: now }, true],
    ['starts exactly now', { startAt: now, endAt: now + 1 }, false],
    ['already ended', { startAt: now - 2, endAt: now - 1 }, false],
    ['no end (never "under way")', { startAt: now - 1, endAt: null }, false],
  ])('%s → %p', (_label, event, expected) => {
    expect(isInProgress(event, now)).toBe(expected);
  });
});
