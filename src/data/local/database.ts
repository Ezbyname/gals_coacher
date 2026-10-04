import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrations } from './migrations';
import { runMigrations, type MigrationResult } from './migrations/runMigrations';

export const LOCAL_DB_NAME = 'gals_coacher.db';

/**
 * SQLite is the operational source of truth on-device (active and unsynced
 * workouts). Open once at startup, then migrate before any read or write.
 * If setup fails (e.g. a newer schema refuses to downgrade), the connection
 * is closed before the error is rethrown; only a ready database is returned.
 */
export async function openLocalDatabase(): Promise<{
  db: SQLiteDatabase;
  migration: MigrationResult;
}> {
  const db = await openDatabaseAsync(LOCAL_DB_NAME);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const migration = await runMigrations(db, migrations);
    return { db, migration };
  } catch (setupError) {
    try {
      await db.closeAsync();
    } catch {
      // The setup failure is the error to report; a failed close must not mask it.
    }
    throw setupError;
  }
}
