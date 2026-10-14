import {
  createCalendarEvent,
  createCalendarEventBatch,
  deleteCalendarEvent,
  getCalendarEvent,
  markCalendarEventCompleted,
  undoCalendarEventCompletion,
  undoCalendarImport,
  updateCalendarEvent,
} from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { archivePlayer, createPlayer } from '@/data/local/players/playerRepository';
import { DEFAULT_REMINDER_RULES, type ReminderPreferences, type ReminderRule } from '@/domain/reminders';
import { createSequentialIdService } from '@/services/ids/IdService';
import type { NotificationPermissionState } from '@/services/notifications/reminderPermissions';
import type { ReminderNotification, ReminderScheduler } from '@/services/notifications/reminderScheduler';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { createReconcileRunner, reconcileReminders, type DescribeReminder } from '../reminderEngine';

/** CAL-SYNC-NOTIFY-001C — the reconcile engine on real SQLite + the real repositories; the device is faked. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const NOW = at(14, 12); // Wed 14 Oct 2026, 12:00 local
const ids = createSequentialIdService();
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
const deps0 = { ids, clock };

class FakeDevice implements ReminderScheduler {
  readonly store = new Map<string, ReminderNotification>([['other-app:1', { id: 'other-app:1', at: NOW + 1, title: 'x', body: 'x', data: { eventId: '-', playerId: '-' } }]]);
  calls = { schedule: 0, cancel: 0 };
  failSchedule = false;
  async scheduled() { return [...this.store.values()].map(({ id, title, body }) => ({ id, title, body })); }
  async schedule(n: ReminderNotification) {
    this.calls.schedule++;
    if (this.failSchedule) throw new Error('device refused');
    this.store.set(n.id, n);
  }
  async cancel(id: string) { this.calls.cancel++; this.store.delete(id); }
  ours() { return [...this.store.values()].filter((n) => n.id.startsWith('cal:')).sort((a, b) => a.at - b.at); }
}

const describe_: DescribeReminder = (e, player) => ({
  title: `${player} · ${e.title ?? e.type}`,
  body: [e.startAt, e.endAt, e.location].map((v) => (v === null ? '∅' : String(v))).join('|'),
});

let db: ReturnType<typeof openNodeSqlite>;
let device: FakeDevice;
let permission: NotificationPermissionState;
let prefs: ReminderPreferences;
let daniel: string;
let maya: string;

const reconcile = () =>
  reconcileReminders({ db, scheduler: device, permissions: { notificationState: async () => permission }, now: () => NOW, describe: describe_, readPrefs: async () => prefs });
const times = () => device.ours().map((n) => new Date(n.at).toTimeString().slice(0, 5));
async function event(playerId: string, startAt: number, extra: { endAt?: number | null; location?: string; title?: string } = {}) {
  const r = await createCalendarEvent(db, playerId, { type: 'GAME', startAt, endAt: extra.endAt ?? null, location: extra.location, title: extra.title }, deps0);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.event;
}
const rules = (...r: ReminderRule[]) => r;

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const a = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps0);
  const b = await createPlayer(db, { player: { name: 'Maya', dateOfBirth: { year: 2014, month: 3, day: 4 } }, basketball: null }, deps0);
  if (!a.ok || !b.ok) throw new Error('seed');
  daniel = a.profile.player.id;
  maya = b.profile.player.id;
  device = new FakeDevice();
  permission = 'GRANTED';
  prefs = { enabled: true, rules: DEFAULT_REMINDER_RULES, players: [daniel] };
});
afterEach(() => db.closeAsync());

describe('reconcile — which reminders', () => {
  it('defaults 08:00 / 120 / 30 → three, deterministic ids, known data only (no end, no location)', async () => {
    const e = await event(daniel, at(15, 19));
    expect(await reconcile()).toEqual({ status: 'DONE', desired: 3, scheduled: 3, cancelled: 0, failed: 0 });
    expect(times()).toEqual(['08:00', '17:00', '18:30']);
    expect(device.ours().map((n) => n.id)).toEqual([0, 1, 2].map((i) => expect.stringMatching(new RegExp(`^cal:${e.id}:${i}:\\d+$`))));
    expect(device.ours()[0]).toMatchObject({ title: 'Daniel · GAME', body: `${at(15, 19)}|∅|∅`, data: { eventId: e.id, playerId: daniel } });
  });

  it('end time and location are included only when known', async () => {
    await event(daniel, at(15, 19), { endAt: at(15, 20, 30), location: 'אולם מי עמי', title: 'א – ב' });
    await reconcile();
    expect(device.ours()[0]).toMatchObject({ title: 'Daniel · א – ב', body: `${at(15, 19)}|${at(15, 20, 30)}|אולם מי עמי` });
  });

  it('0 rules → none; 1 rule → one; 5 rules → five', async () => {
    await event(daniel, at(15, 19));
    prefs = { ...prefs, rules: [] };
    await reconcile();
    expect(times()).toEqual([]);
    prefs = { ...prefs, rules: rules({ kind: 'BEFORE_START', minutes: 45 }) };
    await reconcile();
    expect(times()).toEqual(['18:15']);
    prefs = { ...prefs, rules: rules({ kind: 'DAY_OF_AT', hour: 7, minute: 0 }, { kind: 'DAY_OF_AT', hour: 12, minute: 0 }, { kind: 'BEFORE_START', minutes: 60 }, { kind: 'BEFORE_START', minutes: 10 }, { kind: 'BEFORE_START', minutes: 24 * 60 }) };
    await reconcile();
    expect(times()).toEqual(['19:00', '07:00', '12:00', '18:00', '18:50']); // 1 day before = 14/10 19:00 first
    expect(device.ours()).toHaveLength(5);
  });

  it('past instants are skipped (no catch-up); a DAY_OF_AT after the start is skipped (never moved)', async () => {
    await event(daniel, at(14, 13)); // today 13:00: 08:00 and 11:00 are past, 12:30 is ahead
    await event(maya, at(16, 7)); // 07:00: the 08:00 rule would be AFTER the start
    prefs = { ...prefs, players: [daniel, maya] };
    await reconcile();
    expect(device.ours().map((n) => [n.data.playerId === daniel ? 'D' : 'M', new Date(n.at).toTimeString().slice(0, 5)])).toEqual([
      ['D', '12:30'], ['M', '05:00'], ['M', '06:30'],
    ]);
  });

  it('only the 30-day window; events without an end remind normally', async () => {
    await event(daniel, at(14, 12) + 29 * 86_400_000 + 3_600_000); // ~29 days ahead
    await event(daniel, at(14, 12) + 40 * 86_400_000);
    prefs = { ...prefs, rules: rules({ kind: 'BEFORE_START', minutes: 30 }) };
    await reconcile();
    expect(device.ours()).toHaveLength(1);
  });
});

describe('reconcile — keeping up with the calendar', () => {
  it('edit (time) and move (date): the stale reminders are cancelled, the new ones scheduled', async () => {
    const e = await event(daniel, at(15, 19));
    await reconcile();
    const before = device.ours().map((n) => n.id);
    const moved = await updateCalendarEvent(db, daniel, e.id, { type: 'GAME', startAt: at(17, 18), endAt: null }, { clock });
    expect(moved.ok).toBe(true);
    expect(await reconcile()).toMatchObject({ scheduled: 3, cancelled: 3, failed: 0 });
    expect(device.ours().some((n) => before.includes(n.id))).toBe(false);
    expect(times()).toEqual(['08:00', '16:00', '17:30']);
  });

  it('delete → its reminders are cancelled', async () => {
    const e = await event(daniel, at(15, 19));
    await reconcile();
    await deleteCalendarEvent(db, daniel, e.id);
    expect(await reconcile()).toMatchObject({ desired: 0, cancelled: 3 });
    expect(device.ours()).toEqual([]);
  });

  it('completed → no reminders; un-completed → reconciled back', async () => {
    const e = await event(daniel, at(15, 19));
    await reconcile();
    await markCalendarEventCompleted(db, daniel, e.id, { clock });
    await reconcile();
    expect(device.ours()).toEqual([]);
    await undoCalendarEventCompletion(db, daniel, e.id);
    await reconcile();
    expect(times()).toEqual(['08:00', '17:00', '18:30']);
  });

  it('an import creates the desired reminders; Undo Import removes exactly them', async () => {
    const own = await event(daniel, at(20, 18));
    const batch = await createCalendarEventBatch(db, daniel, {
      events: [{ type: 'GAME', startAt: at(22, 17, 30), endAt: null }, { type: 'GAME', startAt: at(29, 19), endAt: null }],
      source: 'XLSX_IMPORT',
    }, deps0);
    if (!batch.ok) throw new Error('batch');
    await reconcile();
    expect(device.ours()).toHaveLength(9);
    await undoCalendarImport(db, daniel, batch.importBatchId);
    await reconcile();
    expect(new Set(device.ours().map((n) => n.data.eventId))).toEqual(new Set([own.id]));
  });

  it('settings: rule change, Player deselected, archived Player, reminders off → reconciled', async () => {
    await event(daniel, at(15, 19));
    await event(maya, at(15, 18));
    prefs = { ...prefs, players: [daniel, maya] };
    await reconcile();
    expect(device.ours()).toHaveLength(6);
    prefs = { ...prefs, rules: rules({ kind: 'BEFORE_START', minutes: 60 }) };
    await reconcile();
    expect(times()).toEqual(['17:00', '18:00']);
    prefs = { ...prefs, players: [daniel] }; // Maya deselected
    await reconcile();
    expect(device.ours().map((n) => n.data.playerId)).toEqual([daniel]);
    prefs = { ...prefs, players: [daniel, maya] };
    await archivePlayer(db, maya, { clock }); // archived: off the roster → no reminders
    await reconcile();
    expect(device.ours().map((n) => n.data.playerId)).toEqual([daniel]);
    prefs = { ...prefs, enabled: false };
    expect(await reconcile()).toMatchObject({ desired: 0, cancelled: 1 });
    expect(device.ours()).toEqual([]);
  });
});

describe('reconcile — safety', () => {
  it('idempotent: a second reconcile changes nothing', async () => {
    await event(daniel, at(15, 19));
    await reconcile();
    const calls = { ...device.calls };
    expect(await reconcile()).toEqual({ status: 'DONE', desired: 3, scheduled: 0, cancelled: 0, failed: 0 });
    expect(device.calls).toEqual(calls);
  });

  it("notifications that are not ours are never touched", async () => {
    await event(daniel, at(15, 19));
    await reconcile();
    prefs = { ...prefs, enabled: false };
    await reconcile();
    expect([...device.store.keys()]).toEqual(['other-app:1']);
  });

  it('no native notifications in this build → UNAVAILABLE: nothing called, nothing claimed', async () => {
    await event(daniel, at(15, 19));
    permission = 'UNAVAILABLE';
    expect(await reconcile()).toEqual({ status: 'UNAVAILABLE' });
    expect(device.calls).toEqual({ schedule: 0, cancel: 0 });
  });

  it('notifications not allowed → nothing scheduled, our stale ones cancelled, reported as such', async () => {
    await event(daniel, at(15, 19));
    await reconcile();
    permission = 'DENIED';
    expect(await reconcile()).toEqual({ status: 'NO_PERMISSION', cancelled: 3 });
    expect(device.ours()).toEqual([]);
  });

  it('a scheduling failure never touches the calendar, is counted (never claimed), and the next run retries', async () => {
    const e = await event(daniel, at(15, 19));
    device.failSchedule = true;
    expect(await reconcile()).toEqual({ status: 'DONE', desired: 3, scheduled: 0, cancelled: 0, failed: 3 });
    expect(await getCalendarEvent(db, daniel, e.id)).toEqual(e); // the event is untouched
    device.failSchedule = false;
    expect(await reconcile()).toMatchObject({ scheduled: 3, failed: 0 });
  });
});

describe('reconcile runner — serialized, coalesced', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a burst of requests → one run; requests during a run → exactly one more run', async () => {
    let runs = 0;
    let release: () => void = () => {};
    const runner = createReconcileRunner(() => new Promise<void>((done) => { runs++; release = done; }), 100);
    runner.request(); runner.request(); runner.request();
    await jest.advanceTimersByTimeAsync(100);
    expect(runs).toBe(1);
    runner.request(); runner.request(); // while running
    await jest.advanceTimersByTimeAsync(100);
    expect(runs).toBe(1); // never overlapping
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(runs).toBe(2);
    release();
    runner.dispose();
    runner.request();
    await jest.advanceTimersByTimeAsync(200);
    expect(runs).toBe(2);
  });
});
