import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrations } from './migrations';
import { runMigrations, type MigrationResult } from './migrations/runMigrations';

export const LOCAL_DB_NAME = 'gals_coacher.db';

/**
 * SQLite is the operational source of truth on-device (active and unsynced
 * workouts). Open once at startup, then migrate before any read or write.
 */
export async function openLocalDatabase(): Promise<{
  db: SQLiteDatabase;
  migration: MigrationResult;
}> {
  const db = await openDatabaseAsync(LOCAL_DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const migration = await runMigrations(db, migrations);
  return { db, migration };
}
