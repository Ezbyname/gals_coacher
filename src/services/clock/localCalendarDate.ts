import type { CalendarDate } from '@/domain/calendarDate';

/**
 * Device-local boundary: the only place that reads the device timezone for
 * calendar purposes. Domain functions receive plain CalendarDates.
 *
 * Every conversion uses LOCAL components. Never `toISOString()`, the
 * `getUTC*` getters or `new Date('YYYY-MM-DD')`: those are UTC-based and shift
 * the civil day in timezones away from UTC.
 */

/** The civil date of a native Date in the device timezone (e.g. a picker selection). */
export function localDateToCalendarDate(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** The civil date on this device at `epochMs` (e.g. `clock.wallNow()`). */
export function localCalendarDateFromEpoch(epochMs: number): CalendarDate {
  return localDateToCalendarDate(new Date(epochMs));
}

/**
 * A native Date for a civil date, at LOCAL noon: noon never falls in a DST
 * gap or overlap, so the day cannot shift (used as a date picker's value).
 */
export function calendarDateToLocalNoon(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day, 12, 0, 0, 0);
}
