import {
  CalendarEventDataError,
  CalendarEventNotFoundError,
  CalendarSportNotAssignedError,
} from '@/data/local/calendar/errors';
import { ActivityTypeInactiveError, ActivityTypeNotFoundError } from '@/data/local/activityTypes/errors';
import { PlayerNotFoundError, SportInactiveError } from '@/data/local/players/errors';
import { requiresTitle, type ActivityTypeRef } from '@/domain/activityType';
import type { CalendarEvent } from '@/domain/calendarEvent';
import type { SportKey } from '@/domain/sport';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * An Activity Type's name: a built-in's translated label (its stable code is
 * what is stored), or a custom type's name exactly as the user entered it.
 */
export function activityTypeLabel(t: T, type: Pick<ActivityTypeRef, 'builtin' | 'name'>): string {
  return type.builtin !== null ? t(`calendar.type.${type.builtin}`) : (type.name ?? '');
}

/** The same, with "(inactive)" when the type is no longer offered for new events. */
export function activityTypeChoiceLabel(
  t: T,
  type: Pick<ActivityTypeRef, 'builtin' | 'name' | 'active'>,
): string {
  const label = activityTypeLabel(t, type);
  return type.active ? label : t('activityTypes.inactiveLabel', { name: label });
}

type Labelled = Pick<CalendarEvent, 'type' | 'title' | 'activityType'>;

/** What an event is called: its title, or its type when it has none. */
export function eventHeading(t: T, event: Labelled): string {
  return event.title ?? activityTypeLabel(t, event.activityType);
}

/**
 * The type shown next to a title, or null when it adds nothing: no title
 * (the type is already the heading) or OTHER (an input classification only —
 * the title says what it is). The stored type is never changed.
 */
export function eventSubtitle(t: T, event: Labelled): string | null {
  return event.title === null || requiresTitle(event.type) ? null : activityTypeLabel(t, event.activityType);
}

/** Heading plus meaningful type, for one-line text such as accessibility labels. */
export function eventName(t: T, event: Labelled): string {
  const subtitle = eventSubtitle(t, event);
  return subtitle === null ? eventHeading(t, event) : `${eventHeading(t, event)}, ${subtitle}`;
}

/** Storage / data errors → a localized, user-safe message (raw details are only logged). */
export function calendarErrorMessage(e: unknown, fallback: TranslationKey): TranslationKey {
  if (e instanceof PlayerNotFoundError) return 'calendar.errors.playerNotFound';
  if (e instanceof CalendarEventNotFoundError) return 'calendar.errors.eventNotFound';
  if (e instanceof CalendarSportNotAssignedError) return 'calendar.errors.sportNotAssigned';
  if (e instanceof SportInactiveError) return 'calendar.errors.sportInactive';
  if (e instanceof ActivityTypeInactiveError) return 'calendar.errors.typeInactive';
  if (e instanceof ActivityTypeNotFoundError) return 'calendar.errors.typeNotFound';
  if (e instanceof CalendarEventDataError) return 'calendar.errors.dataInvalid';
  return fallback;
}

/** Translated sport names for the sports a calendar event can carry today. */
const SPORT_LABELS: Partial<Record<SportKey, TranslationKey>> = {
  BASKETBALL: 'basketball.sportName',
  FOOTBALL: 'football.sportName',
  SURFING: 'surfing.sportName',
};

export function sportLabel(t: T, sport: SportKey): string {
  const key = SPORT_LABELS[sport];
  return key ? t(key) : sport;
}
