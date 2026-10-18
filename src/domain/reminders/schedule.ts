import { effectiveRules, type ReminderPreferences } from './preferences';
import type { ReminderRule } from './rules';

/**
 * CAL-SYNC-NOTIFY-001A — which reminders SHOULD be scheduled now (pure). The
 * notification engine (001C) only diffs this against what is scheduled.
 *
 * Owner rules 2026-10-10: a 30-day rolling window; past instants are skipped
 * (no catch-up); a DAY_OF_AT time after the event start is skipped (never
 * moved); completed events never remind; an event without an end reminds
 * normally (only the start matters); only subscribed Players' events.
 */
export const REMINDER_WINDOW_DAYS = 30;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Local wall-clock conversion (injected: the app passes its DST-safe device-local helpers). */
export interface LocalClock {
  toLocal(epochMs: number): { year: number; month: number; day: number; hour: number; minute: number };
  /** null when that local time does not exist (DST gap). */
  toEpoch(local: { year: number; month: number; day: number; hour: number; minute: number }): number | null;
}

/** What a reminder needs from a CalendarEvent. */
export interface ReminderEvent {
  readonly id: string;
  readonly playerId: string;
  readonly startAt: number;
  /** The event's Activity Type id: its type default applies unless the event has its own override. */
  readonly type: string;
  /** Non-null when the event was marked completed. */
  readonly completion: unknown;
}

export interface DesiredReminder {
  /** Stable: event + trigger minute. Reordering rules, or a rule that comes from another level but triggers at the same minute, keeps the id. */
  readonly id: string;
  readonly eventId: string;
  /** Epoch ms. */
  readonly at: number;
}

export const REMINDER_ID_PREFIX = 'cal:';

export function reminderId(eventId: string, at: number): string {
  return `${REMINDER_ID_PREFIX}${eventId}:${Math.floor(at / MINUTE)}`;
}

/** The instant of one rule for one event, or null when the rule does not apply to it. */
export function reminderInstant(rule: ReminderRule, startAt: number, clock: LocalClock): number | null {
  if (rule.kind === 'AT_START') return startAt;
  if (rule.kind === 'BEFORE_START') return startAt - rule.minutes * MINUTE;
  const day = clock.toLocal(startAt);
  const at = clock.toEpoch({ year: day.year, month: day.month, day: day.day, hour: rule.hour, minute: rule.minute });
  if (at === null) return null; // a clock time that does not exist that day: never moved
  return at > startAt ? null : at; // after the start: skipped, never moved to the day before
}

export function desiredReminders(
  events: readonly ReminderEvent[],
  prefs: ReminderPreferences,
  now: number,
  clock: LocalClock,
  windowDays: number = REMINDER_WINDOW_DAYS,
): DesiredReminder[] {
  if (!prefs.enabled) return []; // the master switch gates every level, an event override included
  const players = new Set(prefs.players);
  const until = now + windowDays * DAY;
  const out: DesiredReminder[] = [];
  for (const event of events) {
    if (!players.has(event.playerId) || event.completion != null) continue; // not subscribed / archived / completed
    const seen = new Set<string>();
    for (const rule of effectiveRules(prefs, event).rules) {
      const at = reminderInstant(rule, event.startAt, clock);
      if (at === null || at <= now || at > until) continue; // past (no catch-up) or beyond the window
      const id = reminderId(event.id, at);
      if (seen.has(id)) continue; // one managed notification per event and trigger minute
      seen.add(id);
      out.push({ id, eventId: event.id, at });
    }
  }
  return out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * What to change so that exactly `desired` is scheduled: schedule the missing
 * ones, cancel every OTHER reminder of ours (`cal:` ids). Notifications that
 * are not ours are never touched. Idempotent.
 */
export function reminderDiff(
  desired: readonly DesiredReminder[],
  scheduledIds: readonly string[],
): { readonly schedule: readonly DesiredReminder[]; readonly cancel: readonly string[] } {
  const wanted = new Set(desired.map((r) => r.id));
  const ours = scheduledIds.filter((id) => id.startsWith(REMINDER_ID_PREFIX));
  const present = new Set(ours);
  return {
    schedule: desired.filter((r) => !present.has(r.id)),
    cancel: [...new Set(ours.filter((id) => !wanted.has(id)))],
  };
}
