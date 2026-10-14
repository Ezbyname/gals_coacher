import { runSerialized } from '../connectionQueue';
import type { PlayerDb } from '../players/playerDb';

/**
 * CAL-SYNC-NOTIFY-001D — the device-calendar entries Gals Coacher created (schema v16).
 * Device data, never a CalendarEvent field. Link writes do NOT emit the data-change
 * signal (they are the sync's own bookkeeping, not an input of it).
 */
export type SyncLinkState = 'SYNCED' | 'NEEDS_END_TIME' | 'ERROR';

export interface SyncLink {
  readonly eventId: string;
  readonly playerId: string;
  readonly calendarId: string;
  /** null while nothing exists in the device calendar (e.g. NEEDS_END_TIME, or a create that failed). */
  readonly externalEventId: string | null;
  readonly state: SyncLinkState;
  readonly syncedHash: string | null;
  /** The start that was synced (epoch ms): future = still managed; started / past = history. */
  readonly syncedStartAt: number;
  readonly syncedAt: number | null;
  readonly lastError: string | null;
}

type Row = {
  event_id: string; player_id: string; calendar_id: string; external_event_id: string | null; state: SyncLinkState;
  synced_hash: string | null; synced_start_at: number; synced_at: number | null; last_error: string | null;
};
const toLink = (r: Row): SyncLink => ({
  eventId: r.event_id, playerId: r.player_id, calendarId: r.calendar_id, externalEventId: r.external_event_id, state: r.state,
  syncedHash: r.synced_hash, syncedStartAt: r.synced_start_at, syncedAt: r.synced_at, lastError: r.last_error,
});

export function listSyncLinks(db: PlayerDb): Promise<SyncLink[]> {
  return runSerialized(db, async () =>
    (await db.getAllAsync<Row>('SELECT * FROM calendar_event_sync_links ORDER BY synced_start_at, event_id', [])).map(toLink),
  );
}

export function upsertSyncLink(db: PlayerDb, link: SyncLink): Promise<void> {
  return runSerialized(db, async () => {
    await db.runAsync(
      `INSERT INTO calendar_event_sync_links
         (event_id, player_id, calendar_id, external_event_id, state, synced_hash, synced_start_at, synced_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (event_id) DO UPDATE SET player_id = excluded.player_id, calendar_id = excluded.calendar_id,
         external_event_id = excluded.external_event_id, state = excluded.state, synced_hash = excluded.synced_hash,
         synced_start_at = excluded.synced_start_at, synced_at = excluded.synced_at, last_error = excluded.last_error`,
      [link.eventId, link.playerId, link.calendarId, link.externalEventId, link.state, link.syncedHash, link.syncedStartAt,
        link.syncedAt, link.lastError],
    );
  });
}

export function deleteSyncLink(db: PlayerDb, eventId: string): Promise<void> {
  return runSerialized(db, async () => {
    await db.runAsync('DELETE FROM calendar_event_sync_links WHERE event_id = ?', [eventId]);
  });
}
