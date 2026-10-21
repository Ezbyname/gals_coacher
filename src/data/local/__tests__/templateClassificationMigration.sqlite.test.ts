import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import type { Clock } from '@/services/clock/Clock';
import {
  LEGACY,
  seedV2Players,
  seedV3SelfAssessment,
  seedV4CalendarEvents,
  seedV6CalendarHistory,
} from '@/test-support/legacyFixtures';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { expectUnchangedExceptLaterSeeds } from '@/test-support/migrationSeeds';
import { selectPreV13 } from '@/test-support/preV13Columns';

import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { setTaxonomyNodeActive } from '../taxonomy/taxonomyRepository';
import { listTraining } from '../training/trainingRepository';
import { getTemplate, updateTemplate } from '../training/workoutRepository';

type Db = ReturnType<typeof openNodeSqlite>;

const BLOCK = '00000000-0000-4000-8000-00000000c001';
const TEMPLATE = '00000000-0000-4000-8000-00000000c002';
const PLAN = '00000000-0000-4000-8000-00000000c003';
const SESSION = '00000000-0000-4000-8000-00000000c004';
const SESSION_EXERCISE = '00000000-0000-4000-8000-00000000c005';
const SET = '00000000-0000-4000-8000-00000000c006';
const MEASUREMENT = '00000000-0000-4000-8000-00000000c007';
const clock: Clock = { wallNow: () => 1_800_000_000_000, monotonicNow: () => 0 };

/** Every table that exists before v12. */
const PRE_V12_TABLES = [
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
  'taxonomy_nodes',
  'exercise_taxonomy',
];
const TRAINING_HISTORY = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements'];
const V12_OBJECTS = [
  'workout_template_taxonomy',
  'workout_template_taxonomy_by_node',
  'workout_template_taxonomy_frozen_update',
  'workout_template_taxonomy_one_primary',
];

async function dump(db: Db, tables: readonly string[]) {
  const out: Record<string, unknown[]> = {};
  for (const table of tables) out[table] = await db.getAllAsync(selectPreV13(table));
  return out;
}
const v12Objects = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name LIKE 'workout_template_taxonomy%' ORDER BY name",
    )
  ).map((r) => r.name);

describe('migration v12 (template classification) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v12-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A realistic v11 file: players, calendar history, an inactive taxonomy node, a FINISHED training history. */
  async function createV11Database() {
    const v11 = openTracked(file);
    await v11.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v11, migrations.slice(0, 11));
    expect(await v11.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 11 });
    await seedV2Players(v11);
    await seedV3SelfAssessment(v11);
    await seedV4CalendarEvents(v11);
    await seedV6CalendarHistory(v11);
    await v11.execAsync(`
      UPDATE taxonomy_nodes SET active = 0, updated_at = 9 WHERE id = 'BASKETBALL_REBOUNDING';
      INSERT INTO workout_blocks VALUES ('${BLOCK}', '${LEGACY.family}', 'Shots', 1, 10, 10);
      INSERT INTO workout_block_items VALUES ('${BLOCK}', 0, 'FREE_THROWS', 2, 10, NULL, NULL);
      INSERT INTO workout_templates VALUES ('${TEMPLATE}', '${LEGACY.family}', 'Shooting day', 1, 11, 11);
      INSERT INTO workout_template_blocks VALUES ('${TEMPLATE}', 0, '${BLOCK}');
      INSERT INTO planned_workouts VALUES ('${PLAN}', '${LEGACY.gal}', '${TEMPLATE}', 'Shooting day', 12, 12);
      INSERT INTO planned_workout_items VALUES ('${PLAN}', 0, 'Shots', 'FREE_THROWS', 'זריקות עונשין', 'Free Throws',
        'MADE_ATTEMPTS', NULL, 0, NULL, 2, 10, NULL, NULL);
      INSERT INTO training_sessions VALUES ('${SESSION}', '${LEGACY.gal}', '${PLAN}', 'Shooting day', 'TRAINING',
        'IN_PROGRESS', 13, NULL, 13, 13);
      INSERT INTO session_exercises VALUES ('${SESSION_EXERCISE}', '${SESSION}', 0, 0, 'Shots', 'FREE_THROWS',
        'זריקות עונשין', 'Free Throws', 'MADE_ATTEMPTS', NULL, 0, NULL, NULL, 13, 13);
      INSERT INTO session_sets VALUES ('${SET}', '${SESSION_EXERCISE}', 1, 1, 10, NULL, 'DONE', 14, 14);
      INSERT INTO set_measurements VALUES ('${MEASUREMENT}', '${SET}', 'MADE', 7, 7, 0, 'MANUAL', NULL, 14, 14);
      UPDATE training_sessions SET status = 'PARTIAL', ended_at = 15, updated_at = 15 WHERE id = '${SESSION}';
    `);
    expect(await v12Objects(v11)).toEqual([]);
    const data = await dump(v11, PRE_V12_TABLES);
    expect(data.set_measurements).toHaveLength(1);
    await v11.closeAsync();
    return data;
  }

  it('fresh install: the classification table, its indexes and trigger; empty', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(22);
    expect(migration.applied).toContain('template_classification');
    expect(await v12Objects(db as unknown as Db)).toEqual(V12_OBJECTS);
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM workout_template_taxonomy')).toEqual({ n: 0 });
    await db.closeAsync();
  });

  it('upgrades a realistic v11 database: every existing row unchanged; templates read back with no categories', async () => {
    const before = await createV11Database();
    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 11, to: 22, applied: ['template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001', 'time_semantics_001'] });
    expectUnchangedExceptLaterSeeds(await dump(db as unknown as Db, PRE_V12_TABLES), before, 11);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    expect((await getTemplate(db, TEMPLATE))!.classification).toEqual({ nodeKeys: [], primary: null });
    expect((await listTraining(db, LEGACY.gal)).sessions).toHaveLength(1);
    const schema = (h: Db) =>
      h.getAllAsync("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
    const upgraded = await schema(db as unknown as Db);
    await db.closeAsync();
    rmSync(file);
    const fresh = await openLocalDatabase();
    expect(await schema(fresh.db as unknown as Db)).toEqual(upgraded);
    await fresh.db.closeAsync();
  });

  it('classifying a template never rewrites its plans, sessions, sets or measurements', async () => {
    await createV11Database();
    const { db } = await openLocalDatabase();
    const history = await dump(db as unknown as Db, TRAINING_HISTORY);
    const input = { name: 'Shooting day', blockIds: [BLOCK] };
    let saved = await updateTemplate(
      db,
      TEMPLATE,
      { ...input, classification: { nodeKeys: ['BASKETBALL_SHOOTING', 'BASKETBALL_ATHLETIC'], primary: 'BASKETBALL_SHOOTING' } },
      { clock },
    );
    expect(saved.ok).toBe(true);
    saved = await updateTemplate(db, TEMPLATE, { ...input, classification: { nodeKeys: ['BASKETBALL_ATHLETIC'], primary: null } }, { clock });
    expect(saved.ok).toBe(true);
    await setTaxonomyNodeActive(db, 'BASKETBALL_ATHLETIC', false, { clock });
    expect(await dump(db as unknown as Db, TRAINING_HISTORY)).toEqual(history);
    // Plans keep their own snapshot: no taxonomy column anywhere in training history.
    for (const table of TRAINING_HISTORY) {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      expect(cols.map((c) => c.name).filter((n) => /taxonomy|node|categor/.test(n))).toEqual([]);
    }
    await db.closeAsync();
  });

  it('is idempotent and restart-safe: a relaunch applies nothing and keeps the classification', async () => {
    await createV11Database();
    const first = await openLocalDatabase();
    await updateTemplate(
      first.db,
      TEMPLATE,
      { name: 'Shooting day', blockIds: [BLOCK], classification: { nodeKeys: ['BASKETBALL_SHOOTING'], primary: 'BASKETBALL_SHOOTING' } },
      { clock },
    );
    const state = await dump(first.db as unknown as Db, ['workout_template_taxonomy']);
    await first.db.closeAsync();
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 22, to: 22, applied: [] });
    expect(await dump(again.db as unknown as Db, ['workout_template_taxonomy'])).toEqual(state);
    expect((await getTemplate(again.db, TEMPLATE))!.classification).toEqual({
      nodeKeys: ['BASKETBALL_SHOOTING'],
      primary: 'BASKETBALL_SHOOTING',
    });
    await again.db.closeAsync();
  });

  it('rolls back a v12 that fails part-way: user_version stays 11, no v12 objects, v11 data intact', async () => {
    const before = await createV11Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    const broken = { ...migrations[11]!, sql: `${migrations[11]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 11), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 11 });
    expect(await v12Objects(db)).toEqual([]);
    expect(await dump(db, PRE_V12_TABLES)).toEqual(before); // rolled back: nothing newer was applied
    await db.closeAsync();

    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({ from: 11, to: 22, applied: ['template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001', 'time_semantics_001'] });
    expectUnchangedExceptLaterSeeds(await dump(relaunch.db as unknown as Db, PRE_V12_TABLES), before, 11);
    await relaunch.db.closeAsync();
  });
});
