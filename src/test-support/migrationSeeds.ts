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

/**
 * After an upgrade to the latest schema: every table equals `before`, except
 * that `exercises` may additionally hold — and only hold — the built-in rows
 * seeded by migrations newer than `version`.
 */
export function expectUnchangedExceptLaterSeeds(
  after: Record<string, unknown[]>,
  before: Record<string, unknown[]>,
  version: number,
): void {
  if (!('exercises' in after)) {
    expect(after).toEqual(before);
    return;
  }
  const { existing, seededIds } = splitLaterSeeds(after.exercises as { id?: unknown }[], version);
  expect(seededIds).toEqual(exerciseIdsSeededAfter(version));
  expect({ ...after, exercises: existing }).toEqual(before);
}
