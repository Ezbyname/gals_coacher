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

import { getCalendarEvent, listCalendarEvents } from '../calendar/calendarEventRepository';
import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { getPlayer } from '../players/playerRepository';
import { listSelfAssessments } from '../selfAssessments/selfAssessmentRepository';

type Db = ReturnType<typeof openNodeSqlite>;

const V5_EVENT_COLUMNS = 'id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at';

/** Every user table in full; calendar_events with its v5 columns only (v6 ones compared separately). */
async function dumpV5Data(db: Db) {
  return {
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT * FROM players ORDER BY id'),
    player_sports: await db.getAllAsync('SELECT * FROM player_sports ORDER BY player_id, sport'),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    self_assessments: await db.getAllAsync('SELECT * FROM self_assessments ORDER BY id'),
    self_assessment_ratings: await db.getAllAsync(
      'SELECT * FROM self_assessment_ratings ORDER BY assessment_id, category',
    ),
    calendar_events: await db.getAllAsync(`SELECT ${V5_EVENT_COLUMNS} FROM calendar_events ORDER BY id`),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  };
}
const eventColumns = (db: Db) =>
  db.getAllAsync(
    'SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info(\'calendar_events\') ORDER BY cid',
  );
const completionColumns = async (db: Db) =>
  (await eventColumns(db)).filter((c) => /complet/.test((c as { name: string }).name));

describe('migration v6 (calendar event completion) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v6-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A realistic v5 file: no-sport player, Basketball player (now inactive — its
   * history must stay usable), assessment, a past Basketball game and a sport-less gym.
   */
  async function createV5Database() {
    const v5 = openTracked(file);
    await v5.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v5, migrations.slice(0, 5));
    expect(await v5.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 5 });
    await seedV2Players(v5);
    await seedV3SelfAssessment(v5);
    await seedV4CalendarEvents(v5);
    await v5.runAsync('UPDATE player_sports SET active = 0 WHERE player_id = ?', [LEGACY.gal]);
    expect(await completionColumns(v5)).toEqual([]);
    const data = await dumpV5Data(v5);
    expect(data.calendar_events).toHaveLength(2);
    await v5.closeAsync();
    return data;
  }

  it('fresh install: two nullable completion columns, each with its CHECK, no default', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(12);
    expect(migration.applied).toContain('calendar_event_completion');
    expect(await completionColumns(db as unknown as Db)).toEqual([
      { cid: 10, name: 'completed_at', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: 'completion_source', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    ]);
    const sql = (await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE name = 'calendar_events'",
    ))!.sql;
    expect(sql).toContain("typeof(completed_at) = 'integer'");
    expect(sql).toContain('(completion_source IS NULL) = (completed_at IS NULL)');
    // No status column, no session link, no score: completion only.
    expect(sql).not.toMatch(/status|session|score|result|LOCAL_USER|COACH/i);
    await db.closeAsync();
  });

  it('upgrades a realistic v5 database: every row unchanged, every event NOT completed', async () => {
    const before = await createV5Database();

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({
      from: 5,
      to: 12,
      applied: ['calendar_event_completion', 'activity_types', 'exercises', 'training', 'taxonomy', 'basketball_content', 'template_classification'],
    });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 12 });
    expect(await dumpV5Data(db as unknown as Db)).toEqual(before);
    expect(
      await db.getAllAsync('SELECT id, completed_at, completion_source FROM calendar_events ORDER BY id'),
    ).toEqual(
      before.calendar_events.map((e) => ({
        id: (e as { id: string }).id,
        completed_at: null,
        completion_source: null,
      })),
    );
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // Read through today's repositories: a past legacy game is still NOT completed.
    const events = await listCalendarEvents(db, LEGACY.gal);
    expect(events.map((e) => [e.id, e.sport, e.completion])).toEqual([
      [LEGACY_EVENTS.game, 'BASKETBALL', null],
      [LEGACY_EVENTS.gym, null, null],
    ]);
    expect((await getPlayer(db, LEGACY.gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
    expect(await listSelfAssessments(db, LEGACY.gal, 'BASKETBALL')).toHaveLength(1);
    const upgradedColumns = await eventColumns(db as unknown as Db);
    const upgradedSchema = await db.getAllAsync(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    await db.closeAsync();

    // Idempotent: the next launch applies nothing; schema and data unchanged.
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 12, to: 12, applied: [] });
    expect(
      await again.db.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual(upgradedSchema);
    expect(await dumpV5Data(again.db as unknown as Db)).toEqual(before);
    expect((await getCalendarEvent(again.db, LEGACY.gal, LEGACY_EVENTS.game))!.completion).toBeNull();
    await again.db.closeAsync();

    // Fresh and upgraded databases have the same calendar_events structure and SQL.
    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(await eventColumns(fresh)).toEqual(upgradedColumns);
    expect(
      await fresh.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual(upgradedSchema);
    await fresh.closeAsync();
  });

  it('rolls back a v6 that fails part-way: user_version stays 5, no completion column, v5 data intact', async () => {
    const before = await createV5Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    // The real v6 SQL runs first (both columns are added), then fails.
    const broken = { ...migrations[5]!, sql: `${migrations[5]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 5), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 5 });
    expect(await completionColumns(db)).toEqual([]);
    expect(await dumpV5Data(db)).toEqual(before);
    await db.closeAsync();

    // The next launch applies the real v6 normally.
    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({
      from: 5,
      to: 12,
      applied: ['calendar_event_completion', 'activity_types', 'exercises', 'training', 'taxonomy', 'basketball_content', 'template_classification'],
    });
    expect(await dumpV5Data(relaunch.db as unknown as Db)).toEqual(before);
    await relaunch.db.closeAsync();
  });

  it('refuses a newer schema (v10)', async () => {
    const newer = openTracked(file);
    await newer.execAsync('PRAGMA user_version = 13');
    await newer.closeAsync();
    await expect(openLocalDatabase()).rejects.toThrow(/v13 .* only knows v12\. Refusing to downgrade/);
  });
});

describe('v6 constraints enforced by SQLite itself', () => {
  let db: Db;
  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    await seedV2Players(db);
    await seedV4CalendarEvents(db);
  });
  afterEach(() => db.closeAsync());

  const set = (completedAt: string, source: string) =>
    db.execAsync(`UPDATE calendar_events SET completed_at = ${completedAt}, completion_source = ${source}`);

  it('a new event defaults to NOT completed (both NULL)', async () => {
    expect(await db.getAllAsync('SELECT completed_at, completion_source FROM calendar_events')).toEqual([
      { completed_at: null, completion_source: null },
      { completed_at: null, completion_source: null },
    ]);
  });

  it('accepts a complete pair and clearing both', async () => {
    await set('1790000000000', "'LOCAL_USER'");
    await set('NULL', 'NULL');
  });

  it.each([
    ['a time without a source', '1790000000000', 'NULL'],
    ['a source without a time', 'NULL', "'LOCAL_USER'"],
    ['a fractional time', '1790000000000.5', "'LOCAL_USER'"],
    ['a text time', "'today'", "'LOCAL_USER'"],
    ['a blank source', '1790000000000', "'  '"],
  ])('rejects %s', async (_name, completedAt, source) => {
    await expect(set(completedAt, source)).rejects.toThrow(/CHECK/);
  });
});
