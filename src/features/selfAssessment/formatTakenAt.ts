import type { Language } from '@/i18n/languages';

/** Day-first locales for both app languages (no US month-first ambiguity). */
const LOCALES: Record<Language, string> = { he: 'he-IL', en: 'en-GB' };

/**
 * When a self-assessment was taken, in the active app language, on the
 * device's LOCAL calendar and clock (no timeZone option: never UTC). The
 * time is shown because several assessments may be taken on the same day.
 * Presentation only — the stored value stays epoch milliseconds.
 */
export function formatTakenAt(takenAt: number, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(takenAt);
}
