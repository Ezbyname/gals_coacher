import type { CalendarDate } from '../calendarDate';
import { compareCalendarDates } from '../calendarDate';
import { addDays, startOfWeek, WEEK_STARTS_ON, type Weekday } from '../calendarView';

/**
 * The week a pasted schedule belongs to: WEEK_STARTS_ON (Sunday, the Israeli
 * week) through the following Saturday. Pure: callers pass `today`.
 */
export interface ImportWeek {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

export function importWeekContaining(date: CalendarDate): ImportWeek {
  const start = startOfWeek(date, WEEK_STARTS_ON);
  return { start, end: addDays(start, 6) };
}

/**
 * The default week: the NEXT one — starting on the first week-start day
 * strictly after `today` (on a Sunday that is the Sunday a week later; the
 * current week stays one tap away). Today Fri 9 Oct 2026 → Sun 11 – Sat 17 Oct.
 */
export function nextImportWeek(today: CalendarDate): ImportWeek {
  return importWeekContaining(addDays(startOfWeek(today, WEEK_STARTS_ON), 7));
}

export function shiftImportWeek(week: ImportWeek, weeks: number): ImportWeek {
  return importWeekContaining(addDays(week.start, 7 * weeks));
}

/** FUTURE: not begun · STARTED: today is inside it · PAST: it has ended (warn, never forbid). */
export type ImportWeekTiming = 'FUTURE' | 'STARTED' | 'PAST';

export function importWeekTiming(week: ImportWeek, today: CalendarDate): ImportWeekTiming {
  if (compareCalendarDates(today, week.start) < 0) return 'FUTURE';
  if (compareCalendarDates(today, week.end) > 0) return 'PAST';
  return 'STARTED';
}

/** The date of `weekday` inside `week`. */
export function dateInWeek(week: ImportWeek, weekday: Weekday): CalendarDate {
  return addDays(week.start, (weekday - WEEK_STARTS_ON + 7) % 7);
}

export function isInWeek(week: ImportWeek, date: CalendarDate): boolean {
  return compareCalendarDates(date, week.start) >= 0 && compareCalendarDates(date, week.end) <= 0;
}
