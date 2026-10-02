import type { Migration, MigrationExecutor } from './types';

export type MigrationResult = { from: number; to: number; applied: string[] };

export function assertValidMigrations(list: readonly Migration[]): void {
  list.forEach((m, i) => {
    if (!Number.isInteger(m.version) || m.version !== i + 1) {
      throw new Error(
        `Migration "${m.name}" has version ${m.version}; expected ${i + 1}. Versions must be 1..n with no gaps.`,
      );
    }
  });
}

/**
 * Applies pending migrations in order, each inside its own transaction, using
 * SQLite's `PRAGMA user_version` as the schema version.
 */
export async function runMigrations(
  db: MigrationExecutor,
  list: readonly Migration[],
): Promise<MigrationResult> {
  assertValidMigrations(list);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  const latest = list.length;

  if (from > latest) {
    throw new Error(
      `Local database is at schema v${from} but this app only knows v${latest}. Refusing to downgrade.`,
    );
  }

  const applied: string[] = [];
  for (const m of list.slice(from)) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      // PRAGMA cannot be parameterised; version is a validated integer.
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    applied.push(m.name);
  }

  return { from, to: latest, applied };
}
