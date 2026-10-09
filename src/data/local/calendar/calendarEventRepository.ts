import {
  isCalendarCompletionSource,
  isCalendarEventSource,
  validateCalendarEvent,
  validateProvenance,
  type CalendarCompletion,
  type CalendarCompletionSource,
  validateCalendarEventRecord,
  type CalendarEvent,
  type CalendarEventCore,
  type CalendarEventErrors,
  type CalendarEventInput,
  type CalendarEventSource,
} from '@/domain/calendarEvent';
import type { ActivityTypeRef } from '@/domain/activityType';
import { isUuid } from '@/domain/ids';
import { parseActivityTypeRow } from '../activityTypes/activityTypeRepository';
import {
  ActivityTypeDataError,
  ActivityTypeInactiveError,
  ActivityTypeNotFoundError,
} from '../activityTypes/errors';
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
    await assertActivityType(db, valid.value.type, null);
    const v = valid.value;
    await insertEvent(db, id, playerId, v, null, null, now);
    // Re-read inside the transaction: the saved result is parsed like any read.
    saved = await readEvent(db, playerId, id);
  });
  if (saved === null) throw new Error('createCalendarEvent: transaction finished without the saved row');
  return { ok: true, event: saved };
}

/** Unqueued insert of one validated event (provenance is null for hand-entered events). */
async function insertEvent(
  db: PlayerDb,
  id: string,
  playerId: string,
  v: CalendarEventCore,
  source: CalendarEventSource | null,
  importBatchId: string | null,
  now: number,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO calendar_events
       (id, player_id, type, sport, start_at, end_at, title, notes, location, source, import_batch_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, playerId, v.type, v.sport, v.startAt, v.endAt, v.title, v.notes, v.location, source, importBatchId, now, now],
  );
}

/** One requested event of a batch that failed validation (index in the request). */
export interface BatchEventErrors {
  readonly index: number;
  readonly errors: CalendarEventErrors;
}

export type CreateCalendarEventBatchResult =
  | { readonly ok: true; readonly importBatchId: string; readonly events: CalendarEvent[] }
  | { readonly ok: false; readonly errors: readonly BatchEventErrors[] };

/**
 * Creates the events of ONE confirmed import for one Player — ALL OR NOTHING
 * (CAL-TEXT-IMPORT-001B). The inputs are the reviewed values, used exactly as
 * given: nothing is parsed, inferred, re-typed or completed here (no end time
 * is invented; the location is what the user confirmed).
 *
 * Every input is validated first; any invalid one → a result listing each
 * failing index, and nothing is written. Then, in one transaction: the Player
 * must exist, every sport be assigned and active, every Activity Type exist
 * and be active — any failure throws and the transaction writes nothing. Every
 * event gets a client id, `source` and one NEW `importBatchId` shared by the
 * whole batch, and `createdAt = updatedAt = clock.wallNow()`. Returns the saved
 * events in request order (re-read and parsed like any read).
 */
export async function createCalendarEventBatch(
  db: PlayerDb,
  playerId: string,
  request: { readonly events: readonly CalendarEventInput[]; readonly source: CalendarEventSource },
  deps: { ids: IdService; clock: Clock },
): Promise<CreateCalendarEventBatchResult> {
  if (request.events.length === 0) throw new RangeError('createCalendarEventBatch: an import has at least one event');
  if (!isCalendarEventSource(request.source)) throw new RangeError(`createCalendarEventBatch: unknown source ${String(request.source)}`);
  const now = deps.clock.wallNow();
  const validated = request.events.map((event) => validateCalendarEvent(event));
  const errors = validated.flatMap((v, index) => (v.ok ? [] : [{ index, errors: v.errors }]));
  if (errors.length > 0) return { ok: false, errors };
  const values = validated.map((v) => (v as { ok: true; value: CalendarEventCore }).value);

  const importBatchId = deps.ids.newUuid();
  const ids = values.map(() => deps.ids.newUuid());
  let saved = null as CalendarEvent[] | null;
  await writeTransaction(db, async () => {
    const checkedTypes = new Set<string>();
    for (const v of values) {
      await assertPlayerAndSport(db, playerId, v, null);
      if (!checkedTypes.has(v.type)) {
        await assertActivityType(db, v.type, null);
        checkedTypes.add(v.type);
      }
    }
    for (let i = 0; i < values.length; i++) {
      await insertEvent(db, ids[i]!, playerId, values[i]!, request.source, importBatchId, now);
    }
    const read = await Promise.all(ids.map((id) => readEvent(db, playerId, id)));
    if (read.some((e) => e === null)) throw new Error('createCalendarEventBatch: a saved row could not be re-read');
    saved = read as CalendarEvent[];
  });
  if (saved === null) throw new Error('createCalendarEventBatch: transaction finished without the saved rows');
  return { ok: true, importBatchId, events: saved };
}

/**
 * This Player's events of one import, in the canonical order. Identified ONLY
 * by (playerId, importBatchId) — never by date, type, title or location; a
 * batch id of another Player returns nothing.
 */
export function listCalendarEventBatch(
  db: PlayerDb,
  playerId: string,
  importBatchId: string,
): Promise<CalendarEvent[]> {
  return runSerialized(db, () => readBatch(db, playerId, importBatchId));
}

async function readBatch(db: PlayerDb, playerId: string, importBatchId: string): Promise<CalendarEvent[]> {
  if (!isUuid(playerId) || !isUuid(importBatchId)) return [];
  const rows = await db.getAllAsync<EventRow>(
    `${SELECT_EVENTS} WHERE e.player_id = ? AND e.import_batch_id = ? ORDER BY e.start_at ASC, e.id ASC`,
    [playerId, importBatchId],
  );
  return rows.map(parseEventRow);
}

/** Why an event of an undone import was kept instead of deleted. */
export type ImportUndoKeptReason = 'COMPLETED' | 'EDITED';

export interface UndoCalendarImportResult {
  readonly deletedIds: readonly string[];
  readonly kept: readonly { readonly id: string; readonly reason: ImportUndoKeptReason }[];
}

/**
 * Undoes one import (V1: offered on the success screen right after the
 * import). In one transaction, over this Player's events of THIS batch only
 * (matched by player_id AND import_batch_id AND id — nothing else):
 *  - an event marked completed is KEPT (COMPLETED) — never silently deleted;
 *  - an event edited after the import is KEPT (EDITED): every edit sets
 *    `updatedAt` (completion does not), so `updatedAt ≠ createdAt` proves an
 *    edit. Limit: an edit in the very millisecond of the import would not be
 *    seen (not reachable through the UI);
 *  - every other event of the batch is deleted.
 * Unknown / foreign batch → nothing happens. Persistent "undo later" is not
 * claimed by V1; the stored batch id keeps it possible.
 */
export async function undoCalendarImport(
  db: PlayerDb,
  playerId: string,
  importBatchId: string,
): Promise<UndoCalendarImportResult> {
  let result: UndoCalendarImportResult = { deletedIds: [], kept: [] };
  await writeTransaction(db, async () => {
    const events = await readBatch(db, playerId, importBatchId);
    const kept: { id: string; reason: ImportUndoKeptReason }[] = [];
    const deletedIds: string[] = [];
    for (const e of events) {
      if (e.completion !== null) kept.push({ id: e.id, reason: 'COMPLETED' });
      else if (e.updatedAt !== e.createdAt) kept.push({ id: e.id, reason: 'EDITED' });
      else {
        await db.runAsync('DELETE FROM calendar_events WHERE id = ? AND player_id = ? AND import_batch_id = ?', [
          e.id,
          playerId,
          importBatchId,
        ]);
        deletedIds.push(e.id);
      }
    }
    result = { deletedIds, kept };
  });
  return result;
}

/**
 * Replaces the user fields of one of this Player's events. A title longer
 * than CALENDAR_TITLE_MAX_LENGTH is accepted only when it is the stored title,
 * unchanged (history saved before the limit is never truncated). `id`, `playerId`
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
  // Every field rule first (nothing is read or written for invalid input) —
  // except the title length, which depends on the stored title (below).
  const typedTitle = typeof input.title === 'string' ? input.title.trim() : null;
  const typedLocation = typeof input.location === 'string' ? input.location.trim() : null;
  const fields = validateCalendarEvent(input, { storedTitle: typedTitle, storedLocation: typedLocation });
  if (!fields.ok) return fields;

  let updated = null as CalendarEvent | null;
  let rejected = null as SaveCalendarEventResult | null;
  await writeTransaction(db, async () => {
    // Authoritative read of the stored event before any write (fails closed when malformed).
    const existing = await readEvent(db, playerId, eventId);
    if (existing === null) throw new CalendarEventNotFoundError(playerId, eventId);
    // An edit that does not mention the location keeps the stored one (today's form has no location field).
    const edited: CalendarEventInput = input.location === undefined ? { ...input, location: existing.location } : input;
    // A title / location over the limit is accepted only when it is the stored one, unchanged.
    const valid = validateCalendarEvent(edited, { storedTitle: existing.title, storedLocation: existing.location });
    if (!valid.ok) {
      rejected = valid;
      return; // nothing written
    }
    // The event may keep the sport it already has, even if that sport is now inactive.
    await assertPlayerAndSport(db, playerId, valid.value, existing.sport);
    // Likewise the type it already has, even if that type is now inactive (never reactivated).
    await assertActivityType(db, valid.value.type, existing.type);
    const v = valid.value;
    await db.runAsync(
      // Provenance (source, import_batch_id) is written once at creation and never edited.
      `UPDATE calendar_events
          SET type = ?, sport = ?, start_at = ?, end_at = ?, title = ?, notes = ?, location = ?, updated_at = ?
        WHERE id = ? AND player_id = ?`,
      [v.type, v.sport, v.startAt, v.endAt, v.title, v.notes, v.location, now, eventId, playerId],
    );
    updated = await readEvent(db, playerId, eventId);
  });
  if (rejected !== null) return rejected;
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

/**
 * Marks one of this Player's events as completed, explicitly (CAL-COMP-001):
 * stores when (`clock.wallNow()`) and who (`source`). Nothing else changes —
 * not the schedule, the type, sport, text, nor `updatedAt` (completion is not
 * an edit of the event). Idempotent: an already-completed event is left as it
 * is (its original completion time is kept). Works whatever the current state
 * of the event's sport (history stays usable after SPORT-LIFE-001).
 * Throws CalendarEventNotFoundError / CalendarEventDataError; writes nothing then.
 */
export async function markCalendarEventCompleted(
  db: PlayerDb,
  playerId: string,
  eventId: string,
  deps: { clock: Clock },
  source: CalendarCompletionSource = 'LOCAL_USER',
): Promise<CalendarEvent> {
  const now = deps.clock.wallNow();
  return setCompletion(db, playerId, eventId, (existing) =>
    existing.completion !== null
      ? null // already completed: nothing to write
      : { sql: 'completed_at = ?, completion_source = ?', params: [now, source] },
  );
}

/**
 * Undoes an explicit completion: the event is NOT completed again and its
 * current state no longer carries a completion time or source (no history of
 * marks is kept in this version). The schedule and every other field are
 * untouched. Idempotent: an event that is not completed is left as it is.
 */
export async function undoCalendarEventCompletion(
  db: PlayerDb,
  playerId: string,
  eventId: string,
): Promise<CalendarEvent> {
  return setCompletion(db, playerId, eventId, (existing) =>
    existing.completion === null
      ? null
      : { sql: 'completed_at = NULL, completion_source = NULL', params: [] },
  );
}

/** Reads the event (fails closed), applies the completion change if any, re-reads it. */
async function setCompletion(
  db: PlayerDb,
  playerId: string,
  eventId: string,
  change: (existing: CalendarEvent) => { sql: string; params: (string | number)[] } | null,
): Promise<CalendarEvent> {
  let result = null as CalendarEvent | null;
  await writeTransaction(db, async () => {
    const existing = await readEvent(db, playerId, eventId);
    if (existing === null) throw new CalendarEventNotFoundError(playerId, eventId);
    const update = change(existing);
    if (update !== null) {
      // Only the completion columns; scoped to this Player's event.
      await db.runAsync(`UPDATE calendar_events SET ${update.sql} WHERE id = ? AND player_id = ?`, [
        ...update.params,
        eventId,
        playerId,
      ]);
    }
    result = await readEvent(db, playerId, eventId);
  });
  if (result === null) throw new CalendarEventNotFoundError(playerId, eventId);
  return result;
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

/**
 * Every Player's events that overlap the instant range [from, to), in the
 * canonical order `start_at ASC, id ASC` — one query for a whole visible
 * month or week (the Full Calendar, CAL-VIEW-001). An event occupies
 * [start_at, end_at); one without an end occupies its start instant only.
 * Any malformed event in the range fails the whole read (as listCalendarEvents).
 */
export function listCalendarEventsInRange(db: PlayerDb, from: number, to: number): Promise<CalendarEvent[]> {
  return runSerialized(db, async () => {
    const rows = await db.getAllAsync<EventRow>(
      `${SELECT_EVENTS}
       WHERE e.start_at < ? AND (CASE WHEN e.end_at IS NULL THEN e.start_at >= ? ELSE e.end_at > ? END)
       ORDER BY e.start_at ASC, e.id ASC`,
      [to, from, from],
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

/**
 * The event's Activity Type must exist (ActivityTypeNotFoundError) and be
 * ACTIVE (ActivityTypeInactiveError) — except that an existing event may keep
 * the type it already has (`keptType`), active or not (ACTIVITY-001).
 */
async function assertActivityType(db: PlayerDb, typeId: string, keptType: string | null): Promise<void> {
  const row = await db.getFirstAsync<{ active: unknown }>('SELECT active FROM activity_types WHERE id = ?', [
    typeId,
  ]);
  if (row === null) throw new ActivityTypeNotFoundError(typeId);
  if (row.active !== 1 && typeId !== keptType) throw new ActivityTypeInactiveError(typeId);
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
         e.location, e.source, e.import_batch_id,
         e.created_at, e.updated_at, e.completed_at, e.completion_source,
         p.id AS owner_player_id, ps.player_id AS assignment_player_id,
         at.id AS at_id, at.builtin AS at_builtin, at.name AS at_name, at.active AS at_active,
         at.created_at AS at_created_at, at.updated_at AS at_updated_at
  FROM calendar_events e
  LEFT JOIN players p ON p.id = e.player_id
  LEFT JOIN player_sports ps ON ps.player_id = e.player_id AND ps.sport = e.sport
  LEFT JOIN activity_types at ON at.id = e.type`;

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
  location: unknown;
  source: unknown;
  import_batch_id: unknown;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
  completion_source: unknown;
  owner_player_id: unknown;
  assignment_player_id: unknown;
  at_id: unknown;
  at_builtin: unknown;
  at_name: unknown;
  at_active: unknown;
  at_created_at: unknown;
  at_updated_at: unknown;
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
  'location',
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
  if (!isNullableString(row.location)) throw fail('location', 'INVALID_VALUE');
  if (typeof row.created_at !== 'number') throw fail('createdAt', 'INVALID_VALUE');
  if (typeof row.updated_at !== 'number') throw fail('updatedAt', 'INVALID_VALUE');

  const valid = validateCalendarEventRecord({
    type: row.type,
    sport: row.sport as string | null,
    startAt: row.start_at,
    endAt: row.end_at as number | null,
    title: row.title as string | null,
    notes: row.notes as string | null,
    location: row.location as string | null,
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
  if (valid.value.location !== row.location) throw fail('location', 'INVALID_VALUE');

  const provenance = validateProvenance(row.source, row.import_batch_id);
  if (!provenance.ok) {
    throw provenance.error === 'UNKNOWN_SOURCE'
      ? fail('source', 'UNKNOWN_CODE')
      : provenance.error === 'INVALID_BATCH_ID'
        ? fail('importBatchId', 'INVALID_VALUE')
        : fail(provenance.error === 'BATCH_REQUIRED' ? 'importBatchId' : 'source', 'INVALID_RELATIONSHIP');
  }

  return {
    id: rawId,
    playerId,
    ...valid.value,
    ...provenance.value,
    activityType: parseEventActivityType(row, fail),
    completion: parseCompletion(row, fail),
  };
}

/** The event's catalog type: it must exist (a well-formed id with no row is a broken relationship). */
function parseEventActivityType(
  row: EventRow,
  fail: (field: CalendarEventDataField, reason: CalendarEventDataReason) => CalendarEventDataError,
): ActivityTypeRef {
  if (row.at_id === null) throw fail('type', 'INVALID_RELATIONSHIP');
  try {
    const { id, builtin, name, active } = parseActivityTypeRow({
      id: row.at_id,
      builtin: row.at_builtin,
      name: row.at_name,
      active: row.at_active,
      created_at: row.at_created_at,
      updated_at: row.at_updated_at,
    });
    return { id, builtin, name, active };
  } catch (e) {
    if (e instanceof ActivityTypeDataError) throw fail('type', 'INVALID_VALUE');
    throw e;
  }
}

/** Both NULL = not completed; otherwise a whole-millisecond time and a known source, together. */
function parseCompletion(
  row: EventRow,
  fail: (field: CalendarEventDataField, reason: CalendarEventDataReason) => CalendarEventDataError,
): CalendarCompletion | null {
  const { completed_at: completedAt, completion_source: source } = row;
  if (completedAt === null && source === null) return null;
  if (typeof completedAt !== 'number' || !Number.isSafeInteger(completedAt)) {
    throw fail('completedAt', 'INVALID_VALUE');
  }
  if (typeof source !== 'string') throw fail('completionSource', 'INVALID_VALUE');
  if (!isCalendarCompletionSource(source)) throw fail('completionSource', 'UNKNOWN_CODE');
  return { completedAt, source };
}
