import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync } from 'expo-sqlite';

import { BUILTIN_ACTIVITY_TYPES } from '@/domain/activityType';
import {
  LEGACY,
  LEGACY_COMPLETED_AT,
  LEGACY_EVENTS,
  LEGACY_V6_EVENTS,
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
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { getPlayer } from '../players/playerRepository';
import { listSelfAssessments } from '../selfAssessments/selfAssessmentRepository';

type Db = ReturnType<typeof openNodeSqlite>;

/** Every user table in full (activity_types excepted: it is v7's own). */
async function dumpV6Data(db: Db) {
  return {
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT id, family_id, name, date_of_birth, height_cm, created_at, updated_at FROM players ORDER BY id'),
    player_sports: await db.getAllAsync('SELECT * FROM player_sports ORDER BY player_id, sport'),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    self_assessments: await db.getAllAsync('SELECT * FROM self_assessments ORDER BY id'),
    self_assessment_ratings: await db.getAllAsync(
      'SELECT * FROM self_assessment_ratings ORDER BY assessment_id, category',
    ),
    calendar_events: await db.getAllAsync(selectPreV13('calendar_events').replace('ORDER BY rowid', 'ORDER BY id')),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  };
}
const catalogRows = (db: Db) =>
  db.getAllAsync(
    'SELECT id, builtin, name, active, created_at, updated_at FROM activity_types ORDER BY rowid',
  );
const hasCatalog = async (db: Db) =>
  (await db.getFirstAsync<{ n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE name = 'activity_types'",
  ))!.n === 1;
const SEEDED = BUILTIN_ACTIVITY_TYPES.map((id) => ({
  id,
  builtin: 1,
  name: null,
  active: 1,
  created_at: 0,
  updated_at: 0,
}));

describe('migration v7 (activity types) on real SQLite', () => {
  let dir: string;
  let file: string;
  let handles: Db[];
  const openTracked = (path: string) => {
    const handle = openNodeSqlite(path);
    handles.push(handle);
    return handle;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gals-v7-'));
    file = join(dir, 'gals_coacher.db');
    handles = [];
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openTracked(file));
  });
  afterEach(() => {
    expect(handles.filter((h) => h.raw.isOpen)).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /** A realistic v6 file: both players, an assessment, events of all six types, one completed, Basketball inactive. */
  async function createV6Database() {
    const v6 = openTracked(file);
    await v6.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(v6, migrations.slice(0, 6));
    expect(await v6.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 6 });
    await seedV2Players(v6);
    await seedV3SelfAssessment(v6);
    await seedV4CalendarEvents(v6);
    await seedV6CalendarHistory(v6);
    expect(await hasCatalog(v6)).toBe(false);
    const data = await dumpV6Data(v6);
    expect(data.calendar_events).toHaveLength(6);
    await v6.closeAsync();
    return data;
  }

  it('fresh install: the six built-ins exactly once, active, no name; deletion refused', async () => {
    const { db, migration } = await openLocalDatabase();
    expect(migration.to).toBe(23);
    expect(migration.applied).toContain('activity_types');
    expect(await catalogRows(db as unknown as Db)).toEqual(SEEDED);
    expect(
      await db.getAllAsync(
        "SELECT type, name FROM sqlite_master WHERE tbl_name = 'activity_types' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual([
      { type: 'table', name: 'activity_types' },
      { type: 'trigger', name: 'activity_types_never_deleted' },
    ]);
    await expect(db.runAsync("DELETE FROM activity_types WHERE id = 'GAME'", [])).rejects.toThrow(
      /never deleted/,
    );
    expect(await catalogRows(db as unknown as Db)).toHaveLength(6);
    await db.closeAsync();
  });

  it('upgrades a realistic v6 database: every row unchanged; every type, completion and inactive sport kept', async () => {
    const before = await createV6Database();

    const { db, migration } = await openLocalDatabase();
    expect(migration).toEqual({ from: 6, to: 23, applied: ['activity_types', 'exercises', 'training', 'taxonomy', 'basketball_content', 'template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001', 'time_semantics_001', 'workout_templates_001'] });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 23 });
    // Byte-for-byte: no event row (type, dates, titles, notes, completion …) or other row changed.
    expect(await dumpV6Data(db as unknown as Db)).toEqual(before);
    expect(await catalogRows(db as unknown as Db)).toEqual(SEEDED);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();

    // Read through today's repositories: each event's type resolves to its own built-in.
    const gal = await listCalendarEvents(db, LEGACY.gal);
    const noa = await listCalendarEvents(db, LEGACY.noa);
    const byId = Object.fromEntries([...gal, ...noa].map((e) => [e.id, e]));
    expect(Object.keys(byId)).toHaveLength(6); // no duplicates, none lost
    const types = Object.fromEntries(Object.values(byId).map((e) => [e.id, [e.type, e.activityType]]));
    const ref = (code: string) => [code, { id: code, builtin: code, name: null, active: true }];
    expect(types).toEqual({
      [LEGACY_EVENTS.game]: ref('GAME'),
      [LEGACY_EVENTS.gym]: ref('GYM'),
      [LEGACY_V6_EVENTS.team]: ref('TEAM_TRAINING'),
      [LEGACY_V6_EVENTS.personal]: ref('PERSONAL_TRAINING'),
      [LEGACY_V6_EVENTS.recovery]: ref('RECOVERY'),
      [LEGACY_V6_EVENTS.other]: ref('OTHER'),
    });
    expect(byId[LEGACY_V6_EVENTS.team]!.completion).toEqual({
      completedAt: LEGACY_COMPLETED_AT,
      source: 'LOCAL_USER',
    });
    expect(byId[LEGACY_V6_EVENTS.team]!.sport).toBe('BASKETBALL'); // inactive sport, history kept
    expect(byId[LEGACY_V6_EVENTS.other]).toMatchObject({
      title: 'Photo day',
      notes: 'Team shirt',
      type: 'OTHER',
    });
    expect(byId[LEGACY_EVENTS.game]).toMatchObject({ title: 'Cup final', notes: 'Hall 2' });
    expect((await getPlayer(db, LEGACY.gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
    expect(await listSelfAssessments(db, LEGACY.gal, 'BASKETBALL')).toHaveLength(1);
    expect((await listActivityTypes(db)).map((t) => [t.id, t.active])).toEqual(
      BUILTIN_ACTIVITY_TYPES.map((id) => [id, true]),
    );
    const schema = await db.getAllAsync(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    await db.closeAsync();

    // Idempotent: reopening applies nothing and never re-seeds.
    const again = await openLocalDatabase();
    expect(again.migration).toEqual({ from: 23, to: 23, applied: [] });
    expect(await catalogRows(again.db as unknown as Db)).toEqual(SEEDED);
    expect(await dumpV6Data(again.db as unknown as Db)).toEqual(before);
    await again.db.closeAsync();

    // Fresh and upgraded databases have the same schema.
    const fresh = openNodeSqlite(':memory:');
    await runMigrations(fresh, migrations);
    expect(
      await fresh.getAllAsync(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    ).toEqual(schema);
    await fresh.closeAsync();
  });

  it('rolls back a v7 that fails part-way: user_version stays 6, no catalog, v6 data intact', async () => {
    const before = await createV6Database();
    const db = openTracked(file);
    await db.execAsync('PRAGMA foreign_keys = ON');
    // The real v7 SQL runs first (table, seed rows and trigger created), then fails.
    const broken = { ...migrations[6]!, sql: `${migrations[6]!.sql}\nNOT VALID SQL;` };
    await expect(runMigrations(db, [...migrations.slice(0, 6), broken])).rejects.toThrow();
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 6 });
    expect(await hasCatalog(db)).toBe(false);
    expect(await dumpV6Data(db)).toEqual(before);
    await db.closeAsync();

    const relaunch = await openLocalDatabase();
    expect(relaunch.migration).toEqual({ from: 6, to: 23, applied: ['activity_types', 'exercises', 'training', 'taxonomy', 'basketball_content', 'template_classification', 'calendar_event_import', 'player_team_name', 'player_archive', 'calendar_event_sync_links', 'planned_workout_composition', 'planned_workout_calendar_link', 'sport_content_001', 'sport_content_002', 'training_blocks_001', 'time_semantics_001', 'workout_templates_001'] });
    expect(await catalogRows(relaunch.db as unknown as Db)).toEqual(SEEDED);
    await relaunch.db.closeAsync();
  });

  it('refuses a newer schema (v10)', async () => {
    const newer = openTracked(file);
    await newer.execAsync('PRAGMA user_version = 24');
    await newer.closeAsync();
    await expect(openLocalDatabase()).rejects.toThrow(/v24 .* only knows v23\. Refusing to downgrade/);
  });
});

describe('v7 constraints enforced by SQLite itself', () => {
  let db: Db;
  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
  });
  afterEach(() => db.closeAsync());

  const insert = (values: string) =>
    db.execAsync(
      `INSERT INTO activity_types (id, builtin, name, active, created_at, updated_at) VALUES ${values}`,
    );
  const CUSTOM = '00000000-0000-4000-8000-0000000000a1';

  it('accepts a custom type (UUID id, a name) and active / inactive', async () => {
    await insert(`('${CUSTOM}', 0, 'Swim', 1, 5, 5)`);
    await db.runAsync('UPDATE activity_types SET active = 0 WHERE id = ?', [CUSTOM]);
    await db.runAsync('UPDATE activity_types SET active = 1 WHERE id = ?', [CUSTOM]);
  });

  it.each([
    ['a custom type without a name', `('${CUSTOM}', 0, NULL, 1, 5, 5)`],
    ['a blank name', `('${CUSTOM}', 0, '   ', 1, 5, 5)`],
    ['a built-in with a name', `('X_TYPE', 1, 'Swim', 1, 0, 0)`],
    ['active = 2', `('${CUSTOM}', 0, 'Swim', 2, 5, 5)`],
    ['builtin = 2', `('${CUSTOM}', 2, 'Swim', 1, 5, 5)`],
    ['a text timestamp', `('${CUSTOM}', 0, 'Swim', 1, 'now', 5)`],
    ['a duplicate built-in', `('GAME', 1, NULL, 1, 0, 0)`],
  ])('rejects %s', async (_name, values) => {
    await expect(insert(values)).rejects.toThrow(/CHECK|UNIQUE/);
  });

  it('never deletes a type, even one no event uses', async () => {
    await insert(`('${CUSTOM}', 0, 'Swim', 1, 5, 5)`);
    await expect(db.execAsync('DELETE FROM activity_types')).rejects.toThrow(/never deleted/);
    expect((await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM activity_types'))!.n).toBe(7);
  });
});
