import { render, waitFor } from '@testing-library/react-native';

import { createCalendarEvent, updateCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { DEFAULT_REMINDER_RULES } from '@/domain/reminders';
import { stripBidi } from '@/i18n/bidi';
import { messagesFor, type Language } from '@/i18n/languages';
import { translate } from '@/i18n/translate';
import { saveReminderPreferences } from '@/preferences/reminderPreference';
import { createSequentialIdService } from '@/services/ids/IdService';
import type { ReminderNotification, ReminderScheduler } from '@/services/notifications/reminderScheduler';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { ReminderSync } from '../ReminderSync';
import { reconcileReminders, reminderWords } from '../reminderEngine';

/**
 * CAL-SYNC-NOTIFY-001C closure gap (owner 2026-10-14): when the app language changes,
 * the already-scheduled reminders are rewritten in the new language — same identity
 * (event + rule + instant), our `cal:` reminders only, calendar data untouched.
 */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const NOW = at(14, 12);
const ids = createSequentialIdService();
const deps0 = { ids, clock: { wallNow: () => NOW, monotonicNow: () => 0 } };
const tOf = (language: Language) => {
  const messages = messagesFor(language);
  return (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(messages, key, params);
};
const T = { he: tOf('he'), en: tOf('en') }; // stable per language, like the app's `t`

class FakeDevice implements ReminderScheduler {
  readonly store = new Map<string, ReminderNotification>([
    ['other-app:7', { id: 'other-app:7', at: NOW + 1, title: 'not ours', body: 'x', data: { eventId: '-', playerId: '-' } }],
  ]);
  async scheduled() { return [...this.store.values()].map(({ id, title, body }) => ({ id, title, body })); }
  async schedule(n: ReminderNotification) { this.store.set(n.id, n); }
  async cancel(id: string) { this.store.delete(id); }
  ours() { return [...this.store.values()].filter((n) => n.id.startsWith('cal:')).sort((a, b) => a.at - b.at); }
}

let db: ReturnType<typeof openNodeSqlite>;
let daniel: string;
let eventId: string;
let device: FakeDevice;
const granted = { notificationState: async () => 'GRANTED' as const };

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const p = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps0);
  if (!p.ok) throw new Error('seed');
  daniel = p.profile.player.id;
  const e = await createCalendarEvent(db, daniel, { type: 'GAME', startAt: at(15, 19), endAt: at(15, 20, 30), location: 'אולם מי עמי' }, deps0);
  if (!e.ok) throw new Error('seed');
  eventId = e.event.id;
  await saveReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: [daniel], typeRules: {}, eventRules: {} });
  device = new FakeDevice();
});
afterEach(() => db.closeAsync());

const reconcileIn = (language: Language) =>
  reconcileReminders({ db, scheduler: device, permissions: granted, now: () => NOW, describe: (e, player) => reminderWords(T[language], e, player) });
const titles = () => device.ours().map((n) => stripBidi(n.title));

describe('reconcile rewrites reminders whose words changed — same identity', () => {
  it('HE → EN: the old Hebrew cal:* reminders are replaced by English ones with the SAME ids; others untouched', async () => {
    await reconcileIn('he');
    const hebrew = device.ours();
    expect(titles()).toEqual(['Daniel · משחק', 'Daniel · משחק', 'Daniel · משחק']);
    expect(stripBidi(hebrew[0]!.body)).toBe('15/10 · 19:00–20:30 · אולם מי עמי');

    expect(await reconcileIn('en')).toEqual({ status: 'DONE', desired: 3, scheduled: 3, cancelled: 3, failed: 0 });
    const english = device.ours();
    expect(titles()).toEqual(['Daniel · Game', 'Daniel · Game', 'Daniel · Game']);
    expect(english.map((n) => [n.id, n.at])).toEqual(hebrew.map((n) => [n.id, n.at])); // identity: event + rule + instant
    expect(device.store.get('other-app:7')!.title).toBe('not ours');

    expect(await reconcileIn('en')).toEqual({ status: 'DONE', desired: 3, scheduled: 0, cancelled: 0, failed: 0 }); // idempotent
  });

  it('EN → HE works the same way', async () => {
    await reconcileIn('en');
    await reconcileIn('he');
    expect(titles()).toEqual(['Daniel · משחק', 'Daniel · משחק', 'Daniel · משחק']);
  });

  it('a title / location edit at the same time also rewrites the words (identity unchanged)', async () => {
    await reconcileIn('en');
    const before = device.ours().map((n) => n.id);
    const r = await updateCalendarEvent(db, daniel, eventId, { type: 'GAME', startAt: at(15, 19), endAt: at(15, 20, 30), title: 'Final', location: 'Gym 2' }, { clock: deps0.clock });
    expect(r.ok).toBe(true);
    await reconcileIn('en');
    expect(device.ours().map((n) => n.id)).toEqual(before);
    expect(titles()).toEqual(['Daniel · Final', 'Daniel · Final', 'Daniel · Final']);
    expect(stripBidi(device.ours()[0]!.body)).toBe('15/10 · 19:00–20:30 · Gym 2');
  });
});

// ReminderSync reacts to the app language itself (no write, no restart needed).
const mockApp = { boot: { status: 'ready' as const, db: null as unknown }, services: { clock: { wallNow: () => NOW, monotonicNow: () => 0 } } };
const mockI18n = { t: T.he, language: 'he' as Language };
jest.mock('@/features/AppProvider', () => ({ useApp: () => mockApp }));
jest.mock('@/i18n/I18nProvider', () => ({ useI18n: () => mockI18n }));

// Stable props: only the LANGUAGE changes between renders (so a reconcile can only come from it).
const stablePermissions = { ...granted } as never;

it('ReminderSync: changing the app language triggers a reconcile that rewrites the reminders (HE → EN → HE)', async () => {
  mockApp.boot.db = db;
  Object.assign(mockI18n, { t: T.he, language: 'he' });
  const view = render(<ReminderSync scheduler={device} permissions={stablePermissions} delayMs={0} />);
  await waitFor(() => expect(titles()).toEqual(['Daniel · משחק', 'Daniel · משחק', 'Daniel · משחק']));
  const ids0 = device.ours().map((n) => n.id);

  Object.assign(mockI18n, { t: T.en, language: 'en' });
  view.rerender(<ReminderSync scheduler={device} permissions={stablePermissions} delayMs={0} />);
  await waitFor(() => expect(titles()).toEqual(['Daniel · Game', 'Daniel · Game', 'Daniel · Game']));
  expect(device.ours().map((n) => n.id)).toEqual(ids0);

  Object.assign(mockI18n, { t: T.he, language: 'he' });
  view.rerender(<ReminderSync scheduler={device} permissions={stablePermissions} delayMs={0} />);
  await waitFor(() => expect(titles()).toEqual(['Daniel · משחק', 'Daniel · משחק', 'Daniel · משחק']));
  expect(device.store.has('other-app:7')).toBe(true);
  view.unmount();
});
