import { localCalendarDateFromEpoch } from '../localCalendarDate';

// Epochs are built from LOCAL date components, so these assertions hold in any
// machine timezone (no fixed epoch is assumed to map to a fixed local date).
// Dates avoid common DST transition days.
const localEpoch = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, min, s, ms).getTime();

describe('localCalendarDateFromEpoch', () => {
  it('returns the local civil date at the start and end of a local day', () => {
    expect(localCalendarDateFromEpoch(localEpoch(2026, 7, 9, 0, 0, 0, 0))).toEqual({
      year: 2026,
      month: 7,
      day: 9,
    });
    expect(localCalendarDateFromEpoch(localEpoch(2026, 7, 9, 23, 59, 59, 999))).toEqual({
      year: 2026,
      month: 7,
      day: 9,
    });
  });

  it('rolls over at local midnight, including the leap day and year end', () => {
    const endOfLeapDay = localEpoch(2024, 2, 29, 23, 59, 59, 999);
    expect(localCalendarDateFromEpoch(endOfLeapDay)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(localCalendarDateFromEpoch(endOfLeapDay + 1)).toEqual({
      year: 2024,
      month: 3,
      day: 1,
    });

    const endOfYear = localEpoch(2025, 12, 31, 23, 59, 59, 999);
    expect(localCalendarDateFromEpoch(endOfYear)).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
    expect(localCalendarDateFromEpoch(endOfYear + 1)).toEqual({
      year: 2026,
      month: 1,
      day: 1,
    });
  });
});

describe('localDateToCalendarDate / calendarDateToLocalNoon', () => {
  it('reads local components and round-trips at local noon', () => {
    const { localDateToCalendarDate, calendarDateToLocalNoon } = jest.requireActual('../localCalendarDate');
    expect(localDateToCalendarDate(new Date(2015, 6, 9, 0, 1))).toEqual({ year: 2015, month: 7, day: 9 });
    expect(localDateToCalendarDate(new Date(2015, 6, 9, 23, 59))).toEqual({ year: 2015, month: 7, day: 9 });
    const noon = calendarDateToLocalNoon({ year: 2024, month: 2, day: 29 });
    expect([noon.getFullYear(), noon.getMonth() + 1, noon.getDate(), noon.getHours()]).toEqual([
      2024, 2, 29, 12,
    ]);
    expect(localDateToCalendarDate(noon)).toEqual({ year: 2024, month: 2, day: 29 });
  });
});

describe('localDateTimeToEpoch / epochToLocalDateTime (any machine timezone)', () => {
  const { localDateTimeToEpoch, epochToLocalDateTime } = jest.requireActual('../localCalendarDate');
  const valid = { year: 2026, month: 10, day: 6, hour: 18, minute: 30 };

  it('builds the local instant and reads it back unchanged', () => {
    const epoch = localDateTimeToEpoch(valid);
    expect(epoch).toBe(new Date(2026, 9, 6, 18, 30).getTime());
    expect(epochToLocalDateTime(epoch)).toEqual(valid);
  });

  it.each([
    ['31 February', { ...valid, month: 2, day: 31 }],
    ['29 February in a non-leap year', { ...valid, year: 2026, month: 2, day: 29 }],
    ['month 13', { ...valid, month: 13 }],
    ['month 0', { ...valid, month: 0 }],
    ['day 0', { ...valid, day: 0 }],
    ['hour 24', { ...valid, hour: 24 }],
    ['hour -1', { ...valid, hour: -1 }],
    ['minute 60', { ...valid, minute: 60 }],
    ['fractional minute', { ...valid, minute: 30.5 }],
    ['NaN day', { ...valid, day: Number.NaN }],
    ['two-digit year (Date would move it to 1999)', { ...valid, year: 99 }],
  ])('rejects %s', (_label, value) => {
    expect(localDateTimeToEpoch(value)).toBeNull();
  });

  it('accepts 29 February in a leap year and the last minute of a day', () => {
    expect(localDateTimeToEpoch({ year: 2028, month: 2, day: 29, hour: 23, minute: 59 })).toBe(
      new Date(2028, 1, 29, 23, 59).getTime(),
    );
  });

  it('epochToLocalDateTime rejects a non-whole-millisecond timestamp', () => {
    for (const bad of [Number.NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => epochToLocalDateTime(bad)).toThrow(RangeError);
    }
  });
});
