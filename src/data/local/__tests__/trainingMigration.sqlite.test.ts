import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import {
  LEGACY,
  seedV2Players,
  seedV3SelfAssessment,
  seedV4CalendarEvents,
  seedV6CalendarHistory,
} from '@/test-support/legacyFixtures';
import { expectUnchangedExceptLaterSeeds } from '@/test-support/migrationSeeds';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../database';
import { getExercise, listExercises } from '../exercises/exerciseRepository';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { listTraining } from '../training/trainingRepository';
import { listBlocks, listTemplates } from '../training/workoutRepository';

type Db = ReturnType<typeof openNodeSqlite>;

const CUSTOM_EXERCISE = '00000000-0000-4000-8000-00000000e001';
const TRAINING_TABLES = [
  'planned_workout_items',
  'planned_workouts',
  'session_exercises',
  'session_sets',
  'set_measurements',
  'training_sessions',
  'workout_block_items',
  'workout_blocks',
  'workout_template_blocks',
  'workout_templates',
];

/** Every pre-v9 user table in full. */
async function dumpV8Data(db: Db) {
  const tables = [
    'families',
    'players',
    'player_sports',
    'basketball_player_profiles',
    'self_assessments',
    'self_assessment_ratings',
    'calendar_events',
    'activity_types',
    'exercises',
    'exercise_categories',
    'exercise_muscles',
    'exercise_equipment',
    'exercise_sports',
    'app_meta',
  ];
  const dump: Record<string, unknown[]> = {};
  for (const table of tables) dump[table] = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`);
  return dump;
}
const trainingObjects = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${TRAINING_TABLES.map(() => '?').join(', ')})
        ORDER BY name`,
      TRAINING_TABLES,
    )
  ).map((r) => r.name);

describe('migration v9 (training) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v9-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A realistic v8 file: players, assessment, calendar history, a custom exercise, an inactive built-in. */
  async function createV8Database() {
    const v8 = openTracked(file);
    await v8.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v8, migrations.slice(0, 8));
    expect(await v8.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 8 });
    await seedV2Players(v8);
    await seedV3SelfAssessment(v8);
    await seedV4CalendarEvents(v8);
    await seedV6CalendarHistory(v8);
    await v8.execAsync(`
      INSERT INTO exercises (id, builtin, active, name, difficulty, measurement_type, comparison_policy, uses_load,
        instructions, tutorial_url, created_at, updated_at)
        VALUES ('${CUSTOM_EXERCISE}', 0, 1, 'Sled Drag', 'BEGINNER', 'TIME', NULL, 1, NULL, NULL, 5, 5);
      INSERT INTO exercise_categories VALUES ('${CUSTOM_EXERCISE}', 'CONDITIONING');
      INSERT INTO exercise_muscles VALUES ('${CUSTOM_EXERCISE}', 'QUADRICEPS', 'PRIMARY');
      INSERT INTO exercise_equipment VALUES ('${CUSTOM_EXERCISE}', 0, 'SLED');
      UPDATE exercises SET active = 0, updated_at = 6 WHERE id = 'PLANK';
    `);
    expect(await trainingObjects(v8)).toEqual([]);
    const data = await dumpV8Data(v8);
    await v8.closeAsync();
    return data;
  }

  it('fresh install: the ten training tables, empty', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(11);
    expect(migration.applied).toContain('training');
    expect(await trainingObjects(db as unknown as Db)).toEqual(TRAINING_TABLES);
    for (const table of TRAINING_TABLES) {
      expect(await db.getFirstAsync(`SELECT count(*) AS n FROM ${table}`)).toEqual({ n: 0 });
    }
    await db.closeAsync();
  });

  it('upgrades a realistic v8 database: every existing row unchanged; same schema as a fresh install', async () => {
    const before = await createV8Database();
    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 8, to: 11, applied: ['training', 'taxonomy', 'basketball_content'] });
    expectUnchangedExceptLaterSeeds(await dumpV8Data(db as unknown as Db), before, 8);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // Today's repositories still read everything.
    expect((await getExercise(db, CUSTOM_EXERCISE))!.name.en).toBe('Sled Drag');
    expect((await getExercise(db, 'PLANK'))!.active).toBe(false);
    expect((await listExercises(db)).length).toBeGreaterThan(100);
    expect(await listBlocks(db)).toEqual([]);
    expect(await listTemplates(db)).toEqual([]);
    expect(await listTraining(db, LEGACY.gal)).toEqual({ planned: [], sessions: [] });
    const schema = await db.getAllAsync(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    await db.closeAsync();

    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 11, to: 11, applied: [] });
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

  it('rolls back a v9 that fails part-way: user_version stays 8, no training tables, v8 data intact', async () => {
    const before = await createV8Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    const broken = { ...migrations[8]!, sql: `${migrations[8]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 8), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 8 });
    expect(await trainingObjects(db)).toEqual([]);
    expect(await dumpV8Data(db)).toEqual(before);
    await db.closeAsync();

    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({ from: 8, to: 11, applied: ['training', 'taxonomy', 'basketball_content'] });
    await relaunch.db.closeAsync();
  });

  it('refuses a newer schema (v10)', async () => {
    const newer = openTracked(file);
    await newer.execAsync('PRAGMA user_version = 12');
    await newer.closeAsync();
    await expect(openLocalDatabase()).rejects.toThrow(/v12 .* only knows v11\. Refusing to downgrade/);
  });

  it('structural constraints: ownership references, one in-progress session per player, status ⇔ end time', async () => {
    const { db } = await openLocalDatabase();
    const run = (sql: string) => db.runAsync(sql, []);
    await expect(run("INSERT INTO workout_blocks VALUES ('b', 'no-family', 'X', 1, 0, 0)")).rejects.toThrow(
      /FOREIGN KEY/,
    );
    await run("INSERT INTO families (id) VALUES ('f')");
    await run(
      "INSERT INTO players (id, family_id, name, date_of_birth, created_at, updated_at) VALUES ('p', 'f', 'P', '2012-01-01', 0, 0)",
    );
    await expect(
      run(
        "INSERT INTO training_sessions VALUES ('s0', 'p', NULL, 'W', 'TRAINING', 'COMPLETED', 0, NULL, 0, 0)",
      ),
    ).rejects.toThrow(/CHECK/);
    await run(
      "INSERT INTO training_sessions VALUES ('s1', 'p', NULL, 'W', 'TRAINING', 'IN_PROGRESS', 0, NULL, 0, 0)",
    );
    await expect(
      run(
        "INSERT INTO training_sessions VALUES ('s2', 'p', NULL, 'W', 'TRAINING', 'IN_PROGRESS', 0, NULL, 0, 0)",
      ),
    ).rejects.toThrow(/UNIQUE/);
    await db.closeAsync();
  });
});
