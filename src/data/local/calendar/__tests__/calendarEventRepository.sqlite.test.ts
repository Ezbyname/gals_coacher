import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { CalendarEvent, CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../../database';
import { PlayerNotFoundError } from '../../players/errors';
import type { PlayerDb } from '../../players/playerDb';
import { createPlayer, updatePlayer, type PlayerProfileInput } from '../../players/playerRepository';
import { createSelfAssessment } from '../../selfAssessments/selfAssessmentRepository';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  type SaveCalendarEventResult,
} from '../calendarEventRepository';
import { CalendarEventDataError, CalendarEventNotFoundError, CalendarSportNotAssignedError } from '../errors';

const T0 = new Date(2026, 9, 4, 18, 30).getTime();
const HOUR = 3_600_000;
const START = new Date(2026, 9, 6, 17, 0).getTime();

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}

const expectOk = (result: SaveCalendarEventResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.event;
};

const BASKETBALL_PLAYER: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG', experience: 'ONE_TO_TWO_YEARS', weeklyFrequency: 'FOUR_TO_FIVE' },
};
const NO_SPORT_PLAYER: PlayerProfileInput = {
  player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } },
  basketball: null,
};
const GHOST = '00000000-0000-4000-8000-000000000999';

describe('calendar event repository on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  let gal: Uuid;
  let noa: Uuid;

  const eventRows = () => db.getAllAsync('SELECT * FROM calendar_events ORDER BY id');
  const eventCount = async () =>
    (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events'))!.n;
  /** Everything outside calendar_events (the write boundary). */
  const otherTables = async () => ({
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT * FROM players ORDER BY id'),
    player_sports: await db.getAllAsync('SELECT * FROM player_sports ORDER BY player_id, sport'),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    self_assessments: await db.getAllAsync('SELECT * FROM self_assessments ORDER BY id'),
    self_assessment_ratings: await db.getAllAsync(
      'SELECT * FROM self_assessment_ratings ORDER BY assessment_id, category',
    ),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  });
  const create = async (input: Partial<CalendarEventInput> = {}, playerId: string = gal) =>
    expectOk(
      await createCalendarEvent(db, playerId, { type: 'GAME', startAt: START, ...input }, { ids, clock }),
    );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-cal-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
    const playerClock = fakeClock(new Date(2026, 9, 3, 12).getTime());
    for (const [input, set] of [
      [BASKETBALL_PLAYER, (id: Uuid) => (gal = id)],
      [NO_SPORT_PLAYER, (id: Uuid) => (noa = id)],
    ] as const) {
      const result = await createPlayer(db, input, { ids, clock: playerClock });
      if (!result.ok) throw new Error('seed failed');
      set(result.profile.player.id);
    }
    // A self-assessment too, so the write boundary covers every pre-v4 table with data.
    const assessment = await createSelfAssessment(
      db,
      gal,
      'BASKETBALL',
      ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'].map((category) => ({
        category,
        rating: 3,
      })),
      { ids, clock: playerClock },
    );
    if (!assessment.ok) throw new Error('seed failed');
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('saves a minimal sport-less event: client id, createdAt = updatedAt = clock, nulls stored', async () => {
      const saved = await create();
      expect(saved).toEqual({
        id: '00000000-0000-4000-8000-000000000005', // ids 1–4: two players, the family, one assessment
        playerId: gal,
        type: 'GAME',
        sport: null,
        startAt: START,
        endAt: null,
        title: null,
        notes: null,
        location: null,
        source: null,
        importBatchId: null,
        createdAt: T0,
        updatedAt: T0,
        activityType: { id: 'GAME', builtin: 'GAME', name: null, active: true },
        completion: null,
      });
      expect(await eventRows()).toEqual([
        {
          id: saved.id,
          player_id: gal,
          type: 'GAME',
          sport: null,
          start_at: START,
          end_at: null,
          title: null,
          notes: null,
          created_at: T0,
          updated_at: T0,
          completed_at: null,
          completion_source: null,
          location: null,
          source: null,
          import_batch_id: null,
          planned_workout_id: null,
        },
      ]);
      expect(await getCalendarEvent(db, gal, saved.id)).toEqual(saved);
    });

    it('saves a full Basketball event with trimmed text; blank notes become null', async () => {
      const saved = await create({
        type: 'TEAM_TRAINING',
        sport: 'BASKETBALL',
        endAt: START + 2 * HOUR,
        title: '  Practice  ',
        notes: ' \n ',
      });
      expect(saved).toMatchObject({
        type: 'TEAM_TRAINING',
        sport: 'BASKETBALL',
        endAt: START + 2 * HOUR,
        title: 'Practice',
        notes: null,
      });
      expect(await listCalendarEvents(db, gal)).toEqual([saved]);
    });

    it('every type is accepted; OTHER with a title', async () => {
      for (const type of ['TEAM_TRAINING', 'PERSONAL_TRAINING', 'GAME', 'GYM', 'RECOVERY'])
        await create({ type });
      await create({ type: 'OTHER', title: 'School trip' });
      expect((await listCalendarEvents(db, gal)).map((e) => e.type).sort()).toEqual([
        'GAME',
        'GYM',
        'OTHER',
        'PERSONAL_TRAINING',
        'RECOVERY',
        'TEAM_TRAINING',
      ]);
    });

    it('a player without any sport can have sport-less events', async () => {
      const saved = await create({ type: 'GYM' }, noa);
      expect(await listCalendarEvents(db, noa)).toEqual([saved]);
    });

    it.each([
      ['an unknown type', { type: 'SCHOOL' }, { type: 'UNKNOWN_TYPE' }],
      ['an unsupported sport', { sport: 'SOCCER' }, { sport: 'UNSUPPORTED_SPORT' }],
      ['a fractional start', { startAt: START + 0.5 }, { startAt: 'INVALID_TIMESTAMP' }],
      ['an end equal to the start', { endAt: START }, { endAt: 'NOT_AFTER_START' }],
      ['an end before the start', { endAt: START - 1 }, { endAt: 'NOT_AFTER_START' }],
      ['OTHER without a title', { type: 'OTHER', title: '   ' }, { title: 'REQUIRED_FOR_OTHER' }],
    ])('%s is a validation result: nothing written', async (_label, input, errors) => {
      const before = await otherTables();
      const result = await createCalendarEvent(
        db,
        gal,
        { type: 'GAME', startAt: START, ...input },
        { ids, clock },
      );
      expect(result).toEqual({ ok: false, errors });
      expect(await eventCount()).toBe(0);
      expect(await otherTables()).toEqual(before);
    });

    it('an unknown player: PlayerNotFoundError, nothing written', async () => {
      await expect(
        createCalendarEvent(db, GHOST, { type: 'GAME', startAt: START }, { ids, clock }),
      ).rejects.toThrow(PlayerNotFoundError);
      expect(await eventCount()).toBe(0);
    });

    it('a sport the player is not assigned to: CalendarSportNotAssignedError, nothing written', async () => {
      const before = await otherTables();
      const attempt = createCalendarEvent(
        db,
        noa,
        { type: 'GAME', sport: 'BASKETBALL', startAt: START },
        { ids, clock },
      );
      await expect(attempt).rejects.toBeInstanceOf(CalendarSportNotAssignedError);
      await expect(attempt).rejects.toMatchObject({ playerId: noa, sport: 'BASKETBALL' });
      expect(await eventCount()).toBe(0);
      expect(await otherTables()).toEqual(before);
    });

    it('works with that sport once Basketball has been added to the player', async () => {
      const added = await updatePlayer(
        db,
        noa,
        { ...NO_SPORT_PLAYER, basketball: { primaryPosition: 'C' } },
        { clock },
      );
      expect(added.ok).toBe(true);
      expect((await create({ sport: 'BASKETBALL' }, noa)).sport).toBe('BASKETBALL');
    });

    it('a duplicate generated id is rejected by the primary key, never overwriting', async () => {
      const first = await create();
      const sameId: IdService = { newUuid: () => first.id };
      await expect(
        createCalendarEvent(db, gal, { type: 'GYM', startAt: START + HOUR }, { ids: sameId, clock }),
      ).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
      expect(await listCalendarEvents(db, gal)).toEqual([first]);
    });
  });

  describe('update', () => {
    it('replaces the user fields; id, playerId and createdAt unchanged; updatedAt = clock', async () => {
      const original = await create({
        sport: 'BASKETBALL',
        endAt: START + HOUR,
        title: 'Cup',
        notes: 'Bring water',
      });
      const other = await create({ type: 'GYM', startAt: START + 5 * HOUR });
      clock.set(T0 + 60_000);
      const updated = expectOk(
        await updateCalendarEvent(
          db,
          gal,
          original.id,
          {
            type: 'RECOVERY',
            sport: null,
            startAt: START + HOUR,
            endAt: null,
            title: '  Stretch ',
            notes: null,
          },
          { clock },
        ),
      );
      expect(updated).toEqual({
        id: original.id,
        playerId: gal,
        type: 'RECOVERY',
        sport: null,
        startAt: START + HOUR,
        endAt: null,
        title: 'Stretch',
        notes: null,
        location: null,
        source: null,
        importBatchId: null,
        createdAt: T0,
        updatedAt: T0 + 60_000,
        activityType: { id: 'RECOVERY', builtin: 'RECOVERY', name: null, active: true },
        completion: null,
      });
      expect(await getCalendarEvent(db, gal, original.id)).toEqual(updated);
      expect(await getCalendarEvent(db, gal, other.id)).toEqual(other);
      expect(await eventCount()).toBe(2);
    });

    it('writes only calendar_events', async () => {
      const event = await create();
      const before = await otherTables();
      expectOk(await updateCalendarEvent(db, gal, event.id, { type: 'GYM', startAt: START }, { clock }));
      expect(await otherTables()).toEqual(before);
    });

    it.each([
      [
        'OTHER with a blank title',
        { type: 'OTHER', startAt: START, title: ' \t ' },
        { title: 'REQUIRED_FOR_OTHER' },
      ],
      [
        'an end before the start',
        { type: 'GAME', startAt: START, endAt: START - HOUR },
        { endAt: 'NOT_AFTER_START' },
      ],
      ['an unknown type', { type: 'UNAVAILABLE', startAt: START }, { type: 'UNKNOWN_TYPE' }],
    ])('%s is a validation result: the stored event is unchanged', async (_label, input, errors) => {
      const event = await create({ title: 'Final' });
      const rows = await eventRows();
      clock.set(T0 + 1);
      expect(await updateCalendarEvent(db, gal, event.id, input, { clock })).toEqual({ ok: false, errors });
      expect(await eventRows()).toEqual(rows);
    });

    it('an unknown event id: CalendarEventNotFoundError, never created (no upsert)', async () => {
      const event = await create();
      const missing = '00000000-0000-4000-8000-0000000000ee';
      const attempt = updateCalendarEvent(db, gal, missing, { type: 'GYM', startAt: START }, { clock });
      await expect(attempt).rejects.toBeInstanceOf(CalendarEventNotFoundError);
      await expect(attempt).rejects.toMatchObject({ playerId: gal, eventId: missing });
      expect(await listCalendarEvents(db, gal)).toEqual([event]);
    });

    it('another player cannot update an event (CalendarEventNotFoundError); it is unchanged', async () => {
      const event = await create();
      const rows = await eventRows();
      clock.set(T0 + 1);
      await expect(
        updateCalendarEvent(db, noa, event.id, { type: 'GYM', startAt: START + HOUR }, { clock }),
      ).rejects.toBeInstanceOf(CalendarEventNotFoundError);
      expect(await eventRows()).toEqual(rows);
      expect(await listCalendarEvents(db, noa)).toEqual([]);
    });

    it('a sport the player is not assigned to: CalendarSportNotAssignedError, unchanged', async () => {
      const event = await create({}, noa);
      const rows = await eventRows();
      await expect(
        updateCalendarEvent(
          db,
          noa,
          event.id,
          { type: 'GAME', sport: 'BASKETBALL', startAt: START },
          { clock },
        ),
      ).rejects.toBeInstanceOf(CalendarSportNotAssignedError);
      expect(await eventRows()).toEqual(rows);
    });
  });

  describe('delete (hard)', () => {
    it("removes only that event's row; the next read does not contain it", async () => {
      const a = await create();
      const b = await create({ type: 'GYM', startAt: START + HOUR });
      const c = await create({}, noa);
      const before = await otherTables();
      await deleteCalendarEvent(db, gal, a.id);
      expect(await db.getFirstAsync('SELECT id FROM calendar_events WHERE id = ?', [a.id])).toBeNull();
      expect(await getCalendarEvent(db, gal, a.id)).toBeNull();
      expect(await listCalendarEvents(db, gal)).toEqual([b]);
      expect(await listCalendarEvents(db, noa)).toEqual([c]);
      expect(await otherTables()).toEqual(before);
    });

    it('an unknown or already-deleted event: CalendarEventNotFoundError', async () => {
      const a = await create();
      await deleteCalendarEvent(db, gal, a.id);
      const attempt = deleteCalendarEvent(db, gal, a.id);
      await expect(attempt).rejects.toBeInstanceOf(CalendarEventNotFoundError);
      await expect(attempt).rejects.toMatchObject({ playerId: gal, eventId: a.id });
    });

    it('another player cannot delete an event (CalendarEventNotFoundError); it remains', async () => {
      const a = await create();
      await expect(deleteCalendarEvent(db, noa, a.id)).rejects.toBeInstanceOf(CalendarEventNotFoundError);
      expect(await listCalendarEvents(db, gal)).toEqual([a]);
    });
  });

  describe('get / list', () => {
    it("get: null for an unknown id and for another player's event", async () => {
      const a = await create();
      expect(await getCalendarEvent(db, gal, '00000000-0000-4000-8000-0000000000ee')).toBeNull();
      expect(await getCalendarEvent(db, noa, a.id)).toBeNull();
    });

    it('list: [] when the player has no events', async () => {
      expect(await listCalendarEvents(db, gal)).toEqual([]);
    });

    it("list: only that player's events", async () => {
      const mine = await create();
      const theirs = await create({ type: 'GYM' }, noa);
      expect(await listCalendarEvents(db, gal)).toEqual([mine]);
      expect(await listCalendarEvents(db, noa)).toEqual([theirs]);
    });

    it('list: canonical start_at ASC, id ASC regardless of insertion order; no sectioning', async () => {
      // Ids handed out in descending order, so insertion order ≠ id order.
      const queue = ['0d', '0c', '0b', '0a'].map((s) => `00000000-0000-4000-8000-0000000000${s}` as Uuid);
      const descending: IdService = { newUuid: () => queue.shift()! };
      const mk = async (startAt: number) =>
        expectOk(await createCalendarEvent(db, gal, { type: 'GAME', startAt }, { ids: descending, clock }));
      const late = await mk(START + HOUR); // 0d
      const tieB = await mk(START); // 0c
      const past = await mk(T0 - 48 * HOUR); // 0b — already in the past at T0
      const tieA = await mk(START); // 0a
      const listed = await listCalendarEvents(db, gal);
      expect(listed.map((e) => e.id)).toEqual([past.id, tieA.id, tieB.id, late.id]);
      expect(listed).toEqual([past, tieA, tieB, late]);
    });

    it('survives closing and reopening the database (restart)', async () => {
      const a = await create({
        sport: 'BASKETBALL',
        endAt: START + HOUR,
        title: 'Cup final',
        notes: 'Hall 2',
      });
      const b = await create({ type: 'OTHER', title: 'Photo day', startAt: START - HOUR }, noa);
      await db.closeAsync();
      db = (await openLocalDatabase()).db;
      expect(await listCalendarEvents(db, gal)).toEqual([a]);
      expect(await listCalendarEvents(db, noa)).toEqual([b]);
    });
  });

  describe('atomicity', () => {
    /** Fails the first statement matching `pattern` (writes or reads), after the earlier ones ran. */
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
    const REREAD = /FROM calendar_events e/;

    it('create: a failure after the INSERT (the re-read) rolls the insert back', async () => {
      await expect(
        createCalendarEvent(failingOn(REREAD), gal, { type: 'GAME', startAt: START }, { ids, clock }),
      ).rejects.toThrow('injected failure');
      expect(await eventCount()).toBe(0);
      // The connection is still usable.
      expect((await create()).type).toBe('GAME');
    });

    it('update: a failure after the UPDATE rolls it back', async () => {
      const event = await create({ title: 'Before' });
      const rows = await eventRows();
      let reads = 0;
      const failing: PlayerDb = {
        ...failingOn(/^$/),
        getFirstAsync: async (sql, params) => {
          if (REREAD.test(sql) && ++reads === 2) throw new Error('injected failure');
          return db.getFirstAsync(sql, params);
        },
      };
      clock.set(T0 + 1);
      await expect(
        updateCalendarEvent(
          failing,
          gal,
          event.id,
          { type: 'GYM', startAt: START, title: 'After' },
          { clock },
        ),
      ).rejects.toThrow('injected failure');
      expect(await eventRows()).toEqual(rows);
    });

    it('delete: a failing DELETE leaves the event', async () => {
      const event = await create();
      await expect(deleteCalendarEvent(failingOn(/^DELETE/), gal, event.id)).rejects.toThrow(
        'injected failure',
      );
      expect(await listCalendarEvents(db, gal)).toEqual([event]);
    });
  });

  describe('malformed stored data fails the whole read', () => {
    const BAD = '00000000-0000-4000-8000-0000000000c1';
    type Raw = Partial<{
      id: unknown;
      player_id: unknown;
      type: unknown;
      sport: unknown;
      start_at: unknown;
      end_at: unknown;
      title: unknown;
      notes: unknown;
      created_at: unknown;
      updated_at: unknown;
    }>;

    /** Inserts one raw row; `bypass` switches off CHECK and/or FK enforcement for the corruption only. */
    async function corrupt(raw: Raw, bypass: { checks?: boolean; foreignKeys?: boolean } = {}) {
      const row = {
        id: BAD,
        player_id: gal,
        type: 'GAME',
        sport: null,
        start_at: START,
        end_at: null,
        title: null,
        notes: null,
        created_at: T0,
        updated_at: T0,
        ...raw,
      };
      if (bypass.checks) await db.execAsync('PRAGMA ignore_check_constraints = ON');
      if (bypass.foreignKeys) await db.execAsync('PRAGMA foreign_keys = OFF');
      try {
        await db.runAsync(
          `INSERT INTO calendar_events (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row)
            .map(() => '?')
            .join(', ')})`,
          Object.values(row) as never,
        );
      } finally {
        await db.execAsync('PRAGMA ignore_check_constraints = OFF');
        await db.execAsync('PRAGMA foreign_keys = ON');
      }
      expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      expect(await db.getFirstAsync('PRAGMA ignore_check_constraints')).toEqual({
        ignore_check_constraints: 0,
      });
    }

    async function expectReadsFail(
      field: string,
      reason: string,
      { playerId = gal, eventId = BAD }: { playerId?: string; eventId?: unknown } = {},
    ) {
      const rows = await eventRows();
      for (const attempt of [listCalendarEvents(db, playerId), getCalendarEvent(db, playerId, BAD)]) {
        await expect(attempt).rejects.toBeInstanceOf(CalendarEventDataError);
        await expect(attempt).rejects.toMatchObject({ field, reason, eventId });
      }
      // Nothing repaired, skipped or deleted by the failed reads.
      expect(await eventRows()).toEqual(rows);
    }

    let valid: CalendarEvent;
    beforeEach(async () => {
      valid = await create({ startAt: START - HOUR }); // a valid event next to the bad one: no partial list
    });

    it('an unknown type (SQL accepts it; the read fails closed)', async () => {
      await corrupt({ type: 'SCHOOL' });
      await expectReadsFail('type', 'UNKNOWN_CODE');
    });

    it('an invalid sport code (FK-valid fixture)', async () => {
      await db.runAsync('INSERT INTO player_sports (player_id, sport) VALUES (?, ?)', [gal, 'SOCCER']);
      await corrupt({ sport: 'SOCCER' });
      await expectReadsFail('sport', 'UNKNOWN_CODE');
    });

    it('a broken player relationship (no such player; FK bypassed)', async () => {
      await corrupt({ player_id: GHOST }, { foreignKeys: true });
      await expectReadsFail('playerId', 'INVALID_RELATIONSHIP', { playerId: GHOST });
    });

    it('a broken sport relationship (player without the assignment; FK bypassed)', async () => {
      await corrupt({ player_id: noa, sport: 'BASKETBALL' }, { foreignKeys: true });
      await expectReadsFail('sport', 'INVALID_RELATIONSHIP', { playerId: noa });
    });

    it.each([
      ['a fractional start', { start_at: START + 0.5 }, 'startAt'],
      ['a text start', { start_at: 'tomorrow' }, 'startAt'],
      ['an end not after the start', { end_at: START }, 'endAt'],
      ['a fractional updatedAt', { updated_at: T0 + 0.25 }, 'updatedAt'],
      ['a text createdAt', { created_at: 'now' }, 'createdAt'],
      ['OTHER with a null title', { type: 'OTHER', title: null }, 'title'],
      ['an untrimmed title', { title: '  Cup ' }, 'title'],
      ['a non-breaking-space-only note', { notes: ' ' }, 'notes'],
    ])('%s (CHECK bypassed where needed)', async (_label, raw, field) => {
      await corrupt(raw, { checks: true });
      await expectReadsFail(field, 'INVALID_VALUE');
    });

    it('an invalid UUID id', async () => {
      await corrupt({ id: 'not-a-uuid' });
      const attempt = listCalendarEvents(db, gal);
      await expect(attempt).rejects.toBeInstanceOf(CalendarEventDataError);
      await expect(attempt).rejects.toMatchObject({
        field: 'id',
        reason: 'INVALID_VALUE',
        eventId: 'not-a-uuid',
      });
    });

    it('update refuses a malformed stored event and leaves it as stored', async () => {
      await corrupt({ type: 'SCHOOL' });
      const rows = await eventRows();
      await expect(
        updateCalendarEvent(db, gal, BAD, { type: 'GAME', startAt: START }, { clock }),
      ).rejects.toBeInstanceOf(CalendarEventDataError);
      expect(await eventRows()).toEqual(rows);
    });

    it('the valid event still reads once the bad row is gone (nothing else was affected)', async () => {
      await corrupt({ type: 'SCHOOL' });
      await db.runAsync('DELETE FROM calendar_events WHERE id = ?', [BAD]);
      expect(await listCalendarEvents(db, gal)).toEqual([valid]);
    });
  });

  describe('concurrency (one operation at a time per connection)', () => {
    it('concurrent creates all complete, each with its own row', async () => {
      const results = await Promise.allSettled(
        ['GAME', 'GYM', 'RECOVERY'].map((type, i) =>
          createCalendarEvent(db, gal, { type, startAt: START + i * HOUR }, { ids, clock }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
      const saved = results.map((r) =>
        expectOk((r as PromiseFulfilledResult<SaveCalendarEventResult>).value),
      );
      expect(await listCalendarEvents(db, gal)).toEqual(saved);
    });

    it('concurrent create, update, delete and a player update all apply completely', async () => {
      const keep = await create();
      const gone = await create({ type: 'GYM', startAt: START + HOUR });
      clock.set(T0 + 5);
      const [created, updated, , player] = await Promise.all([
        createCalendarEvent(db, noa, { type: 'RECOVERY', startAt: START }, { ids, clock }),
        updateCalendarEvent(db, gal, keep.id, { type: 'GAME', startAt: START, title: 'Derby' }, { clock }),
        deleteCalendarEvent(db, gal, gone.id),
        updatePlayer(
          db,
          gal,
          { ...BASKETBALL_PLAYER, player: { ...BASKETBALL_PLAYER.player, name: 'Gal C' } },
          { clock },
        ),
      ]);
      expect(await listCalendarEvents(db, gal)).toEqual([expectOk(updated)]);
      expect(await listCalendarEvents(db, noa)).toEqual([expectOk(created)]);
      expect(player.ok && player.profile.player.name).toBe('Gal C');
      expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    });
  });
});

describe('calendar persistence boundaries', () => {
  it.each(['../calendarEventRepository.ts', '../errors.ts'])(
    '%s has no agenda sectioning, wall-clock reads, upsert or session/result coupling',
    (file) => {
      const code = readFileSync(resolve(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/agendaSection|splitAgenda|CURRENT_OR_UPCOMING|PAST/);
      expect(code).not.toMatch(/Date\.now|new Date/);
      expect(code).not.toMatch(/REPLACE|UPSERT|ON CONFLICT|INSERT OR/i);
      expect(code).not.toMatch(/training_session|measurement|result_|attempt/i);
    },
  );

  it('exports exactly create, get, list, the range read, update, delete, the explicit completion pair, the import batch trio and the workout scheduling set (QB-WORKOUT-BUILDER-001D)', () => {
    const exported = Object.keys(jest.requireActual('../calendarEventRepository'));
    expect(exported.sort()).toEqual([
      'SCHEDULED_WORKOUT_TYPE',
      'createCalendarEvent',
      'createCalendarEventBatch',
      'deleteCalendarEvent',
      'getCalendarEvent',
      'getEventWorkout',
      'getWorkoutSchedule',
      'listCalendarEventBatch',
      'listCalendarEvents',
      'listCalendarEventsInRange',
      'listWorkoutSchedules',
      'markCalendarEventCompleted',
      'rescheduleWorkout',
      'scheduleWorkout',
      'undoCalendarEventCompletion',
      'undoCalendarImport',
      'unscheduleWorkout',
      'updateCalendarEvent',
    ]);
  });
});
