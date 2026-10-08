import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { CustomExerciseInput } from '@/domain/exercise/exercise';
import { BUILTIN_TAXONOMY_NODES } from '@/domain/taxonomy/nodes';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../../database';
import { createCustomExercise } from '../../exercises/exerciseRepository';
import { ClassificationRefusedError, TaxonomyDataError, TaxonomyNodeNotFoundError } from '../errors';
import { readTaxonomy, setCustomExerciseTaxonomy, setTaxonomyNodeActive } from '../taxonomyRepository';

const T0 = new Date(2026, 9, 7, 9).getTime();
const HOUR = 3_600_000;
const FAMILY = '00000000-0000-4000-8000-00000000f0f0';

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}

const SLED_DRAG: CustomExerciseInput = {
  name: 'Sled Drag',
  categories: ['STRENGTH', 'CONDITIONING'],
  primaryMuscles: ['QUADRICEPS', 'GLUTES'],
  secondaryMuscles: [],
  difficulty: 'BEGINNER',
  sports: [],
  equipment: [['SLED']],
  measurementType: 'TIME',
  comparison: null,
  usesLoad: true,
  instructions: '',
  tutorialUrl: '',
};

describe('taxonomy repository on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  const nodeRow = (key: string) =>
    db.getFirstAsync<{ active: number; updated_at: number }>(
      'SELECT active, updated_at FROM taxonomy_nodes WHERE id = ?',
      [key],
    );
  const memberships = () => db.getAllAsync('SELECT * FROM exercise_taxonomy ORDER BY exercise_id, node_id');
  const customExercise = async () => {
    const result = await createCustomExercise(db, SLED_DRAG, { ids, clock });
    if (!result.ok) throw new Error('fixture exercise refused');
    return result.exercise.id;
  };
  const reopen = async () => {
    await db.closeAsync();
    db = (await openLocalDatabase()).db;
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-tax-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the curated tree: every node, active, with the curated many-to-many membership', async () => {
    const t = await readTaxonomy(db);
    expect(t.nodes.map((n) => n.key)).toEqual(BUILTIN_TAXONOMY_NODES.map((n) => n.key));
    expect(t.nodes.every((n) => n.active)).toBe(true);
    expect(t.nodesOf('DEADLIFT')).toEqual(['FITNESS_BACK', 'FITNESS_LEGS_HINGE', 'FITNESS_FULL_BODY', 'FITNESS_STRENGTH']);
    expect(await memberships()).toEqual([]); // built-in membership is curated in code, never stored
  });

  it('makes a node inactive and active again: idempotent, stamped, memberships untouched, survives a restart', async () => {
    const before = (await readTaxonomy(db)).directMembers('FITNESS_LEGS_HINGE');
    clock.set(T0 + HOUR);
    const off = await setTaxonomyNodeActive(db, 'FITNESS_LEGS_HINGE', false, { clock });
    expect(off.node('FITNESS_LEGS_HINGE')!.active).toBe(false);
    expect(off.directMembers('FITNESS_LEGS_HINGE')).toEqual(before);
    expect(await nodeRow('FITNESS_LEGS_HINGE')).toEqual({ active: 0, updated_at: T0 + HOUR });

    clock.set(T0 + 2 * HOUR);
    await setTaxonomyNodeActive(db, 'FITNESS_LEGS_HINGE', false, { clock }); // no change → no write
    expect(await nodeRow('FITNESS_LEGS_HINGE')).toEqual({ active: 0, updated_at: T0 + HOUR });

    await reopen();
    expect((await readTaxonomy(db)).node('FITNESS_LEGS_HINGE')!.active).toBe(false);
    const on = await setTaxonomyNodeActive(db, 'FITNESS_LEGS_HINGE', true, { clock });
    expect(on.node('FITNESS_LEGS_HINGE')!.active).toBe(true);
    await expect(setTaxonomyNodeActive(db, 'NOPE', false, { clock })).rejects.toBeInstanceOf(
      TaxonomyNodeNotFoundError,
    );
  });

  it('never deletes a node', async () => {
    await expect(db.runAsync("DELETE FROM taxonomy_nodes WHERE id = 'FITNESS_ARMS'")).rejects.toThrow(
      /never deleted/,
    );
    expect(await nodeRow('FITNESS_ARMS')).toEqual({ active: 1, updated_at: 0 });
  });

  it('classifies a custom exercise (many-to-many), replaces it, and keeps it across a restart', async () => {
    const id = await customExercise();
    clock.set(T0 + HOUR);
    expect(
      await setCustomExerciseTaxonomy(db, id, ['FITNESS_STRENGTH', 'FITNESS_LEGS_SQUAT_LUNGE', 'FITNESS_STRENGTH'], {
        clock,
      }),
    ).toEqual(['FITNESS_LEGS_SQUAT_LUNGE', 'FITNESS_STRENGTH']);
    const t = await readTaxonomy(db);
    expect(t.exerciseIdsUnder('FITNESS_LEGS')).toContain(id);
    expect(t.exerciseIdsUnder('FITNESS_STRENGTH')).toContain(id);

    expect(await setCustomExerciseTaxonomy(db, id, ['FITNESS_CONDITIONING'], { clock })).toEqual([
      'FITNESS_CONDITIONING',
    ]);
    await reopen();
    expect((await readTaxonomy(db)).nodesOf(id)).toEqual(['FITNESS_CONDITIONING']);
    expect(await memberships()).toEqual([{ exercise_id: id, node_id: 'FITNESS_CONDITIONING', created_at: T0 + HOUR }]);
    expect(await setCustomExerciseTaxonomy(db, id, [], { clock })).toEqual([]);
  });

  it('refuses: built-in exercises (curated only), unknown exercise / node, a NEW inactive node — nothing written', async () => {
    const id = await customExercise();
    const refusal = async (exerciseId: string, keys: string[]) => {
      const error = await setCustomExerciseTaxonomy(db, exerciseId, keys, { clock }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClassificationRefusedError);
      return (error as ClassificationRefusedError).reason;
    };
    expect(await refusal('DEADLIFT', ['FITNESS_ARMS'])).toBe('BUILTIN_EXERCISE');
    expect(await refusal('00000000-0000-4000-8000-000000000999', ['FITNESS_ARMS'])).toBe('EXERCISE_NOT_FOUND');
    expect(await refusal(id, ['FITNESS_ARMS', 'NOPE'])).toBe('UNKNOWN_NODE');
    await setTaxonomyNodeActive(db, 'FITNESS_ARMS', false, { clock });
    expect(await refusal(id, ['FITNESS_ARMS'])).toBe('INACTIVE_NODE');
    expect(await memberships()).toEqual([]);
    // The database itself refuses to classify a built-in exercise.
    await expect(
      db.runAsync("INSERT INTO exercise_taxonomy (exercise_id, node_id, created_at) VALUES ('DEADLIFT', 'FITNESS_ARMS', 1)"),
    ).rejects.toThrow(/curated taxonomy/);
  });

  it('keeps an existing membership in a node that became inactive (history), but hides that node', async () => {
    const id = await customExercise();
    await setCustomExerciseTaxonomy(db, id, ['FITNESS_LEGS_SQUAT_LUNGE', 'FITNESS_STRENGTH'], { clock });
    await setTaxonomyNodeActive(db, 'FITNESS_LEGS_SQUAT_LUNGE', false, { clock });
    // Re-saving with the existing (now inactive) node is allowed; it is not a new selection.
    expect(await setCustomExerciseTaxonomy(db, id, ['FITNESS_LEGS_SQUAT_LUNGE', 'FITNESS_STRENGTH'], { clock })).toEqual([
      'FITNESS_LEGS_SQUAT_LUNGE',
      'FITNESS_STRENGTH',
    ]);
    const t = await readTaxonomy(db);
    expect(t.node('FITNESS_LEGS_SQUAT_LUNGE')!.active).toBe(false);
    expect(t.nodesOf(id)).toContain('FITNESS_LEGS_SQUAT_LUNGE');
  });

  describe('fails closed on malformed stored data', () => {
    const readError = async () => {
      const error = await readTaxonomy(db).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TaxonomyDataError);
      const e = error as TaxonomyDataError;
      return [e.field, e.reason, e.key];
    };

    it('a curated key without its row', async () => {
      await db.execAsync(`DROP TRIGGER taxonomy_nodes_never_deleted;
        DELETE FROM taxonomy_nodes WHERE id = 'BASKETBALL_REBOUNDING';`);
      expect(await readError()).toEqual(['id', 'MISSING_ROW', 'BASKETBALL_REBOUNDING']);
    });

    it('a built-in row the code does not know', async () => {
      await db.runAsync(
        "INSERT INTO taxonomy_nodes (id, builtin, active, created_at, updated_at) VALUES ('GHOST_NODE', 1, 1, 0, 0)",
      );
      expect(await readError()).toEqual(['id', 'UNKNOWN_CODE', 'GHOST_NODE']);
    });

    it('a custom (family-owned) node — the schema allows it for later, V1 does not', async () => {
      await db.runAsync('INSERT INTO families (id) VALUES (?)', [FAMILY]);
      await db.runAsync(
        `INSERT INTO taxonomy_nodes (id, builtin, active, parent_id, family_id, name, sort_order, created_at, updated_at)
         VALUES ('00000000-0000-4000-8000-0000000000c1', 0, 1, 'FITNESS', ?, 'My drills', 0, 1, 1)`,
        [FAMILY],
      );
      expect(await readError()).toEqual(['builtin', 'UNSUPPORTED', '00000000-0000-4000-8000-0000000000c1']);
    });

    it('a stored membership of a built-in exercise', async () => {
      await db.execAsync(`DROP TRIGGER exercise_taxonomy_builtin_curated;
        INSERT INTO exercise_taxonomy (exercise_id, node_id, created_at) VALUES ('DEADLIFT', 'FITNESS_ARMS', 1);`);
      expect(await readError()).toEqual(['membership', 'INVALID_VALUE', 'DEADLIFT']);
    });

    it('the schema itself refuses half-built rows', async () => {
      await expect(
        db.runAsync("INSERT INTO taxonomy_nodes (id, builtin, active, name, created_at, updated_at) VALUES ('X', 1, 1, 'named', 0, 0)"),
      ).rejects.toThrow();
      await expect(
        db.runAsync("INSERT INTO taxonomy_nodes (id, builtin, active, created_at, updated_at) VALUES ('X', 1, 2, 0, 0)"),
      ).rejects.toThrow();
      await expect(
        db.runAsync("INSERT INTO exercise_taxonomy (exercise_id, node_id, created_at) VALUES ('NOPE', 'FITNESS_ARMS', 1)"),
      ).rejects.toThrow();
    });
  });
});
