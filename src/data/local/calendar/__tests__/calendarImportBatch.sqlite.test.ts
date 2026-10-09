import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { ActivityTypeInactiveError } from '../../activityTypes/errors';
import { setActivityTypeActive } from '../../activityTypes/activityTypeRepository';
import { openLocalDatabase } from '../../database';
import { PlayerNotFoundError } from '../../players/errors';
import { createPlayer, type PlayerProfileInput } from '../../players/playerRepository';
import {
  createCalendarEvent,
  createCalendarEventBatch,
  getCalendarEvent,
  listCalendarEventBatch,
  listCalendarEvents,
  markCalendarEventCompleted,
  undoCalendarImport,
  updateCalendarEvent,
  type CreateCalendarEventBatchResult,
} from '../calendarEventRepository';
import { CalendarSportNotAssignedError } from '../errors';

/**
 * CAL-TEXT-IMPORT-001B — the import batch on real SQLite: provenance, all-or-
 * nothing creation, Player-scoped batch reads and the batch undo safety rules.
 * "Daniel" = a Basketball Player, "Maya" = a Player without a sport.
 */
const T0 = new Date(2026, 9, 9, 18, 0).getTime();
const HOUR = 3_600_000;
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}
const DANIEL: PlayerProfileInput = {
  player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } },
  basketball: { primaryPosition: 'SG', experience: 'ONE_TO_TWO_YEARS', weeklyFrequency: 'FOUR_TO_FIVE' },
};
const MAYA: PlayerProfileInput = { player: { name: 'מאיה', dateOfBirth: { year: 2014, month: 5, day: 6 } }, basketball: null };
const GHOST = '00000000-0000-4000-8000-000000000999';

/** The reviewed Preview of the owner's example 1 (Mon / Wed / Thu / Fri at Ein Carmel), as structured inputs. */
const WEEK_EXAMPLE_1: CalendarEventInput[] = [
  { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(12, 18, 40), endAt: at(12, 20, 10), location: 'עין כרמל' },
  { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(14, 17, 10), endAt: at(14, 18, 40), location: 'עין כרמל' },
  { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(15, 18, 40), endAt: at(15, 20, 10), location: 'עין כרמל' },
  { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: at(16, 14, 30), endAt: at(16, 16, 0), location: 'עין כרמל' },
];

describe('calendar import batch (schema v13) on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  let daniel: Uuid;
  let maya: Uuid;

  const count = async (table = 'calendar_events') =>
    (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n;
  const importFor = (playerId: string, events: readonly CalendarEventInput[]) =>
    createCalendarEventBatch(db, playerId, { events, source: 'TEXT_IMPORT' }, { ids, clock });
  const ok = (r: CreateCalendarEventBatchResult) => {
    if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`);
    return r;
  };
  const noSport = (events: readonly CalendarEventInput[]) => events.map((e) => ({ ...e, sport: null }));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-import-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
    for (const [input, set] of [
      [DANIEL, (id: Uuid) => (daniel = id)],
      [MAYA, (id: Uuid) => (maya = id)],
    ] as const) {
      const result = await createPlayer(db, input, { ids, clock: fakeClock(T0 - 24 * HOUR) });
      if (!result.ok) throw new Error('seed failed');
      set(result.profile.player.id);
    }
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  describe('create (all or nothing)', () => {
    it('saves exactly the reviewed events with location, source TEXT_IMPORT and ONE shared batch id', async () => {
      const { importBatchId, events } = ok(await importFor(daniel, WEEK_EXAMPLE_1));
      expect(events).toHaveLength(4);
      expect(new Set(events.map((e) => e.id)).size).toBe(4);
      expect(events.every((e) => e.importBatchId === importBatchId && e.source === 'TEXT_IMPORT')).toBe(true);
      expect(events.map((e) => [e.playerId, e.type, e.sport, e.startAt, e.endAt, e.location, e.title, e.notes])).toEqual(
        WEEK_EXAMPLE_1.map((i) => [daniel, i.type, i.sport, i.startAt, i.endAt, 'עין כרמל', null, null]),
      );
      expect(events.every((e) => e.createdAt === T0 && e.updatedAt === T0 && e.completion === null)).toBe(true);
      expect(await listCalendarEventBatch(db, daniel, importBatchId)).toEqual(events);
    });

    it('uses the reviewed values as given: no end time invented, type and location unchanged, text trimmed', async () => {
      const { events } = ok(
        await importFor(maya, [
          { type: 'GAME', startAt: at(13, 16, 30), endAt: null, location: '  עין כרמל ', notes: 'משחק אימון נגד העומר' },
        ]),
      );
      expect(events[0]).toMatchObject({ type: 'GAME', endAt: null, location: 'עין כרמל', notes: 'משחק אימון נגד העומר', sport: null });
    });

    it('two imports get two different batch ids; a hand-entered event has no provenance', async () => {
      const a = ok(await importFor(daniel, WEEK_EXAMPLE_1.slice(0, 2)));
      const b = ok(await importFor(daniel, WEEK_EXAMPLE_1.slice(2)));
      expect(a.importBatchId).not.toBe(b.importBatchId);
      const manual = await createCalendarEvent(db, daniel, { type: 'GYM', startAt: at(12, 7), location: 'חדר כושר' }, { ids, clock });
      expect(manual.ok && [manual.event.source, manual.event.importBatchId, manual.event.location]).toEqual([null, null, 'חדר כושר']);
    });

    it('an invalid 3rd event of 4 → each failing index reported, ZERO rows written', async () => {
      const bad = [...WEEK_EXAMPLE_1];
      bad[2] = { ...bad[2]!, endAt: bad[2]!.startAt - HOUR }; // end before start
      bad[3] = { ...bad[3]!, location: 'x'.repeat(81) };
      const result = await importFor(daniel, bad);
      expect(result).toEqual({
        ok: false,
        errors: [
          { index: 2, errors: { endAt: 'NOT_AFTER_START' } },
          { index: 3, errors: { location: 'TOO_LONG' } },
        ],
      });
      expect(await count()).toBe(0);
    });

    it('a failure inside the transaction (an inactive type on the 3rd event) writes NOTHING', async () => {
      await createCalendarEvent(db, daniel, { type: 'GYM', startAt: at(11, 9) }, { ids, clock });
      await setActivityTypeActive(db, 'RECOVERY', false, { clock });
      const events = [...WEEK_EXAMPLE_1];
      events[2] = { ...events[2]!, type: 'RECOVERY' };
      await expect(importFor(daniel, events)).rejects.toThrow(ActivityTypeInactiveError);
      expect(await count()).toBe(1); // only the earlier hand-entered event
    });

    it('an unknown Player or a sport the Player does not have writes nothing', async () => {
      await expect(importFor(GHOST, noSport(WEEK_EXAMPLE_1))).rejects.toThrow(PlayerNotFoundError);
      await expect(importFor(maya, WEEK_EXAMPLE_1)).rejects.toThrow(CalendarSportNotAssignedError);
      expect(await count()).toBe(0);
    });

    it('refuses an empty import and an unknown source', async () => {
      await expect(importFor(daniel, [])).rejects.toThrow(RangeError);
      await expect(
        createCalendarEventBatch(db, daniel, { events: WEEK_EXAMPLE_1, source: 'WHATEVER' as never }, { ids, clock }),
      ).rejects.toThrow(RangeError);
      expect(await count()).toBe(0);
    });

    it('creates CalendarEvents only — no plan, session, template or block', async () => {
      ok(await importFor(daniel, WEEK_EXAMPLE_1));
      for (const table of ['planned_workouts', 'training_sessions', 'workout_templates', 'workout_blocks']) {
        expect(await count(table)).toBe(0);
      }
    });

    it('location, source and batch id survive closing and reopening the database (restart)', async () => {
      const { importBatchId, events } = ok(await importFor(daniel, WEEK_EXAMPLE_1));
      await db.closeAsync();
      db = (await openLocalDatabase()).db;
      expect(await listCalendarEventBatch(db, daniel, importBatchId)).toEqual(events);
    });
  });

  describe('batch read and update', () => {
    it("a batch is Player-scoped: Maya never sees Daniel's batch; a malformed id reads nothing", async () => {
      const { importBatchId } = ok(await importFor(daniel, WEEK_EXAMPLE_1));
      expect(await listCalendarEventBatch(db, maya, importBatchId)).toEqual([]);
      expect(await listCalendarEventBatch(db, daniel, 'not-a-uuid')).toEqual([]);
    });

    it('an edit that omits the location keeps it; an edit may change or clear it; provenance never changes', async () => {
      const { events } = ok(await importFor(daniel, WEEK_EXAMPLE_1.slice(0, 1)));
      const e = events[0]!;
      clock.set(T0 + 60_000);
      const kept = await updateCalendarEvent(db, daniel, e.id, { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: e.startAt, endAt: e.endAt }, { clock });
      expect(kept.ok && [kept.event.location, kept.event.source, kept.event.importBatchId]).toEqual(['עין כרמל', 'TEXT_IMPORT', e.importBatchId]);
      const moved = await updateCalendarEvent(db, daniel, e.id, { type: 'TEAM_TRAINING', startAt: e.startAt, endAt: e.endAt, location: 'אולם 2' }, { clock });
      expect(moved.ok && moved.event.location).toBe('אולם 2');
      const cleared = await updateCalendarEvent(db, daniel, e.id, { type: 'TEAM_TRAINING', startAt: e.startAt, endAt: e.endAt, location: '  ' }, { clock });
      expect(cleared.ok && [cleared.event.location, cleared.event.source, cleared.event.importBatchId]).toEqual([null, 'TEXT_IMPORT', e.importBatchId]);
    });
  });

  describe('undo import (safety)', () => {
    it("deleting batch A never touches batch B, Maya's batch or a hand-entered event at the same time and place", async () => {
      const a = ok(await importFor(daniel, WEEK_EXAMPLE_1.slice(0, 2)));
      const b = ok(await importFor(daniel, WEEK_EXAMPLE_1.slice(2)));
      const mayas = ok(await importFor(maya, noSport(WEEK_EXAMPLE_1)));
      const twin = await createCalendarEvent(db, daniel, { ...WEEK_EXAMPLE_1[0]! }, { ids, clock }); // same date, type, location
      const before = await listCalendarEvents(db, daniel);

      const result = await undoCalendarImport(db, daniel, a.importBatchId);
      expect(result).toEqual({ deletedIds: a.events.map((e) => e.id), kept: [] });
      expect(await listCalendarEvents(db, daniel)).toEqual(before.filter((e) => !a.events.some((x) => x.id === e.id)));
      expect(await listCalendarEventBatch(db, daniel, b.importBatchId)).toEqual(b.events);
      expect(await listCalendarEventBatch(db, maya, mayas.importBatchId)).toEqual(mayas.events);
      expect(twin.ok && (await getCalendarEvent(db, daniel, twin.event.id))).toEqual(twin.ok && twin.event);
    });

    it("Maya's player id cannot undo Daniel's batch", async () => {
      const a = ok(await importFor(daniel, WEEK_EXAMPLE_1));
      expect(await undoCalendarImport(db, maya, a.importBatchId)).toEqual({ deletedIds: [], kept: [] });
      expect(await listCalendarEventBatch(db, daniel, a.importBatchId)).toHaveLength(4);
    });

    it('keeps a COMPLETED event and an EDITED event (reported), deletes the rest; a second undo deletes nothing', async () => {
      const { importBatchId, events } = ok(await importFor(daniel, WEEK_EXAMPLE_1));
      const [mon, wed, thu, fri] = events as [typeof events[0], typeof events[0], typeof events[0], typeof events[0]];
      clock.set(T0 + 60_000);
      await markCalendarEventCompleted(db, daniel, mon.id, { clock });
      await updateCalendarEvent(db, daniel, wed.id, { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: wed.startAt, endAt: wed.endAt, notes: 'מגרש 2' }, { clock });

      const result = await undoCalendarImport(db, daniel, importBatchId);
      expect(result.deletedIds).toEqual([thu.id, fri.id]);
      expect(result.kept).toEqual([
        { id: mon.id, reason: 'COMPLETED' },
        { id: wed.id, reason: 'EDITED' },
      ]);
      expect((await listCalendarEventBatch(db, daniel, importBatchId)).map((e) => e.id)).toEqual([mon.id, wed.id]);
      expect(await undoCalendarImport(db, daniel, importBatchId)).toEqual({
        deletedIds: [],
        kept: [
          { id: mon.id, reason: 'COMPLETED' },
          { id: wed.id, reason: 'EDITED' },
        ],
      });
    });

    it('an unknown batch id is a no-op', async () => {
      ok(await importFor(daniel, WEEK_EXAMPLE_1));
      expect(await undoCalendarImport(db, daniel, GHOST)).toEqual({ deletedIds: [], kept: [] });
      expect(await count()).toBe(4);
    });
  });
});
