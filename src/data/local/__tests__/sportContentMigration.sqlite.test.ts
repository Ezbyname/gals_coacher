import { FOOTBALL } from '@/domain/exercise/catalog/football';
import { SURFING } from '@/domain/exercise/catalog/surfing';
import { BUILTIN_TAXONOMY_NODES } from '@/domain/taxonomy/nodes';
import { createSequentialIdService } from '@/services/ids/IdService';
import { expectUnchangedExceptLaterSeeds, withLaterBuiltinRows } from '@/test-support/migrationSeeds';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { createCalendarEvent } from '../calendar/calendarEventRepository';
import { createPlayer } from '../players/playerRepository';
import { setExerciseActive } from '../exercises/exerciseRepository';
import { savePlannedWorkout } from '../training/plannedWorkoutCompositionRepository';
import { abandonSession, startSession } from '../training/trainingRepository';

/**
 * SPORT-CONTENT-001 — schema v19 `sport_content_001` (DATA ONLY): v18 → v19 keeps every existing user / history row and
 * every schema object exactly as they were; the only additions are the Surfing / Football built-in Exercise rows and
 * taxonomy node rows.
 */
type Db = ReturnType<typeof openNodeSqlite>;
const V18 = migrations.slice(0, 18);
const V19 = migrations.slice(0, 19);
const V20 = migrations.slice(0, 20);
const clock = { wallNow: () => new Date(2026, 9, 18, 12).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
const NEW_EXERCISES = [...SURFING, ...FOOTBALL].map((e) => e.id);
const NEW_NODES = BUILTIN_TAXONOMY_NODES.filter((n) => /^(FOOTBALL|SURFING)/.test(n.key)).map((n) => n.key);
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

const tableNames = async (d: Db) =>
  (await d.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);
async function dumpAll(d: Db): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of await tableNames(d)) out[t] = await d.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`);
  return out;
}
const schemaObjects = (d: Db) => d.getAllAsync<{ type: string; name: string; sql: string }>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");

/** A realistic v18: Players, a calendar with a linked workout, a custom exercise, plans, a closed session and a running one. */
async function seedV18(): Promise<Db> {
  const db = await open(V18);
  await withLaterBuiltinRows(db, 18, async () => {
    const mk = async (name: string) => {
      const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: { primaryPosition: 'PG' } }, deps);
      if (!r.ok) throw new Error('seed');
      return r.profile.player.id;
    };
    const gal = await mk('Gal');
    const noa = await mk('Noa');
    const save = async (playerId: string, name: string, exerciseIds: string[]) => {
      const r = await savePlannedWorkout(db, { planId: null, playerId, name, entries: exerciseIds.map((exerciseId) => ({ kind: 'EXERCISE', exerciseId, prescription: { sets: 3, target: 8, loadKg: null, restSec: 30 } }) as const) }, deps);
      if (!r.ok) throw new Error(JSON.stringify(r.errors));
      return r.plan.id;
    };
    const finished = await save(gal, 'Finished', ['PUSH_UP', 'FREE_THROWS']);
    const running = await save(noa, 'Running', ['PLANK']);
    await save(gal, 'Open', ['PUSH_UP']);
    const s1 = await startSession(db, finished, deps);
    await abandonSession(db, s1.id, { clock }); // a CLOSED session: history that must survive
    await startSession(db, running, deps);
    await createCalendarEvent(db, gal, { type: 'GAME', startAt: new Date(2026, 9, 20, 18).getTime(), endAt: null }, deps);
    await setExerciseActive(db, 'PLANK', false, { clock }); // an inactive built-in stays inactive
  });
  return db;
}

describe('migration v19 (sport content) on real SQLite', () => {
  it('a fresh database reaches v19; 21 exercise rows and the Football / Surfing nodes are seeded once, active, builtin', async () => {
    const d = await open(V19);
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 19 });
    const exercises = await d.getAllAsync<{ id: string; builtin: number; active: number; name: unknown }>(`SELECT id, builtin, active, name FROM exercises WHERE id IN (${NEW_EXERCISES.map((i) => `'${i}'`).join(',')})`);
    expect(exercises).toHaveLength(21);
    for (const r of exercises) expect([r.builtin, r.active, r.name]).toEqual([1, 1, null]);
    const nodes = await d.getAllAsync<{ id: string; builtin: number; active: number }>(`SELECT id, builtin, active FROM taxonomy_nodes WHERE id IN (${NEW_NODES.map((i) => `'${i}'`).join(',')})`);
    expect(nodes.map((n) => n.id).sort()).toEqual([...NEW_NODES].sort());
    for (const n of nodes) expect([n.builtin, n.active]).toEqual([1, 1]);
  });

  it('v18 → v19: every existing row of every table is unchanged, the only additions are the seeds; no schema object changes', async () => {
    const d = await seedV18();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
    const rowsBefore = await dumpAll(d);
    const objectsBefore = await schemaObjects(d);
    expect(rowsBefore.session_exercises!.length).toBeGreaterThan(0);
    const result = await runMigrations(d, V19);
    expect(result).toEqual({ from: 18, to: 19, applied: ['sport_content_001'] });
    expectUnchangedExceptLaterSeeds(await dumpAll(d), rowsBefore, 18, 19);
    expect(await schemaObjects(d)).toEqual(objectsBefore); // no CREATE, ALTER, DROP — not one object differs
    expect((await d.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check'))!.integrity_check).toBe('ok');
    expect(await d.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // history and the inactive built-in state are exactly as they were
    expect(await d.getFirstAsync("SELECT active FROM exercises WHERE id = 'PLANK'")).toEqual({ active: 0 });
  });

  it('idempotent: a second run applies nothing and changes nothing', async () => {
    const d = await seedV18();
    await runMigrations(d, V19);
    const rows = await dumpAll(d);
    expect(await runMigrations(d, V19)).toEqual({ from: 19, to: 19, applied: [] });
    expect(await dumpAll(d)).toEqual(rows);
  });

  it('a v19 that fails part-way rolls back completely: user_version stays 18, no seeds, data intact; the same database then migrates cleanly', async () => {
    const d = await seedV18();
    const rows = await dumpAll(d);
    const broken = [...V18, { ...migrations[18]!, sql: `${migrations[18]!.sql}\nNOT VALID SQL;` }];
    await expect(runMigrations(d, broken)).rejects.toThrow();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
    expect(await dumpAll(d)).toEqual(rows);
    expect((await runMigrations(d, V19)).to).toBe(19);
  });
});

/** SPORT-CONTENT-002 — schema v20 `sport_content_002` (DATA ONLY): the one new built-in Exercise, the Basketball box-out drill. */
describe('migration v20 (sport content 002) on real SQLite', () => {
  async function seedV19(): Promise<Db> {
    const db = await open(V19);
    await withLaterBuiltinRows(db, 19, async () => {
      const r = await createPlayer(db, { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: { primaryPosition: 'PG' } }, deps);
      if (!r.ok) throw new Error('seed');
      const plan = await savePlannedWorkout(db, { planId: null, playerId: r.profile.player.id, name: 'Plan', entries: [{ kind: 'EXERCISE', exerciseId: 'PUSH_UP', prescription: { sets: 3, target: 8, loadKg: null, restSec: 30 } }] }, deps);
      if (!plan.ok) throw new Error('seed');
      await startSession(db, plan.plan.id, deps);
      await setExerciseActive(db, 'PLANK', false, { clock }); // an inactive built-in: an UPDATE would flip it
    });
    return db;
  }

  it('v19 → v20: every existing row and every schema object is unchanged; the only addition is the BOX_OUT_DRILL row (builtin, active)', async () => {
    const d = await seedV19();
    const rowsBefore = await dumpAll(d);
    const objectsBefore = await schemaObjects(d);
    expect(await runMigrations(d, V20)).toEqual({ from: 19, to: 20, applied: ['sport_content_002'] });
    expectUnchangedExceptLaterSeeds(await dumpAll(d), rowsBefore, 19, 20);
    expect(await schemaObjects(d)).toEqual(objectsBefore);
    expect(await d.getFirstAsync("SELECT builtin, active, name FROM exercises WHERE id = 'BOX_OUT_DRILL'")).toEqual({ builtin: 1, active: 1, name: null });
    expect(await d.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
  });

  it('a v20 that fails part-way rolls back completely; the same database then migrates cleanly; a second run applies nothing', async () => {
    const d = await seedV19();
    const rows = await dumpAll(d);
    const broken = [...V19, { ...migrations[19]!, sql: `${migrations[19]!.sql}\nNOT VALID SQL;` }];
    await expect(runMigrations(d, broken)).rejects.toThrow();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 19 });
    expect(await dumpAll(d)).toEqual(rows);
    expect((await runMigrations(d, V20)).to).toBe(20);
    expect(await runMigrations(d, V20)).toEqual({ from: 20, to: 20, applied: [] });
  });

  it('v18 → v20 in one go applies both content migrations in order', async () => {
    const d = await seedV18();
    expect(await runMigrations(d, V20)).toEqual({ from: 18, to: 20, applied: ['sport_content_001', 'sport_content_002'] });
  });
});

/** TRAINING-BLOCKS-001 — schema v21 `training_blocks_001` (DATA ONLY): the six new general-athletic built-in Exercises. */
const V21_IDS = ['DROP_LANDING_STICK', 'SINGLE_LEG_HOP_STICK', 'DECEL_STOP', 'PARTNER_MIRROR_DRILL', 'COACH_CUE_REACTION_SPRINT', 'RUN_INTERVALS'];
describe('migration v21 (training blocks 001) on real SQLite', () => {
  async function seedV20(): Promise<Db> {
    const db = await open(V20);
    await withLaterBuiltinRows(db, 20, async () => {
      const r = await createPlayer(db, { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: { primaryPosition: 'PG' } }, deps);
      if (!r.ok) throw new Error('seed');
      const plan = await savePlannedWorkout(db, { planId: null, playerId: r.profile.player.id, name: 'Plan', entries: [{ kind: 'EXERCISE', exerciseId: 'PUSH_UP', prescription: { sets: 3, target: 8, loadKg: null, restSec: 60 } }] }, deps);
      if (!plan.ok) throw new Error('seed');
      await startSession(db, plan.plan.id, deps);
      await setExerciseActive(db, 'PLANK', false, { clock }); // an inactive built-in: an UPDATE would flip it
    });
    return db;
  }

  it('v20 → v21: every existing row and every schema object is unchanged; the ONLY additions are the six approved Exercise rows (builtin, active, no name)', async () => {
    const d = await seedV20();
    const rowsBefore = await dumpAll(d);
    const objectsBefore = await schemaObjects(d);
    expect(await runMigrations(d, migrations)).toEqual({ from: 20, to: 21, applied: ['training_blocks_001'] });
    const after = await dumpAll(d);
    expectUnchangedExceptLaterSeeds(after, rowsBefore, 20);
    const added = (after.exercises as { id: string }[]).filter((r) => !(rowsBefore.exercises as { id: string }[]).some((b) => b.id === r.id)).map((r) => r.id);
    expect(added).toEqual(V21_IDS);
    expect(await schemaObjects(d)).toEqual(objectsBefore); // no table, column, index or trigger added or changed
    for (const id of V21_IDS) {
      expect(await d.getFirstAsync('SELECT builtin, active, name FROM exercises WHERE id = ?', [id])).toEqual({ builtin: 1, active: 1, name: null });
    }
    expect(await d.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
  });

  it('the migration SQL is INSERT-only: no ALTER, CREATE, DROP, DELETE or UPDATE', () => {
    const sql = migrations[20]!.sql;
    expect(migrations[20]!.version).toBe(21);
    expect(sql).not.toMatch(/\b(ALTER|CREATE|DROP|DELETE|UPDATE|REPLACE|TRIGGER)\b/i);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect([...sql.matchAll(/\('([A-Z0-9_]+)', 1, NULL, 1, 0, 0\)/g)].map((m) => m[1])).toEqual(V21_IDS);
  });

  it('a v21 that fails part-way rolls back completely; the same database then migrates cleanly; a second run applies nothing', async () => {
    const d = await seedV20();
    const rows = await dumpAll(d);
    const broken = [...V20, { ...migrations[20]!, sql: `${migrations[20]!.sql}\nNOT VALID SQL;` }];
    await expect(runMigrations(d, broken)).rejects.toThrow();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 20 });
    expect(await dumpAll(d)).toEqual(rows);
    expect((await runMigrations(d, migrations)).to).toBe(21);
    expect(await runMigrations(d, migrations)).toEqual({ from: 21, to: 21, applied: [] });
  });

  it('v19 → v21 in one go applies both migrations in order', async () => {
    const d = await open(V19);
    expect(await runMigrations(d, migrations)).toEqual({ from: 19, to: 21, applied: ['sport_content_002', 'training_blocks_001'] });
  });
});
