import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import {
  LEGACY,
  LEGACY_V6_EVENTS,
  seedV2Players,
  seedV3SelfAssessment,
  seedV4CalendarEvents,
  seedV6CalendarHistory,
} from '@/test-support/legacyFixtures';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { selectPreV13 } from '@/test-support/preV13Columns';

import { getCalendarEvent, listCalendarEvents } from '../calendar/calendarEventRepository';
import { CalendarEventDataError } from '../calendar/errors';
import { openLocalDatabase } from '../database';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { listTraining } from '../training/trainingRepository';
import { getTemplate } from '../training/workoutRepository';

/**
 * CAL-TEXT-IMPORT-001B — schema v13 (calendar_event_import) on real SQLite:
 * three nullable calendar_events columns (location, source, import_batch_id)
 * and a partial (player_id, import_batch_id) index. Purely additive.
 */
type Db = ReturnType<typeof openNodeSqlite>;

const BLOCK = '00000000-0000-4000-8000-00000000d001';
const TEMPLATE = '00000000-0000-4000-8000-00000000d002';
const PLAN = '00000000-0000-4000-8000-00000000d003';
const SESSION = '00000000-0000-4000-8000-00000000d004';
const SESSION_EXERCISE = '00000000-0000-4000-8000-00000000d005';
const SET = '00000000-0000-4000-8000-00000000d006';
const MEASUREMENT = '00000000-0000-4000-8000-00000000d007';
const BATCH = '00000000-0000-4000-8000-00000000d0b1';

/** Every table that exists in v12 — compared row for row (calendar_events with its pre-v13 columns). */
const V12_TABLES = [
  'app_meta', 'families', 'players', 'player_sports', 'basketball_player_profiles', 'self_assessments',
  'self_assessment_ratings', 'calendar_events', 'activity_types', 'exercises', 'exercise_categories',
  'exercise_muscles', 'exercise_equipment', 'exercise_sports', 'workout_blocks', 'workout_block_items',
  'workout_templates', 'workout_template_blocks', 'planned_workouts', 'planned_workout_items',
  'training_sessions', 'session_exercises', 'session_sets', 'set_measurements', 'taxonomy_nodes',
  'exercise_taxonomy', 'workout_template_taxonomy',
];

async function dump(db: Db) {
  const out: Record<string, unknown[]> = {};
  for (const table of V12_TABLES) out[table] = await db.getAllAsync(selectPreV13(table));
  return out;
}
const v13Columns = async (db: Db) =>
  (
    await db.getAllAsync<{ name: string; type: string; notnull: number; dflt_value: unknown }>(
      "SELECT name, type, \"notnull\", dflt_value FROM pragma_table_info('calendar_events') WHERE name IN ('location', 'source', 'import_batch_id') ORDER BY cid",
    )
  ).map((c) => ({ ...c }));
const batchIndex = (db: Db) =>
  db.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'calendar_events_player_import_batch'");

describe('migration v13 (calendar event import) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v13-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A realistic v12 file: two Players, a self-assessment, calendar history
   * (incl. completed events), a classified template and a FINISHED training
   * session with its frozen plan.
   */
  async function createV12Database() {
    const v12 = openTracked(file);
    await v12.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v12, migrations.slice(0, 12));
    expect(await v12.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 12 });
    await seedV2Players(v12);
    await seedV3SelfAssessment(v12);
    await seedV4CalendarEvents(v12);
    await seedV6CalendarHistory(v12);
    await v12.execAsync(`
      INSERT INTO workout_blocks VALUES ('${BLOCK}', '${LEGACY.family}', 'Shots', 1, 10, 10);
      INSERT INTO workout_block_items VALUES ('${BLOCK}', 0, 'FREE_THROWS', 2, 10, NULL, NULL);
      INSERT INTO workout_templates VALUES ('${TEMPLATE}', '${LEGACY.family}', 'Shooting day', 1, 11, 11);
      INSERT INTO workout_template_blocks VALUES ('${TEMPLATE}', 0, '${BLOCK}');
      INSERT INTO workout_template_taxonomy VALUES ('${TEMPLATE}', 'BASKETBALL_SHOOTING', 0, 1, 11);
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
    expect(await v13Columns(v12)).toEqual([]);
    const data = await dump(v12);
    expect(data.calendar_events!.length).toBeGreaterThanOrEqual(6);
    expect(data.set_measurements).toHaveLength(1);
    await v12.closeAsync();
    return data;
  }

  it('fresh install reaches v13: three nullable columns, no default, a partial batch index', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(16);
    expect(migration.applied.at(-1)).toBe('calendar_event_sync_links');
    expect(await v13Columns(db as unknown as Db)).toEqual([
      { name: 'location', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'source', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'import_batch_id', type: 'TEXT', notnull: 0, dflt_value: null },
    ]);
    const index = (await batchIndex(db as unknown as Db))!.sql;
    expect(index).toMatch(/ON calendar_events \(player_id, import_batch_id\)/);
    expect(index).toMatch(/WHERE import_batch_id IS NOT NULL/);
    // `source` is not restricted to a value set in the database (codes are validated in the domain).
    const table = (await db.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'calendar_events'"))!.sql;
    expect(table).not.toMatch(/TEXT_IMPORT|source IN/);
    await db.closeAsync();
  });

  it('upgrades a realistic v12 database: every row of every table unchanged, new fields NULL, history readable', async () => {
    const before = await createV12Database();

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 12, to: 16, applied: ['calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links'] });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 16 });
    expect(await dump(db as unknown as Db)).toEqual(before);
    expect(
      await db.getAllAsync(
        'SELECT DISTINCT location, source, import_batch_id FROM calendar_events',
      ),
    ).toEqual([{ location: null, source: null, import_batch_id: null }]);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });

    // Read through today's repositories: playerId, type, sport, times, title, notes and completion unchanged.
    for (const player of [LEGACY.gal, LEGACY.noa]) {
      const events = await listCalendarEvents(db, player);
      const rows = (before.calendar_events as Record<string, unknown>[]).filter((r) => r.player_id === player);
      expect(events.map((e) => [e.id, e.playerId, e.type, e.sport, e.startAt, e.endAt, e.title, e.notes,
        e.completion?.completedAt ?? null, e.completion?.source ?? null])).toEqual(
        [...rows]
          .sort((a, b) => (a.start_at as number) - (b.start_at as number) || String(a.id).localeCompare(String(b.id)))
          .map((r) => [r.id, r.player_id, r.type, r.sport, r.start_at, r.end_at, r.title, r.notes, r.completed_at, r.completion_source]),
      );
      expect(events.every((e) => e.location === null && e.source === null && e.importBatchId === null)).toBe(true);
    }
    expect((await getCalendarEvent(db, LEGACY.gal, LEGACY_V6_EVENTS.team))!.completion).not.toBeNull();
    // Training history and the classified template are untouched.
    const training = await listTraining(db, LEGACY.gal);
    expect(training.sessions.map((s) => [s.id, s.status])).toEqual([[SESSION, 'PARTIAL']]);
    expect((await getTemplate(db, TEMPLATE))!.name).toBe('Shooting day');
    await db.closeAsync();

    // Idempotent: the next launch applies nothing and changes nothing.
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 16, to: 16, applied: [] });
    expect(await dump(again.db as unknown as Db)).toEqual(before);
    await again.db.closeAsync();
  });

  it('upgraded and fresh databases have the same calendar_events structure and SQL', async () => {
    await createV12Database();
    const upgraded = await openLocalDatabase();
    const schema = (db: { getAllAsync: Db['getAllAsync'] }) =>
      db.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      );
    const upgradedSchema = await schema(upgraded.db as unknown as Db);
    await upgraded.db.closeAsync();
    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(await schema(fresh)).toEqual(upgradedSchema);
    await fresh.closeAsync();
  });

  it('rolls back a v13 that fails part-way: user_version stays 12, no new column, v12 data intact', async () => {
    const before = await createV12Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    const broken = { ...migrations[12]!, sql: `${migrations[12]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 12), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 12 });
    expect(await v13Columns(db)).toEqual([]);
    expect(await batchIndex(db)).toBeNull();
    expect(await dump(db)).toEqual(before);
    await db.closeAsync();

    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({ from: 12, to: 16, applied: ['calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links'] });
    expect(await dump(relaunch.db as unknown as Db)).toEqual(before);
    await relaunch.db.closeAsync();
  });
});

describe('v13 constraints enforced by SQLite itself', () => {
  let db: Db;
  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    await seedV2Players(db);
    await seedV4CalendarEvents(db);
  });
  afterEach(() => db.closeAsync());
  const set = (assignments: string) => db.execAsync(`UPDATE calendar_events SET ${assignments}`);

  it('accepts a trimmed location, an import with its batch, and clearing all three', async () => {
    await set(`location = 'עין כרמל', source = 'TEXT_IMPORT', import_batch_id = '${BATCH}'`);
    await set('location = NULL, source = NULL, import_batch_id = NULL');
  });

  it('accepts a source code the domain does not know yet (no value list in the database)', async () => {
    await set(`source = 'SOME_FUTURE_SOURCE'`);
  });

  it.each([
    ['a blank location', "location = '  '"],
    ['a blank source', "source = ' '"],
    ['a batch without a source', `import_batch_id = '${BATCH}'`],
    ['a blank batch id', "source = 'TEXT_IMPORT', import_batch_id = '  '"],
  ])('rejects %s', async (_name, assignments) => {
    await expect(set(assignments)).rejects.toThrow(/CHECK/);
  });

  it('a stored source the domain does not know fails the read closed (UNKNOWN_CODE)', async () => {
    await set(`source = 'SOME_FUTURE_SOURCE'`);
    await expect(listCalendarEvents(db, LEGACY.gal)).rejects.toThrow(CalendarEventDataError);
    await expect(listCalendarEvents(db, LEGACY.gal)).rejects.toMatchObject({ field: 'source', reason: 'UNKNOWN_CODE' });
  });

  it('a TEXT_IMPORT event without its batch id fails the read closed', async () => {
    await set(`source = 'TEXT_IMPORT'`);
    await expect(listCalendarEvents(db, LEGACY.gal)).rejects.toMatchObject({ field: 'importBatchId' });
  });
});
