/**
 * Test-only stand-in for expo-sqlite's SQLiteDatabase, backed by Node's real
 * SQLite engine (node:sqlite). Lets Jest run the app's actual SQL —
 * migrations, PRAGMAs, upserts — against a real database file.
 * Never imported by app code.
 */
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

function loadDatabaseSync(): typeof DatabaseSyncType {
  const sqlite = process.getBuiltinModule?.('node:sqlite');
  if (!sqlite) {
    throw new Error(
      `Tests need Node's built-in node:sqlite (Node >= 22.13, see package.json "engines"); running ${process.version}.`,
    );
  }
  return sqlite.DatabaseSync;
}

type Params = (string | number | null)[];

export function openNodeSqlite(path = ':memory:') {
  const DatabaseSync = loadDatabaseSync();
  const raw = new DatabaseSync(path);
  return {
    raw,
    execAsync: async (sql: string) => {
      raw.exec(sql);
    },
    runAsync: async (sql: string, params: Params = []) => raw.prepare(sql).run(...params),
    getFirstAsync: async <T,>(sql: string, params: Params = []) =>
      (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    getAllAsync: async <T,>(sql: string, params: Params = []) => raw.prepare(sql).all(...params) as T[],
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    closeAsync: async () => {
      raw.close();
    },
  };
}
