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
