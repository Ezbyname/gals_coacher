import { builtinExercise } from '@/domain/exercise/catalog';
import { BUILTIN_TAXONOMY_MEMBERS } from '@/domain/taxonomy/memberships';
import { BUILTIN_TAXONOMY_NODES, builtinTaxonomyNode } from '@/domain/taxonomy/nodes';
import { buildTaxonomy, type Taxonomy } from '@/domain/taxonomy/taxonomy';
import type { Clock } from '@/services/clock/Clock';

import { runSerialized } from '../connectionQueue';
import type { PlayerDb } from '../players/playerDb';

import { ClassificationRefusedError, TaxonomyDataError, TaxonomyNodeNotFoundError } from './errors';

/**
 * The training taxonomy (TRAIN-TAXONOMY-001A). Built-in nodes: the curated
 * tree from code + each node's stored active state (one seeded row per key).
 * Built-in exercise membership: curated in code. Custom exercise membership:
 * rows in exercise_taxonomy. Nothing is ever deleted: an inactive node is
 * hidden from NEW selection and keeps every membership. Reads fail closed
 * (a code key without its row, a row the code does not know, a custom node —
 * not supported in V1 — or a membership that is not a custom exercise's).
 * One operation at a time per connection; writes are transactional.
 */

/** The whole taxonomy: curated tree + stored active state + built-in and custom memberships. */
export function readTaxonomy(db: PlayerDb): Promise<Taxonomy> {
  return runSerialized(db, () => readAll(db));
}

/** Makes a node active / inactive. Idempotent. Never touches memberships or history. */
export async function setTaxonomyNodeActive(
  db: PlayerDb,
  key: string,
  active: boolean,
  deps: { clock: Clock },
): Promise<Taxonomy> {
  const now = deps.clock.wallNow();
  let result = null as Taxonomy | null;
  await writeTransaction(db, async () => {
    const taxonomy = await readAll(db); // authoritative read first: fails closed when malformed
    const node = taxonomy.node(key);
    if (node === null) throw new TaxonomyNodeNotFoundError(key);
    if (node.active !== active) {
      await db.runAsync('UPDATE taxonomy_nodes SET active = ?, updated_at = ? WHERE id = ?', [
        active ? 1 : 0,
        now,
        key,
      ]);
    }
    result = await readAll(db);
  });
  return result!;
}

/**
 * Replaces a CUSTOM exercise's taxonomy memberships. Built-in exercises are
 * classified by the curated taxonomy only. Every node must exist; a node the
 * exercise is not already in must be active (an inactive node is hidden from
 * new selection, but an existing membership in it may be kept). Refusals throw
 * ClassificationRefusedError and write nothing.
 */
export async function setCustomExerciseTaxonomy(
  db: PlayerDb,
  exerciseId: string,
  nodeKeys: readonly string[],
  deps: { clock: Clock },
): Promise<readonly string[]> {
  const now = deps.clock.wallNow();
  let result = null as readonly string[] | null;
  await writeTransaction(db, async () => {
    const row = await db.getFirstAsync<{ builtin: unknown }>('SELECT builtin FROM exercises WHERE id = ?', [
      exerciseId,
    ]);
    if (row === null) throw new ClassificationRefusedError('EXERCISE_NOT_FOUND', exerciseId);
    if (row.builtin !== 0) throw new ClassificationRefusedError('BUILTIN_EXERCISE', exerciseId);
    const taxonomy = await readAll(db);
    const current = new Set(taxonomy.nodesOf(exerciseId));
    const wanted = [...new Set(nodeKeys)];
    for (const key of wanted) {
      const node = taxonomy.node(key);
      if (node === null) throw new ClassificationRefusedError('UNKNOWN_NODE', key);
      if (!node.active && !current.has(key)) throw new ClassificationRefusedError('INACTIVE_NODE', key);
    }
    await db.runAsync('DELETE FROM exercise_taxonomy WHERE exercise_id = ?', [exerciseId]);
    for (const key of wanted) {
      await db.runAsync('INSERT INTO exercise_taxonomy (exercise_id, node_id, created_at) VALUES (?, ?, ?)', [
        exerciseId,
        key,
        now,
      ]);
    }
    result = (await readAll(db)).nodesOf(exerciseId);
  });
  return result!;
}

function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

type NodeRow = { id: unknown; builtin: unknown; active: unknown; created_at: unknown; updated_at: unknown };
type MembershipRow = { exercise_id: unknown; node_id: unknown; builtin: unknown; created_at: unknown };

async function readAll(db: PlayerDb): Promise<Taxonomy> {
  const rows = await db.getAllAsync<NodeRow>(
    'SELECT id, builtin, active, created_at, updated_at FROM taxonomy_nodes ORDER BY id',
    [],
  );
  const active = new Map<string, boolean>();
  for (const row of rows) {
    const key = typeof row.id === 'string' ? row.id : null;
    if (key === null) throw new TaxonomyDataError('id', 'INVALID_VALUE', null);
    if (row.builtin === 0) throw new TaxonomyDataError('builtin', 'UNSUPPORTED', key); // custom nodes: not in V1
    if (row.builtin !== 1) throw new TaxonomyDataError('builtin', 'INVALID_VALUE', key);
    if (builtinTaxonomyNode(key) === null) throw new TaxonomyDataError('id', 'UNKNOWN_CODE', key);
    if (row.active !== 0 && row.active !== 1) throw new TaxonomyDataError('active', 'INVALID_VALUE', key);
    if (typeof row.created_at !== 'number' || !Number.isSafeInteger(row.created_at)) {
      throw new TaxonomyDataError('createdAt', 'INVALID_VALUE', key);
    }
    if (typeof row.updated_at !== 'number' || !Number.isSafeInteger(row.updated_at)) {
      throw new TaxonomyDataError('updatedAt', 'INVALID_VALUE', key);
    }
    active.set(key, row.active === 1);
  }
  for (const definition of BUILTIN_TAXONOMY_NODES) {
    if (!active.has(definition.key)) throw new TaxonomyDataError('id', 'MISSING_ROW', definition.key);
  }

  const members: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(BUILTIN_TAXONOMY_MEMBERS)) members[key] = [...ids];
  const memberships = await db.getAllAsync<MembershipRow>(
    `SELECT m.exercise_id, m.node_id, e.builtin, m.created_at
       FROM exercise_taxonomy m JOIN exercises e ON e.id = m.exercise_id
      ORDER BY m.node_id, m.exercise_id`,
    [],
  );
  for (const m of memberships) {
    const key = typeof m.node_id === 'string' ? m.node_id : null;
    const exerciseId = typeof m.exercise_id === 'string' ? m.exercise_id : null;
    if (key === null || exerciseId === null || !active.has(key)) {
      throw new TaxonomyDataError('membership', 'UNKNOWN_CODE', key);
    }
    // Built-in exercises are classified in code only (a trigger refuses such rows).
    if (m.builtin !== 0 || builtinExercise(exerciseId) !== null) {
      throw new TaxonomyDataError('membership', 'INVALID_VALUE', exerciseId);
    }
    if (typeof m.created_at !== 'number' || !Number.isSafeInteger(m.created_at)) {
      throw new TaxonomyDataError('membership', 'INVALID_VALUE', exerciseId);
    }
    members[key] = [...(members[key] ?? []), exerciseId];
  }

  return buildTaxonomy(BUILTIN_TAXONOMY_NODES, (key) => active.get(key)!, members);
}
