/**
 * A civil (calendar) date: year, month, day. No time of day, no timezone.
 * Used for dates of birth and "today" when deriving age. Every function here
 * is pure: none reads the clock or the device timezone — callers pass `today`
 * explicitly. Never parse with `new Date('YYYY-MM-DD')` (that is UTC midnight)
 * and never derive age from milliseconds / 365 days.
 */
export interface CalendarDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31, bounded by the month */
  readonly day: number;
}

// Years are limited to what the stored YYYY-MM-DD text can represent; this is
// a format bound, not a product rule.
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Returns the date if year/month/day form a real calendar date, else `null`. */
export function calendarDate(year: number, month: number, day: number): CalendarDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Parses strict `YYYY-MM-DD`; returns `null` for malformed text or impossible dates. */
export function parseCalendarDate(text: string): CalendarDate | null {
  const match = ISO_DATE_RE.exec(text);
  if (!match) return null;
  return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function formatCalendarDate(date: CalendarDate): string {
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** Negative if `a` is before `b`, 0 if equal, positive if after. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * Whole years completed on `today`. The age increments on the birthday; a
 * 29 February birthday increments on 1 March in non-leap years. Throws if
 * `today` is before `dateOfBirth` (validation rejects future dates of birth).
 */
export function ageOn(dateOfBirth: CalendarDate, today: CalendarDate): number {
  if (compareCalendarDates(today, dateOfBirth) < 0) {
    throw new RangeError('ageOn: today is before the date of birth');
  }
  const birthdayReached =
    today.month > dateOfBirth.month ||
    (today.month === dateOfBirth.month && today.day >= dateOfBirth.day);
  return today.year - dateOfBirth.year - (birthdayReached ? 0 : 1);
}
