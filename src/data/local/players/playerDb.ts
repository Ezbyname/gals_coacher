/**
 * The SQLite operations player persistence needs. expo-sqlite's SQLiteDatabase
 * and the test adapter (src/test-support/nodeSqlite.ts) both satisfy it.
 *
 * `withTransactionAsync` is expo-sqlite's non-exclusive transaction, so the
 * repository never calls it directly: every operation goes through
 * `runSerialized` (../connectionQueue), one at a time per connection.
 */
export type SqlParam = string | number | null;

export interface PlayerDb {
  runAsync(sql: string, params: SqlParam[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
