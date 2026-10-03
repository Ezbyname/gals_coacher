import {
  ageOn,
  calendarDate,
  compareCalendarDates,
  formatCalendarDate,
  isLeapYear,
  parseCalendarDate,
  type CalendarDate,
} from '../calendarDate';

// All dates are explicit CalendarDate values: nothing here depends on the
// machine clock or timezone.
const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe('parseCalendarDate / formatCalendarDate', () => {
  it('parses a valid YYYY-MM-DD date', () => {
    expect(parseCalendarDate('2015-07-09')).toEqual(d(2015, 7, 9));
  });

  it('round-trips through format', () => {
    for (const text of ['2015-07-09', '2024-02-29', '0001-01-01', '9999-12-31', '2010-12-31']) {
      const parsed = parseCalendarDate(text);
      expect(parsed).not.toBeNull();
      expect(formatCalendarDate(parsed!)).toBe(text);
    }
  });

  it('formats with zero padding', () => {
    expect(formatCalendarDate(d(987, 3, 4))).toBe('0987-03-04');
  });

  it('rejects malformed input', () => {
    for (const text of [
      '',
      '2015-7-9',
      '15-07-09',
      '2015/07/09',
      '2015-07-09T00:00:00Z',
      ' 2015-07-09',
      '2015-07-09 ',
      '20150709',
      'abcd-ef-gh',
      '+2015-07-09',
      '2015-07-0x',
    ]) {
      expect(parseCalendarDate(text)).toBeNull();
    }
  });

  it('rejects month 0 and month 13', () => {
    expect(parseCalendarDate('2015-00-10')).toBeNull();
    expect(parseCalendarDate('2015-13-10')).toBeNull();
  });

  it('rejects day 0', () => {
    expect(parseCalendarDate('2015-07-00')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(parseCalendarDate('2026-02-31')).toBeNull();
    expect(parseCalendarDate('2026-04-31')).toBeNull();
    expect(parseCalendarDate('2026-01-32')).toBeNull();
    expect(parseCalendarDate('0000-01-01')).toBeNull();
  });

  it('rejects 29 February in a non-leap year (2025-02-29)', () => {
    expect(parseCalendarDate('2025-02-29')).toBeNull();
    expect(parseCalendarDate('1900-02-29')).toBeNull();
  });

  it('accepts a valid leap day', () => {
    expect(parseCalendarDate('2024-02-29')).toEqual(d(2024, 2, 29));
    expect(parseCalendarDate('2000-02-29')).toEqual(d(2000, 2, 29));
  });
});

describe('calendarDate', () => {
  it('accepts real dates and rejects impossible or non-integer parts', () => {
    expect(calendarDate(2016, 12, 31)).toEqual(d(2016, 12, 31));
    expect(calendarDate(2025, 2, 29)).toBeNull();
    expect(calendarDate(2015, 0, 1)).toBeNull();
    expect(calendarDate(2015, 13, 1)).toBeNull();
    expect(calendarDate(2015, 1, 0)).toBeNull();
    expect(calendarDate(2015.5, 1, 1)).toBeNull();
    expect(calendarDate(2015, 1, Number.NaN)).toBeNull();
  });
});

describe('isLeapYear', () => {
  it('follows the Gregorian rule', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('compareCalendarDates', () => {
  it('orders by year, then month, then day', () => {
    expect(compareCalendarDates(d(2015, 7, 9), d(2015, 7, 9))).toBe(0);
    expect(compareCalendarDates(d(2015, 7, 9), d(2015, 7, 10))).toBeLessThan(0);
    expect(compareCalendarDates(d(2015, 8, 1), d(2015, 7, 31))).toBeGreaterThan(0);
    expect(compareCalendarDates(d(2014, 12, 31), d(2015, 1, 1))).toBeLessThan(0);
  });
});

describe('ageOn', () => {
  const dob = d(2015, 7, 9);

  it('gives the new age on the birthday itself', () => {
    expect(ageOn(dob, d(2026, 7, 9))).toBe(11);
  });

  it('gives the previous age the day before the birthday', () => {
    expect(ageOn(dob, d(2026, 7, 8))).toBe(10);
  });

  it('gives the new age the day after the birthday', () => {
    expect(ageOn(dob, d(2026, 7, 10))).toBe(11);
  });

  it('is 0 on the day of birth', () => {
    expect(ageOn(dob, dob)).toBe(0);
  });

  it('handles the 31 December / 1 January boundary', () => {
    const newYearsEve = d(2014, 12, 31);
    expect(ageOn(newYearsEve, d(2025, 12, 30))).toBe(10);
    expect(ageOn(newYearsEve, d(2025, 12, 31))).toBe(11);
    expect(ageOn(newYearsEve, d(2026, 1, 1))).toBe(11);

    const newYearsDay = d(2015, 1, 1);
    expect(ageOn(newYearsDay, d(2025, 12, 31))).toBe(10);
    expect(ageOn(newYearsDay, d(2026, 1, 1))).toBe(11);
  });

  describe('29 February date of birth', () => {
    const leapDob = d(2016, 2, 29);

    it('has not reached the birthday on 28 February of a non-leap year', () => {
      expect(ageOn(leapDob, d(2025, 2, 28))).toBe(8);
    });

    it('increments on 1 March of a non-leap year', () => {
      expect(ageOn(leapDob, d(2025, 3, 1))).toBe(9);
    });

    it('increments on 29 February of a leap year', () => {
      expect(ageOn(leapDob, d(2024, 2, 28))).toBe(7);
      expect(ageOn(leapDob, d(2024, 2, 29))).toBe(8);
    });
  });

  it('throws when today is before the date of birth', () => {
    expect(() => ageOn(dob, d(2015, 7, 8))).toThrow(RangeError);
  });
});
