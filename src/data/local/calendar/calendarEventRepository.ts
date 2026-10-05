import {
  validateCalendarEvent,
  validateCalendarEventRecord,
  type CalendarEvent,
  type CalendarEventCore,
  type CalendarEventErrors,
  type CalendarEventInput,
} from '@/domain/calendarEvent';
import { isUuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import { PlayerNotFoundError, SportInactiveError } from '../players/errors';
import type { PlayerDb } from '../players/playerDb';

import {
  CalendarEventDataError,
  CalendarEventNotFoundError,
  CalendarSportNotAssignedError,
  type CalendarEventDataField,
  type CalendarEventDataReason,
} from './errors';

/** Invalid input is a result, not an exception: nothing was written. */
export type SaveCalendarEventResult =
  | { readonly ok: true; readonly event: CalendarEvent }
  | { readonly ok: false; readonly errors: CalendarEventErrors };

/**
 * Creates a one-off event in a Player's schedule. The input is validated by
 * the domain first (invalid → result, nothing written). Then, one operation
 * at a time per connection and in one transaction: the Player must exist
 * (PlayerNotFoundError) and, when a sport is given, be assigned to it
 * (CalendarSportNotAssignedError) and the assignment be active
 * (SportInactiveError); the row is inserted with a client id and
 * `createdAt = updatedAt = clock.wallNow()`, then re-read and validated.
 */
export async function createCalendarEvent(
  db: PlayerDb,
  playerId: string,
  input: CalendarEventInput,
  deps: { ids: IdService; clock: Clock },
): Promise<SaveCalendarEventResult> {
  const now = deps.clock.wallNow();
  const valid = validateCalendarEvent(input);
  if (!valid.ok) return valid;

  const id = deps.ids.newUuid();
  let saved = null as CalendarEvent | null;
  await writeTransaction(db, async () => {
    await assertPlayerAndSport(db, playerId, valid.value, null);
    const v = valid.value;
    await db.runAsync(
      `INSERT INTO calendar_events
         (id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, playerId, v.type, v.sport, v.startAt, v.endAt, v.title, v.notes, now, now],
    );
    // Re-read inside the transaction: the saved result is parsed like any read.
    saved = await readEvent(db, playerId, id);
  });
  if (saved === null) throw new Error('createCalendarEvent: transaction finished without the saved row');
  return { ok: true, event: saved };
}

/**
 * Replaces the user fields of one of this Player's events. `id`, `playerId`
 * and `createdAt` never change; `updatedAt = clock.wallNow()`. Validated
 * first; then, in one transaction, the event must exist for this Player
 * (CalendarEventNotFoundError — never created) and be readable, and any sport
 * must be assigned. Never moves an event to another Player.
 */
export async function updateCalendarEvent(
  db: PlayerDb,
  playerId: string,
  eventId: string,
  input: CalendarEventInput,
  deps: { clock: Clock },
): Promise<SaveCalendarEventResult> {
  const now = deps.clock.wallNow();
  const valid = validateCalendarEvent(input);
  if (!valid.ok) return valid;

  let updated = null as CalendarEvent | null;
  await writeTransaction(db, async () => {
    // Authoritative read of the stored event before any write (fails closed when malformed).
    const existing = await readEvent(db, playerId, eventId);
    if (existing === null) throw new CalendarEventNotFoundError(playerId, eventId);
    // The event may keep the sport it already has, even if that sport is now inactive.
    await assertPlayerAndSport(db, playerId, valid.value, existing.sport);
    const v = valid.value;
    await db.runAsync(
      `UPDATE calendar_events
          SET type = ?, sport = ?, start_at = ?, end_at = ?, title = ?, notes = ?, updated_at = ?
        WHERE id = ? AND player_id = ?`,
      [v.type, v.sport, v.startAt, v.endAt, v.title, v.notes, now, eventId, playerId],
    );
    updated = await readEvent(db, playerId, eventId);
  });
  if (updated === null) throw new CalendarEventNotFoundError(playerId, eventId);
  return { ok: true, event: updated };
}

/**
 * Permanently deletes one of this Player's events (hard delete: local-only,
 * single-writer stage). Throws CalendarEventNotFoundError when this Player has
 * no such event; nothing else is touched.
 */
export async function deleteCalendarEvent(db: PlayerDb, playerId: string, eventId: string): Promise<void> {
  await writeTransaction(db, async () => {
    const row = await db.getFirstAsync('SELECT id FROM calendar_events WHERE id = ? AND player_id = ?', [
      eventId,
      playerId,
    ]);
    if (row === null) throw new CalendarEventNotFoundError(playerId, eventId);
    await db.runAsync('DELETE FROM calendar_events WHERE id = ? AND player_id = ?', [eventId, playerId]);
  });
}

/** One of this Player's events, or null. A malformed stored event fails with CalendarEventDataError. */
export function getCalendarEvent(
  db: PlayerDb,
  playerId: string,
  eventId: string,
): Promise<CalendarEvent | null> {
  return runSerialized(db, () => readEvent(db, playerId, eventId));
}

/**
 * All of one Player's events in the canonical order `start_at ASC, id ASC`.
 * Sections (Current & upcoming / Past) and their display order belong to the
 * domain's `splitAgenda`, not here. Any malformed event fails the whole read.
 */
export function listCalendarEvents(db: PlayerDb, playerId: string): Promise<CalendarEvent[]> {
  return runSerialized(db, async () => {
    const rows = await db.getAllAsync<EventRow>(
      `${SELECT_EVENTS} WHERE e.player_id = ? ORDER BY e.start_at ASC, e.id ASC`,
      [playerId],
    );
    return rows.map(parseEventRow);
  });
}

/** One write transaction at a time per connection (the same queue as the other repositories). */
function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

/**
 * The Player must exist and, when the event has a sport, be assigned to it
 * with the assignment ACTIVE (SportInactiveError otherwise) — except that an
 * existing event may keep the sport it already has (`keptSport`): history
 * stays editable after its sport becomes inactive (SPORT-LIFE-001).
 */
async function assertPlayerAndSport(
  db: PlayerDb,
  playerId: string,
  event: CalendarEventCore,
  keptSport: string | null,
): Promise<void> {
  const player = await db.getFirstAsync('SELECT id FROM players WHERE id = ?', [playerId]);
  if (player === null) throw new PlayerNotFoundError(playerId);
  if (event.sport === null) return;
  const assignment = await db.getFirstAsync<{ active: unknown }>(
    'SELECT active FROM player_sports WHERE player_id = ? AND sport = ?',
    [playerId, event.sport],
  );
  if (assignment === null) throw new CalendarSportNotAssignedError(playerId, event.sport);
  if (assignment.active !== 1 && event.sport !== keptSport)
    throw new SportInactiveError(playerId, event.sport);
}

/** Unqueued read; only for use inside an already-queued operation. */
async function readEvent(db: PlayerDb, playerId: string, eventId: string): Promise<CalendarEvent | null> {
  const row = await db.getFirstAsync<EventRow>(`${SELECT_EVENTS} WHERE e.id = ? AND e.player_id = ?`, [
    eventId,
    playerId,
  ]);
  return row === null ? null : parseEventRow(row);
}

// The Player and the (Player, sport) assignment are LEFT JOINed so a broken
// relationship is observed and rejected, never hidden by an inner join.
// players.id and the player_sports key are unique, so rows never multiply.
const SELECT_EVENTS = `
  SELECT e.id, e.player_id, e.type, e.sport, e.start_at, e.end_at, e.title, e.notes,
         e.created_at, e.updated_at,
         p.id AS owner_player_id, ps.player_id AS assignment_player_id
  FROM calendar_events e
  LEFT JOIN players p ON p.id = e.player_id
  LEFT JOIN player_sports ps ON ps.player_id = e.player_id AND ps.sport = e.sport`;

/** Raw SQLite values: nothing is trusted until parsed. */
type EventRow = {
  id: unknown;
  player_id: unknown;
  type: unknown;
  sport: unknown;
  start_at: unknown;
  end_at: unknown;
  title: unknown;
  notes: unknown;
  created_at: unknown;
  updated_at: unknown;
  owner_player_id: unknown;
  assignment_player_id: unknown;
};

const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const isNullableNumber = (value: unknown) => value === null || typeof value === 'number';

/** Domain error field → stored-data error (first problem in a fixed field order). */
const RECORD_FIELDS = [
  'type',
  'sport',
  'startAt',
  'endAt',
  'title',
  'notes',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof CalendarEventErrors & CalendarEventDataField)[];

/**
 * The domain validator is the authority for a stored event's fields; stored
 * text must already be in its saved (trimmed, non-blank) form — nothing is
 * normalized on read.
 */
function parseEventRow(row: EventRow): CalendarEvent {
  const rawId = typeof row.id === 'string' ? row.id : null;
  const fail = (field: CalendarEventDataField, reason: CalendarEventDataReason) =>
    new CalendarEventDataError(field, reason, rawId);

  if (rawId === null || !isUuid(rawId)) throw fail('id', 'INVALID_VALUE');
  const playerId = row.player_id;
  if (typeof playerId !== 'string' || !isUuid(playerId)) throw fail('playerId', 'INVALID_VALUE');
  // An event belongs to an existing Player (and to its sport assignment when it has a sport).
  if (row.owner_player_id === null) throw fail('playerId', 'INVALID_RELATIONSHIP');
  if (row.sport !== null && row.assignment_player_id === null) throw fail('sport', 'INVALID_RELATIONSHIP');

  if (typeof row.type !== 'string') throw fail('type', 'INVALID_VALUE');
  if (!isNullableString(row.sport)) throw fail('sport', 'INVALID_VALUE');
  if (typeof row.start_at !== 'number') throw fail('startAt', 'INVALID_VALUE');
  if (!isNullableNumber(row.end_at)) throw fail('endAt', 'INVALID_VALUE');
  if (!isNullableString(row.title)) throw fail('title', 'INVALID_VALUE');
  if (!isNullableString(row.notes)) throw fail('notes', 'INVALID_VALUE');
  if (typeof row.created_at !== 'number') throw fail('createdAt', 'INVALID_VALUE');
  if (typeof row.updated_at !== 'number') throw fail('updatedAt', 'INVALID_VALUE');

  const valid = validateCalendarEventRecord({
    type: row.type,
    sport: row.sport as string | null,
    startAt: row.start_at,
    endAt: row.end_at as number | null,
    title: row.title as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!valid.ok) {
    const field = RECORD_FIELDS.find((f) => valid.errors[f] !== undefined) ?? 'type';
    const code = valid.errors[field];
    throw fail(
      field,
      code === 'UNKNOWN_TYPE' || code === 'UNSUPPORTED_SPORT' ? 'UNKNOWN_CODE' : 'INVALID_VALUE',
    );
  }
  if (valid.value.title !== row.title) throw fail('title', 'INVALID_VALUE');
  if (valid.value.notes !== row.notes) throw fail('notes', 'INVALID_VALUE');

  return { id: rawId, playerId, ...valid.value };
}
