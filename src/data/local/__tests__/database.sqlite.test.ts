import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import type { PlayerDb } from '../players/playerDb';

/**
 * Runs the app's real startup path (open → PRAGMAs → migrations) against a
 * real SQLite file, closing and reopening it to simulate an app restart.
 * This proves the SQL; on-device behaviour is proven by the Android gate.
 */
describe('local database on real SQLite', () => {
  let dir: string;
  let file: string;
  /** Every handle opened on the temp file, by the app or by a test. */
  let handles: ReturnType<typeof openNodeSqlite>[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-db-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    // An open handle makes Windows refuse to delete the directory (EPERM).
    // Assert it here so the leak fails deterministically on every OS.
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('first launch applies the migrations once', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({
      from: 0,
      to: 20,
      applied: [
        'app_meta',
        'players',
        'self_assessments',
        'calendar_events',
        'player_sports_active',
        'calendar_event_completion',
        'activity_types',
        'exercises',
        'training',
        'taxonomy',
        'basketball_content',
        'template_classification',
        'calendar_event_import',
        'player_team_name',
        'player_archive',
        'calendar_event_sync_links',
        'planned_workout_composition',
        'planned_workout_calendar_link',
        'sport_content_001',
        'sport_content_002',
      ],
    });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
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
    expect(second.migration).toEqual({ from: 20, to: 20, applied: [] });
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
    const db = openTracked(file);
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

  describe('migration v2 (players)', () => {
    const V2_TABLES = ['basketball_player_profiles', 'families', 'player_sports', 'players'];
    const v2Tables = async (db: Pick<PlayerDb, 'getAllAsync'>) =>
      (
        await db.getAllAsync<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?) ORDER BY name`,
          V2_TABLES,
        )
      ).map((r) => r.name);
    const schema = (db: Pick<PlayerDb, 'getAllAsync'>) =>
      db.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        [],
      );

    /** A real v1 database file, as shipped in Slice 1.0, with app data in it. */
    async function createV1Database() {
      const v1 = openTracked(file);
      await runMigrations(v1, migrations.slice(0, 1));
      await v1.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', ['probe', 'kept']);
      expect(await v1.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 1 });
      await v1.closeAsync();
    }

    it('upgrades an existing v1 database once and keeps app_meta data', async () => {
      await createV1Database();
      const { db, migration } = await openLocalDatabase();
      expect(migration).toEqual({
        from: 1,
        to: 20,
        applied: [
          'players',
          'self_assessments',
          'calendar_events',
          'player_sports_active',
          'calendar_event_completion',
          'activity_types',
          'exercises',
          'training',
          'taxonomy',
          'basketball_content',
        'template_classification',
        'calendar_event_import',
        'player_team_name',
        'player_archive',
        'calendar_event_sync_links',
        'planned_workout_composition',
        'planned_workout_calendar_link',
        'sport_content_001',
        'sport_content_002',
        ],
      });
      expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
      expect(await v2Tables(db)).toEqual(V2_TABLES);
      expect(await db.getAllAsync('SELECT key, value FROM app_meta')).toEqual([{ key: 'probe', value: 'kept' }]);
      await db.closeAsync();

      const reopened = await openLocalDatabase();
      expect(reopened.migration).toEqual({ from: 20, to: 20, applied: [] });
      await reopened.db.closeAsync();
    });

    it('produces the same schema on a fresh install as on an upgraded v1 database', async () => {
      await createV1Database();
      const upgraded = await openLocalDatabase();
      const upgradedSchema = await schema(upgraded.db);
      await upgraded.db.closeAsync();

      const fresh = openNodeSqlite(':memory:');
      expect(await runMigrations(fresh, migrations)).toEqual({
        from: 0,
        to: 20,
        applied: [
          'app_meta',
          'players',
          'self_assessments',
          'calendar_events',
          'player_sports_active',
          'calendar_event_completion',
          'activity_types',
          'exercises',
          'training',
          'taxonomy',
          'basketball_content',
        'template_classification',
        'calendar_event_import',
        'player_team_name',
        'player_archive',
        'calendar_event_sync_links',
        'planned_workout_composition',
        'planned_workout_calendar_link',
        'sport_content_001',
        'sport_content_002',
        ],
      });
      expect(await schema(fresh)).toEqual(upgradedSchema);
      // 14 tables + players_family_id, self_assessments_history, calendar_events_player_start indexes
      // + the activity_types_never_deleted (v7) and exercises_never_deleted (v8) triggers
      // + v9 training: 10 tables, 4 indexes, 18 history / snapshot triggers
      // + v10 taxonomy: 2 tables, 2 indexes, 3 triggers
      // + v15 player_archive: 4 "archived player gets no new activity" triggers
      // + v16 calendar_event_sync_links: 1 table + 1 index
      // + v17 planned_workout_composition: 4 "archived player gets no new activity" triggers on plan edits
      //   (the v9 freeze triggers are replaced in place: same count; two columns are not schema objects)
      // + v18 planned_workout_calendar_link: 1 unique index + 4 guard triggers (the column is not a schema object)
      expect(upgradedSchema).toHaveLength(78); // v13 adds calendar_events_player_import_batch
      await fresh.closeAsync();
    });

    it('rolls back a v2 that fails part-way: no v2 tables, user_version stays 1, app_meta intact', async () => {
      await createV1Database();
      const db = openTracked(file);
      await db.execAsync('PRAGMA foreign_keys = ON');
      const broken = { ...migrations[1]!, sql: `${migrations[1]!.sql}\nNOT VALID SQL;` };
      await expect(runMigrations(db, [migrations[0]!, broken])).rejects.toThrow();
      expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 1 });
      expect(await v2Tables(db)).toEqual([]);
      expect(await db.getAllAsync('SELECT key, value FROM app_meta')).toEqual([{ key: 'probe', value: 'kept' }]);
      await db.closeAsync();

      // The next launch applies the real v2 normally.
      const relaunch = await openLocalDatabase();
      expect(relaunch.migration).toEqual({
        from: 1,
        to: 20,
        applied: [
          'players',
          'self_assessments',
          'calendar_events',
          'player_sports_active',
          'calendar_event_completion',
          'activity_types',
          'exercises',
          'training',
          'taxonomy',
          'basketball_content',
        'template_classification',
        'calendar_event_import',
        'player_team_name',
        'player_archive',
        'calendar_event_sync_links',
        'planned_workout_composition',
        'planned_workout_calendar_link',
        'sport_content_001',
        'sport_content_002',
        ],
      });
      await relaunch.db.closeAsync();
    });

    it('still refuses to open a newer schema (downgrade)', async () => {
      const newer = openTracked(file);
      await newer.execAsync('PRAGMA user_version = 21');
      await newer.closeAsync();
      await expect(openLocalDatabase()).rejects.toThrow(/v21 .* only knows v20\. Refusing to downgrade/);
    });
  });

  describe('initialization failure closes the connection', () => {
    /** The next app open returns this handle, so the test can observe it. */
    function nextAppHandle() {
      const handle = openTracked(file);
      (openDatabaseAsync as jest.Mock).mockImplementationOnce(async () => handle);
      return { handle, close: jest.spyOn(handle, 'closeAsync') };
    }

    it('closes the opened database before rethrowing a migration failure (downgrade refusal)', async () => {
      const newer = openTracked(file);
      await newer.execAsync('PRAGMA user_version = 21');
      await newer.closeAsync();

      const { handle, close } = nextAppHandle();
      await expect(openLocalDatabase()).rejects.toThrow(/Refusing to downgrade/);
      expect(close).toHaveBeenCalledTimes(1);
      expect(handle.raw.isOpen).toBe(false);
    });

    it('closes the opened database before rethrowing a PRAGMA setup failure', async () => {
      const { handle, close } = nextAppHandle();
      jest.spyOn(handle, 'execAsync').mockRejectedValueOnce(new Error('disk I/O error'));
      await expect(openLocalDatabase()).rejects.toThrow('disk I/O error');
      expect(close).toHaveBeenCalledTimes(1);
      expect(handle.raw.isOpen).toBe(false);
    });

    it('rethrows the setup error, not a close error, when closing also fails', async () => {
      const { handle, close } = nextAppHandle();
      jest.spyOn(handle, 'execAsync').mockRejectedValueOnce(new Error('disk I/O error'));
      close.mockImplementationOnce(async () => {
        handle.raw.close();
        throw new Error('close failed');
      });
      await expect(openLocalDatabase()).rejects.toThrow('disk I/O error');
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('does not close a successfully opened database', async () => {
      const { handle, close } = nextAppHandle();
      const { db } = await openLocalDatabase();
      expect(db).toBe(handle);
      expect(close).not.toHaveBeenCalled();
      expect(handle.raw.isOpen).toBe(true);
      expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
      await db.closeAsync();
    });
  });
});
