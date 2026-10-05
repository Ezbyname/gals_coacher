import {
  CalendarEventDataError,
  CalendarEventNotFoundError,
  CalendarSportNotAssignedError,
} from '@/data/local/calendar/errors';
import { PlayerNotFoundError } from '@/data/local/players/errors';
import type { CalendarEvent, CalendarEventType } from '@/domain/calendarEvent';
import type { SportKey } from '@/domain/sport';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** The translated name of a stable event type code (the code itself is what is stored). */
export function eventTypeLabel(t: T, type: CalendarEventType): string {
  return t(`calendar.type.${type}`);
}

/** What an event is called in a list: its title, or its type when it has none. */
export function eventHeading(t: T, event: Pick<CalendarEvent, 'type' | 'title'>): string {
  return event.title ?? eventTypeLabel(t, event.type);
}

/** Storage / data errors → a localized, user-safe message (raw details are only logged). */
export function calendarErrorMessage(e: unknown, fallback: TranslationKey): TranslationKey {
  if (e instanceof PlayerNotFoundError) return 'calendar.errors.playerNotFound';
  if (e instanceof CalendarEventNotFoundError) return 'calendar.errors.eventNotFound';
  if (e instanceof CalendarSportNotAssignedError) return 'calendar.errors.sportNotAssigned';
  if (e instanceof CalendarEventDataError) return 'calendar.errors.dataInvalid';
  return fallback;
}

/** Translated sport names for the sports a calendar event can carry today. */
const SPORT_LABELS: Partial<Record<SportKey, TranslationKey>> = { BASKETBALL: 'basketball.sportName' };

export function sportLabel(t: T, sport: SportKey): string {
  const key = SPORT_LABELS[sport];
  return key ? t(key) : sport;
}
