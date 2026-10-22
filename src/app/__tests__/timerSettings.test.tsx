import { resolve } from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { PREFERENCE_KEYS } from '@/preferences/keys';
import { readTimerPreferences } from '@/preferences/timerPreference';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAINING-TIMER-001: Settings has exactly two timer switches, ON by default, saved on this device. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
let db: ReturnType<typeof openNodeSqlite> | null = null;

async function open(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  renderRouter(routes, { initialUrl: '/settings' });
  await screen.findByTestId('settings-timer-sound');
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

describe('Settings -> workout timer', () => {
  it('English: both switches start ON; turning one off is saved and the other is unaffected', async () => {
    await open('en');
    expect(screen.getByText('Timer sounds')).toBeTruthy();
    expect(screen.getByText('Vibration')).toBeTruthy();
    const on = (id: string) => {
      const p = screen.getByTestId(id).props;
      return p.value ?? p.on ?? p.accessibilityState?.checked;
    };
    expect(on('settings-timer-sound')).toBe(true);
    expect(on('settings-timer-vibration')).toBe(true);
    fireEvent(screen.getByTestId('settings-timer-sound'), 'valueChange', false);
    await waitFor(async () => expect(await readTimerPreferences()).toEqual({ sound: false, vibration: true }));
    expect(JSON.parse((await AsyncStorage.getItem(PREFERENCE_KEYS.timer))!)).toEqual({ version: 1, sound: false, vibration: true });
    fireEvent(screen.getByTestId('settings-timer-vibration'), 'valueChange', false);
    await waitFor(async () => expect(await readTimerPreferences()).toEqual({ sound: false, vibration: false }));
  });

  it('Hebrew labels', async () => {
    await open('he');
    expect(screen.getByText('צלילי טיימר')).toBeTruthy();
    expect(screen.getByText('רטט')).toBeTruthy();
    expect(screen.getByText('טיימר אימון')).toBeTruthy();
  });
});
