import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { archivePlayer, createPlayer } from '@/data/local/players/playerRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { stripBidi } from '@/i18n/bidi';
import { readReminderPreferences } from '@/preferences/reminderPreference';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import type { ExactAlarmState, NotificationPermissionState } from '@/services/notifications/reminderPermissions';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** CAL-SYNC-NOTIFY-001B — Settings → Training reminders (real routes, real SQLite, AsyncStorage mock). */
const mockState: { notif: NotificationPermissionState; afterRequest: NotificationPermissionState; exact: ExactAlarmState } = {
  notif: 'UNDETERMINED', afterRequest: 'GRANTED', exact: 'UNKNOWN',
};
const mockCalls: string[] = [];
jest.mock('@/services/notifications/reminderPermissions', () => ({
  ...jest.requireActual('@/services/notifications/reminderPermissions'),
  expoReminderPermissions: {
    notificationState: async () => mockState.notif,
    requestNotifications: async () => (mockCalls.push('request'), (mockState.notif = mockState.afterRequest)),
    exactAlarmState: () => mockState.exact,
    openNotificationSettings: async () => void mockCalls.push('notification-settings'),
    openExactAlarmSettings: async () => void mockCalls.push('exact-settings'),
  },
}));

const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 13, 12).getTime();
const ids = createSequentialIdService();
const deps = { ids, clock: { wallNow: () => NOW, monotonicNow: () => 0 } };
let db: ReturnType<typeof openNodeSqlite> | null = null;

async function prepare(language: 'he' | 'en', names: string[]) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const out: string[] = [];
  for (const name of names) {
    const p = await createPlayer(opened, { player: { name, dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
    if (!p.ok) throw new Error('seed');
    out.push(p.profile.player.id);
  }
  Object.assign(mockState, { notif: 'UNDETERMINED', afterRequest: 'GRANTED', exact: 'UNKNOWN' });
  mockCalls.length = 0;
  return out;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const text = (id: string) => stripBidi(String(screen.getByTestId(id).props.children));
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const isSelected = (id: string) => screen.getByTestId(id).props.accessibilityState?.selected === true;
const rules = () => screen.queryAllByTestId(/^reminders-rule-\d+-text$/).map((n) => stripBidi(String(n.props.children)));
const stored = (playerIds: string[]) => readReminderPreferences(playerIds);
function answerAlerts(answer: 'cancel' | 'continue') {
  const seen: { title: string; body?: string }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons: AlertButton[] = []) => {
    seen.push({ title, body });
    buttons.find((b) => (answer === 'cancel' ? b.style === 'cancel' : b.style !== 'cancel'))?.onPress?.();
  });
  return seen;
}
async function open() {
  renderRouter(routes, { initialUrl: '/settings' });
  press(await screen.findByTestId('settings-reminders').then(() => 'settings-reminders'));
  await screen.findByTestId('reminders-enabled');
}

describe('Settings → Training reminders (001B)', () => {
  it('Hebrew defaults: OFF, the single Player preselected and shown, the 3 default rules; nothing asked at open', async () => {
    const [daniel] = await prepare('he', ['Daniel']);
    await open();
    expect((await stored([daniel!])).enabled).toBe(false); // OFF until the user turns it on
    expect(isSelected(`reminders-players-${daniel}`)).toBe(true);
    expect(rules()).toEqual(['ב-08:00 ביום האירוע', '2 שעות לפני', '30 דקות לפני']);
    expect(screen.queryByTestId('reminders-permissions')).toBeNull();
    expect(mockCalls).toEqual([]); // never asked at launch / on open
  });

  it('turning ON explains first, then asks; granted is shown; the preference is saved', async () => {
    const [daniel] = await prepare('en', ['Daniel']);
    await open();
    const dialogs = answerAlerts('continue');
    await act(async () => fireEvent(screen.getByTestId('reminders-enabled'), 'valueChange', true));
    expect(dialogs[0]!.title).toBe('Allow notifications?');
    await waitFor(() => expect(text('reminders-notif-granted')).toBe('Notifications are allowed.'));
    expect(mockCalls).toEqual(['request']);
    expect(await stored([daniel!])).toMatchObject({ enabled: true, players: [daniel] });
  });

  it('"Not now" keeps reminders ON with an inline "Allow notifications"; blocked → Open settings', async () => {
    await prepare('en', ['Daniel']);
    await open();
    answerAlerts('cancel');
    await act(async () => fireEvent(screen.getByTestId('reminders-enabled'), 'valueChange', true));
    expect(text('reminders-notif-off')).toBe('Notifications are off for this app — reminders cannot appear.');
    expect(mockCalls).toEqual([]);
    mockState.afterRequest = 'BLOCKED';
    await act(async () => press('reminders-notif-allow'));
    await screen.findByTestId('reminders-notif-blocked');
    await act(async () => press('reminders-notif-settings'));
    expect(mockCalls).toEqual(['request', 'notification-settings']);
  });

  it('exact alarms unknown (Android 12+): a clear warning + Open settings; this app build without notifications says so', async () => {
    await prepare('en', ['Daniel']);
    mockState.notif = 'GRANTED';
    await open();
    await act(async () => fireEvent(screen.getByTestId('reminders-enabled'), 'valueChange', true));
    expect(text('reminders-exact-warning')).toContain('Precise timing may be unavailable');
    await act(async () => press('reminders-exact-settings'));
    expect(mockCalls).toEqual(['exact-settings']);
  });

  it('UNAVAILABLE (no native notifications in this build): an honest notice, no prompt, no exact warning', async () => {
    await prepare('en', ['Daniel']);
    mockState.notif = 'UNAVAILABLE';
    await open();
    const dialogs = answerAlerts('continue');
    await act(async () => fireEvent(screen.getByTestId('reminders-enabled'), 'valueChange', true));
    expect(dialogs).toEqual([]);
    expect(text('reminders-notif-unavailable')).toContain('cannot show notifications yet');
    expect(screen.queryByTestId('reminders-exact-warning')).toBeNull();
  });

  it('several Players: none preselected; ON without a Player warns; selecting one saves exactly that Player; archived not offered', async () => {
    const [daniel, maya, gone] = await prepare('en', ['Daniel', 'Maya', 'Gone']);
    await archivePlayer(db!, gone!, deps);
    await open();
    expect(isSelected(`reminders-players-${daniel}`)).toBe(false);
    expect(isSelected(`reminders-players-${maya}`)).toBe(false);
    expect(screen.queryByTestId(`reminders-players-${gone}`)).toBeNull();
    answerAlerts('cancel');
    await act(async () => fireEvent(screen.getByTestId('reminders-enabled'), 'valueChange', true));
    expect(text('reminders-players-required')).toBe('Choose at least one Player — otherwise there are no reminders.');
    await act(async () => press(`reminders-players-${maya}`));
    expect(screen.queryByTestId('reminders-players-required')).toBeNull();
    expect((await stored([daniel!, maya!])).players).toEqual([maya]);
  });

  it('add / edit / remove rules: value + unit, duplicates refused, 5 at most, 0 allowed; saved each time', async () => {
    const [daniel] = await prepare('en', ['Daniel']);
    await open();
    press('reminders-add');
    fireEvent.changeText(screen.getByTestId('reminders-editor-value'), '45');
    await act(async () => press('reminders-editor-save'));
    expect(rules()).toEqual(['08:00 on the event day', '2 hours before', '30 minutes before', '45 minutes before']);
    press('reminders-add');
    fireEvent.changeText(screen.getByTestId('reminders-editor-value'), '30');
    await act(async () => press('reminders-editor-save'));
    expect(text('reminders-editor-error')).toBe('This reminder already exists.');
    fireEvent.changeText(screen.getByTestId('reminders-editor-value'), '1');
    press('reminders-editor-unit-DAYS');
    await act(async () => press('reminders-editor-save'));
    expect(rules()).toHaveLength(5);
    expect(rules()[4]).toBe('1 day before');
    expect(screen.getByTestId('reminders-add').props.accessibilityState?.disabled).toBe(true);
    expect(text('reminders-max')).toBe('Up to 5 reminders.');
    // Edit "2 hours before" → 3 hours; then the editor shows the stored value in its unit.
    press('reminders-rule-1-edit');
    expect(screen.getByTestId('reminders-editor-value').props.value).toBe('2');
    expect(isSelected('reminders-editor-unit-HOURS')).toBe(true);
    fireEvent.changeText(screen.getByTestId('reminders-editor-value'), '3');
    await act(async () => press('reminders-editor-save'));
    expect(rules()[1]).toBe('3 hours before');
    // An invalid value is explained, nothing saved.
    press('reminders-rule-1-edit');
    fireEvent.changeText(screen.getByTestId('reminders-editor-value'), '0');
    await act(async () => press('reminders-editor-save'));
    expect(text('reminders-editor-error')).toBe('Enter a whole number greater than zero.');
    press('reminders-editor-cancel');
    for (let i = 0; i < 5; i++) await act(async () => press('reminders-rule-0-remove'));
    expect(text('reminders-rules-none')).toBe('No reminders. Add one to be reminded.');
    expect((await stored([daniel!])).rules).toEqual([]);
  });

  it('DAY_OF_AT editor: kind "At a time on the event day" with the time field; accessible labels on actions', async () => {
    await prepare('en', ['Daniel']);
    await open();
    press('reminders-rule-0-edit');
    expect(isSelected('reminders-editor-kind-DAY_OF_AT')).toBe(true);
    expect(screen.getByTestId('reminders-editor-time')).toBeTruthy();
    expect(screen.getByTestId('reminders-rule-0-remove').props.accessibilityLabel).toBe('Remove reminder: 08:00 on the event day');
    expect(screen.getByTestId('reminders-enabled').props.accessibilityLabel).toBe('Remind me about trainings and games');
  });
});
