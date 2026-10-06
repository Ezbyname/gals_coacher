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

/** A wall-clock date and time on this device (month 1–12, hour 0–23, minute 0–59). */
export interface LocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * The instant (epoch ms) at which this device's clock shows `value`, built
 * with the LOCAL `Date` constructor. Returns null when that local time does
 * not exist: an impossible date or time (31 February, hour 24, minute 60, a
 * two-digit year that `Date` would move to 19xx) or a time skipped by a DST
 * change (spring forward) — detected by reading the local components back,
 * so nothing is silently normalized. A wall time that occurs twice (DST fall
 * back) resolves as the platform `Date` does; on V8 / Node that is the
 * earlier instant (proven in localCalendarDate.timezone.test.ts).
 */
export function localDateTimeToEpoch(value: LocalDateTime): number | null {
  const { year, month, day, hour, minute } = value;
  if (![year, month, day, hour, minute].every(Number.isInteger)) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const epochMs = date.getTime();
  if (!Number.isSafeInteger(epochMs)) return null;
  const back = epochToLocalDateTime(epochMs);
  const same =
    back.year === year &&
    back.month === month &&
    back.day === day &&
    back.hour === hour &&
    back.minute === minute;
  return same ? epochMs : null;
}

/** The wall-clock date and time this device shows at `epochMs` (e.g. to prefill a picker). */
export function epochToLocalDateTime(epochMs: number): LocalDateTime {
  if (!Number.isSafeInteger(epochMs)) throw new RangeError(`Not a whole-millisecond timestamp: ${epochMs}`);
  const date = new Date(epochMs);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

/**
 * The first instant of a civil date on this device (local midnight; when a
 * DST change skips midnight, the first local time that exists that day).
 * Used as a half-open range boundary: a day is [start of day, start of next day).
 */
export function localDayStart(date: CalendarDate): number {
  return new Date(date.year, date.month - 1, date.day, 0, 0, 0, 0).getTime();
}

/**
 * The instant range [from, to) covering the civil dates first..last on this
 * device: from = start of `first`, to = start of the day after `last`.
 */
export function localDateRange(first: CalendarDate, last: CalendarDate): { from: number; to: number } {
  return {
    from: localDayStart(first),
    to: new Date(last.year, last.month - 1, last.day + 1, 0, 0, 0, 0).getTime(),
  };
}

/**
 * The first and last local civil dates an event occupies, with the end
 * exclusive ([startAt, endAt)): an event ending exactly at midnight does not
 * reach the next day; an event without an end occupies its start date only.
 * Nothing about the event is changed.
 */
export function eventLocalDates(
  startAt: number,
  endAt: number | null,
): { first: CalendarDate; last: CalendarDate } {
  const first = localCalendarDateFromEpoch(startAt);
  if (endAt === null || endAt <= startAt) return { first, last: first };
  return { first, last: localCalendarDateFromEpoch(endAt - 1) };
}
