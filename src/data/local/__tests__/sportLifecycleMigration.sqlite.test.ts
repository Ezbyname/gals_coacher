import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import {
  LEGACY,
  LEGACY_EVENTS,
  seedV2Players,
  seedV3SelfAssessment,
  seedV4CalendarEvents,
} from '@/test-support/legacyFixtures';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { listCalendarEvents } from '../calendar/calendarEventRepository';
import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { getPlayer, listPlayers } from '../players/playerRepository';
import { listSelfAssessments } from '../selfAssessments/selfAssessmentRepository';

type Db = ReturnType<typeof openNodeSqlite>;

/** Every user table in full; player_sports without the v5 column (compared separately). */
async function dumpV4Data(db: Db) {
  return {
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT * FROM players ORDER BY id'),
    player_sports: await db.getAllAsync(
      'SELECT player_id, sport FROM player_sports ORDER BY player_id, sport',
    ),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    self_assessments: await db.getAllAsync('SELECT * FROM self_assessments ORDER BY id'),
    self_assessment_ratings: await db.getAllAsync(
      'SELECT * FROM self_assessment_ratings ORDER BY assessment_id, category',
    ),
    // The v4 columns only: v6 adds completion columns, which the v6 tests cover.
    calendar_events: await db.getAllAsync(
      `SELECT id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at
       FROM calendar_events ORDER BY id`,
    ),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  };
}
/** player_sports' structure (column metadata, not SQL text). */
const playerSportsColumns = (db: Db) =>
  db.getAllAsync(
    'SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info(\'player_sports\') ORDER BY cid',
  );
const hasActiveColumn = async (db: Db) =>
  (await db.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('player_sports')")).some(
    (c) => c.name === 'active',
  );

describe('migration v5 (sport assignment lifecycle) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v5-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A realistic v4 file: no-sport player, Basketball player (dormant fields), assessment, events. */
  async function createV4Database() {
    const v4 = openTracked(file);
    await v4.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v4, migrations.slice(0, 4));
    expect(await v4.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
    await seedV2Players(v4);
    await seedV3SelfAssessment(v4);
    await seedV4CalendarEvents(v4);
    expect(await hasActiveColumn(v4)).toBe(false);
    const data = await dumpV4Data(v4);
    await v4.closeAsync();
    return data;
  }

  it('fresh install: player_sports has active INTEGER NOT NULL DEFAULT 1 with its CHECK', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(9);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 9 });
    expect(await playerSportsColumns(db as unknown as Db)).toEqual([
      { cid: 0, name: 'player_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
      { cid: 1, name: 'sport', type: 'TEXT', notnull: 1, dflt_value: null, pk: 2 },
      { cid: 2, name: 'active', type: 'INTEGER', notnull: 1, dflt_value: '1', pk: 0 },
    ]);
    const sql = (await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE name = 'player_sports'",
    ))!.sql;
    expect(sql).toContain("CHECK (typeof(active) = 'integer' AND active IN (0, 1))");
    // No timestamp or other lifecycle metadata in this slice.
    expect(sql).not.toMatch(/changed_at|deactivated|deleted/i);
    await db.closeAsync();
  });

  it('upgrades a realistic v4 database: every row unchanged, the Basketball assignment active', async () => {
    const before = await createV4Database();

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({
      from: 4,
      to: 9,
      applied: ['player_sports_active', 'calendar_event_completion', 'activity_types', 'exercises', 'training'],
    });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 9 });
    expect(await dumpV4Data(db as unknown as Db)).toEqual(before);
    expect(await db.getAllAsync('SELECT player_id, sport, active FROM player_sports')).toEqual([
      { player_id: LEGACY.gal, sport: 'BASKETBALL', active: 1 },
    ]);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // Read through today's repositories.
    expect((await getPlayer(db, LEGACY.gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: true }]);
    expect((await getPlayer(db, LEGACY.noa))!).toMatchObject({ basketball: null, sports: [] });
    expect(await listSelfAssessments(db, LEGACY.gal, 'BASKETBALL')).toHaveLength(1);
    expect((await listCalendarEvents(db, LEGACY.gal)).map((e) => [e.id, e.sport])).toEqual([
      [LEGACY_EVENTS.game, 'BASKETBALL'],
      [LEGACY_EVENTS.gym, null],
    ]);
    const upgradedColumns = await playerSportsColumns(db as unknown as Db);
    const upgradedSchema = await db.getAllAsync(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    await db.closeAsync();

    // Idempotent: the next launch applies nothing; schema and data unchanged.
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 9, to: 9, applied: [] });
    expect(
      await again.db.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual(upgradedSchema);
    expect(await dumpV4Data(again.db as unknown as Db)).toEqual(before);
    expect((await listPlayers(again.db)).map((p) => p.sports)).toEqual([
      [],
      [{ sport: 'BASKETBALL', active: true }],
    ]);
    await again.db.closeAsync();

    // Fresh and upgraded databases have the same player_sports structure.
    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(await playerSportsColumns(fresh)).toEqual(upgradedColumns);
    await fresh.closeAsync();
  });

  it('rolls back a v5 that fails part-way: user_version stays 4, no active column, v4 data intact', async () => {
    const before = await createV4Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    // The real v5 SQL runs first (the column is added), then fails.
    const broken = { ...migrations[4]!, sql: `${migrations[4]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 4), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect(await hasActiveColumn(db)).toBe(false);
    expect(await dumpV4Data(db)).toEqual(before);
    await db.closeAsync();

    // The next launch applies the real v5 normally.
    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({
      from: 4,
      to: 9,
      applied: ['player_sports_active', 'calendar_event_completion', 'activity_types', 'exercises', 'training'],
    });
    expect(await dumpV4Data(relaunch.db as unknown as Db)).toEqual(before);
    await relaunch.db.closeAsync();
  });

  it('refuses a newer schema (v10)', async () => {
    const newer = openTracked(file);
    await newer.execAsync('PRAGMA user_version = 10');
    await newer.closeAsync();
    await expect(openLocalDatabase()).rejects.toThrow(/v10 .* only knows v9\. Refusing to downgrade/);
  });
});

describe('v5 constraint enforced by SQLite itself', () => {
  let db: Db;
  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    await seedV2Players(db);
  });
  afterEach(() => db.closeAsync());

  it('a new assignment defaults to active = 1', async () => {
    await db.execAsync(`INSERT INTO player_sports (player_id, sport) VALUES ('${LEGACY.noa}', 'BASKETBALL')`);
    expect(
      await db.getFirstAsync('SELECT active FROM player_sports WHERE player_id = ?', [LEGACY.noa]),
    ).toEqual({
      active: 1,
    });
  });

  it("text '1' is stored as the integer 1 (INTEGER affinity), never as text", async () => {
    await db.execAsync("UPDATE player_sports SET active = '1'");
    expect(await db.getFirstAsync('SELECT typeof(active) AS t, active FROM player_sports')).toEqual({
      t: 'integer',
      active: 1,
    });
  });

  it('accepts 0 and 1', async () => {
    await db.runAsync('UPDATE player_sports SET active = 0');
    await db.runAsync('UPDATE player_sports SET active = 1');
  });

  it.each([
    ['2', /CHECK/],
    ['-1', /CHECK/],
    ['0.5', /CHECK/],
    ["'yes'", /CHECK/],
    ['NULL', /NOT NULL/],
  ])('rejects active = %s', async (value, error) => {
    await expect(db.execAsync(`UPDATE player_sports SET active = ${value}`)).rejects.toThrow(error);
  });
});
