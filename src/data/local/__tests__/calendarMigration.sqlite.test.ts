import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import {
  LEGACY,
  LEGACY_CATEGORIES,
  seedV2Players,
  seedV3SelfAssessment,
} from '@/test-support/legacyFixtures';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { listPlayers } from '../players/playerRepository';
import { listSelfAssessments } from '../selfAssessments/selfAssessmentRepository';

type Db = ReturnType<typeof openNodeSqlite>;

/** Every pre-v4 user table, in full, for "unchanged" proofs. */
async function dumpV3Data(db: Db) {
  return {
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT id, family_id, name, date_of_birth, height_cm, created_at, updated_at FROM players ORDER BY id'),
    // The columns v3 knew (v5 adds `active`, proven in sportLifecycleMigration).
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
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  };
}

/** Structural metadata of the calendar table and its index (independent of SQL text formatting). */
async function calendarStructure(db: Db) {
  return {
    objects: await db.getAllAsync(
      "SELECT type, name, tbl_name FROM sqlite_master WHERE tbl_name = 'calendar_events' ORDER BY name",
    ),
    columns: await db.getAllAsync<{ name: string }>(
      'SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info(\'calendar_events\') ORDER BY cid',
    ),
    foreignKeys: await db.getAllAsync(
      `SELECT id, seq, "table", "from", "to" FROM pragma_foreign_key_list('calendar_events') ORDER BY id, seq`,
    ),
    indexes: await db.getAllAsync<{ name: string; origin: string }>(
      'SELECT name, "unique", origin FROM pragma_index_list(\'calendar_events\') ORDER BY name',
    ),
    indexColumns: await db.getAllAsync(
      "SELECT seqno, name FROM pragma_index_info('calendar_events_player_start') ORDER BY seqno",
    ),
  };
}
const v4Objects = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name LIKE 'calendar_events%' ORDER BY name",
    )
  ).map((r) => r.name);

describe('migration v4 (calendar events) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v4-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A real v3 database file (Slice 1.2): two players, a Basketball profile with dormant fields, a self-assessment. */
  async function createV3Database() {
    const v3 = openTracked(file);
    await v3.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v3, migrations.slice(0, 3));
    expect(await v3.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 });
    // Raw v2/v3 rows (as Slices 1.1–1.2 stored them): today's repository reads v5 columns.
    await seedV2Players(v3);
    await seedV3SelfAssessment(v3);
    const gal = LEGACY.gal;
    const before = { data: await dumpV3Data(v3) };
    expect(before.data.self_assessment_ratings).toHaveLength(6);
    expect(before.data.basketball_player_profiles).toEqual([
      expect.objectContaining({ experience: 'ONE_TO_TWO_YEARS', weekly_frequency: 'TWO_TO_THREE' }),
    ]);
    await v3.closeAsync();
    return { gal, ...before };
  }

  it('fresh install: v4 creates exactly calendar_events and its (player_id, start_at) index', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(18);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
    // v13 (calendar_event_import) adds the import-batch index; covered in calendarImportMigration.
    expect(await v4Objects(db as unknown as Db)).toEqual([
      'calendar_events',
      'calendar_events_archived_player', // v15 (PLAYER-ARCHIVE-001)
      'calendar_events_one_per_plan', // v18 (QB-WORKOUT-BUILDER-001D) - proven in plannedWorkoutCalendarLinkMigration
      'calendar_events_plan_link_fixed',
      'calendar_events_plan_not_started',
      'calendar_events_plan_player_fixed',
      'calendar_events_plan_same_player',
      'calendar_events_player_import_batch',
      'calendar_events_player_start',
    ]);
    const s = await calendarStructure(db as unknown as Db);
    expect(s.columns.map((c) => c.name)).toEqual([
      'id',
      'player_id',
      'type',
      'sport',
      'start_at',
      'end_at',
      'title',
      'notes',
      'created_at',
      'updated_at',
      // Added by v6 (calendar_event_completion); covered in calendarCompletionMigration.
      'completed_at',
      'completion_source',
      // Added by v13 (calendar_event_import); covered in calendarImportMigration.
      'location',
      'source',
      'import_batch_id',
      // Added by v18 (planned_workout_calendar_link); covered in plannedWorkoutCalendarLinkMigration.
      'planned_workout_id',
    ]);
    expect(s.indexColumns).toEqual([
      { seqno: 0, name: 'player_id' },
      { seqno: 1, name: 'start_at' },
    ]);
    // The (player_id, start_at) index, plus v13's partial import-batch index — no speculative type / sport / cross-player index.
    expect(s.indexes.filter((i) => i.origin === 'c').sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'calendar_events_one_per_plan', unique: 1, origin: 'c' }, // v18
      { name: 'calendar_events_player_import_batch', unique: 0, origin: 'c' },
      { name: 'calendar_events_player_start', unique: 0, origin: 'c' },
    ]);
    expect(s.foreignKeys).toEqual([
      { id: 0, seq: 0, table: 'player_sports', from: 'player_id', to: 'player_id' },
      { id: 0, seq: 1, table: 'player_sports', from: 'sport', to: 'sport' },
      { id: 1, seq: 0, table: 'planned_workouts', from: 'planned_workout_id', to: 'id' }, // v18
      { id: 2, seq: 0, table: 'players', from: 'player_id', to: 'id' },
    ]);
    // Generic: no type CHECK list, no extra columns.
    const sql = (await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE name = 'calendar_events'",
    ))!.sql;
    expect(sql).not.toMatch(
      // `location` is a v13 column (owner decision 2026-10-09); `source` holds no value list (TEXT_IMPORT is domain-validated).
      /TEAM_TRAINING|GAME|GYM|RECOVERY|OTHER|TEXT_IMPORT|status|time_?zone|recurr|series|reminder|deleted|sync|session/i,
    );
    expect(sql.match(/typeof\(\w+\) = 'integer'/g)).toEqual([
      "typeof(start_at) = 'integer'",
      "typeof(end_at) = 'integer'",
      "typeof(created_at) = 'integer'",
      "typeof(updated_at) = 'integer'",
      "typeof(completed_at) = 'integer'",
    ]);
    await db.closeAsync();
  });

  it('upgrades a v3 database with players and a self-assessment: everything unchanged, calendar empty', async () => {
    const before = await createV3Database();

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({
      from: 3,
      to: 18,
      applied: [
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
      ],
    });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
    expect(await dumpV3Data(db as unknown as Db)).toEqual(before.data);
    // Read back through today's repository: players, Basketball (active) and the assessment intact.
    expect(
      (await listPlayers(db)).map((p) => [p.player.name, p.basketball?.experience ?? null, p.sports]),
    ).toEqual([
      ['Noa', null, []],
      ['Gal', 'ONE_TO_TWO_YEARS', [{ sport: 'BASKETBALL', active: true }]],
    ]);
    expect(
      (await listSelfAssessments(db, before.gal, 'BASKETBALL')).map((a) => [a.id, a.takenAt, a.ratings]),
    ).toEqual([
      [
        LEGACY.assessment,
        LEGACY.takenAt,
        LEGACY_CATEGORIES.map((category, i) => ({ category, rating: (i % 5) + 1 })),
      ],
    ]);
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM calendar_events')).toEqual({ n: 0 });
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    const upgraded = await calendarStructure(db as unknown as Db);
    const upgradedSchema = await db.getAllAsync(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    await db.closeAsync();

    // Idempotent: the next launch applies nothing; schema, data and version unchanged.
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 18, to: 18, applied: [] });
    expect(await again.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
    expect(
      await again.db.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual(upgradedSchema);
    expect(await dumpV3Data(again.db as unknown as Db)).toEqual(before.data);
    await again.db.closeAsync();

    // An upgraded v4 database has the same calendar structure as a fresh install.
    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(await calendarStructure(fresh)).toEqual(upgraded);
    await fresh.closeAsync();
  });

  it('rolls back a v4 that fails part-way: user_version stays 3, no table or index, v3 data intact', async () => {
    const before = await createV3Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    // The real v4 SQL runs first (table + index are created), then fails.
    const broken = { ...migrations[3]!, sql: `${migrations[3]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 3), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 });
    expect(await v4Objects(db)).toEqual([]);
    expect(await dumpV3Data(db)).toEqual(before.data);
    await db.closeAsync();

    // The next launch applies the real v4 normally.
    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({
      from: 3,
      to: 18,
      applied: [
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
      ],
    });
    expect(await dumpV3Data(relaunch.db as unknown as Db)).toEqual(before.data);
    expect((await listPlayers(relaunch.db)).map((p) => p.player.name)).toEqual(['Noa', 'Gal']);
    await relaunch.db.closeAsync();
  });

  it('refuses a newer schema (v10)', async () => {
    const newer = openTracked(file);
    await newer.execAsync('PRAGMA user_version = 19');
    await newer.closeAsync();
    await expect(openLocalDatabase()).rejects.toThrow(/v19 .* only knows v18\. Refusing to downgrade/);
  });
});

describe('v4 constraints enforced by SQLite itself', () => {
  let db: Db;
  const FAMILY = '00000000-0000-4000-8000-0000000000ff';
  const GAL = '00000000-0000-4000-8000-0000000000aa'; // Basketball
  const NOA = '00000000-0000-4000-8000-0000000000bb'; // no sport
  const E1 = '00000000-0000-4000-8000-0000000000e1';
  const T = 1_790_000_000_000;

  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    await db.execAsync(`
      INSERT INTO families (id) VALUES ('${FAMILY}');
      INSERT INTO players (id, family_id, name, date_of_birth, created_at, updated_at)
        VALUES ('${GAL}', '${FAMILY}', 'Gal', '2015-07-09', 1, 1), ('${NOA}', '${FAMILY}', 'Noa', '2016-01-02', 1, 1);
      INSERT INTO player_sports (player_id, sport) VALUES ('${GAL}', 'BASKETBALL');
    `);
  });
  afterEach(() => db.closeAsync());

  type Row = {
    id?: string;
    player?: string;
    type?: string;
    sport?: string | null;
    start?: unknown;
    end?: unknown;
    title?: string | null;
    notes?: string | null;
    created?: unknown;
    updated?: unknown;
  };
  const insert = (r: Row = {}) =>
    db.runAsync(
      `INSERT INTO calendar_events (id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.id ?? E1,
        r.player ?? GAL,
        r.type ?? 'GAME',
        r.sport === undefined ? null : r.sport,
        (r.start ?? T) as number,
        (r.end === undefined ? null : r.end) as number | null,
        r.title === undefined ? null : r.title,
        r.notes === undefined ? null : r.notes,
        (r.created ?? T) as number,
        (r.updated ?? T) as number,
      ],
    );

  it('accepts a sport-less event for an existing player (only the player FK applies)', async () => {
    await insert({ player: NOA, sport: null });
    await insert({ id: '00000000-0000-4000-8000-0000000000e2', player: GAL, sport: null });
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM calendar_events')).toEqual({ n: 2 });
  });

  it('accepts a BASKETBALL event for a player with that assignment', async () => {
    await insert({ sport: 'BASKETBALL', end: T + 1, title: 'Practice', notes: 'Gym B' });
  });

  it('rejects an unknown player (FK)', async () => {
    await expect(insert({ player: '00000000-0000-4000-8000-000000000999' })).rejects.toThrow(/FOREIGN KEY/);
  });

  it('rejects a BASKETBALL event for a player without the assignment (composite FK)', async () => {
    await expect(insert({ player: NOA, sport: 'BASKETBALL' })).rejects.toThrow(/FOREIGN KEY/);
  });

  it.each([
    ['end_at == start_at', { end: T }],
    ['end_at < start_at', { end: T - 1 }],
    ['fractional start_at', { start: T + 0.5 }],
    ['text start_at', { start: 'soon' }],
    ['fractional end_at', { end: T + 10.5 }],
    ['fractional created_at', { created: T + 0.5 }],
    ['fractional updated_at', { updated: T + 0.5 }],
    ['text updated_at', { updated: 'now' }],
    ['blank title', { title: '   ' }],
    ['empty title', { title: '' }],
    ['tab/newline-only title', { title: '\t\r\n' }],
    ['blank notes', { notes: ' \n ' }],
  ] as const)('rejects %s (CHECK)', async (_label, row) => {
    await expect(insert(row as Row)).rejects.toThrow(/CHECK/);
  });

  it('rejects a duplicate id (primary key)', async () => {
    await insert();
    await expect(insert({ start: T + 5 })).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it('accepts any type string structurally (type validity is a domain rule)', async () => {
    await insert({ type: 'SCHOOL' });
    expect(await db.getFirstAsync('SELECT type FROM calendar_events')).toEqual({ type: 'SCHOOL' });
  });
});
