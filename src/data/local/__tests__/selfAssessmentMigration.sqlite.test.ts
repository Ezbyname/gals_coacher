import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import { seedV2Players } from '@/test-support/legacyFixtures';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { listPlayers } from '../players/playerRepository';

type Db = ReturnType<typeof openNodeSqlite>;
const V3_TABLES = ['self_assessment_ratings', 'self_assessments'];

/** Every user table's full content, for "unchanged" proofs. */
async function dumpPlayerData(db: Db) {
  return {
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT id, family_id, name, date_of_birth, height_cm, created_at, updated_at FROM players ORDER BY id'),
    // The columns v2 knew (v5 adds `active`, proven in sportLifecycleMigration).
    player_sports: await db.getAllAsync(
      'SELECT player_id, sport FROM player_sports ORDER BY player_id, sport',
    ),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  };
}
const schema = (db: Db) =>
  db.getAllAsync(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  );
const v3Objects = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name LIKE 'self_assessment%' ORDER BY name",
    )
  ).map((r) => r.name);

describe('migration v3 (self-assessments) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v3-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A real v2 database file (Slice 1.1) with a player without sport and a Basketball player. */
  async function createV2DatabaseWithPlayers() {
    const v2 = openTracked(file);
    await v2.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v2, migrations.slice(0, 2));
    expect(await v2.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 2 });
    // Raw v2 rows (as Slice 1.1 stored them): today's repository reads v5 columns.
    await seedV2Players(v2);
    const data = await dumpPlayerData(v2);
    await v2.closeAsync();
    return { data };
  }

  it('fresh install: v3 creates exactly the two generic tables and the history index', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(20);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
    expect(await v3Objects(db as unknown as Db)).toEqual([
      'self_assessment_ratings',
      'self_assessments',
      'self_assessments_archived_player', // v15 (PLAYER-ARCHIVE-001)
      'self_assessments_history',
    ]);
    expect(
      await db.getAllAsync("SELECT name FROM pragma_table_info('self_assessments') ORDER BY cid"),
    ).toEqual([{ name: 'id' }, { name: 'player_id' }, { name: 'sport' }, { name: 'taken_at' }]);
    expect(
      await db.getAllAsync("SELECT name FROM pragma_table_info('self_assessment_ratings') ORDER BY cid"),
    ).toEqual([{ name: 'assessment_id' }, { name: 'category' }, { name: 'rating' }]);
    expect(
      await db.getAllAsync("SELECT name FROM pragma_index_info('self_assessments_history') ORDER BY seqno"),
    ).toEqual([{ name: 'player_id' }, { name: 'sport' }, { name: 'taken_at' }]);
    expect(
      await db.getAllAsync(
        `SELECT "table" AS parent, "from" AS child_column, "to" AS parent_column
         FROM pragma_foreign_key_list('self_assessments') ORDER BY seq`,
      ),
    ).toEqual([
      { parent: 'player_sports', child_column: 'player_id', parent_column: 'player_id' },
      { parent: 'player_sports', child_column: 'sport', parent_column: 'sport' },
    ]);
    expect(
      await db.getAllAsync(
        `SELECT "table" AS parent, "from" AS child_column, "to" AS parent_column
         FROM pragma_foreign_key_list('self_assessment_ratings')`,
      ),
    ).toEqual([{ parent: 'self_assessments', child_column: 'assessment_id', parent_column: 'id' }]);
    // Generic storage: no Basketball-specific self-assessment table, no category CHECK list.
    expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE name LIKE 'basketball_self%'")).toEqual(
      [],
    );
    const sql = (
      await db.getAllAsync<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE name LIKE 'self_assessment%' AND sql IS NOT NULL",
      )
    )
      .map((r) => r.sql)
      .join('\n');
    expect(sql).not.toMatch(/SHOOTING|BALL_HANDLING|created_at|updated_at|status|score|average/i);
    await db.closeAsync();
  });

  it('upgrades a v2 database with players: player data unchanged, new tables empty, schema v8 (via v3)', async () => {
    const before = await createV2DatabaseWithPlayers();
    expect(before.data.basketball_player_profiles).toEqual([
      expect.objectContaining({ experience: 'ONE_TO_TWO_YEARS', weekly_frequency: 'TWO_TO_THREE' }),
    ]);

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({
      from: 2,
      to: 20,
      applied: [
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
    expect(await dumpPlayerData(db as unknown as Db)).toEqual(before.data);
    // Read back through today's repository: both players intact, Basketball active.
    expect(
      (await listPlayers(db)).map(({ player, basketball, sports }) => ({
        name: player.name,
        heightCm: player.heightCm,
        basketball,
        sports,
      })),
    ).toEqual([
      { name: 'Noa', heightCm: null, basketball: null, sports: [] },
      {
        name: 'Gal',
        heightCm: 142,
        basketball: {
          primaryPosition: 'SG',
          secondaryPosition: 'SF',
          dominantHand: 'LEFT',
          experience: 'ONE_TO_TWO_YEARS',
          weeklyFrequency: 'TWO_TO_THREE',
        },
        sports: [{ sport: 'BASKETBALL', active: true }],
      },
    ]);
    for (const table of V3_TABLES) {
      expect(await db.getFirstAsync(`SELECT count(*) AS n FROM ${table}`)).toEqual({ n: 0 });
    }
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    const upgradedSchema = await schema(db as unknown as Db);
    await db.closeAsync();

    // Idempotent: the next launch applies nothing; schema and data are identical.
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 20, to: 20, applied: [] });
    expect(await schema(again.db as unknown as Db)).toEqual(upgradedSchema);
    expect(await dumpPlayerData(again.db as unknown as Db)).toEqual(before.data);
    expect(await again.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
    await again.db.closeAsync();

    // An upgraded database has the same schema as a fresh install.
    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(await schema(fresh)).toEqual(upgradedSchema);
    await fresh.closeAsync();
  });

  it('rolls back a v3 that fails part-way: user_version stays 2, no v3 objects, players intact', async () => {
    const before = await createV2DatabaseWithPlayers();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    // The real v3 SQL runs first (tables + index are created), then fails.
    const broken = { ...migrations[2]!, sql: `${migrations[2]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [migrations[0]!, migrations[1]!, broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 2 });
    expect(await v3Objects(db)).toEqual([]);
    expect(await dumpPlayerData(db)).toEqual(before.data);
    await db.closeAsync();

    // The next launch applies the real v3 normally.
    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({
      from: 2,
      to: 20,
      applied: [
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
    expect((await listPlayers(relaunch.db)).map((p) => [p.player.name, p.sports])).toEqual([
      ['Noa', []],
      ['Gal', [{ sport: 'BASKETBALL', active: true }]],
    ]);
    expect(await dumpPlayerData(relaunch.db as unknown as Db)).toEqual(before.data);
    await relaunch.db.closeAsync();
  });
});

describe('v3 constraints enforced by SQLite itself', () => {
  let db: Db;
  const PLAYER = '00000000-0000-4000-8000-0000000000aa';
  const OTHER = '00000000-0000-4000-8000-0000000000bb';
  const A1 = '00000000-0000-4000-8000-0000000000a1';

  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    await db.execAsync(`
      INSERT INTO families (id) VALUES ('00000000-0000-4000-8000-0000000000ff');
      INSERT INTO players (id, family_id, name, date_of_birth, created_at, updated_at)
        VALUES ('${PLAYER}', '00000000-0000-4000-8000-0000000000ff', 'Gal', '2015-07-09', 1, 1),
               ('${OTHER}', '00000000-0000-4000-8000-0000000000ff', 'Noa', '2016-01-02', 1, 1);
      INSERT INTO player_sports (player_id, sport) VALUES ('${PLAYER}', 'BASKETBALL');
    `);
  });
  afterEach(() => db.closeAsync());

  const insertAssessment = (id: string, playerId: string, sport: string, takenAt: unknown = 1) =>
    db.runAsync('INSERT INTO self_assessments (id, player_id, sport, taken_at) VALUES (?, ?, ?, ?)', [
      id,
      playerId,
      sport,
      takenAt as number,
    ]);
  const insertRating = (assessmentId: string, category: string, rating: number | string) =>
    db.runAsync('INSERT INTO self_assessment_ratings (assessment_id, category, rating) VALUES (?, ?, ?)', [
      assessmentId,
      category,
      rating,
    ]);

  it('accepts an assessment for a valid Basketball assignment', async () => {
    await insertAssessment(A1, PLAYER, 'BASKETBALL');
    await insertRating(A1, 'SHOOTING', 3);
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM self_assessment_ratings')).toEqual({ n: 1 });
  });

  it('rejects an assessment for a player without that sport assignment (composite FK)', async () => {
    await expect(insertAssessment(A1, OTHER, 'BASKETBALL')).rejects.toThrow(/FOREIGN KEY/);
    await expect(insertAssessment(A1, PLAYER, 'FOOTBALL')).rejects.toThrow(/FOREIGN KEY/);
  });

  it('rejects an assessment for an unknown player (composite FK)', async () => {
    await expect(insertAssessment(A1, '00000000-0000-4000-8000-000000000999', 'BASKETBALL')).rejects.toThrow(
      /FOREIGN KEY/,
    );
  });

  it('rejects a rating without its assessment (orphan)', async () => {
    await expect(insertRating(A1, 'SHOOTING', 3)).rejects.toThrow(/FOREIGN KEY/);
  });

  it.each([0, 6, 2.5, -1, 'three'])('rejects rating %p (CHECK 1–5 integer)', async (rating) => {
    await insertAssessment(A1, PLAYER, 'BASKETBALL');
    await expect(insertRating(A1, 'SHOOTING', rating)).rejects.toThrow(/CHECK/);
  });

  it.each([1, 5])('accepts the boundary rating %p', async (rating) => {
    await insertAssessment(A1, PLAYER, 'BASKETBALL');
    await insertRating(A1, 'SHOOTING', rating);
  });

  it('rejects a duplicate (assessment_id, category) through the primary key', async () => {
    await insertAssessment(A1, PLAYER, 'BASKETBALL');
    await insertRating(A1, 'SHOOTING', 3);
    await expect(insertRating(A1, 'SHOOTING', 4)).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it.each([1.5, 'yesterday'])('rejects a non-integer taken_at %p (CHECK)', async (takenAt) => {
    await expect(insertAssessment(A1, PLAYER, 'BASKETBALL', takenAt)).rejects.toThrow(/CHECK/);
  });

  it('accepts any integer taken_at, including 0 and negative (no extra timestamp rule)', async () => {
    await insertAssessment(A1, PLAYER, 'BASKETBALL', 0);
    await insertAssessment('00000000-0000-4000-8000-0000000000a2', PLAYER, 'BASKETBALL', -5);
  });

  it('rejects a duplicate assessment id (primary key)', async () => {
    await insertAssessment(A1, PLAYER, 'BASKETBALL');
    await expect(insertAssessment(A1, PLAYER, 'BASKETBALL', 2)).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
  });
});
