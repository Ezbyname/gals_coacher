import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { ACTIVITY_TYPE_NAME_MAX_LENGTH, BUILTIN_ACTIVITY_TYPES } from '@/domain/activityType';
import type { CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import {
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  listCalendarEventsInRange,
  markCalendarEventCompleted,
  updateCalendarEvent,
  type SaveCalendarEventResult,
} from '../../calendar/calendarEventRepository';
import { CalendarEventDataError } from '../../calendar/errors';
import { openLocalDatabase } from '../../database';
import {
  createPlayer,
  getPlayer,
  updatePlayer,
  type PlayerProfileInput,
} from '../../players/playerRepository';
import {
  createCustomActivityType,
  getActivityType,
  listActivityTypes,
  setActivityTypeActive,
  type CreateActivityTypeResult,
} from '../activityTypeRepository';
import { ActivityTypeDataError, ActivityTypeInactiveError, ActivityTypeNotFoundError } from '../errors';

/** ACTIVITY-001: the catalog, and how calendar events use it. */
const T0 = new Date(2026, 9, 6, 12).getTime();
const START = new Date(2026, 9, 8, 17).getTime();
const HOUR = 3_600_000;

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}
const okType = (result: CreateActivityTypeResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.type;
};
const okEvent = (result: SaveCalendarEventResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.event;
};
const GAL: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG' },
};
const GHOST = '00000000-0000-4000-8000-000000000999';

describe('activity type catalog and calendar events on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  let gal: Uuid;

  const eventRows = () => db.getAllAsync('SELECT * FROM calendar_events ORDER BY id');
  const catalogRows = () => db.getAllAsync('SELECT * FROM activity_types ORDER BY rowid');
  const sportRows = () => db.getAllAsync('SELECT * FROM player_sports ORDER BY player_id, sport');
  const create = async (name: string) => okType(await createCustomActivityType(db, name, { ids, clock }));
  const newEvent = async (input: Partial<CalendarEventInput> = {}) =>
    createCalendarEvent(db, gal, { type: 'GAME', startAt: START, ...input }, { ids, clock });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-types-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
    const player = await createPlayer(db, GAL, { ids, clock });
    if (!player.ok) throw new Error('seed failed');
    gal = player.profile.player.id;
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  describe('catalog', () => {
    it('lists the six built-ins first, in order, active, with their code as id and no name', async () => {
      expect(await listActivityTypes(db)).toEqual(
        BUILTIN_ACTIVITY_TYPES.map((id) => ({
          id,
          builtin: id,
          name: null,
          active: true,
          createdAt: 0,
          updatedAt: 0,
        })),
      );
      expect(await getActivityType(db, 'GAME')).toMatchObject({ id: 'GAME', builtin: 'GAME' });
      expect(await getActivityType(db, GHOST)).toBeNull();
    });

    it('creates a custom type: a UUID id, the trimmed name exactly as typed, active, timestamps = clock', async () => {
      const swim = await create('  Swim  Club ');
      expect(swim).toEqual({
        id: '00000000-0000-4000-8000-000000000003', // ids 1–2: the family and the player
        builtin: null,
        name: 'Swim  Club', // trimmed only: inner spaces and case kept
        active: true,
        createdAt: T0,
        updatedAt: T0,
      });
      expect((await listActivityTypes(db)).map((t) => t.id)).toEqual([...BUILTIN_ACTIVITY_TYPES, swim.id]);
    });

    it('custom types are listed after the built-ins in creation order', async () => {
      clock.set(T0 + 2);
      const later = await create('Yoga');
      clock.set(T0 + 1);
      const earlier = await create('Swim');
      expect((await listActivityTypes(db)).slice(6).map((t) => t.id)).toEqual([earlier.id, later.id]);
    });

    it.each([
      ['blank', '   ', 'REQUIRED'],
      ['empty', '', 'REQUIRED'],
      ['over the limit', 'x'.repeat(ACTIVITY_TYPE_NAME_MAX_LENGTH + 1), 'TOO_LONG'],
    ])('rejects a %s name; nothing is written', async (_label, name, error) => {
      const before = await catalogRows();
      expect(await createCustomActivityType(db, name, { ids, clock })).toEqual({ ok: false, error });
      expect(await catalogRows()).toEqual(before);
    });

    it('accepts exactly the limit (35 characters after trimming)', async () => {
      const name = 'y'.repeat(ACTIVITY_TYPE_NAME_MAX_LENGTH);
      expect((await create(` ${name} `)).name).toBe(name);
    });

    it('rejects a duplicate custom name (case-insensitive, even inactive): re-enable instead', async () => {
      const swim = await create('Swim');
      await setActivityTypeActive(db, swim.id, false, { clock });
      const before = await catalogRows();
      expect(await createCustomActivityType(db, ' SWIM ', { ids, clock })).toEqual({
        ok: false,
        error: 'DUPLICATE',
      });
      expect(await catalogRows()).toEqual(before);
    });

    it('a custom type persists across a restart', async () => {
      const swim = await create('Swim');
      await db.closeAsync();
      db = (await openLocalDatabase()).db;
      expect(await getActivityType(db, swim.id)).toEqual(swim);
    });

    it('disable / disable again / enable / enable again: same row, same id, idempotent', async () => {
      const swim = await create('Swim');
      clock.set(T0 + HOUR);
      const off = await setActivityTypeActive(db, swim.id, false, { clock });
      expect(off).toEqual({ ...swim, active: false, updatedAt: T0 + HOUR });
      clock.set(T0 + 2 * HOUR);
      expect(await setActivityTypeActive(db, swim.id, false, { clock })).toEqual(off); // no-op: updatedAt kept
      clock.set(T0 + 3 * HOUR);
      const on = await setActivityTypeActive(db, swim.id, true, { clock });
      expect(on).toEqual({ ...swim, active: true, updatedAt: T0 + 3 * HOUR });
      clock.set(T0 + 4 * HOUR);
      expect(await setActivityTypeActive(db, swim.id, true, { clock })).toEqual(on);
      expect(await catalogRows()).toHaveLength(7); // no duplicate on reactivation
      // Built-ins too.
      expect((await setActivityTypeActive(db, 'GAME', false, { clock })).active).toBe(false);
      expect((await setActivityTypeActive(db, 'GAME', true, { clock })).id).toBe('GAME');
      expect(await catalogRows()).toHaveLength(7);
    });

    it('an unknown id is not found; nothing is written', async () => {
      const before = await catalogRows();
      await expect(setActivityTypeActive(db, GHOST, false, { clock })).rejects.toBeInstanceOf(
        ActivityTypeNotFoundError,
      );
      expect(await catalogRows()).toEqual(before);
    });

    it('there is no delete: no exported delete, and the database refuses one', async () => {
      const exported = Object.keys(jest.requireActual('../activityTypeRepository'));
      expect(exported.sort()).toEqual([
        'createCustomActivityType',
        'getActivityType',
        'listActivityTypes',
        'parseActivityTypeRow',
        'setActivityTypeActive',
      ]);
      await expect(db.runAsync("DELETE FROM activity_types WHERE id = 'OTHER'")).rejects.toThrow(
        /never deleted/,
      );
    });

    it('malformed catalog data fails the whole read', async () => {
      await db.execAsync('PRAGMA ignore_check_constraints = ON');
      await db.runAsync(
        "INSERT INTO activity_types (id, builtin, name, active, created_at, updated_at) VALUES ('NOT_A_CODE', 1, NULL, 1, 0, 0)",
      );
      await db.execAsync('PRAGMA ignore_check_constraints = OFF');
      await expect(listActivityTypes(db)).rejects.toBeInstanceOf(ActivityTypeDataError);
      await expect(listActivityTypes(db)).rejects.toMatchObject({ field: 'id', reason: 'UNKNOWN_CODE' });
    });
  });

  describe('new events use ACTIVE types only', () => {
    it('an active built-in and an active custom type can be used; the event reads its type', async () => {
      const swim = await create('Swim');
      const game = okEvent(await newEvent({ type: 'GAME' }));
      const custom = okEvent(await newEvent({ type: swim.id }));
      expect(game.activityType).toEqual({ id: 'GAME', builtin: 'GAME', name: null, active: true });
      expect(custom).toMatchObject({ type: swim.id, title: null });
      expect(custom.activityType).toEqual({ id: swim.id, builtin: null, name: 'Swim', active: true });
    });

    it('an inactive built-in or custom type is refused for a new event; nothing is written', async () => {
      const swim = await create('Swim');
      await setActivityTypeActive(db, swim.id, false, { clock });
      await setActivityTypeActive(db, 'GAME', false, { clock });
      for (const type of ['GAME', swim.id]) {
        await expect(newEvent({ type })).rejects.toBeInstanceOf(ActivityTypeInactiveError);
      }
      expect(await eventRows()).toEqual([]);
    });

    it('a well-formed id that is not in the catalog is refused (never invented)', async () => {
      await expect(newEvent({ type: GHOST })).rejects.toBeInstanceOf(ActivityTypeNotFoundError);
      expect(await eventRows()).toEqual([]);
      expect(await catalogRows()).toHaveLength(6);
    });

    it('a custom type is a real type, not OTHER: no title needed, the stored type is its id', async () => {
      const swim = await create('Swim');
      const event = okEvent(await newEvent({ type: swim.id }));
      expect(
        await db.getFirstAsync('SELECT type, title FROM calendar_events WHERE id = ?', [event.id]),
      ).toEqual({
        type: swim.id,
        title: null,
      });
    });
  });

  describe('history: an existing event keeps an inactive type', () => {
    it('disabling a type changes no event row; every read still shows it (inactive) and its completion', async () => {
      const swim = await create('Swim');
      const game = okEvent(
        await newEvent({ type: 'GAME', sport: 'BASKETBALL', title: 'Cup', notes: 'Hall' }),
      );
      const custom = okEvent(
        await newEvent({ type: swim.id, startAt: START + HOUR, endAt: START + 2 * HOUR }),
      );
      const done = await markCalendarEventCompleted(db, gal, custom.id, { clock });
      const rows = await eventRows();
      const sports = await sportRows();

      clock.set(T0 + HOUR);
      await setActivityTypeActive(db, 'GAME', false, { clock });
      await setActivityTypeActive(db, swim.id, false, { clock });

      expect(await eventRows()).toEqual(rows); // nothing about any event changed
      expect(await sportRows()).toEqual(sports); // nor any sport
      const read = await listCalendarEvents(db, gal);
      expect(read).toEqual([
        { ...game, activityType: { ...game.activityType, active: false } },
        { ...done, activityType: { ...done.activityType, active: false } },
      ]);
      expect(await getCalendarEvent(db, gal, custom.id)).toEqual(read[1]);
      expect(await listCalendarEventsInRange(db, START - HOUR, START + 3 * HOUR)).toEqual(read);
      expect(read[1]!.completion).toEqual({ completedAt: T0, source: 'LOCAL_USER' });
    });

    it('editing keeps an inactive type (unrelated change) and never reactivates it', async () => {
      const swim = await create('Swim');
      const event = okEvent(await newEvent({ type: swim.id, title: 'Laps' }));
      await setActivityTypeActive(db, swim.id, false, { clock });
      clock.set(T0 + HOUR);
      const edited = okEvent(
        await updateCalendarEvent(
          db,
          gal,
          event.id,
          { type: swim.id, startAt: START, title: 'Long laps' },
          { clock },
        ),
      );
      expect(edited).toMatchObject({ type: swim.id, title: 'Long laps', activityType: { active: false } });
      expect((await getActivityType(db, swim.id))!.active).toBe(false);
    });

    it('changing an event to another INACTIVE type is refused; to an active type it works', async () => {
      const event = okEvent(await newEvent({ type: 'GAME' }));
      await setActivityTypeActive(db, 'GYM', false, { clock });
      const before = await eventRows();
      await expect(
        updateCalendarEvent(db, gal, event.id, { type: 'GYM', startAt: START }, { clock }),
      ).rejects.toBeInstanceOf(ActivityTypeInactiveError);
      expect(await eventRows()).toEqual(before);
      const changed = okEvent(
        await updateCalendarEvent(db, gal, event.id, { type: 'RECOVERY', startAt: START }, { clock }),
      );
      expect(changed.type).toBe('RECOVERY');
    });

    it('OTHER inactive: an existing OTHER event stays readable and editable; new OTHER refused', async () => {
      const other = okEvent(await newEvent({ type: 'OTHER', title: 'Photo day' }));
      await setActivityTypeActive(db, 'OTHER', false, { clock });
      expect((await getCalendarEvent(db, gal, other.id))!.activityType.active).toBe(false);
      const edited = okEvent(
        await updateCalendarEvent(
          db,
          gal,
          other.id,
          { type: 'OTHER', startAt: START, title: 'Photos' },
          { clock },
        ),
      );
      expect(edited).toMatchObject({ type: 'OTHER', title: 'Photos' });
      // OTHER's title rule still applies while it is inactive.
      expect(
        await updateCalendarEvent(
          db,
          gal,
          other.id,
          { type: 'OTHER', startAt: START, title: ' ' },
          { clock },
        ),
      ).toEqual({ ok: false, errors: { title: 'REQUIRED_FOR_OTHER' } });
      await expect(newEvent({ type: 'OTHER', title: 'New' })).rejects.toBeInstanceOf(
        ActivityTypeInactiveError,
      );
    });

    it('an event whose stored type id has no catalog row fails closed (never shown as something else)', async () => {
      const event = okEvent(await newEvent({ type: 'GAME' }));
      await db.runAsync('UPDATE calendar_events SET type = ? WHERE id = ?', [GHOST, event.id]);
      const read = listCalendarEvents(db, gal);
      await expect(read).rejects.toBeInstanceOf(CalendarEventDataError);
      await expect(read).rejects.toMatchObject({
        field: 'type',
        reason: 'INVALID_RELATIONSHIP',
        eventId: event.id,
      });
    });
  });

  describe('Sport and Activity Type are independent', () => {
    it('making Basketball inactive leaves every Activity Type; the historical GAME still reads GAME + Basketball', async () => {
      const event = okEvent(await newEvent({ type: 'GAME', sport: 'BASKETBALL' }));
      const catalog = await catalogRows();
      expect((await updatePlayer(db, gal, { ...GAL, basketball: null }, { clock })).ok).toBe(true);
      expect(await catalogRows()).toEqual(catalog);
      expect(await getCalendarEvent(db, gal, event.id)).toMatchObject({
        type: 'GAME',
        sport: 'BASKETBALL',
        activityType: { id: 'GAME', active: true },
      });
    });

    it('making GAME inactive leaves Basketball active; the historical event still reads both', async () => {
      const event = okEvent(await newEvent({ type: 'GAME', sport: 'BASKETBALL' }));
      const sports = await sportRows();
      await setActivityTypeActive(db, 'GAME', false, { clock });
      expect(await sportRows()).toEqual(sports);
      expect((await getPlayer(db, gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: true }]);
      expect(await getCalendarEvent(db, gal, event.id)).toMatchObject({
        sport: 'BASKETBALL',
        activityType: { id: 'GAME', active: false },
      });
    });

    it('both inactive: the history is still complete and readable', async () => {
      const event = okEvent(await newEvent({ type: 'GAME', sport: 'BASKETBALL', title: 'Final' }));
      await setActivityTypeActive(db, 'GAME', false, { clock });
      expect((await updatePlayer(db, gal, { ...GAL, basketball: null }, { clock })).ok).toBe(true);
      expect(await getCalendarEvent(db, gal, event.id)).toMatchObject({
        title: 'Final',
        sport: 'BASKETBALL',
        activityType: { id: 'GAME', active: false },
      });
    });
  });
});
