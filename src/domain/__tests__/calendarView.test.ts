import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CalendarDate } from '../calendarDate';
import { BUILTIN_ACTIVITY_TYPES } from '../activityType';
import {
  NO_FILTER,
  NO_SPORT,
  WEEK_STARTS_ON,
  activeFilterCount,
  addDays,
  addMonths,
  byStartThenId,
  colorMeaning,
  dateKey,
  eventsByDate,
  datesWithin,
  daysBetween,
  filterCalendarEvents,
  isFilterActive,
  matchesFilter,
  monthGrid,
  playerColorSlot,
  sameDate,
  startOfWeek,
  toggleValue,
  visibleDates,
  weekDates,
  weekdayOf,
  type CalendarFilter,
} from '../calendarView';
import type { SportKey } from '../sport';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });
const keys = (dates: readonly CalendarDate[]) => dates.map(dateKey);

describe('civil-date arithmetic (no Date, no timezone)', () => {
  it('agrees with the proleptic Gregorian calendar for every day 1900–2100', () => {
    // Reference: Date.UTC is a pure calendar here (no local timezone involved).
    let date = d(1900, 1, 1);
    for (let n = 0; n < 73_415; n++) {
      const ref = new Date(Date.UTC(1900, 0, 1 + n));
      expect([date.year, date.month, date.day, weekdayOf(date)]).toEqual([
        ref.getUTCFullYear(),
        ref.getUTCMonth() + 1,
        ref.getUTCDate(),
        ref.getUTCDay(),
      ]);
      date = addDays(date, 1);
    }
  });

  it.each([
    ['month boundary', d(2026, 10, 31), 1, d(2026, 11, 1)],
    ['year boundary', d(2026, 12, 31), 1, d(2027, 1, 1)],
    ['backwards over a year', d(2027, 1, 1), -1, d(2026, 12, 31)],
    ['leap day', d(2024, 2, 28), 1, d(2024, 2, 29)],
    ['after a leap day', d(2024, 2, 29), 1, d(2024, 3, 1)],
    ['no leap day in 2026', d(2026, 2, 28), 1, d(2026, 3, 1)],
    ['no leap day in 2100', d(2100, 2, 28), 1, d(2100, 3, 1)],
    ['leap day in 2000', d(2000, 2, 28), 1, d(2000, 2, 29)],
    ['a week', d(2026, 10, 5), 7, d(2026, 10, 12)],
  ])('%s', (_name, from, days, to) => {
    expect(addDays(from, days)).toEqual(to);
    expect(daysBetween(from, to)).toBe(days);
  });

  it('weekdays: 5 Oct 2026 is a Monday, 4 Oct a Sunday, 1 Jan 2027 a Friday', () => {
    expect(weekdayOf(d(2026, 10, 5))).toBe(1);
    expect(weekdayOf(d(2026, 10, 4))).toBe(0);
    expect(weekdayOf(d(2027, 1, 1))).toBe(5);
  });
});

describe('weeks (start of week: one constant, Sunday)', () => {
  it('the app-wide week starts on Sunday (owner decision pending; one constant)', () => {
    expect(WEEK_STARTS_ON).toBe(0);
  });

  it('the current week of Monday 5 Oct 2026 is Sun 4 – Sat 10 Oct', () => {
    expect(keys(weekDates(d(2026, 10, 5)))).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
    // A Sunday starts its own week; a Saturday ends it.
    expect(startOfWeek(d(2026, 10, 4))).toEqual(d(2026, 10, 4));
    expect(startOfWeek(d(2026, 10, 10))).toEqual(d(2026, 10, 4));
  });

  it('previous / next week, and a week across a year boundary', () => {
    expect(startOfWeek(addDays(d(2026, 10, 5), -7))).toEqual(d(2026, 9, 27));
    expect(startOfWeek(addDays(d(2026, 10, 5), 7))).toEqual(d(2026, 10, 11));
    expect(keys(weekDates(d(2026, 12, 31)))).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('a different start day is a parameter (Monday), not a code change', () => {
    expect(startOfWeek(d(2026, 10, 4), 1)).toEqual(d(2026, 9, 28));
    expect(keys(weekDates(d(2026, 10, 5), 1))[0]).toBe('2026-10-05');
  });
});

describe('month grid', () => {
  const shape = (year: number, month: number) => {
    const weeks = monthGrid(year, month);
    return { rows: weeks.length, first: dateKey(weeks[0]![0]!), last: dateKey(weeks.at(-1)![6]!) };
  };

  it('October 2026: whole weeks Sun 27 Sep – Sat 31 Oct (5 rows of 7)', () => {
    const weeks = monthGrid(2026, 10);
    expect(shape(2026, 10)).toEqual({ rows: 5, first: '2026-09-27', last: '2026-10-31' });
    expect(weeks.every((week) => week.length === 7 && weekdayOf(week[0]!) === 0)).toBe(true);
    // Consecutive days with no gap or repeat.
    const all = weeks.flat();
    all.slice(1).forEach((date, i) => expect(daysBetween(all[i]!, date)).toBe(1));
  });

  it.each([
    ['February 2026 starts on Sunday, 28 days: exactly 4 rows', 2026, 2, 4, '2026-02-01', '2026-02-28'],
    ['February 2024 (leap): 29 Feb is in the grid', 2024, 2, 5, '2024-01-28', '2024-03-02'],
    ['January 2027 begins in December 2026 and needs 6 rows', 2027, 1, 6, '2026-12-27', '2027-02-06'],
    ['August 2026 needs 6 rows', 2026, 8, 6, '2026-07-26', '2026-09-05'],
  ])('%s', (_name, year, month, rows, first, last) => {
    expect(shape(year, month)).toEqual({ rows, first, last });
  });

  it('previous / next month keep the day where it exists, else the month end', () => {
    expect(addMonths(d(2026, 10, 5), -1)).toEqual(d(2026, 9, 5));
    expect(addMonths(d(2026, 10, 5), 1)).toEqual(d(2026, 11, 5));
    expect(addMonths(d(2026, 12, 15), 1)).toEqual(d(2027, 1, 15));
    expect(addMonths(d(2027, 1, 15), -1)).toEqual(d(2026, 12, 15));
    expect(addMonths(d(2026, 1, 31), 1)).toEqual(d(2026, 2, 28));
    expect(addMonths(d(2024, 1, 31), 1)).toEqual(d(2024, 2, 29));
    expect(addMonths(d(2026, 10, 31), 1)).toEqual(d(2026, 11, 30));
  });

  it('visible range: the whole grid in Month, the seven days in Week', () => {
    expect(visibleDates('MONTH', d(2026, 10, 5))).toEqual({ first: d(2026, 9, 27), last: d(2026, 10, 31) });
    expect(visibleDates('WEEK', d(2026, 10, 5))).toEqual({ first: d(2026, 10, 4), last: d(2026, 10, 10) });
  });

  it('datesWithin clips an event’s dates to the visible range', () => {
    const range = { first: d(2026, 10, 4), last: d(2026, 10, 10) };
    expect(keys(datesWithin(d(2026, 10, 6), d(2026, 10, 7), range))).toEqual(['2026-10-06', '2026-10-07']);
    expect(keys(datesWithin(d(2026, 9, 1), d(2026, 10, 5), range))).toEqual(['2026-10-04', '2026-10-05']);
    expect(keys(datesWithin(d(2026, 10, 9), d(2027, 1, 1), range))).toEqual(['2026-10-09', '2026-10-10']);
    expect(datesWithin(d(2026, 10, 11), d(2026, 10, 12), range)).toEqual([]);
    expect(sameDate(d(2026, 10, 4), d(2026, 10, 4))).toBe(true);
  });
});

describe('filters: AND across Player / Sport / Type, OR inside one', () => {
  type E = { id: string; playerId: string; sport: SportKey | null; type: string };
  const events: E[] = [
    { id: 'gal-game-bb', playerId: 'gal', sport: 'BASKETBALL', type: 'GAME' },
    { id: 'gal-gym', playerId: 'gal', sport: null, type: 'GYM' },
    { id: 'noa-game', playerId: 'noa', sport: null, type: 'GAME' },
    { id: 'tom-team-bb', playerId: 'tom', sport: 'BASKETBALL', type: 'TEAM_TRAINING' },
    { id: 'tom-other', playerId: 'tom', sport: null, type: 'OTHER' },
  ];
  const ids = (filter: Partial<CalendarFilter>) =>
    filterCalendarEvents(events, { ...NO_FILTER, ...filter }).map((e) => e.id);

  it('default (every dimension empty) is All: every event, in the given order', () => {
    expect(ids({})).toEqual(events.map((e) => e.id));
    expect(isFilterActive(NO_FILTER)).toBe(false);
    expect(activeFilterCount(NO_FILTER)).toBe(0);
  });

  it('one Player; several Players (OR)', () => {
    expect(ids({ playerIds: ['gal'] })).toEqual(['gal-game-bb', 'gal-gym']);
    expect(ids({ playerIds: ['gal', 'tom'] })).toEqual([
      'gal-game-bb',
      'gal-gym',
      'tom-team-bb',
      'tom-other',
    ]);
  });

  it('sport is the stored sport; "No sport" is its own value; both together is OR', () => {
    expect(ids({ sports: ['BASKETBALL'] })).toEqual(['gal-game-bb', 'tom-team-bb']);
    expect(ids({ sports: [NO_SPORT] })).toEqual(['gal-gym', 'noa-game', 'tom-other']);
    expect(ids({ sports: ['BASKETBALL', NO_SPORT] })).toEqual(events.map((e) => e.id));
  });

  it('activity types (OR inside)', () => {
    expect(ids({ types: ['GAME'] })).toEqual(['gal-game-bb', 'noa-game']);
    expect(ids({ types: ['GAME', 'OTHER'] })).toEqual(['gal-game-bb', 'noa-game', 'tom-other']);
  });

  it('dimensions combine with AND', () => {
    expect(ids({ playerIds: ['gal'], sports: ['BASKETBALL'], types: ['GAME'] })).toEqual(['gal-game-bb']);
    expect(ids({ playerIds: ['gal', 'noa'], types: ['GAME'] })).toEqual(['gal-game-bb', 'noa-game']);
    expect(ids({ playerIds: ['noa'], sports: ['BASKETBALL'] })).toEqual([]);
    expect(activeFilterCount({ playerIds: ['gal', 'noa'], sports: [], types: ['GAME'] })).toBe(2);
  });

  it('never changes an event (pure)', () => {
    const before = JSON.stringify(events);
    ids({ playerIds: ['gal'], types: ['GAME'] });
    expect(JSON.stringify(events)).toBe(before);
    expect(matchesFilter(events[0]!, NO_FILTER)).toBe(true);
  });

  it('toggleValue adds, then removes (multi-select chips)', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('colour meaning and stable Player colour slots', () => {
  const all = ['gal', 'noa', 'tom'];

  it('several Players can show → PLAYER; exactly one → TYPE', () => {
    expect(colorMeaning(NO_FILTER, all)).toBe('PLAYER');
    expect(colorMeaning({ ...NO_FILTER, playerIds: ['gal', 'tom'] }, all)).toBe('PLAYER');
    expect(colorMeaning({ ...NO_FILTER, playerIds: ['noa'] }, all)).toBe('TYPE');
    // A family with a single Player: one Player shows even unfiltered.
    expect(colorMeaning(NO_FILTER, ['gal'])).toBe('TYPE');
    // Other dimensions do not change who can show.
    expect(colorMeaning({ ...NO_FILTER, types: ['GAME'] }, all)).toBe('PLAYER');
  });

  const players = [
    { id: 'b-noa', createdAt: 200 },
    { id: 'a-gal', createdAt: 100 },
    { id: 'c-tom', createdAt: 200 }, // same createdAt as noa: id breaks the tie
  ];

  it('slot = creation order (createdAt, then id), independent of the input order', () => {
    expect(players.map((p) => playerColorSlot(players, p.id, 8))).toEqual([1, 0, 2]);
    const reversed = [...players].reverse();
    expect(players.map((p) => playerColorSlot(reversed, p.id, 8))).toEqual([1, 0, 2]);
  });

  it('wraps around the palette; an unknown Player has no slot', () => {
    expect(playerColorSlot(players, 'c-tom', 2)).toBe(0);
    expect(playerColorSlot(players, 'ghost', 8)).toBeNull();
  });

  it('chronological order inside a day: start, then id', () => {
    const a = { id: 'b', startAt: 1 };
    const b = { id: 'a', startAt: 1 };
    const c = { id: 'c', startAt: 0 };
    expect([a, b, c].sort(byStartThenId).map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('all six current types are the filterable ones (no new type here)', () => {
    expect(BUILTIN_ACTIVITY_TYPES).toEqual([
      'TEAM_TRAINING',
      'PERSONAL_TRAINING',
      'GAME',
      'GYM',
      'RECOVERY',
      'OTHER',
    ]);
  });
});

describe('eventsByDate: the events of each visible date', () => {
  const range = { first: d(2026, 10, 4), last: d(2026, 10, 10) };
  // Local dates are given directly (the device projection is tested in services/clock).
  const ev = (
    id: string,
    startAt: number,
    first: CalendarDate,
    last = first,
    completion: unknown = null,
  ) => ({
    id,
    startAt,
    first,
    last,
    completion,
  });
  const datesOf = (e: { first: CalendarDate; last: CalendarDate }) => ({ first: e.first, last: e.last });
  const ids = (map: Map<string, { id: string }[]>) =>
    Object.fromEntries([...map].map(([key, list]) => [key, list.map((e) => e.id)]));

  it('every occupied date in range, chronological per date (start, then id), regardless of input order', () => {
    const events = [
      ev('late', 30, d(2026, 10, 6)),
      ev('span', 10, d(2026, 10, 3), d(2026, 10, 5)), // starts before the range
      ev('b-tie', 20, d(2026, 10, 6)),
      ev('a-tie', 20, d(2026, 10, 6)),
      ev('after', 40, d(2026, 10, 11)), // outside
    ];
    const expected = {
      '2026-10-04': ['span'],
      '2026-10-05': ['span'],
      '2026-10-06': ['a-tie', 'b-tie', 'late'],
    };
    expect(ids(eventsByDate(events, datesOf, range))).toEqual(expected);
    expect(ids(eventsByDate([...events].reverse(), datesOf, range))).toEqual(expected);
  });

  it('completion never moves or reorders an event', () => {
    const plain = [ev('x', 10, d(2026, 10, 6)), ev('y', 20, d(2026, 10, 6))];
    const done = [ev('x', 10, d(2026, 10, 6), d(2026, 10, 6), { completedAt: 99 }), plain[1]!];
    expect(ids(eventsByDate(done, datesOf, range))).toEqual(ids(eventsByDate(plain, datesOf, range)));
  });
});

describe('calendar view boundaries', () => {
  it('reads no clock, no timezone and changes no event', () => {
    const code = readFileSync(resolve(__dirname, '../calendarView.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Date\.now|new Date|getTimezoneOffset|toISOString|getUTC|Date\.UTC/);
    expect(code).not.toMatch(/session|result|score|completion/i);
  });
});
