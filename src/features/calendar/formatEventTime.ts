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
 * isolate so `18:00–19:30` keeps its order inside Hebrew text. Every time is
 * shown next to its own date.
 */

/** e.g. "Tuesday, 6 October 2026" / "יום שלישי, 6 באוקטובר 2026" (the form's date fields). */
export function formatEventDate(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(epochMs);
}

/** e.g. "5 Oct 2026" / "5 באוק׳ 2026": the date a time belongs to on cards and details. */
export function formatShortDate(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(epochMs);
}

/** A 24-hour local time without an isolate, e.g. "18:00". */
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

/** `5 Oct 2026 · 23:00`: a time always next to its own date (the time is an LTR run). */
export function formatDateTime(epochMs: number, language: Language): string {
  return `${formatShortDate(epochMs, language)} · ${ltr(plainTime(epochMs, language))}`;
}

/**
 * When an event happens, as lines that keep every time with its own date:
 * - `day`: one line — `5 Oct 2026 · 18:00`, or `5 Oct 2026 · 18:00–19:00`
 *   when it ends the same local day (the range is one LTR run);
 * - `span`: it ends on a later local day — a start line and an end line,
 *   each `date · time` (the caller labels them Start / End).
 */
export type EventTimeLines = { kind: 'day'; text: string } | { kind: 'span'; start: string; end: string };

export function eventTimeLines(
  event: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  language: Language,
): EventTimeLines {
  const date = formatShortDate(event.startAt, language);
  const start = plainTime(event.startAt, language);
  if (event.endAt === null) return { kind: 'day', text: `${date} · ${ltr(start)}` };
  if (sameLocalDay(event.startAt, event.endAt)) {
    return { kind: 'day', text: `${date} · ${ltr(`${start}–${plainTime(event.endAt, language)}`)}` };
  }
  return {
    kind: 'span',
    start: formatDateTime(event.startAt, language),
    end: formatDateTime(event.endAt, language),
  };
}

/** The same, on one line (summaries and accessibility labels). */
export function formatEventWhen(
  t: T,
  event: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  language: Language,
): string {
  const lines = eventTimeLines(event, language);
  return lines.kind === 'day' ? lines.text : t('calendar.span', { start: lines.start, end: lines.end });
}

/** Shown as "Now" while an event with an end is under way. Computed from timestamps only. */
export function isInProgress(event: Pick<CalendarEvent, 'startAt' | 'endAt'>, now: number): boolean {
  return event.endAt !== null && event.startAt < now && event.endAt >= now;
}

/** e.g. "October 2026" / "אוקטובר 2026" (the Full Calendar's month title). `epochMs` is any instant of that month. */
export function formatMonthYear(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], { month: 'long', year: 'numeric' }).format(epochMs);
}

/**
 * A weekday for a narrow grid column: "Sun" … in English, "א׳" … in Hebrew
 * (the Hebrew short form "יום א׳" does not fit a seventh of a phone width).
 */
export function formatWeekdayShort(epochMs: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: language === 'he' ? 'narrow' : 'short',
  }).format(epochMs);
}
