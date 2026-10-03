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

// Official in-memory AsyncStorage mock (language preference, reload guard).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// A real app reload must never happen in tests; tests inject a fake DirectionService.
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  reloadAppAsync: jest.fn(async () => {
    throw new Error('reloadAppAsync called in a test');
  }),
}));

// expo-splash-screen is native; tests only need the calls to be observable.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
  hideAsync: jest.fn(async () => {}),
  setOptions: jest.fn(),
}));
