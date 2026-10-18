import {
  createCalendarEvent,
  createCalendarEventBatch,
  deleteCalendarEvent,
  markCalendarEventCompleted,
  undoCalendarEventCompletion,
  undoCalendarImport,
  updateCalendarEvent,
} from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { archivePlayer, createPlayer } from '@/data/local/players/playerRepository';
import { DEFAULT_REMINDER_RULES } from '@/domain/reminders';
import { saveReminderPreferences } from '@/preferences/reminderPreference';
import type { PreferenceStore } from '@/preferences/store';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { onDataChanged, type DataTopic } from '../changes';

/** CAL-SYNC-NOTIFY-001C — every COMMITTED write that can change the reminder schedule signals it; nothing else does. */
const T = new Date(2026, 9, 15, 19).getTime();
const ids = createSequentialIdService();
const clock = { wallNow: () => T - 86_400_000, monotonicNow: () => 0 };
let db: ReturnType<typeof openNodeSqlite>;
let seen: DataTopic[];
let off: () => void;
let player: string;

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const p = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, { ids, clock });
  if (!p.ok) throw new Error('seed');
  player = p.profile.player.id;
  seen = [];
  off = onDataChanged((topic) => seen.push(topic));
});
afterEach(async () => {
  off();
  await db.closeAsync();
});

it('event create / edit / complete / un-complete / delete, import and Undo Import: one "calendar" signal each, after the commit', async () => {
  const e = await createCalendarEvent(db, player, { type: 'GAME', startAt: T, endAt: null }, { ids, clock });
  if (!e.ok) throw new Error('create');
  await updateCalendarEvent(db, player, e.event.id, { type: 'GAME', startAt: T + 3_600_000, endAt: null }, { clock });
  await markCalendarEventCompleted(db, player, e.event.id, { clock });
  await undoCalendarEventCompletion(db, player, e.event.id);
  const batch = await createCalendarEventBatch(db, player, { events: [{ type: 'GAME', startAt: T, endAt: null }], source: 'TEXT_IMPORT' }, { ids, clock });
  if (!batch.ok) throw new Error('batch');
  await undoCalendarImport(db, player, batch.importBatchId);
  await deleteCalendarEvent(db, player, e.event.id);
  expect(seen).toEqual(['calendar', 'calendar', 'calendar', 'calendar', 'calendar', 'calendar', 'calendar']);
});

it('a write that fails (rolled back) signals nothing', async () => {
  await expect(createCalendarEvent(db, 'no-such-player', { type: 'GAME', startAt: T, endAt: null }, { ids, clock })).rejects.toThrow();
  expect(seen).toEqual([]);
});

it('archiving a Player signals "players"; saving the reminder settings signals "reminders"', async () => {
  await archivePlayer(db, player, { clock });
  const memory = new Map<string, string>();
  const store: PreferenceStore = { getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => void memory.set(k, v), removeItem: async (k) => void memory.delete(k) } as PreferenceStore;
  await saveReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: [player], typeRules: {}, eventRules: {} }, store);
  expect(seen).toEqual(['players', 'reminders']);
});

it('a failing listener never affects the write', async () => {
  const offBad = onDataChanged(() => {
    throw new Error('listener bug');
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const e = await createCalendarEvent(db, player, { type: 'GAME', startAt: T, endAt: null }, { ids, clock });
  expect(e.ok).toBe(true);
  expect(seen).toEqual(['calendar']);
  offBad();
  warn.mockRestore();
});
