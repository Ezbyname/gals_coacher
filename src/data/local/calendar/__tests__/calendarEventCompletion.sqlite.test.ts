import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { CalendarEvent, CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../../database';
import type { PlayerDb } from '../../players/playerDb';
import {
  createPlayer,
  getPlayer,
  updatePlayer,
  type PlayerProfileInput,
} from '../../players/playerRepository';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  markCalendarEventCompleted,
  undoCalendarEventCompletion,
  updateCalendarEvent,
  type SaveCalendarEventResult,
} from '../calendarEventRepository';
import { CalendarEventDataError, CalendarEventNotFoundError } from '../errors';

/**
 * CAL-COMP-001: completion is an explicit user action on an existing event —
 * never inferred from time, never an edit of the schedule, never a training
 * session or a result.
 */
const T0 = new Date(2026, 9, 4, 18, 30).getTime();
const HOUR = 3_600_000;
const START = new Date(2026, 9, 6, 17, 0).getTime();
const MARKED = T0 + 7 * HOUR;

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}

const expectOk = (result: SaveCalendarEventResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.event;
};

const GAL: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG', experience: 'ONE_TO_TWO_YEARS', weeklyFrequency: 'FOUR_TO_FIVE' },
};
const NOA: PlayerProfileInput = {
  player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } },
  basketball: null,
};
const GHOST = '00000000-0000-4000-8000-000000000999';

describe('calendar event completion on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  let gal: Uuid;
  let noa: Uuid;

  const eventRows = () => db.getAllAsync('SELECT * FROM calendar_events ORDER BY id');
  /** Everything outside calendar_events: completion creates no session, result or assessment. */
  const otherTables = async () => {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'calendar_events' ORDER BY name",
    );
    const dump: Record<string, unknown[]> = {};
    for (const { name } of tables) dump[name] = await db.getAllAsync(`SELECT * FROM "${name}"`);
    return dump;
  };
  const create = async (input: Partial<CalendarEventInput> = {}, playerId: string = gal) =>
    expectOk(
      await createCalendarEvent(db, playerId, { type: 'GAME', startAt: START, ...input }, { ids, clock }),
    );
  const mark = (eventId: string, on: PlayerDb = db, playerId: string = gal) =>
    markCalendarEventCompleted(on, playerId, eventId, { clock });
  const undo = (eventId: string, on: PlayerDb = db, playerId: string = gal) =>
    undoCalendarEventCompletion(on, playerId, eventId);
  /** The event as stored, without its completion: what completion must never change. */
  const schedule = ({ completion: _completion, ...rest }: CalendarEvent) => rest;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-cal-comp-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
    for (const [input, set] of [
      [GAL, (id: Uuid) => (gal = id)],
      [NOA, (id: Uuid) => (noa = id)],
    ] as const) {
      const result = await createPlayer(db, input, { ids, clock });
      if (!result.ok) throw new Error('seed failed');
      set(result.profile.player.id);
    }
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  it('1. a new event is NOT completed, whatever the time (even long after it ended)', async () => {
    const event = await create({ startAt: START, endAt: START + HOUR });
    expect(event.completion).toBeNull();
    clock.set(START + 400 * 24 * HOUR); // a year later: time passing completes nothing
    expect((await getCalendarEvent(db, gal, event.id))!.completion).toBeNull();
    expect((await listCalendarEvents(db, gal))[0]!.completion).toBeNull();
    expect(await eventRows()).toEqual([
      expect.objectContaining({ id: event.id, completed_at: null, completion_source: null }),
    ]);
  });

  it('2. marking stores the time and the source, and changes nothing else (not even updatedAt)', async () => {
    const event = await create({
      type: 'TEAM_TRAINING',
      sport: 'BASKETBALL',
      startAt: START,
      endAt: START + HOUR,
      title: 'Practice',
      notes: 'Bring water',
    });
    const other = await create({ type: 'GYM', startAt: START + 2 * HOUR });
    const others = await otherTables();
    clock.set(MARKED);

    const marked = await mark(event.id);
    expect(marked).toEqual({ ...event, completion: { completedAt: MARKED, source: 'LOCAL_USER' } });
    expect(schedule(marked)).toEqual(schedule(event));
    expect(marked.updatedAt).toBe(event.updatedAt);
    expect(await getCalendarEvent(db, gal, event.id)).toEqual(marked);
    // Only that row's two completion columns moved.
    expect(await getCalendarEvent(db, gal, other.id)).toEqual(other);
    expect(
      await db.getFirstAsync('SELECT completed_at, completion_source FROM calendar_events WHERE id = ?', [
        event.id,
      ]),
    ).toEqual({ completed_at: MARKED, completion_source: 'LOCAL_USER' });
    // No training session, result, measurement or self-assessment appears.
    expect(await otherTables()).toEqual(others);
  });

  it('3. completion survives a restart (close and reopen the database)', async () => {
    const event = await create();
    clock.set(MARKED);
    const marked = await mark(event.id);
    await db.closeAsync();

    const reopened = await openLocalDatabase();
    db = reopened.db;
    expect(reopened.migration.applied).toEqual([]);
    expect(await getCalendarEvent(db, gal, event.id)).toEqual(marked);
    expect(marked.completion).toEqual({ completedAt: MARKED, source: 'LOCAL_USER' });
  });

  it('4. undo makes it NOT completed again; the schedule is unchanged', async () => {
    const event = await create({ endAt: START + HOUR, title: 'Cup' });
    clock.set(MARKED);
    await mark(event.id);
    clock.set(MARKED + HOUR);
    const undone = await undo(event.id);
    expect(undone).toEqual(event);
    expect(await getCalendarEvent(db, gal, event.id)).toEqual(event);
    expect(await db.getFirstAsync('SELECT completed_at, completion_source FROM calendar_events')).toEqual({
      completed_at: null,
      completion_source: null,
    });
  });

  it('5. marking twice is idempotent: one row, the first completion time kept', async () => {
    const event = await create();
    clock.set(MARKED);
    const first = await mark(event.id);
    clock.set(MARKED + HOUR);
    const second = await mark(event.id);
    expect(second).toEqual(first);
    expect(second.completion!.completedAt).toBe(MARKED);
    expect(await eventRows()).toHaveLength(1);
  });

  it('6. undoing twice (or undoing a never-completed event) is idempotent', async () => {
    const event = await create();
    expect(await undo(event.id)).toEqual(event);
    clock.set(MARKED);
    await mark(event.id);
    expect(await undo(event.id)).toEqual(event);
    expect(await undo(event.id)).toEqual(event);
    expect(await eventRows()).toHaveLength(1);
  });

  it('7a. editing a completed event keeps its completion (time and source)', async () => {
    const event = await create({ title: 'Before' });
    clock.set(MARKED);
    const marked = await mark(event.id);
    clock.set(MARKED + HOUR);
    const edited = expectOk(
      await updateCalendarEvent(
        db,
        gal,
        event.id,
        { type: 'RECOVERY', startAt: START + 3 * HOUR, title: 'After', notes: 'Moved' },
        { clock },
      ),
    );
    expect(edited.completion).toEqual(marked.completion);
    expect(edited).toMatchObject({ type: 'RECOVERY', title: 'After', updatedAt: MARKED + HOUR });
    expect(await getCalendarEvent(db, gal, event.id)).toEqual(edited);
  });

  it('7b. editing a not-completed event leaves it NOT completed', async () => {
    const event = await create();
    clock.set(START + 10 * HOUR); // after the event: still nothing is inferred
    const edited = expectOk(
      await updateCalendarEvent(db, gal, event.id, { type: 'GYM', startAt: START }, { clock }),
    );
    expect(edited.completion).toBeNull();
  });

  it('8. deleting a completed event removes it and its completion; nothing is left behind', async () => {
    const event = await create();
    const others = await otherTables();
    clock.set(MARKED);
    await mark(event.id);
    await deleteCalendarEvent(db, gal, event.id);
    expect(await eventRows()).toEqual([]);
    expect(await otherTables()).toEqual(others);
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    await expect(mark(event.id)).rejects.toBeInstanceOf(CalendarEventNotFoundError);
  });

  it('9. a historical event of a now-inactive sport can still be marked and undone', async () => {
    const event = await create({ sport: 'BASKETBALL', title: 'Old practice' });
    const deactivated = await updatePlayer(db, gal, { ...GAL, basketball: null }, { clock });
    expect(deactivated.ok).toBe(true);
    const profile = await getPlayer(db, gal);
    expect(profile!.sports).toEqual([expect.objectContaining({ sport: 'BASKETBALL', active: false })]);

    clock.set(MARKED);
    const marked = await mark(event.id);
    expect(marked).toEqual({ ...event, completion: { completedAt: MARKED, source: 'LOCAL_USER' } });
    expect(await undo(event.id)).toEqual(event);
  });

  it("10. an unknown event, or another Player's event, is not found; nothing is written", async () => {
    const noasEvent = await create({}, noa);
    const before = await eventRows();
    for (const attempt of [
      () => mark(GHOST),
      () => undo(GHOST),
      () => mark(noasEvent.id),
      () => undo(noasEvent.id),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(CalendarEventNotFoundError);
    }
    expect(await eventRows()).toEqual(before);
  });

  describe('11. a storage failure leaves the stored state as it was', () => {
    function failingOn(pattern: RegExp): PlayerDb {
      const check = (sql: string) => {
        if (pattern.test(sql)) throw new Error('injected failure');
      };
      return {
        runAsync: async (sql, params) => (check(sql), db.runAsync(sql, params)),
        getFirstAsync: async (sql, params) => (check(sql), db.getFirstAsync(sql, params)),
        getAllAsync: async (sql, params) => (check(sql), db.getAllAsync(sql, params)),
        withTransactionAsync: (task) => db.withTransactionAsync(task),
      };
    }
    /** Lets the UPDATE run, then fails the re-read: the transaction must roll it back. */
    function failingAfterWrite(): PlayerDb {
      let wrote = false;
      return {
        ...failingOn(/^$/),
        runAsync: async (sql, params) => {
          const result = await db.runAsync(sql, params);
          if (/^UPDATE calendar_events/.test(sql)) wrote = true;
          return result;
        },
        getFirstAsync: async (sql, params) => {
          if (wrote) throw new Error('injected failure');
          return db.getFirstAsync(sql, params);
        },
      };
    }

    it('mark: a failing UPDATE, or a failure after it, leaves it NOT completed', async () => {
      const event = await create();
      const rows = await eventRows();
      clock.set(MARKED);
      await expect(mark(event.id, failingOn(/^UPDATE calendar_events/))).rejects.toThrow('injected failure');
      expect(await eventRows()).toEqual(rows);
      await expect(mark(event.id, failingAfterWrite())).rejects.toThrow('injected failure');
      expect(await eventRows()).toEqual(rows);
      // The connection is still usable; a retry succeeds.
      expect((await mark(event.id)).completion).toEqual({ completedAt: MARKED, source: 'LOCAL_USER' });
    });

    it('undo: a failing UPDATE, or a failure after it, leaves it completed', async () => {
      const event = await create();
      clock.set(MARKED);
      await mark(event.id);
      const rows = await eventRows();
      await expect(undo(event.id, failingOn(/^UPDATE calendar_events/))).rejects.toThrow('injected failure');
      expect(await eventRows()).toEqual(rows);
      await expect(undo(event.id, failingAfterWrite())).rejects.toThrow('injected failure');
      expect(await eventRows()).toEqual(rows);
      expect((await undo(event.id)).completion).toBeNull();
    });
  });

  describe('12. malformed completion data fails closed (the whole read, and mark / undo write nothing)', () => {
    /** Writes raw completion columns into the event; `bypassChecks` only for the corruption. */
    async function corrupt(eventId: string, completedAt: unknown, source: unknown, bypassChecks = false) {
      if (bypassChecks) await db.execAsync('PRAGMA ignore_check_constraints = ON');
      try {
        await db.runAsync('UPDATE calendar_events SET completed_at = ?, completion_source = ? WHERE id = ?', [
          completedAt,
          source,
          eventId,
        ] as never);
      } finally {
        await db.execAsync('PRAGMA ignore_check_constraints = OFF');
      }
      expect(await db.getFirstAsync('PRAGMA ignore_check_constraints')).toEqual({
        ignore_check_constraints: 0,
      });
    }

    it.each([
      [
        'an unknown source (SQL accepts any text)',
        MARKED,
        'COACH',
        false,
        'completionSource',
        'UNKNOWN_CODE',
      ],
      ['a time without a source', MARKED, null, true, 'completionSource', 'INVALID_VALUE'],
      ['a source without a time', null, 'LOCAL_USER', true, 'completedAt', 'INVALID_VALUE'],
      ['a text time', 'yesterday', 'LOCAL_USER', true, 'completedAt', 'INVALID_VALUE'],
      ['a fractional time', MARKED + 0.5, 'LOCAL_USER', true, 'completedAt', 'INVALID_VALUE'],
      ['a non-text (blob) source', MARKED, new Uint8Array([1]), true, 'completionSource', 'INVALID_VALUE'],
    ])('%s', async (_name, completedAt, source, bypassChecks, field, reason) => {
      const valid = await create({ startAt: START - HOUR }); // a valid neighbour: no partial list
      const bad = await create();
      await corrupt(bad.id, completedAt, source, bypassChecks);
      const rows = await eventRows();
      for (const attempt of [
        () => listCalendarEvents(db, gal),
        () => getCalendarEvent(db, gal, bad.id),
        () => mark(bad.id),
        () => undo(bad.id),
      ]) {
        const failed = attempt();
        await expect(failed).rejects.toBeInstanceOf(CalendarEventDataError);
        await expect(failed).rejects.toMatchObject({ field, reason, eventId: bad.id });
      }
      // Nothing repaired, cleared or deleted.
      expect(await eventRows()).toEqual(rows);
      expect(await getCalendarEvent(db, gal, valid.id)).toEqual(valid);
    });

    it('the database itself rejects a half-set or non-integer completion (CHECK)', async () => {
      const event = await create();
      for (const [at, source] of [
        [MARKED, null],
        [null, 'LOCAL_USER'],
        [MARKED + 0.5, 'LOCAL_USER'],
        ['now', 'LOCAL_USER'],
        [MARKED, '   '],
      ] as const) {
        await expect(corrupt(event.id, at, source)).rejects.toThrow(/CHECK constraint failed/);
      }
      expect((await getCalendarEvent(db, gal, event.id))!.completion).toBeNull();
    });
  });
});
