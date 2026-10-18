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
    const d = await open();
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
    const result = await runMigrations(d, migrations);
    expect(result).toEqual({ from: 18, to: 19, applied: ['sport_content_001'] });
    expectUnchangedExceptLaterSeeds(await dumpAll(d), rowsBefore, 18);
    expect(await schemaObjects(d)).toEqual(objectsBefore); // no CREATE, ALTER, DROP — not one object differs
    expect((await d.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check'))!.integrity_check).toBe('ok');
    expect(await d.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    // history and the inactive built-in state are exactly as they were
    expect(await d.getFirstAsync("SELECT active FROM exercises WHERE id = 'PLANK'")).toEqual({ active: 0 });
  });

  it('idempotent: a second run applies nothing and changes nothing', async () => {
    const d = await seedV18();
    await runMigrations(d, migrations);
    const rows = await dumpAll(d);
    expect(await runMigrations(d, migrations)).toEqual({ from: 19, to: 19, applied: [] });
    expect(await dumpAll(d)).toEqual(rows);
  });

  it('a v19 that fails part-way rolls back completely: user_version stays 18, no seeds, data intact; the same database then migrates cleanly', async () => {
    const d = await seedV18();
    const rows = await dumpAll(d);
    const broken = [...V18, { ...migrations[18]!, sql: `${migrations[18]!.sql}\nNOT VALID SQL;` }];
    await expect(runMigrations(d, broken)).rejects.toThrow();
    expect(await d.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 18 });
    expect(await dumpAll(d)).toEqual(rows);
    expect((await runMigrations(d, migrations)).to).toBe(19);
  });
});
