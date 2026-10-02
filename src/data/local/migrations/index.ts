import type { Migration } from './types';

/**
 * Append-only list of local SQLite migrations. Never edit a shipped migration;
 * add a new one. Domain tables arrive with their phase (children in Phase 1,
 * exercises in Phase 2, sessions/results/outbox in Phase 3).
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'app_meta',
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
];
