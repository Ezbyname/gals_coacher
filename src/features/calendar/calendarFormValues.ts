import type { ActivityTypeId } from '@/domain/activityType';
import type { CalendarEvent, CalendarEventInput } from '@/domain/calendarEvent';
import type { SportKey } from '@/domain/sport';
import {
  epochToLocalDateTime,
  localDateTimeToEpoch,
  type LocalDateTime,
} from '@/services/clock/localCalendarDate';

/** What the event form edits: device-local wall times, raw text (the domain trims and validates). */
export type CalendarFormValues = {
  readonly type: ActivityTypeId | null;
  readonly sport: SportKey | null;
  readonly start: LocalDateTime;
  /** null: no end time. */
  readonly end: LocalDateTime | null;
  readonly title: string;
  readonly notes: string;
  /** Optional place (CAL-EVENT-LOC-001); blank saves as no location. */
  readonly location: string;
};

const MINUTE = 60_000;
/** New events start on the next quarter hour, so the default is never already in the past. */
const START_STEP_MINUTES = 15;

/**
 * The first local wall time after `now` whose minute is a multiple of 15.
 * Stepped in whole epoch minutes and read back with local getters, so it is
 * right across hours, days, DST changes and any timezone offset.
 */
export function nextQuarterHour(now: number): LocalDateTime {
  let at = now - (now % MINUTE) + MINUTE;
  while (epochToLocalDateTime(at).minute % START_STEP_MINUTES !== 0) at += MINUTE;
  return epochToLocalDateTime(at);
}

/** A new event: no type chosen yet, no sport, starting at the next quarter hour, no end. */
export function newEventValues(now: number): CalendarFormValues {
  return { type: null, sport: null, start: nextQuarterHour(now), end: null, title: '', notes: '', location: '' };
}

/** A saved event, as the form shows it (local wall times on this device). */
export function valuesFromEvent(event: CalendarEvent): CalendarFormValues {
  return {
    type: event.type,
    sport: event.sport,
    start: epochToLocalDateTime(event.startAt),
    end: event.endAt === null ? null : epochToLocalDateTime(event.endAt),
    title: event.title ?? '',
    notes: event.notes ?? '',
    location: event.location ?? '',
  };
}

/** A local wall time that does not exist on this device (a DST gap). */
export type LocalTimeErrors = { start?: 'TIME_DOES_NOT_EXIST'; end?: 'TIME_DOES_NOT_EXIST' };

/**
 * The repository input for these values, or the local times that do not
 * exist. Everything else (type, end after start, OTHER title, text) is left
 * to the domain validator through the repository.
 */
export function toEventInput(
  values: CalendarFormValues,
): { ok: true; input: CalendarEventInput } | { ok: false; errors: LocalTimeErrors } {
  const startAt = localDateTimeToEpoch(values.start);
  const endAt = values.end === null ? null : localDateTimeToEpoch(values.end);
  const errors: LocalTimeErrors = {};
  if (startAt === null) errors.start = 'TIME_DOES_NOT_EXIST';
  if (values.end !== null && endAt === null) errors.end = 'TIME_DOES_NOT_EXIST';
  if (startAt === null || errors.end) return { ok: false, errors };
  return {
    ok: true,
    input: {
      type: values.type ?? '',
      sport: values.sport,
      startAt,
      endAt,
      title: values.title,
      notes: values.notes,
      location: values.location,
    },
  };
}

/**
 * The sports a new event may carry: the Player's ACTIVE assignments (today
 * only Basketball). An edited event also keeps offering the sport it already
 * has (`kept`), even when that sport is now inactive.
 */
export function sportsOf(
  profile: { readonly sports: readonly { readonly sport: SportKey; readonly active: boolean }[] },
  kept: SportKey | null = null,
): SportKey[] {
  const active = profile.sports.filter((assignment) => assignment.active).map((a) => a.sport);
  return kept !== null && !active.includes(kept) ? [...active, kept] : active;
}
