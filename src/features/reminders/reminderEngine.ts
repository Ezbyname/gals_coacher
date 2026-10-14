import { listCalendarEventsInRange } from '@/data/local/calendar/calendarEventRepository';
import type { PlayerDb } from '@/data/local/players/playerDb';
import { listPlayers } from '@/data/local/players/playerRepository';
import type { CalendarEvent } from '@/domain/calendarEvent';
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
 * rolling window) — schedule the missing, cancel the stale. Idempotent: a second
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
  const scheduled = await deps.scheduler.scheduledIds();

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

  const diff = reminderDiff(desired, scheduled);
  let cancelled = 0;
  let failed = 0;
  for (const id of diff.cancel) {
    try {
      await deps.scheduler.cancel(id);
      cancelled++;
    } catch (e) {
      failed++;
      console.warn('[reminders] cancel failed', id, e);
    }
  }
  if (permission !== 'GRANTED') return { status: 'NO_PERMISSION', cancelled };

  const names = new Map(players.map((p) => [p.player.id as string, p.player.name]));
  let made = 0;
  for (const r of diff.schedule) {
    const event = events.get(r.eventId)!;
    const words = deps.describe(event, names.get(event.playerId) ?? '');
    const notification: ReminderNotification = { id: r.id, at: r.at, ...words, data: { eventId: event.id, playerId: event.playerId } };
    try {
      await deps.scheduler.schedule(notification);
      made++;
    } catch (e) {
      failed++; // never claimed as scheduled; the next reconcile retries it
      console.warn('[reminders] schedule failed', r.id, e);
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
