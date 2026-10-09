import type { CalendarDate } from '@/domain/calendarDate';
import type { ParsedTime } from '@/domain/calendarImport';
import { ltr } from '@/i18n/bidi';
import type { Language } from '@/i18n/languages';
import { calendarDateToLocalNoon } from '@/services/clock/localCalendarDate';

/**
 * Presentation of import candidates (CAL-TEXT-IMPORT-001C). Times and dates
 * are LTR runs (`ltr`) so "18:40–20:10" and "12/10" never reverse inside
 * Hebrew; weekday names come from Intl in the active language.
 */
const LOCALES: Record<Language, string> = { he: 'he-IL', en: 'en-GB' };

/** "יום שני" / "Monday". */
export function weekdayName(date: CalendarDate, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], { weekday: 'long' }).format(calendarDateToLocalNoon(date));
}

/** "12/10" (day/month, LTR run). */
export function shortDate(date: CalendarDate): string {
  return ltr(`${date.day}/${date.month}`);
}

/** "18:40" (no isolate). */
export function clock(t: ParsedTime): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** "18:40–20:10", or "16:30–?" when the end is missing (one LTR run). */
export function timeRange(start: ParsedTime, end: ParsedTime | null): string {
  return ltr(`${clock(start)}–${end === null ? '?' : clock(end)}`);
}

/** "יום שני · 12/10". */
export function dayLine(date: CalendarDate, language: Language): string {
  return `${weekdayName(date, language)} · ${shortDate(date)}`;
}
