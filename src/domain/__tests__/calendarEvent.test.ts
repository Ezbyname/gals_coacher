import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BUILTIN_ACTIVITY_TYPES, isActivityTypeId, isBuiltinActivityType } from '../activityType';
import {
  agendaSection,
  splitAgenda,
  validateCalendarEvent,
  validateCalendarEventRecord,
  type CalendarEventInput,
} from '../calendarEvent';

const START = new Date(2026, 9, 6, 18, 0).getTime();
const HOUR = 60 * 60 * 1000;
const base: CalendarEventInput = {
  type: 'TEAM_TRAINING',
  sport: 'BASKETBALL',
  startAt: START,
  endAt: START + HOUR,
};

const errorsOf = (input: CalendarEventInput) => {
  const result = validateCalendarEvent(input);
  if (result.ok) throw new Error('expected invalid');
  return result.errors;
};

describe('event types (Activity Type ids, ACTIVITY-001)', () => {
  it('the built-ins are exactly the six approved codes, in order', () => {
    expect(BUILTIN_ACTIVITY_TYPES).toEqual([
      'TEAM_TRAINING',
      'PERSONAL_TRAINING',
      'GAME',
      'GYM',
      'RECOVERY',
      'OTHER',
    ]);
  });

  it.each(BUILTIN_ACTIVITY_TYPES.filter((t) => t !== 'OTHER'))('%s is valid without a title', (type) => {
    expect(validateCalendarEvent({ ...base, type, title: null })).toEqual({
      ok: true,
      value: { type, sport: 'BASKETBALL', startAt: START, endAt: START + HOUR, title: null, notes: null, location: null },
    });
  });

  it.each([
    'SCHOOL',
    'UNAVAILABLE',
    'team_training',
    '',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ])('rejects %p as UNKNOWN_TYPE', (type) => {
    expect(errorsOf({ ...base, type })).toEqual({ type: 'UNKNOWN_TYPE' });
    expect(isActivityTypeId(type)).toBe(false);
  });

  it('ids reject non-strings', () => {
    for (const value of [null, undefined, 1, {}, ['GAME']]) {
      expect(isActivityTypeId(value)).toBe(false);
      expect(isBuiltinActivityType(value)).toBe(false);
    }
  });

  it('a custom type (a UUID id) is well-formed and needs no title; only OTHER requires one', () => {
    const custom = '00000000-0000-4000-8000-0000000000a1';
    expect(validateCalendarEvent({ ...base, type: custom, title: null })).toEqual({
      ok: true,
      value: {
        type: custom,
        sport: 'BASKETBALL',
        startAt: START,
        endAt: START + HOUR,
        title: null,
        notes: null,
        location: null,
      },
    });
    expect(errorsOf({ ...base, type: 'OTHER', title: '  ' })).toEqual({ title: 'REQUIRED_FOR_OTHER' });
    // A label is never an id.
    expect(errorsOf({ ...base, type: 'Game' })).toEqual({ type: 'UNKNOWN_TYPE' });
  });
});

describe('sport (optional, independent of type)', () => {
  it.each([
    ['TEAM_TRAINING', 'BASKETBALL'],
    ['TEAM_TRAINING', null],
    ['GYM', null],
    ['GYM', 'BASKETBALL'],
    ['PERSONAL_TRAINING', null],
    ['RECOVERY', 'BASKETBALL'],
  ] as const)('%s with sport %p is valid', (type, sport) => {
    const result = validateCalendarEvent({ ...base, type, sport });
    expect(result.ok && result.value.sport).toBe(sport);
  });

  it('a missing sport is null', () => {
    const { sport: _omit, ...withoutSport } = base;
    void _omit;
    const result = validateCalendarEvent(withoutSport);
    expect(result.ok && result.value.sport).toBeNull();
  });

  it.each(['FOOTBALL', 'TENNIS', 'basketball', '', '__proto__'])('rejects sport %p', (sport) => {
    expect(errorsOf({ ...base, sport })).toEqual({ sport: 'UNSUPPORTED_SPORT' });
  });
});

describe('start / end', () => {
  it.each([START, 0, -1, -HOUR, Number.MAX_SAFE_INTEGER - HOUR])('accepts startAt %p', (startAt) => {
    expect(validateCalendarEvent({ ...base, startAt, endAt: null }).ok).toBe(true);
  });

  it.each([
    Number.NaN,
    Infinity,
    -Infinity,
    START + 0.5,
    Number.MAX_SAFE_INTEGER + 1,
    -Number.MAX_SAFE_INTEGER - 2,
  ])('rejects startAt %p as INVALID_TIMESTAMP', (startAt) => {
    expect(errorsOf({ ...base, startAt, endAt: null })).toEqual({ startAt: 'INVALID_TIMESTAMP' });
  });

  it('endAt is optional (null or omitted)', () => {
    expect(validateCalendarEvent({ ...base, endAt: null }).ok).toBe(true);
    const { endAt: _omit, ...withoutEnd } = base;
    void _omit;
    const result = validateCalendarEvent(withoutEnd);
    expect(result.ok && result.value.endAt).toBeNull();
  });

  it('endAt must be after startAt: one millisecond later is valid', () => {
    expect(validateCalendarEvent({ ...base, endAt: START + 1 }).ok).toBe(true);
  });

  it.each([START, START - 1, START - HOUR])('rejects endAt %p as NOT_AFTER_START', (endAt) => {
    expect(errorsOf({ ...base, endAt })).toEqual({ endAt: 'NOT_AFTER_START' });
  });

  it.each([Number.NaN, Infinity, START + HOUR + 0.25, Number.MAX_SAFE_INTEGER + 2])(
    'rejects endAt %p as INVALID_TIMESTAMP',
    (endAt) => {
      expect(errorsOf({ ...base, endAt })).toEqual({ endAt: 'INVALID_TIMESTAMP' });
    },
  );

  it('the safe-integer boundary: MAX_SAFE_INTEGER is accepted, one more is not', () => {
    expect(
      validateCalendarEvent({ ...base, startAt: Number.MAX_SAFE_INTEGER - 1, endAt: Number.MAX_SAFE_INTEGER })
        .ok,
    ).toBe(true);
    expect(
      errorsOf({ ...base, startAt: Number.MAX_SAFE_INTEGER, endAt: Number.MAX_SAFE_INTEGER + 1 }),
    ).toEqual({
      endAt: 'INVALID_TIMESTAMP',
    });
  });
});

describe('title / notes', () => {
  it('trims both and keeps the text', () => {
    const result = validateCalendarEvent({ ...base, title: '  Maccabi U12  ', notes: '\n bring water \t' });
    expect(result.ok && [result.value.title, result.value.notes]).toEqual(['Maccabi U12', 'bring water']);
  });

  it.each(['', '   ', '\n\t ', null, undefined])('blank title %p becomes null for a known type', (title) => {
    const result = validateCalendarEvent({ ...base, title, notes: title });
    expect(result.ok && [result.value.title, result.value.notes]).toEqual([null, null]);
  });

  it.each(['', '   ', null, undefined])('OTHER with title %p fails as REQUIRED_FOR_OTHER', (title) => {
    expect(errorsOf({ ...base, type: 'OTHER', title })).toEqual({ title: 'REQUIRED_FOR_OTHER' });
  });

  it('OTHER with a non-blank title is valid (trimmed)', () => {
    const result = validateCalendarEvent({ ...base, type: 'OTHER', sport: null, title: ' Swimming ' });
    expect(result.ok && result.value).toMatchObject({ type: 'OTHER', title: 'Swimming', sport: null });
  });

  it('non-string text is INVALID_VALUE, never coerced', () => {
    expect(errorsOf({ ...base, title: 5 as unknown as string })).toEqual({ title: 'INVALID_VALUE' });
    expect(errorsOf({ ...base, notes: {} as unknown as string })).toEqual({ notes: 'INVALID_VALUE' });
  });

  it('does not modify the caller input', () => {
    const input = { ...base, title: '  A  ', notes: '  B ' };
    const copy = JSON.parse(JSON.stringify(input));
    validateCalendarEvent(input);
    expect(input).toEqual(copy);
  });

  it('reports every problem at once', () => {
    expect(
      errorsOf({
        type: 'OTHER',
        sport: 'FOOTBALL',
        startAt: START,
        endAt: START,
        title: ' ',
        notes: 7 as unknown as string,
      }),
    ).toEqual({
      sport: 'UNSUPPORTED_SPORT',
      endAt: 'NOT_AFTER_START',
      title: 'REQUIRED_FOR_OTHER',
      notes: 'INVALID_VALUE',
    });
  });
});

describe('record timestamps (createdAt / updatedAt)', () => {
  const record = { ...base, createdAt: START - HOUR, updatedAt: START - 1 };

  it('accepts safe-integer timestamps', () => {
    const result = validateCalendarEventRecord(record);
    expect(result.ok && [result.value.createdAt, result.value.updatedAt]).toEqual([START - HOUR, START - 1]);
  });

  it.each([Number.NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 2])(
    'rejects createdAt / updatedAt %p',
    (bad) => {
      const result = validateCalendarEventRecord({ ...record, createdAt: bad, updatedAt: bad });
      expect(result).toEqual({
        ok: false,
        errors: { createdAt: 'INVALID_TIMESTAMP', updatedAt: 'INVALID_TIMESTAMP' },
      });
    },
  );

  it('combines field and timestamp errors', () => {
    const result = validateCalendarEventRecord({ ...record, type: 'OTHER', createdAt: Number.NaN });
    expect(result).toEqual({
      ok: false,
      errors: { title: 'REQUIRED_FOR_OTHER', createdAt: 'INVALID_TIMESTAMP' },
    });
  });
});

describe('agenda: Current & upcoming vs Past at `now`', () => {
  const now = START;

  it.each([
    ['in progress (started before, ends after now)', now - HOUR, now + HOUR, 'CURRENT_OR_UPCOMING'],
    ['ends exactly now', now - HOUR, now, 'CURRENT_OR_UPCOMING'],
    ['ended 1 ms before now', now - HOUR, now - 1, 'PAST'],
    ['ends 1 ms after now', now - HOUR, now + 1, 'CURRENT_OR_UPCOMING'],
    ['no end, starts exactly now', now, null, 'CURRENT_OR_UPCOMING'],
    ['no end, started 1 ms before now', now - 1, null, 'PAST'],
    ['no end, starts 1 ms after now', now + 1, null, 'CURRENT_OR_UPCOMING'],
    ['future with end', now + HOUR, now + 2 * HOUR, 'CURRENT_OR_UPCOMING'],
  ] as const)('%s → %s', (_label, startAt, endAt, section) => {
    expect(agendaSection({ startAt, endAt }, now)).toBe(section);
  });
});

describe('agenda order (splitAgenda)', () => {
  const now = START;
  const ev = (id: string, startAt: number, endAt: number | null = null) => ({ id, startAt, endAt });
  const events = [
    ev('c', now + 2 * HOUR),
    ev('past-b', now - 3 * HOUR, now - 2 * HOUR),
    ev('a', now + HOUR),
    ev('past-a', now - 3 * HOUR, now - 2 * HOUR), // same start as past-b
    ev('running', now - HOUR, now + HOUR),
    ev('b', now + HOUR), // same start as a
    ev('past-c', now - HOUR),
  ];

  it('Current & upcoming: start ascending, id ascending on ties (nearest first)', () => {
    expect(splitAgenda(events, now).currentOrUpcoming.map((e) => e.id)).toEqual(['running', 'a', 'b', 'c']);
  });

  it('Past: start descending, id descending on ties (most recent first)', () => {
    expect(splitAgenda(events, now).past.map((e) => e.id)).toEqual(['past-c', 'past-b', 'past-a']);
  });

  it('does not depend on input order', () => {
    const reversed = [...events].reverse();
    expect(splitAgenda(reversed, now)).toEqual(splitAgenda([...events], now));
  });

  it('does not modify the input array', () => {
    const input = events.map((e) => ({ ...e })); // a fresh copy in its original (unsorted) order
    const before = input.map((e) => e.id);
    splitAgenda(input, now);
    expect(input.map((e) => e.id)).toEqual(before);
    expect(before).toEqual(['c', 'past-b', 'a', 'past-a', 'running', 'b', 'past-c']);
  });
});

describe('calendar domain boundaries', () => {
  it('has no clock, UTC/ISO, training-session or score coupling and no extra fields', () => {
    const code = readFileSync(resolve(__dirname, '../calendarEvent.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Date\.now|new Date|toISOString|getUTC|Date\.UTC/);
    expect(code).not.toMatch(/measurement|comparison|session|result/i);
    // `location` is first-class event data since CAL-TEXT-IMPORT-001B (owner decision 2026-10-09).
    expect(code).not.toMatch(/status|timezone|timeZone|recurr|series|reminder|deleted|sync/i);
  });
});
