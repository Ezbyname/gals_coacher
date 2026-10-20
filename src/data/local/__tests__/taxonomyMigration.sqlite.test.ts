import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import { BUILTIN_TAXONOMY_NODES } from '@/domain/taxonomy/nodes';
import type { Clock } from '@/services/clock/Clock';
import {
  LEGACY,
  seedV2Players,
  seedV3SelfAssessment,
  seedV4CalendarEvents,
  seedV6CalendarHistory,
} from '@/test-support/legacyFixtures';
import { expectUnchangedExceptLaterSeeds } from '@/test-support/migrationSeeds';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { selectPreV13 } from '@/test-support/preV13Columns';

import { openLocalDatabase } from '../database';
import { getExercise } from '../exercises/exerciseRepository';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { readTaxonomy, setCustomExerciseTaxonomy, setTaxonomyNodeActive } from '../taxonomy/taxonomyRepository';
import { listTraining } from '../training/trainingRepository';

type Db = ReturnType<typeof openNodeSqlite>;

const CUSTOM_EXERCISE = '00000000-0000-4000-8000-00000000e001';
const BLOCK = '00000000-0000-4000-8000-00000000c001';
const TEMPLATE = '00000000-0000-4000-8000-00000000c002';
const PLAN = '00000000-0000-4000-8000-00000000c003';
const SESSION = '00000000-0000-4000-8000-00000000c004';
const SESSION_EXERCISE = '00000000-0000-4000-8000-00000000c005';
const SET = '00000000-0000-4000-8000-00000000c006';
const MEASUREMENT = '00000000-0000-4000-8000-00000000c007';
const clock: Clock = { wallNow: () => 1_800_000_000_000, monotonicNow: () => 0 };

const PRE_V10_TABLES = [
  'app_meta',
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
  'workout_blocks',
  'workout_block_items',
  'workout_templates',
  'workout_template_blocks',
  'planned_workouts',
  'planned_workout_items',
  'training_sessions',
  'session_exercises',
  'session_sets',
  'set_measurements',
];
const TRAINING_HISTORY = PRE_V10_TABLES.slice(PRE_V10_TABLES.indexOf('workout_blocks'));
const V10_OBJECTS = [
  'exercise_taxonomy',
  'exercise_taxonomy_builtin_curated',
  'exercise_taxonomy_by_node',
  'exercise_taxonomy_frozen_update',
  'taxonomy_nodes',
  'taxonomy_nodes_by_parent',
  'taxonomy_nodes_never_deleted',
];

async function dump(db: Db, tables: readonly string[]) {
  const out: Record<string, unknown[]> = {};
  for (const table of tables) out[table] = await db.getAllAsync(selectPreV13(table));
  return out;
}
const v10Objects = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name LIKE '%taxonomy%' AND name NOT LIKE 'workout_template_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).map((r) => r.name);

describe('migration v10 (taxonomy) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v10-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A realistic v9 file: players, an assessment, calendar history, a custom
   * exercise, an inactive built-in, and a FINISHED training history (block →
   * template → frozen plan → session → set → measurement).
   */
  async function createV9Database() {
    const v9 = openTracked(file);
    await v9.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v9, migrations.slice(0, 9));
    expect(await v9.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 9 });
    await seedV2Players(v9);
    await seedV3SelfAssessment(v9);
    await seedV4CalendarEvents(v9);
    await seedV6CalendarHistory(v9);
    await v9.execAsync(`
      INSERT INTO exercises (id, builtin, active, name, difficulty, measurement_type, comparison_policy, uses_load,
        instructions, tutorial_url, created_at, updated_at)
        VALUES ('${CUSTOM_EXERCISE}', 0, 1, 'Sled Drag', 'BEGINNER', 'TIME', NULL, 1, NULL, NULL, 5, 5);
      INSERT INTO exercise_categories VALUES ('${CUSTOM_EXERCISE}', 'CONDITIONING');
      INSERT INTO exercise_muscles VALUES ('${CUSTOM_EXERCISE}', 'QUADRICEPS', 'PRIMARY');
      INSERT INTO exercise_equipment VALUES ('${CUSTOM_EXERCISE}', 0, 'SLED');
      UPDATE exercises SET active = 0, updated_at = 6 WHERE id = 'PLANK';

      INSERT INTO workout_blocks VALUES ('${BLOCK}', '${LEGACY.family}', 'Legs A', 1, 10, 10);
      INSERT INTO workout_block_items VALUES ('${BLOCK}', 0, 'GOBLET_SQUAT', 3, 10, 20, 90);
      INSERT INTO workout_templates VALUES ('${TEMPLATE}', '${LEGACY.family}', 'Leg day', 1, 11, 11);
      INSERT INTO workout_template_blocks VALUES ('${TEMPLATE}', 0, '${BLOCK}');
      INSERT INTO planned_workouts VALUES ('${PLAN}', '${LEGACY.gal}', '${TEMPLATE}', 'Leg day', 12, 12);
      INSERT INTO planned_workout_items VALUES ('${PLAN}', 0, 'Legs A', 'GOBLET_SQUAT', 'סקוואט גביע', 'Goblet Squat',
        'REPETITIONS', NULL, 1, NULL, 3, 10, 20, 90);
      INSERT INTO training_sessions VALUES ('${SESSION}', '${LEGACY.gal}', '${PLAN}', 'Leg day', 'TRAINING',
        'IN_PROGRESS', 13, NULL, 13, 13);
      INSERT INTO session_exercises VALUES ('${SESSION_EXERCISE}', '${SESSION}', 0, 0, 'Legs A', 'GOBLET_SQUAT',
        'סקוואט גביע', 'Goblet Squat', 'REPETITIONS', NULL, 1, NULL, 90, 13, 13);
      INSERT INTO session_sets VALUES ('${SET}', '${SESSION_EXERCISE}', 1, 1, 10, 20, 'DONE', 14, 14);
      INSERT INTO set_measurements VALUES ('${MEASUREMENT}', '${SET}', 'REPETITIONS', 7, 7, 0, 'MANUAL', NULL, 14, 14);
      UPDATE training_sessions SET status = 'PARTIAL', ended_at = 15, updated_at = 15 WHERE id = '${SESSION}';
    `);
    expect(await v10Objects(v9)).toEqual([]);
    const data = await dump(v9, PRE_V10_TABLES);
    expect(data.set_measurements).toHaveLength(1);
    await v9.closeAsync();
    return data;
  }

  it('fresh install: the two taxonomy tables, their indexes and triggers; every curated node seeded once, active', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(21);
    expect(migration.applied).toContain('taxonomy');
    expect(await v10Objects(db as unknown as Db)).toEqual(V10_OBJECTS);
    const rows = await db.getAllAsync<{ id: string; builtin: number; active: number }>(
      'SELECT id, builtin, active FROM taxonomy_nodes ORDER BY id',
    );
    expect(rows.map((r) => r.id)).toEqual(BUILTIN_TAXONOMY_NODES.map((n) => n.key).sort());
    expect(rows.every((r) => r.builtin === 1 && r.active === 1)).toBe(true);
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM exercise_taxonomy')).toEqual({ n: 0 });
    await db.closeAsync();
  });

  it('upgrades a realistic v9 database: every existing row unchanged, same schema as a fresh install', async () => {
    const before = await createV9Database();
    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 9, to: 21, applied: ['taxonomy', 'basketball_content', 'template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001'] });
    expectUnchangedExceptLaterSeeds(await dump(db as unknown as Db, PRE_V10_TABLES), before, 9);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // Today's repositories still read everything; the taxonomy reads on top.
    expect((await getExercise(db, CUSTOM_EXERCISE))!.name.en).toBe('Sled Drag');
    expect((await getExercise(db, 'PLANK'))!.active).toBe(false);
    expect((await listTraining(db, LEGACY.gal)).sessions).toHaveLength(1);
    expect((await readTaxonomy(db)).nodesOf('GOBLET_SQUAT')).toContain('FITNESS_LEGS_SQUAT_LUNGE');
    const schema = (h: Db) =>
      h.getAllAsync("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
    const upgraded = await schema(db as unknown as Db);
    await db.closeAsync();
    rmSync(file);
    const fresh = await openLocalDatabase();
    expect(await schema(fresh.db as unknown as Db)).toEqual(upgraded);
    await fresh.db.closeAsync();
  });

  it('taxonomy changes never rewrite training history (plans, sessions, sets, measurements)', async () => {
    await createV9Database();
    const { db } = await openLocalDatabase();
    const history = await dump(db as unknown as Db, TRAINING_HISTORY);
    await setTaxonomyNodeActive(db, 'FITNESS_LEGS_SQUAT_LUNGE', false, { clock });
    await setTaxonomyNodeActive(db, 'FITNESS', false, { clock });
    await setCustomExerciseTaxonomy(db, CUSTOM_EXERCISE, ['FITNESS_CONDITIONING'], { clock }).catch(() => {});
    await setTaxonomyNodeActive(db, 'FITNESS', true, { clock });
    await setCustomExerciseTaxonomy(db, CUSTOM_EXERCISE, ['FITNESS_CONDITIONING'], { clock });
    expect(await dump(db as unknown as Db, TRAINING_HISTORY)).toEqual(history);
    expect((await readTaxonomy(db)).nodesOf(CUSTOM_EXERCISE)).toEqual(['FITNESS_CONDITIONING']);
    await db.closeAsync();
  });

  it('is idempotent and restart-safe: a relaunch applies nothing and keeps the taxonomy state', async () => {
    await createV9Database();
    const first = await openLocalDatabase();
    await setTaxonomyNodeActive(first.db, 'BASKETBALL_REBOUNDING', false, { clock });
    const state = await dump(first.db as unknown as Db, ['taxonomy_nodes', 'exercise_taxonomy']);
    await first.db.closeAsync();
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 21, to: 21, applied: [] });
    expect(await dump(again.db as unknown as Db, ['taxonomy_nodes', 'exercise_taxonomy'])).toEqual(state);
    expect((await readTaxonomy(again.db)).node('BASKETBALL_REBOUNDING')!.active).toBe(false);
    await again.db.closeAsync();
  });

  it('rolls back a v10 that fails part-way: user_version stays 9, no taxonomy objects, v9 data intact', async () => {
    const before = await createV9Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    const broken = { ...migrations[9]!, sql: `${migrations[9]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 9), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 9 });
    expect(await v10Objects(db)).toEqual([]);
    expect(await dump(db, PRE_V10_TABLES)).toEqual(before);
    await db.closeAsync();

    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({ from: 9, to: 21, applied: ['taxonomy', 'basketball_content', 'template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001'] });
    expectUnchangedExceptLaterSeeds(await dump(relaunch.db as unknown as Db, PRE_V10_TABLES), before, 9);
    await relaunch.db.closeAsync();
  });
});
