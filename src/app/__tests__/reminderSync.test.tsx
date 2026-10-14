import { resolve } from 'node:path';

import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { createCalendarEvent, updateCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { DEFAULT_REMINDER_RULES } from '@/domain/reminders';
import { stripBidi } from '@/i18n/bidi';
import { saveReminderPreferences } from '@/preferences/reminderPreference';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import type { NotificationPermissionState } from '@/services/notifications/reminderPermissions';
import type { ReminderNotification } from '@/services/notifications/reminderScheduler';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/**
 * CAL-SYNC-NOTIFY-001C — the app keeps reminders reconciled: at start, after a calendar write,
 * and when it comes back to the foreground. The device's notifications are faked.
 */
const mockDevice = new Map<string, ReminderNotification>();
let mockPermission: NotificationPermissionState = 'GRANTED';
let mockStateChecks = 0;
jest.mock('@/services/notifications/reminderScheduler', () => ({
  ...jest.requireActual('@/services/notifications/reminderScheduler'),
  expoReminderScheduler: {
    scheduled: async () => [...mockDevice.values()].map(({ id, title, body }) => ({ id, title, body })),
    schedule: async (n: ReminderNotification) => void mockDevice.set(n.id, n),
    cancel: async (id: string) => void mockDevice.delete(id),
  },
}));
jest.mock('@/services/notifications/reminderPermissions', () => ({
  ...jest.requireActual('@/services/notifications/reminderPermissions'),
  expoReminderPermissions: {
    ...jest.requireActual('@/services/notifications/reminderPermissions').expoReminderPermissions,
    notificationState: async () => (mockStateChecks++, mockPermission),
  },
}));

const routes = appRoutes(resolve(__dirname, '..')) as never;
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const NOW = at(14, 12);
const ids = createSequentialIdService();
const deps = { ids, clock: { wallNow: () => NOW, monotonicNow: () => 0 } };
let db: ReturnType<typeof openNodeSqlite> | null = null;
let daniel = '';

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  daniel = p.profile.player.id;
  mockDevice.clear();
  mockPermission = 'GRANTED';
  mockStateChecks = 0;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});
jest.setTimeout(30_000); // the whole app boots per test (route tree + startup)
const ours = () => [...mockDevice.values()].sort((a, b) => a.at - b.at);

it('start → reconciled; a calendar write → reconciled; foreground → reconciled (HE notification text)', async () => {
  await prepare('he');
  await saveReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: [daniel] });
  const e = await createCalendarEvent(db!, daniel, { type: 'GAME', startAt: at(15, 19), endAt: at(15, 20, 30), location: 'אולם מי עמי' }, deps);
  if (!e.ok) throw new Error('seed');
  renderRouter(routes, { initialUrl: '/' });
  await screen.findByTestId('home-quick-training');
  await waitFor(() => expect(ours()).toHaveLength(3)); // app start
  // Visible text (the translator wraps inserted values in bidi isolates — right for mixed HE / Latin).
  expect([stripBidi(ours()[0]!.title), stripBidi(ours()[0]!.body)]).toEqual(['Daniel · משחק', '15/10 · 19:00–20:30 · אולם מי עמי']);

  await act(async () => {
    await updateCalendarEvent(db!, daniel, e.event.id, { type: 'GAME', startAt: at(16, 18), endAt: null, location: null }, { clock: deps.clock });
  });
  await waitFor(() => expect(ours().map((n) => new Date(n.at).getDate())).toEqual([16, 16, 16])); // after the write
  expect(stripBidi(ours()[0]!.body)).toBe('16/10 · 18:00'); // no end, no location: nothing invented

  mockDevice.clear(); // e.g. the system dropped them while the app was away
  const listeners = (AppState.addEventListener as unknown as jest.Mock | undefined)?.mock;
  await act(async () => {
    // Bring the app back to the foreground.
    const change = (AppState as unknown as { emit?: (e: string, s: AppStateStatus) => void }).emit;
    if (change) change('change', 'active');
    else for (const [type, fn] of listeners?.calls ?? []) if (type === 'change') (fn as (s: AppStateStatus) => void)('active');
  });
  await waitFor(() => expect(ours()).toHaveLength(3));
});

it('this app build has no native notifications → the app runs normally and nothing is scheduled or claimed', async () => {
  await prepare('en');
  mockPermission = 'UNAVAILABLE';
  await saveReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: [daniel] });
  await createCalendarEvent(db!, daniel, { type: 'GAME', startAt: at(15, 19), endAt: null }, deps);
  renderRouter(routes, { initialUrl: '/' });
  await screen.findByTestId('home-quick-training');
  await waitFor(() => expect(mockStateChecks).toBeGreaterThan(0)); // the engine ran (app start)
  expect(mockDevice.size).toBe(0);
});
