import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { DEFAULT_REMINDER_RULES } from '@/domain/reminders';
import { stripBidi } from '@/i18n/bidi';
import { readCalendarSyncPreferences, saveCalendarSyncPreferences } from '@/preferences/calendarSyncPreference';
import { saveReminderPreferences } from '@/preferences/reminderPreference';
import type { CalendarPermissionState } from '@/services/calendar/deviceCalendar';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** CAL-SYNC-NOTIFY-001D — Settings → Phone calendar (real routes, real SQLite, AsyncStorage mock, device calendar faked). */
const mockDevice: { native: boolean; perm: CalendarPermissionState; afterRequest: CalendarPermissionState; calls: string[] } = {
  native: true, perm: 'UNDETERMINED', afterRequest: 'GRANTED', calls: [],
};
jest.mock('@/services/calendar/deviceCalendar', () => ({
  ...jest.requireActual('@/services/calendar/deviceCalendar'),
  expoDeviceCalendar: {
    available: () => mockDevice.native,
    permission: async () => mockDevice.perm,
    requestPermission: async () => (mockDevice.calls.push('request'), (mockDevice.perm = mockDevice.afterRequest)),
    writableCalendars: async () => [{ id: 'cal-a', title: 'Family', account: 'me@gmail.com' }, { id: 'cal-b', title: 'Phone', account: null }],
    calendarExists: async () => true,
    readEvent: async () => null,
    createEvent: async () => (mockDevice.calls.push('create'), 'x'),
    updateEvent: async () => void mockDevice.calls.push('update'),
    deleteEvent: async () => void mockDevice.calls.push('delete'),
    openSettings: async () => void mockDevice.calls.push('settings'),
  },
}));

const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 14, 12).getTime();
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
  Object.assign(mockDevice, { native: true, perm: 'UNDETERMINED', afterRequest: 'GRANTED', calls: [] });
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
  await screen.findByTestId('settings-calendar-sync');
  press('settings-calendar-sync');
  await screen.findByTestId('calsync-enabled');
}

describe('Settings → Phone calendar (001D)', () => {
  it('OFF by default; NO Player preselected (even a single one); the reminder Players are not reused; nothing asked at open', async () => {
    const [daniel] = await prepare('en', ['Daniel']);
    await saveReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: [daniel!] });
    await open();
    expect(screen.getByTestId('calsync-enabled').props.on).toBe(false); // Android host Switch
    expect(isSelected(`calsync-players-${daniel}`)).toBe(false);
    expect(await readCalendarSyncPreferences()).toEqual({ enabled: false, calendarId: null, players: [] });
    expect(mockDevice.calls).toEqual([]);
  });

  it('turning ON explains first, then asks; the user chooses the calendar and the Players explicitly', async () => {
    const [daniel, maya] = await prepare('en', ['Daniel', 'Maya']);
    await open();
    const dialogs = answerAlerts('continue');
    await act(async () => fireEvent(screen.getByTestId('calsync-enabled'), 'valueChange', true));
    expect(dialogs[0]!.title).toBe('Allow calendar access?');
    await screen.findByTestId('calsync-calendar-1');
    expect(mockDevice.calls).toEqual(['request']);
    expect(text('calsync-calendar-required')).toBe('Choose the calendar to copy to — nothing is copied until you do.');
    expect(text('calsync-players-required')).toBe('Choose at least one Player — otherwise nothing is copied.');
    await act(async () => press('calsync-calendar-1'));
    await act(async () => press(`calsync-players-${maya}`));
    expect(screen.queryByTestId('calsync-calendar-required')).toBeNull();
    expect(screen.queryByTestId('calsync-players-required')).toBeNull();
    await waitFor(async () => expect(await readCalendarSyncPreferences()).toEqual({ enabled: true, calendarId: 'cal-b', players: [maya] }));
    expect(isSelected(`calsync-players-${daniel}`)).toBe(false);
  });

  it('turning OFF warns first (exact owner wording); Cancel keeps it ON; confirming saves OFF', async () => {
    const [daniel] = await prepare('en', ['Daniel']);
    await saveCalendarSyncPreferences({ enabled: true, calendarId: 'cal-a', players: [daniel!] });
    mockDevice.perm = 'GRANTED';
    await open();
    let dialogs = answerAlerts('cancel');
    await act(async () => fireEvent(screen.getByTestId('calsync-enabled'), 'valueChange', false));
    expect(dialogs).toEqual([{
      title: 'Turn off calendar sync?',
      body: 'Turning off calendar sync will remove future Gals Coacher events from your phone calendar. Past events will remain.',
    }]);
    expect((await readCalendarSyncPreferences()).enabled).toBe(true);
    jest.restoreAllMocks();
    dialogs = answerAlerts('continue');
    await act(async () => fireEvent(screen.getByTestId('calsync-enabled'), 'valueChange', false));
    await waitFor(async () => expect(await readCalendarSyncPreferences()).toEqual({ enabled: false, calendarId: 'cal-a', players: [daniel] }));
  });

  it('Hebrew: the turn-off warning is the owner wording', async () => {
    const [daniel] = await prepare('he', ['Daniel']);
    await saveCalendarSyncPreferences({ enabled: true, calendarId: 'cal-a', players: [daniel!] });
    mockDevice.perm = 'GRANTED';
    await open();
    const dialogs = answerAlerts('cancel');
    await act(async () => fireEvent(screen.getByTestId('calsync-enabled'), 'valueChange', false));
    expect(dialogs[0]!.body).toBe('כיבוי הסנכרון יסיר מהיומן בטלפון אירועים עתידיים שנוצרו על ידי Gals Coacher. אירועים שכבר התקיימו יישארו ביומן.');
  });

  it('this build has no calendar module → an honest notice, no prompt; blocked permission → Open settings', async () => {
    await prepare('en', ['Daniel']);
    mockDevice.native = false;
    await open();
    const dialogs = answerAlerts('continue');
    await act(async () => fireEvent(screen.getByTestId('calsync-enabled'), 'valueChange', true));
    expect(dialogs).toEqual([]);
    expect(text('calsync-unavailable')).toContain('cannot write to the phone calendar yet');
    expect(mockDevice.calls).toEqual([]);
  });

  it('blocked permission → explained + Open settings (no system prompt)', async () => {
    await prepare('en', ['Daniel']);
    mockDevice.perm = 'BLOCKED';
    await open();
    const dialogs = answerAlerts('continue');
    await act(async () => fireEvent(screen.getByTestId('calsync-enabled'), 'valueChange', true));
    await screen.findByTestId('calsync-blocked');
    expect(dialogs).toEqual([]);
    await act(async () => press('calsync-open-settings'));
    expect(mockDevice.calls).toEqual(['settings']);
  });

  it('a chosen calendar no longer on the phone is reported', async () => {
    const [daniel] = await prepare('en', ['Daniel']);
    await saveCalendarSyncPreferences({ enabled: true, calendarId: 'gone', players: [daniel!] });
    mockDevice.perm = 'GRANTED';
    await open();
    expect(text(await screen.findByTestId('calsync-calendar-missing').then(() => 'calsync-calendar-missing'))).toBe(
      'The chosen calendar is no longer on this phone. Choose another one.',
    );
  });
});
