import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import { BUILTIN_EXERCISES } from '@/domain/exercise/catalog';
import {
  LEGACY,
  seedV2Players,
  seedV3SelfAssessment,
  seedV4CalendarEvents,
  seedV6CalendarHistory,
} from '@/test-support/legacyFixtures';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { selectPreV13 } from '@/test-support/preV13Columns';

import { listActivityTypes } from '../activityTypes/activityTypeRepository';
import { listCalendarEvents } from '../calendar/calendarEventRepository';
import { openLocalDatabase } from '../database';
import { listExercises } from '../exercises/exerciseRepository';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { getPlayer } from '../players/playerRepository';

type Db = ReturnType<typeof openNodeSqlite>;

const CUSTOM_TYPE = '00000000-0000-4000-8000-00000000d001';

/** Every pre-v8 user table in full. */
async function dumpV7Data(db: Db) {
  const tables = [
    'families',
    'players',
    'player_sports',
    'basketball_player_profiles',
    'self_assessments',
    'self_assessment_ratings',
    'calendar_events',
    'activity_types',
    'app_meta',
  ];
  const dump: Record<string, unknown[]> = {};
  for (const table of tables) dump[table] = await db.getAllAsync(selectPreV13(table));
  return dump;
}
const exerciseRows = (db: Db) =>
  db.getAllAsync<{ id: string; builtin: number; active: number }>(
    'SELECT id, builtin, active FROM exercises ORDER BY rowid',
  );
const v8Tables = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') AND name LIKE 'exercise%' AND name NOT LIKE 'exercise_taxonomy%' ORDER BY name",
    )
  ).map((r) => r.name);

describe('migration v8 (exercise library) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v8-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A realistic v7 file: players, assessment, calendar history, a custom + an inactive activity type. */
  async function createV7Database() {
    const v7 = openTracked(file);
    await v7.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v7, migrations.slice(0, 7));
    expect(await v7.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 7 });
    await seedV2Players(v7);
    await seedV3SelfAssessment(v7);
    await seedV4CalendarEvents(v7);
    await seedV6CalendarHistory(v7);
    await v7.execAsync(`
      INSERT INTO activity_types (id, builtin, name, active, created_at, updated_at)
        VALUES ('${CUSTOM_TYPE}', 0, 'Swim', 1, 5, 5);
      UPDATE activity_types SET active = 0, updated_at = 6 WHERE id = 'GAME';
    `);
    expect(await v8Tables(v7)).toEqual([]);
    const data = await dumpV7Data(v7);
    await v7.closeAsync();
    return data;
  }

  it('fresh install: the library tables, every built-in id exactly once (active), deletion refused', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(22);
    expect(migration.applied).toContain('exercises');
    expect(await v8Tables(db as unknown as Db)).toEqual([
      'exercise_categories',
      'exercise_equipment',
      'exercise_muscles',
      'exercise_sports',
      'exercises',
      'exercises_never_deleted',
    ]);
    const rows = await exerciseRows(db as unknown as Db);
    expect(rows.map((r) => r.id)).toEqual(BUILTIN_EXERCISES.map((e) => e.id));
    expect(rows.every((r) => r.builtin === 1 && r.active === 1)).toBe(true);
    // Built-in content lives in code: no child rows for built-ins.
    for (const table of [
      'exercise_categories',
      'exercise_muscles',
      'exercise_equipment',
      'exercise_sports',
    ]) {
      expect(await db.getFirstAsync(`SELECT count(*) AS n FROM ${table}`)).toEqual({ n: 0 });
    }
    await expect(db.runAsync("DELETE FROM exercises WHERE id = 'PLANK'", [])).rejects.toThrow(
      /never deleted/,
    );
    await db.closeAsync();
  });

  it('upgrades a realistic v7 database: every existing row unchanged; built-ins seeded once; reopening re-seeds nothing', async () => {
    const before = await createV7Database();

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 7, to: 22, applied: ['exercises', 'training', 'taxonomy', 'basketball_content', 'template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001', 'time_semantics_001'] });
    expect(await dumpV7Data(db as unknown as Db)).toEqual(before);
    expect(await exerciseRows(db as unknown as Db)).toHaveLength(BUILTIN_EXERCISES.length);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // Today's repositories still read everything, inactive and custom included.
    expect((await listCalendarEvents(db, LEGACY.gal)).length).toBeGreaterThan(0);
    expect((await listActivityTypes(db)).find((t) => t.id === 'GAME')!.active).toBe(false);
    expect((await getPlayer(db, LEGACY.gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
    expect(await listExercises(db)).toHaveLength(BUILTIN_EXERCISES.length);
    const schema = await db.getAllAsync(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    await db.closeAsync();

    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 22, to: 22, applied: [] });
    expect(await exerciseRows(again.db as unknown as Db)).toHaveLength(BUILTIN_EXERCISES.length);
    expect(await dumpV7Data(again.db as unknown as Db)).toEqual(before);
    await again.db.closeAsync();

    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(
      await fresh.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual(schema);
    await fresh.closeAsync();
  });

  it('rolls back a v8 that fails part-way: user_version stays 7, no library tables, v7 data intact', async () => {
    const before = await createV7Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    const broken = { ...migrations[7]!, sql: `${migrations[7]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 7), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 7 });
    expect(await v8Tables(db)).toEqual([]);
    expect(await dumpV7Data(db)).toEqual(before);
    await db.closeAsync();

    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({ from: 7, to: 22, applied: ['exercises', 'training', 'taxonomy', 'basketball_content', 'template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001', 'time_semantics_001'] });
    await relaunch.db.closeAsync();
  });

  it('refuses a newer schema (v10)', async () => {
    const newer = openTracked(file);
    await newer.execAsync('PRAGMA user_version = 23');
    await newer.closeAsync();
    await expect(openLocalDatabase()).rejects.toThrow(/v23 .* only knows v22\. Refusing to downgrade/);
  });
});

describe('v8 constraints enforced by SQLite itself', () => {
  let db: Db;
  const ID = '00000000-0000-4000-8000-0000000000e1';
  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
  });
  afterEach(() => db.closeAsync());

  const insert = (values: string) =>
    db.execAsync(
      `INSERT INTO exercises (id, builtin, active, name, difficulty, measurement_type, comparison_policy, uses_load, instructions, tutorial_url, created_at, updated_at) VALUES ${values}`,
    );

  it('accepts a complete custom row and its child rows', async () => {
    await insert(
      `('${ID}', 0, 1, 'Sandbag Carry', 'BEGINNER', 'DURATION', 'HIGHER_IS_BETTER', 1, NULL, NULL, 5, 5)`,
    );
    await db.execAsync(`INSERT INTO exercise_categories VALUES ('${ID}', 'STRENGTH')`);
  });

  it.each([
    [
      'a custom row without a name',
      `('${ID}', 0, 1, NULL, 'BEGINNER', 'REPETITIONS', NULL, 0, NULL, NULL, 5, 5)`,
    ],
    [
      'a custom row without a difficulty',
      `('${ID}', 0, 1, 'X', NULL, 'REPETITIONS', NULL, 0, NULL, NULL, 5, 5)`,
    ],
    [
      'a built-in row carrying content',
      `('NEW_ONE', 1, 1, NULL, 'BEGINNER', NULL, NULL, NULL, NULL, NULL, 0, 0)`,
    ],
    ['active = 2', `('${ID}', 0, 2, 'X', 'BEGINNER', 'REPETITIONS', NULL, 0, NULL, NULL, 5, 5)`],
    ['a blank name', `('${ID}', 0, 1, '  ', 'BEGINNER', 'REPETITIONS', NULL, 0, NULL, NULL, 5, 5)`],
  ])('rejects %s', async (_label, values) => {
    await expect(insert(values)).rejects.toThrow(/CHECK/);
  });

  it('a child row must belong to an existing exercise', async () => {
    await expect(db.execAsync(`INSERT INTO exercise_sports VALUES ('${ID}', 'BASKETBALL')`)).rejects.toThrow(
      /FOREIGN KEY/,
    );
  });
});
