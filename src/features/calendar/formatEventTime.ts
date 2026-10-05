import type { CalendarEvent } from '@/domain/calendarEvent';
import { ltr } from '@/i18n/bidi';
import type { Language } from '@/i18n/languages';
import type { TranslationKey, TranslationParams } from '@/i18n/types';
import { epochToLocalDateTime } from '@/services/clock/localCalendarDate';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** Day-first locales for both app languages (the same as the rest of the app). */
const LOCALES: Record<Language, string> = { he: 'he-IL', en: 'en-GB' };

/*
 * Presentation only: stored instants (epoch ms) are formatted on the device's
 * LOCAL calendar and clock, in the active app language. No timeZone option
 * (never UTC), 24-hour times, and every numeric time is wrapped in an LTR
 * isolate so `18:00–19:30` keeps its order inside Hebrew text.
 */

/** e.g. "Tuesday 6 October 2026" / "יום שלישי, 6 באוקטובר 2026". */
export function formatEventDate(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(epochMs);
}

/** e.g. "7 October" — the end date of an event that ends on a later day. */
function formatShortDate(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], { day: 'numeric', month: 'long' }).format(epochMs);
}

/** A 24-hour local time without an isolate, e.g. "18:00" (for accessibility labels and pickers). */
export function plainTime(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(epochMs);
}

const sameLocalDay = (a: number, b: number) => {
  const x = epochToLocalDateTime(a);
  const y = epochToLocalDateTime(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

/**
 * The event's time: `18:00`, `18:00–19:30` (one isolated LTR run), or, when it
 * ends on a later local day, `18:00 – 7 October, 01:00`.
 */
export function formatEventTime(
  t: T,
  event: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  language: Language,
): string {
  const start = plainTime(event.startAt, language);
  if (event.endAt === null) return ltr(start);
  const end = plainTime(event.endAt, language);
  if (sameLocalDay(event.startAt, event.endAt)) return ltr(`${start}–${end}`);
  return t('calendar.timeRangeUntil', {
    start: ltr(start),
    endDate: formatShortDate(event.endAt, language),
    end: ltr(end),
  });
}

/** Date and time together, e.g. for a one-line summary or an accessibility label. */
export function formatEventWhen(
  t: T,
  event: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  language: Language,
): string {
  return `${formatEventDate(event.startAt, language)}, ${formatEventTime(t, event, language)}`;
}

/** Shown as "Now" while an event with an end is under way. Computed from timestamps only. */
export function isInProgress(event: Pick<CalendarEvent, 'startAt' | 'endAt'>, now: number): boolean {
  return event.endAt !== null && event.startAt < now && event.endAt >= now;
}
