import {
  isBuiltinActivityType,
  sortActivityTypes,
  validateCustomActivityTypeName,
  type ActivityType,
  type CustomActivityTypeNameError,
} from '@/domain/activityType';
import { isUuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import type { PlayerDb } from '../players/playerDb';

import { ActivityTypeDataError, ActivityTypeNotFoundError, type ActivityTypeDataField } from './errors';

/**
 * The Activity Type catalog (ACTIVITY-001). Types are never deleted (the
 * schema refuses it): "removing" one makes it inactive, which only hides it
 * from NEW events — no calendar event, sport or completion is touched.
 * Every operation runs one at a time per connection; writes are transactional.
 */

/** Invalid input is a result, not an exception: nothing was written. */
export type CreateActivityTypeResult =
  | { readonly ok: true; readonly type: ActivityType }
  | { readonly ok: false; readonly error: CustomActivityTypeNameError };

/** Every type, active and inactive, in display order (built-ins first, then custom by creation). */
export function listActivityTypes(db: PlayerDb): Promise<ActivityType[]> {
  return runSerialized(db, () => readAll(db));
}

/** One type, or null. */
export function getActivityType(db: PlayerDb, id: string): Promise<ActivityType | null> {
  return runSerialized(db, () => readOne(db, id));
}

/**
 * Adds a custom type: a new client UUID, the trimmed name, active. The name
 * must be non-blank, within the limit, and not an existing custom name (an
 * existing one — even inactive — is made active again instead).
 */
export async function createCustomActivityType(
  db: PlayerDb,
  name: string,
  deps: { ids: IdService; clock: Clock },
): Promise<CreateActivityTypeResult> {
  const now = deps.clock.wallNow();
  let result = null as CreateActivityTypeResult | null;
  await writeTransaction(db, async () => {
    const existing = await readAll(db);
    const valid = validateCustomActivityTypeName(
      name,
      existing.flatMap((type) => (type.name === null ? [] : [type.name])),
    );
    if (!valid.ok) {
      result = valid;
      return;
    }
    const id = deps.ids.newUuid();
    await db.runAsync(
      'INSERT INTO activity_types (id, builtin, name, active, created_at, updated_at) VALUES (?, 0, ?, 1, ?, ?)',
      [id, valid.value, now, now],
    );
    const saved = await readOne(db, id);
    if (saved === null) throw new ActivityTypeNotFoundError(id);
    result = { ok: true, type: saved };
  });
  return result!;
}

/**
 * Makes a type active or inactive — the same row, the same id. Idempotent: a
 * type already in that state is left untouched (updatedAt unchanged).
 * Throws ActivityTypeNotFoundError for an unknown id; nothing is written then.
 */
export async function setActivityTypeActive(
  db: PlayerDb,
  id: string,
  active: boolean,
  deps: { clock: Clock },
): Promise<ActivityType> {
  const now = deps.clock.wallNow();
  let result = null as ActivityType | null;
  await writeTransaction(db, async () => {
    const existing = await readOne(db, id);
    if (existing === null) throw new ActivityTypeNotFoundError(id);
    if (existing.active !== active) {
      // Only this catalog row; events keep referencing the same id.
      await db.runAsync('UPDATE activity_types SET active = ?, updated_at = ? WHERE id = ?', [
        active ? 1 : 0,
        now,
        id,
      ]);
    }
    result = await readOne(db, id);
  });
  if (result === null) throw new ActivityTypeNotFoundError(id);
  return result;
}

function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

const SELECT_TYPES = 'SELECT id, builtin, name, active, created_at, updated_at FROM activity_types';

type TypeRow = {
  id: unknown;
  builtin: unknown;
  name: unknown;
  active: unknown;
  created_at: unknown;
  updated_at: unknown;
};

async function readAll(db: PlayerDb): Promise<ActivityType[]> {
  const rows = await db.getAllAsync<TypeRow>(SELECT_TYPES, []);
  return sortActivityTypes(rows.map(parseActivityTypeRow));
}

async function readOne(db: PlayerDb, id: string): Promise<ActivityType | null> {
  const row = await db.getFirstAsync<TypeRow>(`${SELECT_TYPES} WHERE id = ?`, [id]);
  return row === null ? null : parseActivityTypeRow(row);
}

/**
 * A stored row, checked in full: a built-in has a known code as its id and
 * no name; a custom type has a UUID id and a trimmed, non-blank name.
 */
export function parseActivityTypeRow(row: TypeRow): ActivityType {
  const id = typeof row.id === 'string' ? row.id : null;
  const fail = (field: ActivityTypeDataField, reason: 'INVALID_VALUE' | 'UNKNOWN_CODE' = 'INVALID_VALUE') =>
    new ActivityTypeDataError(field, reason, id);
  if (id === null) throw fail('id');
  if (row.builtin !== 0 && row.builtin !== 1) throw fail('builtin');
  if (row.active !== 0 && row.active !== 1) throw fail('active');
  if (typeof row.created_at !== 'number' || !Number.isSafeInteger(row.created_at)) throw fail('createdAt');
  if (typeof row.updated_at !== 'number' || !Number.isSafeInteger(row.updated_at)) throw fail('updatedAt');
  if (row.builtin === 1) {
    if (!isBuiltinActivityType(id)) throw fail('id', 'UNKNOWN_CODE');
    if (row.name !== null) throw fail('name');
  } else {
    if (!isUuid(id)) throw fail('id');
    if (typeof row.name !== 'string' || row.name.length === 0 || row.name.trim() !== row.name)
      throw fail('name');
  }
  return {
    id,
    builtin: row.builtin === 1 && isBuiltinActivityType(id) ? id : null,
    name: row.builtin === 1 ? null : (row.name as string),
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
