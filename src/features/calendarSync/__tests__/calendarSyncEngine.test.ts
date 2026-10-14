import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from '@/data/local/calendar/calendarEventRepository';
import { listSyncLinks } from '@/data/local/calendarSync/syncLinkRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { archivePlayer, createPlayer, restorePlayer } from '@/data/local/players/playerRepository';
import type { CalendarSyncPreferences, ExternalPayload } from '@/domain/calendarSync';
import type { CalendarPermissionState, DeviceCalendar, WritableCalendar } from '@/services/calendar/deviceCalendar';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { syncDeviceCalendar } from '../calendarSyncEngine';

/** CAL-SYNC-NOTIFY-001D — the sync engine on real SQLite + repositories; the device calendar is faked. */
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
let now = at(14, 12);
const ids = createSequentialIdService();
const clock = { wallNow: () => now, monotonicNow: () => 0 };

class FakeCalendar implements DeviceCalendar {
  native = true;
  perm: CalendarPermissionState = 'GRANTED';
  calendars: WritableCalendar[] = [{ id: 'cal-1', title: 'Family', account: 'me@gmail.com' }, { id: 'cal-2', title: 'Phone', account: null }];
  readonly entries = new Map<string, ExternalPayload & { calendarId: string }>([
    ['someone-else', { calendarId: 'cal-1', title: 'Dentist', startAt: at(16, 9), endAt: at(16, 10), location: null, notes: null }],
  ]);
  fail = false;
  private n = 0;
  available() { return this.native; }
  async permission() { return this.perm; }
  async requestPermission() { return this.perm; }
  async writableCalendars() { return this.calendars; }
  async calendarExists(id: string) { return this.calendars.some((c) => c.id === id); }
  async readEvent(id: string) { const e = this.entries.get(id); return e ? { title: e.title, startAt: e.startAt, endAt: e.endAt, location: e.location, notes: e.notes } : null; }
  async createEvent(calendarId: string, p: ExternalPayload) { if (this.fail) throw new Error('provider refused'); const id = `gc-${++this.n}`; this.entries.set(id, { ...p, calendarId }); return id; }
  async updateEvent(id: string, p: ExternalPayload) { if (this.fail) throw new Error('provider refused'); this.entries.set(id, { ...p, calendarId: this.entries.get(id)!.calendarId }); }
  async deleteEvent(id: string) { this.entries.delete(id); }
  async openSettings() {}
  ours() { return [...this.entries.entries()].filter(([id]) => id.startsWith('gc-')).map(([id, e]) => ({ id, ...e })).sort((a, b) => a.startAt - b.startAt); }
}

let db: ReturnType<typeof openNodeSqlite>;
let device: FakeCalendar;
let prefs: CalendarSyncPreferences;
let daniel: string;
let maya: string;
const sync = () => syncDeviceCalendar({ db, device, now: () => now, title: (e, player) => `${player} · ${e.title ?? e.type}`, readPrefs: async () => prefs });
async function event(playerId: string, startAt: number, endAt: number | null, extra: { location?: string } = {}) {
  const r = await createCalendarEvent(db, playerId, { type: 'GAME', startAt, endAt, ...extra }, { ids, clock });
  if (!r.ok) throw new Error('seed');
  return r.event;
}

beforeEach(async () => {
  now = at(14, 12);
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const a = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, { ids, clock });
  const b = await createPlayer(db, { player: { name: 'Maya', dateOfBirth: { year: 2014, month: 3, day: 4 } }, basketball: null }, { ids, clock });
  if (!a.ok || !b.ok) throw new Error('seed');
  daniel = a.profile.player.id;
  maya = b.profile.player.id;
  device = new FakeCalendar();
  prefs = { enabled: true, calendarId: 'cal-1', players: [daniel] };
});
afterEach(() => db.closeAsync());

describe('mirror', () => {
  it('creates the chosen Player\'s future events (with an end) in the chosen calendar; no end → NEEDS_END_TIME; idempotent', async () => {
    const e1 = await event(daniel, at(15, 19), at(15, 20), { location: 'Gym' });
    await event(daniel, at(16, 18), null);
    await event(maya, at(15, 17), at(15, 18)); // Maya not chosen
    expect(await sync()).toEqual({ status: 'DONE', created: 1, updated: 0, removed: 0, released: 0, needsEndTime: 1, failed: 0 });
    expect(device.ours()).toEqual([{ id: 'gc-1', calendarId: 'cal-1', title: 'Daniel · GAME', startAt: at(15, 19), endAt: at(15, 20), location: 'Gym', notes: null }]);
    expect((await listSyncLinks(db)).map((l) => [l.eventId === e1.id, l.state, l.externalEventId])).toEqual([[true, 'SYNCED', 'gc-1'], [false, 'NEEDS_END_TIME', null]]);
    expect(await sync()).toEqual({ status: 'DONE', created: 0, updated: 0, removed: 0, released: 0, needsEndTime: 1, failed: 0 });
  });

  it('an app edit is copied; a phone-side edit is overwritten; a phone-side deletion is recreated', async () => {
    const e = await event(daniel, at(15, 19), at(15, 20));
    await sync();
    await updateCalendarEvent(db, daniel, e.id, { type: 'GAME', startAt: at(15, 18), endAt: at(15, 19), location: 'Hall' }, { clock });
    expect(await sync()).toMatchObject({ updated: 1 });
    expect(device.ours()[0]).toMatchObject({ startAt: at(15, 18), location: 'Hall' });
    device.entries.set('gc-1', { ...device.entries.get('gc-1')!, title: 'changed on the phone' });
    expect(await sync()).toMatchObject({ updated: 1 });
    expect(device.ours()[0]!.title).toBe('Daniel · GAME');
    device.entries.delete('gc-1');
    expect(await sync()).toMatchObject({ created: 1 });
    expect(device.ours()).toHaveLength(1);
  });

  it('another calendar chosen → our entries move; unrelated calendar events are never touched', async () => {
    await event(daniel, at(15, 19), at(15, 20));
    await sync();
    prefs = { ...prefs, calendarId: 'cal-2' };
    await sync();
    expect(device.ours().map((e) => e.calendarId)).toEqual(['cal-2']);
    expect(device.entries.get('someone-else')!.title).toBe('Dentist');
  });
});

describe('leaving the scope — future removed, started / past kept (owner rules)', () => {
  async function both() {
    const future = await event(daniel, at(20, 19), at(20, 20));
    const soon = await event(daniel, at(14, 13), at(14, 15)); // will have started
    await sync();
    now = at(14, 14); // `soon` is now in progress
    return { future, soon };
  }

  it('sync turned OFF: future Gals Coacher entries removed; the started one stays; others untouched', async () => {
    await both();
    prefs = { ...prefs, enabled: false };
    expect(await sync()).toMatchObject({ removed: 1, released: 1 });
    expect(device.ours().map((e) => e.startAt)).toEqual([at(14, 13)]);
    expect(device.entries.has('someone-else')).toBe(true);
    expect(await listSyncLinks(db)).toEqual([]);
    expect(await sync()).toEqual({ status: 'OFF' }); // nothing of ours left to manage
  });

  it('Player deselected → same rule', async () => {
    await both();
    prefs = { ...prefs, players: [] };
    expect(await sync()).toMatchObject({ removed: 1, released: 1 });
    expect(device.ours()).toHaveLength(1);
  });

  it('Player ARCHIVED → future entries removed, history kept; restored → future entries recreated', async () => {
    await both();
    await archivePlayer(db, daniel, { clock });
    expect(await sync()).toMatchObject({ removed: 1, released: 1 });
    expect(device.ours().map((e) => e.startAt)).toEqual([at(14, 13)]);
    await restorePlayer(db, daniel, { clock });
    expect(await sync()).toMatchObject({ created: 1 });
    expect(device.ours().map((e) => e.startAt)).toEqual([at(14, 13), at(20, 19)]);
  });

  it('event deleted in the app → its future entry is removed', async () => {
    const { future } = await both();
    await deleteCalendarEvent(db, daniel, future.id);
    expect(await sync()).toMatchObject({ removed: 1 });
    expect(device.ours().some((e) => e.startAt === at(20, 19))).toBe(false);
  });
});

describe('safety', () => {
  it('no calendar module in this build → UNAVAILABLE: nothing read or written', async () => {
    await event(daniel, at(15, 19), at(15, 20));
    device.native = false;
    expect(await sync()).toEqual({ status: 'UNAVAILABLE' });
    expect(device.ours()).toEqual([]);
  });

  it('no calendar permission → NO_PERMISSION (nothing done); the chosen calendar gone → CALENDAR_MISSING', async () => {
    await event(daniel, at(15, 19), at(15, 20));
    device.perm = 'DENIED';
    expect(await sync()).toEqual({ status: 'NO_PERMISSION' });
    device.perm = 'GRANTED';
    device.calendars = [];
    expect(await sync()).toEqual({ status: 'CALENDAR_MISSING' });
    expect(device.ours()).toEqual([]);
  });

  it('a device failure never touches the CalendarEvent: the link is ERROR and the next sync retries', async () => {
    const e = await event(daniel, at(15, 19), at(15, 20));
    device.fail = true;
    expect(await sync()).toMatchObject({ created: 0, failed: 1 });
    expect((await listSyncLinks(db))[0]).toMatchObject({ state: 'ERROR', externalEventId: null });
    expect(await getCalendarEvent(db, daniel, e.id)).toEqual(e);
    device.fail = false;
    expect(await sync()).toMatchObject({ created: 1, failed: 0 });
  });
});
