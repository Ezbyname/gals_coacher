import { migrations } from '../index';
import { assertValidMigrations, runMigrations } from '../runMigrations';
import type { Migration, MigrationExecutor } from '../types';

function fakeDb(startVersion = 0) {
  let version = startVersion;
  const executed: string[] = [];
  let inTx = false;
  const db: MigrationExecutor = {
    execAsync: async (sql) => {
      executed.push(sql.trim());
      const m = /PRAGMA user_version = (\d+)/.exec(sql);
      if (m) {
        if (!inTx) throw new Error('version bumped outside transaction');
        version = Number(m[1]);
      }
    },
    getFirstAsync: async <T,>() => ({ user_version: version }) as T,
    withTransactionAsync: async (task) => {
      inTx = true;
      try {
        await task();
      } finally {
        inTx = false;
      }
    },
  };
  return { db, executed, version: () => version };
}

const list: Migration[] = [
  { version: 1, name: 'one', sql: 'CREATE TABLE a (id TEXT);' },
  { version: 2, name: 'two', sql: 'CREATE TABLE b (id TEXT);' },
];

describe('runMigrations', () => {
  it('applies all migrations to a fresh database, in order, inside transactions', async () => {
    const f = fakeDb();
    const result = await runMigrations(f.db, list);
    expect(result).toEqual({ from: 0, to: 2, applied: ['one', 'two'] });
    expect(f.version()).toBe(2);
    expect(f.executed.filter((s) => s.startsWith('CREATE'))).toEqual([
      'CREATE TABLE a (id TEXT);',
      'CREATE TABLE b (id TEXT);',
    ]);
  });

  it('only applies pending migrations', async () => {
    const f = fakeDb(1);
    const result = await runMigrations(f.db, list);
    expect(result.applied).toEqual(['two']);
  });

  it('is a no-op when up to date (safe to run on every launch)', async () => {
    const f = fakeDb(2);
    const result = await runMigrations(f.db, list);
    expect(result.applied).toEqual([]);
    expect(f.executed).toEqual([]);
  });

  it('refuses to run against a newer schema', async () => {
    await expect(runMigrations(fakeDb(5).db, list)).rejects.toThrow(/downgrade/);
  });

  it('rejects gaps or out-of-order versions', () => {
    expect(() => assertValidMigrations([{ version: 2, name: 'x', sql: '' }])).toThrow(/expected 1/);
  });

  it('ships a valid migration list', () => {
    expect(() => assertValidMigrations(migrations)).not.toThrow();
  });
});
