import { onDataChanged } from '@/data/changes';
import { DEFAULT_REMINDER_RULES } from '@/domain/reminders';
import { readCalendarSyncPreferences, saveCalendarSyncPreferences } from '@/preferences/calendarSyncPreference';
import { readReminderPreferences, saveReminderPreferences } from '@/preferences/reminderPreference';
import type { PreferenceStore } from '@/preferences/store';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';

/** CAL-SYNC-NOTIFY-001D — schema v16 (additive) and the separate calendar-sync preference. */
describe('schema v16 — calendar_event_sync_links', () => {
  it('upgrades a v15 database: one new table + index; no existing table changes; the CHECKs hold', async () => {
    const db = openNodeSqlite(':memory:');
    await runMigrations(db, migrations.filter((m) => m.version <= 15));
    const before = await db.getAllAsync("SELECT name, sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY name");
    await runMigrations(db, migrations.filter((m) => m.version <= 16)); // this suite is about v16 (later versions have their own)
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 16 });
    const after = await db.getAllAsync<{ name: string }>("SELECT name, sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY name");
    expect(after.filter((o) => !before.some((b) => (b as { name: string }).name === o.name)).map((o) => o.name)).toEqual([
      'calendar_event_sync_links', 'calendar_event_sync_links_player', 'sqlite_autoindex_calendar_event_sync_links_1', // TEXT PRIMARY KEY
    ]);
    for (const b of before) expect(after).toContainEqual(b); // nothing else changed
    await expect(db.execAsync("INSERT INTO calendar_event_sync_links (event_id, player_id, calendar_id, state, synced_start_at) VALUES ('e', 'p', 'c', 'SOMETHING', 1)")).rejects.toThrow(/CHECK/);
    await db.execAsync("INSERT INTO calendar_event_sync_links (event_id, player_id, calendar_id, state, synced_start_at) VALUES ('e', 'p', 'c', 'NEEDS_END_TIME', 1)");
    await db.closeAsync();
  });
});

describe('calendar-sync preference — separate from reminders', () => {
  const memory = new Map<string, string>();
  const store = { getItem: async (k: string) => memory.get(k) ?? null, setItem: async (k: string, v: string) => void memory.set(k, v) } as unknown as PreferenceStore;

  it('OFF with nothing chosen by default; saving it never changes the reminder Players (and vice versa); it signals the sync', async () => {
    memory.clear();
    expect(await readCalendarSyncPreferences(store)).toEqual({ enabled: false, calendarId: null, players: [] });
    const topics: string[] = [];
    const off = onDataChanged((t) => topics.push(t));
    await saveReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: ['daniel'] }, store);
    await saveCalendarSyncPreferences({ enabled: true, calendarId: 'cal-1', players: ['maya'] }, store);
    off();
    expect((await readReminderPreferences(['daniel', 'maya'], store)).players).toEqual(['daniel']);
    expect((await readCalendarSyncPreferences(store)).players).toEqual(['maya']);
    expect(topics).toEqual(['reminders', 'calendarSync']);
  });
});
