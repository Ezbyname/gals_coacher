import { isUuid, type Uuid } from '@/domain/ids';
import type { IdService } from '@/services/ids/IdService';

import { PlayerDataError } from './errors';
import type { PlayerDb } from './playerDb';

/**
 * The app_meta row naming the one local Family (ARCHITECTURE §13). Its
 * primary key is the singleton authority: a second pointer cannot exist, and
 * the family is always found through it — never by "any row in families".
 */
export const LOCAL_FAMILY_META_KEY = 'local_family_id';

/**
 * Returns the local Family id, creating the Family and its pointer on first
 * use. Must run inside the caller's write transaction so a failed first save
 * leaves neither a Family nor a pointer behind. A pointer to a missing (or
 * malformed) Family is data corruption and fails; it is never replaced.
 */
export async function ensureLocalFamily(db: PlayerDb, ids: IdService): Promise<Uuid> {
  const pointer = await db.getFirstAsync<{ value: unknown }>('SELECT value FROM app_meta WHERE key = ?', [
    LOCAL_FAMILY_META_KEY,
  ]);

  if (pointer !== null) {
    const familyId = pointer.value;
    if (typeof familyId !== 'string' || !isUuid(familyId)) {
      throw new PlayerDataError('localFamily', 'INVALID_VALUE', null);
    }
    const family = await db.getFirstAsync<{ id: string }>('SELECT id FROM families WHERE id = ?', [familyId]);
    if (family === null) throw new PlayerDataError('localFamily', 'MISSING_ROW', null);
    return familyId;
  }

  const familyId = ids.newUuid();
  await db.runAsync('INSERT INTO families (id) VALUES (?)', [familyId]);
  // Plain INSERT, never OR REPLACE: a concurrent first save fails here and rolls back.
  await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', [LOCAL_FAMILY_META_KEY, familyId]);
  return familyId;
}
