/**
 * Minimal surface the migration runner needs. Kept separate from expo-sqlite's
 * SQLiteDatabase so the runner is unit-testable without native code.
 */
export interface MigrationExecutor {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type Migration = {
  /** Strictly increasing, never reused, never edited once shipped. */
  version: number;
  name: string;
  sql: string;
};
