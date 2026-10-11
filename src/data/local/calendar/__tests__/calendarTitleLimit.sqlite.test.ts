import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../../database';
import { createPlayer } from '../../players/playerRepository';
import {
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from '../calendarEventRepository';

const T0 = new Date(2026, 9, 6, 12).getTime();
const START = new Date(2026, 9, 10, 17).getTime();
const LEGACY_ID = '00000000-0000-4000-8000-0000000000c9';
const LEGACY_TITLE =
  'אימון כוח ארוך במיוחד שנשמר לפני שהייתה מגבלה על אורך הכותרת, עם הרבה פרטים נוספים על התרגילים והמטרות של השבוע'; // > 100

describe('calendar title limit on real SQLite', () => {
  let db: SQLiteDatabase;
  let ids: IdService;
  let now = T0;
  const clock: Clock = { wallNow: () => now, monotonicNow: () => 0 };
  let gal: Uuid;
  const rows = () => db.getAllAsync('SELECT * FROM calendar_events ORDER BY id');

  beforeEach(async () => {
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(':memory:'));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    const created = await createPlayer(
      db,
      { player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } }, basketball: null },
      { ids, clock },
    );
    if (!created.ok) throw new Error('seed failed');
    gal = created.profile.player.id;
    // An event saved before the limit existed (Slice 1.3 had no length limit).
    await db.runAsync(
      `INSERT INTO calendar_events (id, player_id, type, start_at, title, created_at, updated_at)
       VALUES (?, ?, 'OTHER', ?, ?, ?, ?)`,
      [LEGACY_ID, gal, START, LEGACY_TITLE, T0, T0],
    );
    now = T0 + 60_000;
  });
  afterEach(() => db.closeAsync());

  it('the stored long title still reads in full', async () => {
    expect(LEGACY_TITLE.length).toBeGreaterThan(100);
    expect((await getCalendarEvent(db, gal, LEGACY_ID))!.title).toBe(LEGACY_TITLE);
    expect((await listCalendarEvents(db, gal)).map((e) => e.title)).toEqual([LEGACY_TITLE]);
  });

  it('create: 100 characters are saved; 101 are a TOO_LONG result with nothing written', async () => {
    expect(
      (
        await createCalendarEvent(
          db,
          gal,
          { type: 'GAME', startAt: START, title: 'x'.repeat(100) },
          { ids, clock },
        )
      ).ok,
    ).toBe(true);
    const before = await rows();
    expect(
      await createCalendarEvent(
        db,
        gal,
        { type: 'GAME', startAt: START, title: 'x'.repeat(101) },
        { ids, clock },
      ),
    ).toEqual({ ok: false, errors: { title: 'TOO_LONG' } });
    expect(await rows()).toEqual(before);
  });

  it('edit keeping the long title unchanged saves (the title is not truncated or rewritten)', async () => {
    const result = await updateCalendarEvent(
      db,
      gal,
      LEGACY_ID,
      { type: 'OTHER', startAt: START, title: LEGACY_TITLE, notes: 'Bus 16:00' },
      { clock },
    );
    expect(result.ok && [result.event.title, result.event.notes]).toEqual([LEGACY_TITLE, 'Bus 16:00']);
  });

  it('edit changing the long title must meet the limit; a rejected edit writes nothing', async () => {
    const before = await rows();
    expect(
      await updateCalendarEvent(
        db,
        gal,
        LEGACY_ID,
        { type: 'OTHER', startAt: START, title: LEGACY_TITLE.slice(0, 105) },
        { clock },
      ),
    ).toEqual({ ok: false, errors: { title: 'TOO_LONG' } });
    expect(await rows()).toEqual(before);
    const shortened = await updateCalendarEvent(
      db,
      gal,
      LEGACY_ID,
      { type: 'OTHER', startAt: START, title: LEGACY_TITLE.slice(0, 100) },
      { clock },
    );
    expect(shortened.ok && shortened.event.title).toBe(LEGACY_TITLE.slice(0, 100).trim());
  });

  it('other field rules are still checked before anything is read', async () => {
    expect(
      await updateCalendarEvent(
        db,
        gal,
        '00000000-0000-4000-8000-0000000000ee',
        { type: 'GAME', startAt: START, endAt: START },
        { clock },
      ),
    ).toEqual({ ok: false, errors: { endAt: 'NOT_AFTER_START' } });
  });
});
