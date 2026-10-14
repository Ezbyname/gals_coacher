import { listCalendarEventsInRange } from '@/data/local/calendar/calendarEventRepository';
import type { PlayerDb } from '@/data/local/players/playerDb';
import { listPlayers } from '@/data/local/players/playerRepository';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { activityTypeLabel } from '@/features/calendar/calendarLabels';
import type { TranslationKey, TranslationParams } from '@/i18n/types';
import {
  desiredReminders,
  MAX_BEFORE_START_MINUTES,
  REMINDER_WINDOW_DAYS,
  reminderDiff,
  subscribedPlayers,
  type LocalClock,
  type ReminderPreferences,
} from '@/domain/reminders';
import { readReminderPreferences } from '@/preferences/reminderPreference';
import { epochToLocalDateTime, localDateTimeToEpoch } from '@/services/clock/localCalendarDate';
import type { ReminderPermissions } from '@/services/notifications/reminderPermissions';
import type { ReminderNotification, ReminderScheduler } from '@/services/notifications/reminderScheduler';

/**
 * CAL-SYNC-NOTIFY-001C — the local notification engine: make the device's
 * scheduled reminders EXACTLY the desired ones (001A `desiredReminders`, 30-day
 * rolling window) — schedule the missing, cancel the stale, and rewrite one whose
 * WORDS changed (app language, event title / location) under the SAME id (identity
 * stays event + rule + instant). Idempotent: a second
 * run changes nothing. CalendarEvent is the source of truth; this only READS it,
 * so a scheduling failure can never corrupt or roll back calendar data (it is
 * counted, and the next reconcile retries). Notifications that are not ours
 * (not `cal:`) are never touched.
 */
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const deviceLocalClock: LocalClock = { toLocal: epochToLocalDateTime, toEpoch: localDateTimeToEpoch };

/** The notification's words (known event data only: no invented end, no empty location). */
export type DescribeReminder = (event: CalendarEvent, playerName: string) => { title: string; body: string };

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The words of an event's reminder in the CURRENT app language: "<Player> · <title or type>"
 * and "<d/m> · <start>[–<end>][ · <location>]" — the end and the location only when known.
 */
export function reminderWords(
  t: (key: TranslationKey, params?: TranslationParams) => string,
  event: CalendarEvent,
  player: string,
): { title: string; body: string } {
  const start = epochToLocalDateTime(event.startAt);
  const end = event.endAt === null ? null : epochToLocalDateTime(event.endAt);
  const time = `${pad(start.hour)}:${pad(start.minute)}${end === null ? '' : `–${pad(end.hour)}:${pad(end.minute)}`}`;
  const when = `${start.day}/${start.month} · ${time}`;
  return {
    title: t('reminders.notification.title', { player, what: event.title ?? activityTypeLabel(t, event.activityType) }),
    body: event.location === null ? when : t('reminders.notification.bodyAt', { when, place: event.location }),
  };
}

export interface ReconcileDeps {
  readonly db: PlayerDb;
  readonly scheduler: ReminderScheduler;
  readonly permissions: Pick<ReminderPermissions, 'notificationState'>;
  readonly now: () => number;
  readonly describe: DescribeReminder;
  readonly clock?: LocalClock;
  readonly readPrefs?: (playerIds: readonly string[]) => Promise<ReminderPreferences>;
}

export type ReconcileResult =
  /** No notifications in this app build: nothing done, nothing claimed. */
  | { readonly status: 'UNAVAILABLE' }
  /** Notifications not allowed: nothing scheduled; our stale ones cancelled. */
  | { readonly status: 'NO_PERMISSION'; readonly cancelled: number }
  | { readonly status: 'DONE'; readonly desired: number; readonly scheduled: number; readonly cancelled: number; readonly failed: number };

export async function reconcileReminders(deps: ReconcileDeps): Promise<ReconcileResult> {
  const permission = await deps.permissions.notificationState();
  if (permission === 'UNAVAILABLE') return { status: 'UNAVAILABLE' };
  const now = deps.now();
  const onDevice = await deps.scheduler.scheduled();
  const scheduled = onDevice.map((n) => n.id);

  const players = await listPlayers(deps.db); // the active roster: an archived Player's events never remind
  const ids = players.map((p) => p.player.id as string);
  const prefs = await (deps.readPrefs ?? readReminderPreferences)(ids);
  const subscribed = subscribedPlayers(prefs, ids);

  let desired: ReturnType<typeof desiredReminders> = [];
  const events = new Map<string, CalendarEvent>();
  if (permission === 'GRANTED' && prefs.enabled && subscribed.length > 0) {
    // Starts up to the window + the longest "before" rule can still have a reminder inside the window.
    const until = now + REMINDER_WINDOW_DAYS * DAY + MAX_BEFORE_START_MINUTES * MINUTE;
    const wanted = new Set(subscribed);
    for (const e of await listCalendarEventsInRange(deps.db, now, until)) if (wanted.has(e.playerId)) events.set(e.id, e);
    desired = desiredReminders(
      [...events.values()].map((e) => ({ id: e.id, playerId: e.playerId, startAt: e.startAt, completion: e.completion })),
      { ...prefs, players: subscribed },
      now,
      deps.clock ?? deviceLocalClock,
    );
  }

  const names = new Map(players.map((p) => [p.player.id as string, p.player.name]));
  const notificationOf = (r: (typeof desired)[number]): ReminderNotification => {
    const event = events.get(r.eventId)!;
    const words = deps.describe(event, names.get(event.playerId) ?? '');
    return { id: r.id, at: r.at, ...words, data: { eventId: event.id, playerId: event.playerId } };
  };
  const wanted = new Map(desired.map((r) => [r.id, notificationOf(r)]));
  const diff = reminderDiff(desired, scheduled);
  // Same reminder, other words (e.g. the app language changed): rewrite it — cancel + schedule, same id.
  const stale = onDevice.filter((n) => {
    const w = wanted.get(n.id);
    return w !== undefined && (w.title !== n.title || w.body !== n.body);
  });
  const toCancel = [...diff.cancel, ...stale.map((n) => n.id)];
  const toSchedule = [...diff.schedule.map((r) => wanted.get(r.id)!), ...stale.map((n) => wanted.get(n.id)!)];
  let cancelled = 0;
  let failed = 0;
  for (const id of toCancel) {
    try {
      await deps.scheduler.cancel(id);
      cancelled++;
    } catch (e) {
      failed++;
      console.warn('[reminders] cancel failed', id, e);
    }
  }
  if (permission !== 'GRANTED') return { status: 'NO_PERMISSION', cancelled };

  let made = 0;
  for (const notification of toSchedule) {
    try {
      await deps.scheduler.schedule(notification);
      made++;
    } catch (e) {
      failed++; // never claimed as scheduled; the next reconcile retries it
      console.warn('[reminders] schedule failed', notification.id, e);
    }
  }
  return { status: 'DONE', desired: desired.length, scheduled: made, cancelled, failed };
}

/**
 * Serializes reconciles and coalesces bursts: requests during a run cause ONE
 * more run afterwards (never overlapping, never lost). `delayMs` gathers a burst
 * of writes (e.g. an import) into one reconcile.
 */
export function createReconcileRunner(task: () => Promise<unknown>, delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let again = false;
  let disposed = false;
  const run = async () => {
    timer = null;
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await task();
    } catch (e) {
      console.warn('[reminders] reconcile failed', e);
    }
    running = false;
    if (again && !disposed) {
      again = false;
      void run();
    }
  };
  return {
    request() {
      if (disposed || timer !== null) return;
      timer = setTimeout(() => void run(), delayMs);
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}
