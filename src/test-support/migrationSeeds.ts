import { migrations } from '@/data/local/migrations';

/**
 * Built-in exercise ids seeded by migrations NEWER than `version` (e.g. v11
 * adds Basketball drills). Upgrade tests use it to prove that an upgrade
 * leaves every existing row unchanged and adds exactly these seed rows —
 * nothing else.
 */
export function exerciseIdsSeededAfter(version: number): string[] {
  return migrations
    .filter((m) => m.version > version)
    .flatMap((m) => [...m.sql.matchAll(/\('([A-Z0-9_]+)', 1, NULL, 1, 0, 0\)/g)].map((match) => match[1]!));
}

/**
 * Splits an upgraded `exercises` dump into the rows that existed before and
 * the rows seeded by later migrations, so the old rows can be compared
 * byte-for-byte and the new ones checked to be exactly the expected seeds.
 */
export function splitLaterSeeds<T extends { id?: unknown }>(
  rows: readonly T[],
  version: number,
): { existing: T[]; seededIds: string[] } {
  const later = new Set(exerciseIdsSeededAfter(version));
  return {
    existing: rows.filter((r) => !later.has(String(r.id))),
    seededIds: rows.filter((r) => later.has(String(r.id))).map((r) => String(r.id)),
  };
}

/** Taxonomy node keys seeded by migrations NEWER than `version` (v10 seeds the tree; v19 adds Football / Surfing). */
export function nodeIdsSeededAfter(version: number): string[] {
  return migrations
    .filter((m) => m.version > version)
    .flatMap((m) => [...m.sql.matchAll(/\('([A-Z0-9_]+)', 1, 1, 0, 0\)/g)].map((match) => match[1]!));
}

/**
 * After an upgrade to the latest schema: every table equals `before`, except
 * that `exercises` and `taxonomy_nodes` may additionally hold — and only
 * hold — the built-in rows seeded by migrations newer than `version`.
 */
export function expectUnchangedExceptLaterSeeds(
  after: Record<string, unknown[]>,
  before: Record<string, unknown[]>,
  version: number,
): void {
  let rest = after;
  if ('exercises' in rest) {
    const { existing, seededIds } = splitLaterSeeds(rest.exercises as { id?: unknown }[], version);
    expect(seededIds).toEqual(exerciseIdsSeededAfter(version));
    rest = { ...rest, exercises: existing };
  }
  if ('taxonomy_nodes' in rest) {
    const later = new Set(nodeIdsSeededAfter(version));
    const rows = rest.taxonomy_nodes as { id?: unknown }[];
    expect(rows.filter((r) => later.has(String(r.id))).map((r) => String(r.id))).toEqual(nodeIdsSeededAfter(version));
    rest = { ...rest, taxonomy_nodes: rows.filter((r) => !later.has(String(r.id))) };
  }
  expect(rest).toEqual(before);
}

/**
 * A test that builds an OLD-version database and then uses today's repositories on it (which read every built-in
 * exercise) needs the rows that LATER migrations seed. This inserts them for the duration of `task` and removes them
 * again, so the real upgrade afterwards seeds them itself and the comparison stays honest.
 */
export async function withLaterBuiltinRows<T>(
  db: { runAsync(sql: string, params?: unknown[]): Promise<unknown>; getAllAsync<R>(sql: string, params?: unknown[]): Promise<R[]> },
  version: number,
  task: () => Promise<T>,
): Promise<T> {
  const ids = exerciseIdsSeededAfter(version);
  for (const id of ids) {
    await db.runAsync('INSERT INTO exercises (id, builtin, name, active, created_at, updated_at) VALUES (?, 1, NULL, 1, 0, 0)', [id]);
  }
  try {
    return await task();
  } finally {
    // exercises are never deleted by the product (a trigger refuses it): lift the guard only to take the temporary rows out
    const guards = await db.getAllAsync<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'exercises'",
    );
    for (const g of guards) await db.runAsync(`DROP TRIGGER ${g.name}`);
    for (const id of ids) await db.runAsync('DELETE FROM exercises WHERE id = ? AND builtin = 1', [id]);
    for (const g of guards) await db.runAsync(g.sql);
  }
}
