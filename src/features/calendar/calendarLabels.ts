import {
  CalendarEventDataError,
  CalendarEventNotFoundError,
  CalendarSportNotAssignedError,
} from '@/data/local/calendar/errors';
import { PlayerNotFoundError, SportInactiveError } from '@/data/local/players/errors';
import type { CalendarEvent, CalendarEventType } from '@/domain/calendarEvent';
import type { SportKey } from '@/domain/sport';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** The translated name of a stable event type code (the code itself is what is stored). */
export function eventTypeLabel(t: T, type: CalendarEventType): string {
  return t(`calendar.type.${type}`);
}

/** What an event is called: its title, or its type when it has none. */
export function eventHeading(t: T, event: Pick<CalendarEvent, 'type' | 'title'>): string {
  return event.title ?? eventTypeLabel(t, event.type);
}

/**
 * The type shown next to a title, or null when it adds nothing: no title
 * (the type is already the heading) or OTHER (an input classification only —
 * the title says what it is). The stored type is never changed.
 */
export function eventSubtitle(t: T, event: Pick<CalendarEvent, 'type' | 'title'>): string | null {
  return event.title === null || event.type === 'OTHER' ? null : eventTypeLabel(t, event.type);
}

/** Heading plus meaningful type, for one-line text such as accessibility labels. */
export function eventName(t: T, event: Pick<CalendarEvent, 'type' | 'title'>): string {
  const subtitle = eventSubtitle(t, event);
  return subtitle === null ? eventHeading(t, event) : `${eventHeading(t, event)}, ${subtitle}`;
}

/** Storage / data errors → a localized, user-safe message (raw details are only logged). */
export function calendarErrorMessage(e: unknown, fallback: TranslationKey): TranslationKey {
  if (e instanceof PlayerNotFoundError) return 'calendar.errors.playerNotFound';
  if (e instanceof CalendarEventNotFoundError) return 'calendar.errors.eventNotFound';
  if (e instanceof CalendarSportNotAssignedError) return 'calendar.errors.sportNotAssigned';
  if (e instanceof SportInactiveError) return 'calendar.errors.sportInactive';
  if (e instanceof CalendarEventDataError) return 'calendar.errors.dataInvalid';
  return fallback;
}

/** Translated sport names for the sports a calendar event can carry today. */
const SPORT_LABELS: Partial<Record<SportKey, TranslationKey>> = { BASKETBALL: 'basketball.sportName' };

export function sportLabel(t: T, sport: SportKey): string {
  const key = SPORT_LABELS[sport];
  return key ? t(key) : sport;
}
