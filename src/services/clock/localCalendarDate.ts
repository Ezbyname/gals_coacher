import type { CalendarDate } from '@/domain/calendarDate';

/**
 * Device-local boundary: the civil date on this device at `epochMs` (e.g.
 * `clock.wallNow()`). The only place that reads the device timezone for
 * calendar purposes; domain functions receive the resulting `today` explicitly.
 */
export function localCalendarDateFromEpoch(epochMs: number): CalendarDate {
  const local = new Date(epochMs);
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
  };
}
