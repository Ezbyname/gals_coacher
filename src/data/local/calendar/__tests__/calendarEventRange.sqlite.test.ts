import type { CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer, updatePlayer, type PlayerProfileInput } from '../../players/playerRepository';
import {
  createCalendarEvent,
  listCalendarEventsInRange,
  markCalendarEventCompleted,
} from '../calendarEventRepository';
import { CalendarEventDataError } from '../errors';

/** The Full Calendar's one range read across every Player (CAL-VIEW-001). */
const T0 = new Date(2026, 9, 1, 12).getTime();
const at = (d: number, h = 0, min = 0) => new Date(2026, 9, d, h, min).getTime();
const clock = { wallNow: () => T0, monotonicNow: () => 0 };

const GAL: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG' },
};
const NOA: PlayerProfileInput = {
  player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } },
  basketball: null,
};

describe('listCalendarEventsInRange on real SQLite', () => {
  let db: ReturnType<typeof openNodeSqlite>;
  let ids: IdService;
  let gal: Uuid;
  let noa: Uuid;

  const create = async (input: CalendarEventInput, playerId: Uuid = gal) => {
    const result = await createCalendarEvent(db, playerId, input, { ids, clock });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.event;
  };
  /** The week 4–10 Oct as [from, to). */
  const week = () => listCalendarEventsInRange(db, at(4), at(11));

  beforeEach(async () => {
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    ids = createSequentialIdService();
    for (const [input, set] of [
      [GAL, (id: Uuid) => (gal = id)],
      [NOA, (id: Uuid) => (noa = id)],
    ] as const) {
      const result = await createPlayer(db, input, { ids, clock });
      if (!result.ok) throw new Error('seed failed');
      set(result.profile.player.id);
    }
  });
  afterEach(() => db.closeAsync());

  it('returns every Player’s overlapping events, start then id, unchanged (completion included)', async () => {
    const noaGym = await create({ type: 'GYM', startAt: at(6, 9) }, noa);
    const galGame = await create({ type: 'GAME', sport: 'BASKETBALL', startAt: at(6, 9), endAt: at(6, 11) });
    const galEarly = await create({ type: 'RECOVERY', startAt: at(5, 7) });
    const done = await markCalendarEventCompleted(db, gal, galEarly.id, { clock });
    const result = await week();
    const tie = [noaGym, galGame].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(result).toEqual([done, ...tie]);
    expect(result[0]!.completion).toEqual({ completedAt: T0, source: 'LOCAL_USER' });
  });

  it('[from, to): boundaries are exact', async () => {
    const endsAtFrom = await create({ type: 'GAME', startAt: at(3, 22), endAt: at(4) }); // ends at midnight
    const endsAfterFrom = await create({ type: 'GAME', startAt: at(3, 22), endAt: at(4) + 1 });
    const startsAtFrom = await create({ type: 'GYM', startAt: at(4) });
    const lastMoment = await create({ type: 'GYM', startAt: at(11) - 1 });
    const startsAtTo = await create({ type: 'GYM', startAt: at(11) }); // next week
    const spanning = await create({ type: 'OTHER', title: 'Camp', startAt: at(1, 9), endAt: at(20, 17) });
    const noEndBefore = await create({ type: 'RECOVERY', startAt: at(3, 23, 59) });
    const ids = (await week()).map((e) => e.id);
    expect(ids).toEqual([spanning.id, endsAfterFrom.id, startsAtFrom.id, lastMoment.id]);
    for (const excluded of [endsAtFrom, startsAtTo, noEndBefore]) expect(ids).not.toContain(excluded.id);
  });

  it('an empty range, or no events at all, is an empty list', async () => {
    expect(await week()).toEqual([]);
    await create({ type: 'GYM', startAt: at(20, 9) });
    expect(await week()).toEqual([]);
  });

  it('history of an inactive sport is still returned with its sport', async () => {
    const event = await create({ type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(6, 17) });
    expect((await updatePlayer(db, gal, { ...GAL, basketball: null }, { clock })).ok).toBe(true);
    expect(await week()).toEqual([event]);
  });

  it('one query for the whole range (no per-day or per-Player reads)', async () => {
    await create({ type: 'GYM', startAt: at(5, 9) });
    await create({ type: 'GYM', startAt: at(6, 9) }, noa);
    const all = jest.spyOn(db, 'getAllAsync');
    const first = jest.spyOn(db, 'getFirstAsync');
    await week();
    expect(all).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('a malformed event in the range fails the whole read (never a partial calendar)', async () => {
    await create({ type: 'GYM', startAt: at(5, 9) });
    const bad = await create({ type: 'GAME', startAt: at(6, 9) });
    await db.runAsync("UPDATE calendar_events SET type = 'SCHOOL' WHERE id = ?", [bad.id]);
    await expect(week()).rejects.toMatchObject({ field: 'type', reason: 'UNKNOWN_CODE', eventId: bad.id });
    // Outside the range it is not read.
    await expect(listCalendarEventsInRange(db, at(12), at(19))).resolves.toEqual([]);
  });

  it('an event whose Player is missing fails closed (no fabricated Player)', async () => {
    const orphan = await create({ type: 'GAME', startAt: at(6, 9) }, noa);
    await db.execAsync('PRAGMA foreign_keys = OFF');
    await db.runAsync('DELETE FROM players WHERE id = ?', [noa]);
    await db.execAsync('PRAGMA foreign_keys = ON');
    const read = week();
    await expect(read).rejects.toBeInstanceOf(CalendarEventDataError);
    await expect(read).rejects.toMatchObject({
      field: 'playerId',
      reason: 'INVALID_RELATIONSHIP',
      eventId: orphan.id,
    });
  });
});
