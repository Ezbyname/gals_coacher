// expo-sqlite has native code; app-level tests run the same SQL against
// Node's real SQLite engine (in-memory) instead.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => {
    const { openNodeSqlite } = require('./src/test-support/nodeSqlite');
    return openNodeSqlite(':memory:');
  }),
}));

// jest-expo auto-mocks native expo-crypto (randomUUID returns undefined);
// use Node's implementation so id generation behaves like the device.
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));
