import { expectUnchangedExceptLaterSeeds, withLaterBuiltinRows } from '@/test-support/migrationSeeds';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { listCalendarEvents } from '../calendar/calendarEventRepository';
import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { archivePlayer, createPlayer } from '../players/playerRepository';
import { savePlannedWorkout } from '../training/plannedWorkoutCompositionRepository';
import { abandonSession, getPlannedWorkout, listTraining, startSession } from '../training/trainingRepository';

/**
 * QB-WORKOUT-BUILDER-001D — schema v18 (MIG-18-01…07): one nullable column on calendar_events, a partial unique index
 * and four guard triggers. The v17 database is built realistically (players, plans, a started plan with a session,
 * hand-entered / completed / imported-looking events written exactly as v17 wrote them), then migrated.
 */
type Db = ReturnType<typeof openNodeSqlite>;
const T0 = new Date(2026, 9, 16, 17).getTime();
const clock = { wallNow: () => T0, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
const rx = (sets: number, target: number | null): Prescription => ({ sets, target, loadKg: null, restSec: 60 });
const V17 = migrations.filter((m) => m.version <= 17);
let dbs: Db[] = [];

async function open(list = migrations): Promise<Db> {
  const d = openNodeSqlite(':memory:');
  dbs.push(d);
  await d.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(d, list);
  return d;
}
afterEach(async () => {
  for (const d of dbs) await d.closeAsync();
  dbs = [];
});

/** An event as v17 stored it (no link column exists yet). */
async function rawEvent(d: Db, playerId: string, id: string, extra: { completed?: boolean; imported?: boolean } = {}) {
  await d.runAsync(
    `INSERT INTO calendar_events (id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at,
       completed_at, completion_source, location, source, import_batch_id) VALUES (?, ?, 'PERSONAL_TRAINING', NULL, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
    [id, playerId, T0 + 86_400_000, T0 + 90_000_000, `event ${id}`, T0, T0, extra.completed ? T0 : null, extra.completed ? 'LOCAL_USER' : null, extra.imported ? 'TEXT_IMPORT' : null, extra.imported ? ids.newUuid() : null],
  );
}

async function plan(d: Db, playerId: string, name: string): Promise<string> {
  const r = await savePlannedWorkout(d, { planId: null, playerId, name, entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: rx(2, 30) }] }, deps);
  if (!r.ok) throw new Error('seed');
  return r.plan.id;
}

interface Seed {
  db: Db;
  gal: string;
  noa: string;
  openPlan: string;
  startedPlan: string;
  events: { hand: string; done: string; imported: string };
}
async function seedV17(): Promise<Seed> {
  const db = await open(V17);
  // today's repositories read every built-in exercise: the rows of LATER migrations exist only while seeding
  return withLaterBuiltinRows(db, 17, () => seedV17Rows(db));
}
async function seedV17Rows(db: Db): Promise<Seed> {
  const mk = async (name: string) => {
    const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
    if (!r.ok) throw new Error('seed');
    return r.profile.player.id;
  };
  const gal = await mk('Gal');
  const noa = await mk('Noa');
  const openPlan = await plan(db, gal, 'Open plan');
  const startedPlan = await plan(db, gal, 'Started plan');
  const session = await startSession(db, startedPlan, deps);
  await abandonSession(db, session.id, { clock }); // a session EXISTS for the plan (frozen), none is running
  const events = { hand: ids.newUuid(), done: ids.newUuid(), imported: ids.newUuid() };
  await rawEvent(db, gal, events.hand);
  await rawEvent(db, gal, events.done, { completed: true });
  await rawEvent(db, noa, events.imported, { imported: true });
  return { db, gal, noa, openPlan, startedPlan, events };
}

type Columns = Record<string, string[]>;
const tableNames = async (d: Db) =>
  (await d.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);
const columnsOf = async (d: Db): Promise<Columns> => {
  const out: Columns = {};
  for (const t of await tableNames(d)) out[t] = (await d.getAllAsync<{ name: string }>(`SELECT name FROM pragma_table_info('${t}') ORDER BY cid`)).map((c) => c.name);
  return out;
};
const dumpWith = async (d: Db, columns: Columns) => {
  const out: Record<string, unknown[]> = {};
  for (const [t, cols] of Object.entries(columns)) out[t] = await d.getAllAsync(`SELECT ${cols.join(', ')} FROM ${t} ORDER BY rowid`);
  return out;
};
const names = async (d: Db, type: 'trigger' | 'index') =>
  (await d.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = '${type}' AND name NOT LIKE 'sqlite_%' ORDER BY name`)).map((r) => r.name);
const objects = async (d: Db) => d.getAllAsync<{ type: string; name: string; sql: string }>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");

const NEW_TRIGGERS = ['calendar_events_plan_link_fixed', 'calendar_events_plan_not_started', 'calendar_events_plan_player_fixed', 'calendar_events_plan_same_player'];

describe('migration v18 (planned workout ↔ calendar link) on real SQLite', () => {
  it('MIG-18-01: a fresh database reaches v18: a nullable FK column, the partial unique index and the four guards', async () => {
    const d = await open();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
    const col = await d.getAllAsync("SELECT name, type, \"notnull\" AS not_null, dflt_value FROM pragma_table_info('calendar_events') WHERE name = 'planned_workout_id'");
    expect(col).toEqual([{ name: 'planned_workout_id', type: 'TEXT', not_null: 0, dflt_value: null }]);
    expect(await d.getAllAsync("SELECT \"table\", \"from\", \"to\" FROM pragma_foreign_key_list('calendar_events') WHERE \"from\" = 'planned_workout_id'")).toEqual([
      { table: 'planned_workouts', from: 'planned_workout_id', to: 'id' },
    ]);
    const idx = await d.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'calendar_events_one_per_plan'");
    expect(idx!.sql).toMatch(/CREATE UNIQUE INDEX calendar_events_one_per_plan ON calendar_events \(planned_workout_id\)\s+WHERE planned_workout_id IS NOT NULL/);
    expect((await names(d, 'trigger')).filter((n) => n.startsWith('calendar_events_plan_'))).toEqual(NEW_TRIGGERS);
    expect((await d.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check'))!.integrity_check).toBe('ok');
    expect(await d.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('MIG-18-02: v17 → v18 succeeds; every existing row of every table is unchanged; the link is NULL; only the expected objects change', async () => {
    const { db } = await seedV17();
    const columns = await columnsOf(db);
    const rows = await dumpWith(db, columns);
    const before = await objects(db);
    const result = await runMigrations(db, migrations);
    expect(result.from).toBe(17);
    expect(result.to).toBe(20);
    expect(result.applied).toEqual(['planned_workout_calendar_link', 'sport_content_001', 'sport_content_002']);
    expectUnchangedExceptLaterSeeds(await dumpWith(db, columns), rows, 17); // byte-for-byte what it was
    expect(await db.getAllAsync('SELECT DISTINCT planned_workout_id FROM calendar_events')).toEqual([{ planned_workout_id: null }]);
    const after = await objects(db);
    const added = after.filter((o) => !before.some((b) => b.name === o.name)).map((o) => `${o.type}:${o.name}`);
    expect(added).toEqual(['index:calendar_events_one_per_plan', ...NEW_TRIGGERS.map((n) => `trigger:${n}`)]);
    const changed = after.filter((o) => before.some((b) => b.name === o.name && b.sql !== o.sql)).map((o) => o.name);
    expect(changed).toEqual(['calendar_events']); // the one table that gained the column
    expect(before.filter((b) => !after.some((o) => o.name === b.name))).toEqual([]); // nothing dropped
    expect((await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check'))!.integrity_check).toBe('ok');
  });

  it('MIG-18-03: idempotent: a second run applies nothing and changes nothing', async () => {
    const { db } = await seedV17();
    await runMigrations(db, migrations);
    const columns = await columnsOf(db);
    const rows = await dumpWith(db, columns);
    const objs = await objects(db);
    const again = await runMigrations(db, migrations);
    expect(again).toEqual({ from: 20, to: 20, applied: [] });
    expect(await columnsOf(db)).toEqual(columns);
    expect(await dumpWith(db, columns)).toEqual(rows);
    expect(await objects(db)).toEqual(objs);
  });

  it('MIG-18-04: legacy rows stay readable and usable: events, plans, the finished session history', async () => {
    const { db, gal, noa, openPlan, startedPlan, events } = await seedV17();
    await runMigrations(db, migrations);
    expect((await listCalendarEvents(db, gal)).map((e) => [e.id, e.title, e.completion !== null])).toEqual([
      [events.hand, `event ${events.hand}`, false],
      [events.done, `event ${events.done}`, true],
    ]);
    expect((await listCalendarEvents(db, noa)).map((e) => [e.id, e.source])).toEqual([[events.imported, 'TEXT_IMPORT']]);
    expect((await getPlannedWorkout(db, startedPlan))!.sessionId).not.toBeNull();
    expect((await listTraining(db, gal)).planned.map((p) => p.id)).toEqual([openPlan]); // the started plan is performed, not planned
  });

  it('MIG-18-05: the database itself enforces the relationship (index, FK, same Player, not started, link fixed)', async () => {
    const { db, gal, noa, openPlan, startedPlan } = await seedV17();
    await runMigrations(db, migrations);
    const insert = (id: string, player: string, planId: string | null) =>
      db.runAsync(
        `INSERT INTO calendar_events (id, player_id, type, start_at, created_at, updated_at, planned_workout_id) VALUES (?, ?, 'PERSONAL_TRAINING', ?, ?, ?, ?)`,
        [id, player, T0 + 1000, T0, T0, planId],
      );
    await insert('ok-1', gal, openPlan); // the allowed case: own Player, plan without a session
    await expect(insert('dup', gal, openPlan)).rejects.toThrow(/UNIQUE/); // one event per plan
    await expect(insert('ghost', gal, 'no-such-plan')).rejects.toThrow(); // FK (and the same-player guard)
    const noaPlan = await plan(db, noa, 'Noa plan');
    await expect(insert('cross', gal, noaPlan)).rejects.toThrow(/own player only/);
    await expect(insert('started', gal, startedPlan)).rejects.toThrow(/started workout cannot be newly scheduled/);
    // the link never changes: not attach (NULL -> plan), not swap, not detach
    await insert('plain', gal, null);
    await expect(db.runAsync('UPDATE calendar_events SET planned_workout_id = ? WHERE id = ?', [noaPlan, 'plain'])).rejects.toThrow(/never changes/);
    await expect(db.runAsync('UPDATE calendar_events SET planned_workout_id = NULL WHERE id = ?', ['ok-1'])).rejects.toThrow(/never changes/);
    const another = await plan(db, gal, 'Another');
    await expect(db.runAsync('UPDATE calendar_events SET planned_workout_id = ? WHERE id = ?', [another, 'ok-1'])).rejects.toThrow(/never changes/);
    // a linked event never moves to another Player; editing other fields is fine
    await expect(db.runAsync('UPDATE calendar_events SET player_id = ? WHERE id = ?', [noa, 'ok-1'])).rejects.toThrow(/own player/);
    await db.runAsync("UPDATE calendar_events SET start_at = start_at + 60000, title = 'x' WHERE id = 'ok-1'");
    // a session that starts LATER does not touch an existing link
    await startSession(db, openPlan, deps);
    expect(await db.getFirstAsync("SELECT planned_workout_id FROM calendar_events WHERE id = 'ok-1'")).toEqual({ planned_workout_id: openPlan });
    // deleting the event (= unschedule) leaves the plan; deleting a plan is still refused
    await db.runAsync("DELETE FROM calendar_events WHERE id = 'ok-1'");
    expect(await getPlannedWorkout(db, openPlan)).not.toBeNull();
    await expect(db.runAsync('DELETE FROM planned_workouts WHERE id = ?', [openPlan])).rejects.toThrow();
  });

  it('MIG-18-06: an archived Player gets no new linked event', async () => {
    const { db, gal } = await seedV17();
    await runMigrations(db, migrations);
    const p = await plan(db, gal, 'Before archive');
    await archivePlayer(db, gal, { clock });
    await expect(
      db.runAsync(`INSERT INTO calendar_events (id, player_id, type, start_at, created_at, updated_at, planned_workout_id) VALUES ('arch', ?, 'PERSONAL_TRAINING', ?, ?, ?, ?)`, [gal, T0 + 1000, T0, T0, p]),
    ).rejects.toThrow(/archived player/);
  });

  it('MIG-18-07: a v18 that fails part-way rolls back completely: user_version stays 17, no column, no guards, data intact', async () => {
    const { db } = await seedV17();
    const columns = await columnsOf(db);
    const rows = await dumpWith(db, columns);
    const triggersBefore = await names(db, 'trigger');
    const indexesBefore = await names(db, 'index');
    const broken = [...V17, { ...migrations[17]!, sql: `${migrations[17]!.sql}\nCREATE TABLE calendar_events (id TEXT);` }];
    await expect(runMigrations(db, broken)).rejects.toThrow(/already exists/);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 17 });
    expect(await columnsOf(db)).toEqual(columns); // no planned_workout_id
    expect(await names(db, 'trigger')).toEqual(triggersBefore);
    expect(await names(db, 'index')).toEqual(indexesBefore);
    expect(await dumpWith(db, columns)).toEqual(rows);
    expect((await runMigrations(db, migrations)).to).toBe(20); // the same database then migrates cleanly
  });
});
