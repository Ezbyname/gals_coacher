import { listCalendarEventsInRange } from '@/data/local/calendar/calendarEventRepository';
import { deleteSyncLink, listSyncLinks, upsertSyncLink, type SyncLink } from '@/data/local/calendarSync/syncLinkRepository';
import type { PlayerDb } from '@/data/local/players/playerDb';
import { listPlayers } from '@/data/local/players/playerRepository';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { planCalendarSync, type CalendarSyncPreferences, type ExternalPayload, type SyncAction, type SyncEvent } from '@/domain/calendarSync';
import { readCalendarSyncPreferences } from '@/preferences/calendarSyncPreference';
import type { DeviceCalendar } from '@/services/calendar/deviceCalendar';

/**
 * CAL-SYNC-NOTIFY-001D — apply the sync plan to the device calendar and record what
 * Gals Coacher created (sync links, schema v16). CalendarEvents are only READ: a
 * device failure never touches calendar data (the link is marked ERROR, retried next
 * run). Only entries recorded in our links are ever updated or deleted.
 */
const DAY = 24 * 60 * 60_000;
/** How far ahead the mirror reaches (a season). */
export const CALENDAR_SYNC_HORIZON_DAYS = 400;

/** The entry title "<Player> · <title or type>" in the current language (no invented data). */
export type DescribeEntry = (event: CalendarEvent, playerName: string) => string;

export interface CalendarSyncDeps {
  readonly db: PlayerDb;
  readonly device: DeviceCalendar;
  readonly now: () => number;
  readonly title: DescribeEntry;
  readonly readPrefs?: () => Promise<CalendarSyncPreferences>;
}

export type CalendarSyncResult =
  /** No calendar module in this app build: nothing done, nothing claimed. */
  | { readonly status: 'UNAVAILABLE' }
  /** Sync off and nothing of ours left to remove. */
  | { readonly status: 'OFF' }
  /** Calendar access not granted: nothing written or deleted (links kept for later). */
  | { readonly status: 'NO_PERMISSION' }
  /** The chosen calendar is gone (e.g. account removed): nothing written; the user chooses again. */
  | { readonly status: 'CALENDAR_MISSING' }
  | {
      readonly status: 'DONE';
      readonly created: number;
      readonly updated: number;
      readonly removed: number;
      readonly released: number;
      readonly needsEndTime: number;
      readonly failed: number;
    };

export async function syncDeviceCalendar(deps: CalendarSyncDeps): Promise<CalendarSyncResult> {
  if (!deps.device.available()) return { status: 'UNAVAILABLE' };
  const prefs = await (deps.readPrefs ?? readCalendarSyncPreferences)();
  const links = await listSyncLinks(deps.db);
  if (!prefs.enabled && links.length === 0) return { status: 'OFF' };
  if ((await deps.device.permission()) !== 'GRANTED') return { status: 'NO_PERMISSION' };
  if (prefs.enabled && prefs.calendarId !== null && !(await deps.device.calendarExists(prefs.calendarId))) {
    return { status: 'CALENDAR_MISSING' };
  }

  const now = deps.now();
  const players = await listPlayers(deps.db); // ACTIVE roster: an archived Player is out of scope
  const names = new Map(players.map((p) => [p.player.id as string, p.player.name]));
  const raw = await listCalendarEventsInRange(deps.db, now, now + CALENDAR_SYNC_HORIZON_DAYS * DAY);
  const events: SyncEvent[] = raw.map((e) => ({
    id: e.id,
    playerId: e.playerId,
    startAt: e.startAt,
    payload:
      e.endAt === null
        ? null
        : { title: deps.title(e, names.get(e.playerId) ?? ''), startAt: e.startAt, endAt: e.endAt, location: e.location, notes: e.notes },
  }));

  // What the calendar holds now for our managed future entries (to restore outside edits / deletions).
  const external = new Map<string, ExternalPayload | null>();
  for (const l of links) {
    if (l.externalEventId !== null && l.syncedStartAt > now && l.state === 'SYNCED') external.set(l.externalEventId, await deps.device.readEvent(l.externalEventId));
  }

  const actions = planCalendarSync({ prefs, roster: new Set(names.keys()), events, links, external, now });
  const linkOf = new Map(links.map((l) => [l.eventId, l]));
  const counts = { created: 0, updated: 0, removed: 0, released: 0, failed: 0 };
  const calendarId = prefs.calendarId!;

  const record = (a: Extract<SyncAction, { event: SyncEvent }>, patch: Partial<SyncLink>) =>
    upsertSyncLink(deps.db, {
      eventId: a.event.id, playerId: a.event.playerId, calendarId, externalEventId: null, state: 'SYNCED', syncedHash: null,
      syncedStartAt: a.event.startAt, syncedAt: now, lastError: null, ...patch,
    });
  const failed = async (a: SyncAction, e: unknown) => {
    counts.failed++;
    console.warn('[calendarSync] action failed', a.kind, e);
    if ('event' in a) {
      const prev = linkOf.get(a.event.id);
      await record(a, { externalEventId: prev?.externalEventId ?? null, calendarId: prev?.calendarId ?? calendarId, state: 'ERROR', syncedHash: null, lastError: String(e) });
    }
  };

  for (const a of actions) {
    try {
      switch (a.kind) {
        case 'CREATE': {
          const id = await deps.device.createEvent(calendarId, a.payload);
          await record(a, { externalEventId: id, syncedHash: a.hash });
          counts.created++;
          break;
        }
        case 'UPDATE':
          await deps.device.updateEvent(a.link.externalEventId!, a.payload);
          await record(a, { externalEventId: a.link.externalEventId, syncedHash: a.hash });
          counts.updated++;
          break;
        case 'MOVE': {
          await deps.device.deleteEvent(a.link.externalEventId!);
          const id = await deps.device.createEvent(calendarId, a.payload);
          await record(a, { externalEventId: id, syncedHash: a.hash });
          counts.updated++;
          break;
        }
        case 'NEEDS_END_TIME':
          // A future entry we created earlier (the end was removed since): it cannot stay correct → removed.
          if (a.link?.externalEventId) await deps.device.deleteEvent(a.link.externalEventId);
          await record(a, { externalEventId: null, state: 'NEEDS_END_TIME', syncedHash: null });
          break;
        case 'REMOVE':
          if (a.link.externalEventId !== null) await deps.device.deleteEvent(a.link.externalEventId);
          await deleteSyncLink(deps.db, a.link.eventId);
          counts.removed++;
          break;
        case 'RELEASE':
          await deleteSyncLink(deps.db, a.link.eventId); // history stays in the device calendar, untouched
          counts.released++;
          break;
      }
    } catch (e) {
      await failed(a, e);
    }
  }
  const needsEndTime = (await listSyncLinks(deps.db)).filter((l) => l.state === 'NEEDS_END_TIME').length;
  return { status: 'DONE', ...counts, needsEndTime };
}
