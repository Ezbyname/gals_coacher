import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';

/**
 * Runs the app's real startup path (open → PRAGMAs → migrations) against a
 * real SQLite file, closing and reopening it to simulate an app restart.
 * This proves the SQL; on-device behaviour is proven by the Android gate.
 */
describe('local database on real SQLite', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-db-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('first launch applies the migrations once', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 0, to: migrations.length, applied: ['app_meta'] });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 1 });
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'app_meta'")).toEqual({
      name: 'app_meta',
    });
    await db.closeAsync();
  });

  it('after a restart, migrations are not re-applied and written rows persist', async () => {
    const first = await openLocalDatabase();
    await first.db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', ['probe', 'kept']);
    await first.db.closeAsync();

    const second = await openLocalDatabase();
    expect(second.migration).toEqual({ from: 1, to: 1, applied: [] });
    expect(await second.db.getFirstAsync('SELECT value FROM app_meta WHERE key = ?', ['probe'])).toEqual({
      value: 'kept',
    });
    await second.db.closeAsync();
  });

  it('enables foreign keys and WAL on the file database', async () => {
    const { db } = await openLocalDatabase();
    expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await db.getFirstAsync('PRAGMA journal_mode')).toEqual({ journal_mode: 'wal' });
    await db.closeAsync();
  });

  it('rolls back a failing migration without bumping the schema version', async () => {
    const db = openNodeSqlite(file);
    await expect(
      runMigrations(db, [
        { version: 1, name: 'ok', sql: 'CREATE TABLE a (id TEXT);' },
        { version: 2, name: 'broken', sql: 'CREATE TABLE b (id TEXT); NOT VALID SQL;' },
      ]),
    ).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 1 });
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'b'")).toBeNull();
    await db.closeAsync();
  });
});
