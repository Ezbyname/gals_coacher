// expo-sqlite has native code; app-level tests use an in-memory stand-in.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => {
    let version = 0;
    const db = {
      execAsync: jest.fn(async (sql: string) => {
        const m = /PRAGMA user_version = (\d+)/.exec(sql);
        if (m) version = Number(m[1]);
      }),
      getFirstAsync: jest.fn(async () => ({ user_version: version })),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) => task()),
    };
    return db;
  }),
}));
