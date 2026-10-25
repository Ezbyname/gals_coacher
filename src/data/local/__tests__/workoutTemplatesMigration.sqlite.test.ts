import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { createPlayer } from '../players/playerRepository';
import { savePlannedWorkout } from '../training/plannedWorkoutCompositionRepository';
import { abandonSession, startSession } from '../training/trainingRepository';

/**
 * WORKOUT-TEMPLATES-001 — schema v23 `workout_templates_001` (ADDITIVE, owner-approved): the Family's personal workout templates.
 * v22 -> v23 creates three tables, two indexes and ten triggers and changes NOTHING else: every existing row of every table is
 * byte-for-byte what it was and every existing schema object keeps its exact SQL.
 */
type Db = ReturnType<typeof openNodeSqlite>;
const V22 = migrations.slice(0, 22);
const clock = { wallNow: () => new Date(2026, 9, 25, 12).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
let dbs: Db[] = [];
afterEach(async () => {
  for (const d of dbs) if (d.raw.isOpen) await d.closeAsync();
  dbs = [];
});

async function open(list = migrations): Promise<Db> {
  const d = openNodeSqlite(':memory:');
  dbs.push(d);
  await d.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(d, list);
  return d;
}
const tableNames = async (d: Db) => (await d.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);
async function dumpAll(d: Db, only?: string[]): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of only ?? (await tableNames(d))) out[t] = await d.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`);
  return out;
}
type Obj = { type: string; name: string; sql: string | null };
const schemaObjects = (d: Db) => d.getAllAsync<Obj>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");

/** A realistic v22: two Players, plans (one started and finished, one running, one open) with time semantics, and their sessions. */
async function seedV22(): Promise<Db> {
  const db = await open(V22);
  const mk = async (name: string) => {
    const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: { primaryPosition: 'PG' } }, deps);
    if (!r.ok) throw new Error('seed');
    return r.profile.player.id;
  };
  const gal = await mk('Gal');
  const noa = await mk('Noa');
  const save = async (playerId: string, name: string, exerciseIds: string[]) => {
    const r = await savePlannedWorkout(db, { planId: null, playerId, name, entries: exerciseIds.map((exerciseId) => ({ kind: 'EXERCISE', exerciseId, prescription: { sets: 3, target: 20, loadKg: null, restSec: 45, ...(exerciseId === 'PLANK' ? { timeSemantics: 'COMPLETION_TIME_CAP' as const } : {}) } }) as const) }, deps);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.plan.id;
  };
  const finished = await save(gal, 'Finished', ['PUSH_UP', 'PLANK']);
  const running = await save(noa, 'Running', ['SPRINT_10M']);
  await save(gal, 'Open', ['PUSH_UP']);
  const s1 = await startSession(db, finished, deps);
  await abandonSession(db, s1.id, { clock });
  await startSession(db, running, deps);
  return db;
}

describe('migration v23 (personal workout templates) on real SQLite', () => {
  it('MIG-23-01: v22 → v23 applies exactly workout_templates_001; every existing row and every existing object is unchanged; only the new objects appear', async () => {
    const d = await seedV22();
    const rowsBefore = await dumpAll(d);
    const objectsBefore = await schemaObjects(d);
    expect(Object.keys(rowsBefore)).not.toContain('user_workout_templates');
    expect(await runMigrations(d, migrations)).toEqual({ from: 22, to: 23, applied: ['workout_templates_001'] });
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 23 });
    // every pre-existing table: byte for byte
    expect(await dumpAll(d, Object.keys(rowsBefore))).toEqual(rowsBefore);
    // every pre-existing object keeps its exact SQL; nothing dropped
    const after = await schemaObjects(d);
    for (const o of objectsBefore) expect(after.find((a) => a.name === o.name && a.type === o.type)?.sql).toBe(o.sql);
    const added = after.filter((a) => !objectsBefore.some((o) => o.name === a.name)).map((a) => `${a.type}:${a.name}`);
    expect(added).toEqual([
      'index:user_workout_template_sections_one_role',
      'index:user_workout_templates_active_name',
      'table:user_workout_template_items',
      'table:user_workout_template_sections',
      'table:user_workout_templates',
      'trigger:user_workout_template_items_frozen_update',
      'trigger:user_workout_template_items_never_deleted',
      'trigger:user_workout_template_items_sealed_insert',
      'trigger:user_workout_template_sections_frozen_update',
      'trigger:user_workout_template_sections_never_deleted',
      'trigger:user_workout_template_sections_sealed_insert',
      'trigger:user_workout_templates_edit_after_seal',
      'trigger:user_workout_templates_identity_frozen',
      'trigger:user_workout_templates_never_deleted',
      'trigger:user_workout_templates_seal_complete',
    ]);
    // the new tables start empty: nothing was migrated into them
    for (const t of ['user_workout_templates', 'user_workout_template_sections', 'user_workout_template_items']) {
      expect((await d.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${t}`))!.n).toBe(0);
    }
    expect(await d.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
    expect(await d.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
  });

  it('MIG-23-02: idempotent: a second run applies nothing and changes nothing', async () => {
    const d = await seedV22();
    await runMigrations(d, migrations);
    const rows = await dumpAll(d);
    const objects = await schemaObjects(d);
    expect(await runMigrations(d, migrations)).toEqual({ from: 23, to: 23, applied: [] });
    expect(await dumpAll(d)).toEqual(rows);
    expect(await schemaObjects(d)).toEqual(objects);
  });

  it('MIG-23-03: a v23 that fails part-way rolls back completely: user_version stays 22, no new object, data intact; then it migrates cleanly', async () => {
    const d = await seedV22();
    const rows = await dumpAll(d);
    const objects = await schemaObjects(d);
    const broken = [...V22, { ...migrations[22]!, sql: `${migrations[22]!.sql}\nNOT VALID SQL;` }];
    await expect(runMigrations(d, broken)).rejects.toThrow();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 22 });
    expect(await schemaObjects(d)).toEqual(objects);
    expect(await dumpAll(d)).toEqual(rows);
    expect((await runMigrations(d, migrations)).to).toBe(23);
  });

  it('MIG-23-04: a fresh install and an upgrade end with the same schema; the migration SQL changes no existing table', async () => {
    const upgraded = await seedV22();
    await runMigrations(upgraded, migrations);
    const fresh = await open();
    const shape = async (d: Db) => (await schemaObjects(d)).map((o) => [o.type, o.name, (o.sql ?? '').replace(/\s+/g, ' ')]);
    expect(await shape(upgraded)).toEqual(await shape(fresh));
    const sql = migrations[22]!.sql;
    expect(migrations[22]).toMatchObject({ version: 23, name: 'workout_templates_001' });
    expect(sql).not.toMatch(/\b(ALTER|DROP|UPDATE\s+(?!user_workout_templates)\w|DELETE\s+FROM|REPLACE)\b/i);
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(3);
    // every table it creates is a NEW user_workout_template* table
    expect([...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1])).toEqual(['user_workout_templates', 'user_workout_template_sections', 'user_workout_template_items']);
  });
});
