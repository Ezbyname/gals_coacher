import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { EMPTY_BASKETBALL_PROFILE } from '@/domain/basketball/profile';
import { isUuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../../database';
import { PlayerDataError, PlayerNotFoundError } from '../errors';
import { LOCAL_FAMILY_META_KEY } from '../localFamily';
import type { PlayerDb } from '../playerDb';
import {
  createPlayer,
  getPlayer,
  listPlayers,
  updatePlayer,
  type PlayerProfile,
  type PlayerProfileInput,
  type SavePlayerResult,
} from '../playerRepository';

// Compile-time proof that both the real expo-sqlite database and the test
// adapter satisfy the repository's database interface.
const expoSatisfies = (db: SQLiteDatabase): PlayerDb => db;
const nodeSatisfies = (db: ReturnType<typeof openNodeSqlite>): PlayerDb => db;
void expoSatisfies;
void nodeSatisfies;

/** Wall clock pinned to a LOCAL date (timezone-independent); tests advance it. */
function fakeClock(start = new Date(2026, 9, 3, 12, 0, 0).getTime()): Clock & { advance(ms: number): void } {
  let now = start;
  return {
    wallNow: () => now,
    monotonicNow: () => 0,
    advance: (ms) => void (now += ms),
  };
}

const minimal: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: {},
};

const full: PlayerProfileInput = {
  player: {
    name: '  נועה  ',
    dateOfBirth: { year: 2014, month: 2, day: 28 },
    heightCm: 142,
  },
  basketball: {
    primaryPosition: 'SG',
    secondaryPosition: 'SF',
    dominantHand: 'LEFT',
    experience: 'ONE_TO_TWO_YEARS',
    weeklyFrequency: 'TWO_TO_THREE',
  },
};

function expectOk(result: SavePlayerResult): PlayerProfile {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.profile;
}

/** Fails the first statement matching `pattern`, after earlier writes ran. */
function failingOn(db: PlayerDb, pattern: RegExp): PlayerDb {
  return {
    ...db,
    getFirstAsync: (sql, params) => db.getFirstAsync(sql, params),
    getAllAsync: (sql, params) => db.getAllAsync(sql, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
    runAsync: async (sql, params) => {
      if (pattern.test(sql)) throw new Error('injected failure');
      return db.runAsync(sql, params);
    },
  };
}

describe('player repository on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;

  const count = async (table: string) =>
    (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n;
  const counts = async () => ({
    families: await count('families'),
    players: await count('players'),
    player_sports: await count('player_sports'),
    basketball_player_profiles: await count('basketball_player_profiles'),
    pointer: await count(`app_meta WHERE key = '${LOCAL_FAMILY_META_KEY}'`),
  });
  const pointer = async () =>
    (
      await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
        LOCAL_FAMILY_META_KEY,
      ])
    )?.value ?? null;
  const create = async (input: PlayerProfileInput = minimal) =>
    expectOk(await createPlayer(db, input, { ids, clock }));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-players-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates a minimal player (name + date of birth only) with an empty basketball profile', async () => {
      const created = await create();
      expect(isUuid(created.player.id)).toBe(true);
      expect(created).toEqual({
        player: {
          id: created.player.id,
          familyId: created.player.familyId,
          name: 'Gal',
          dateOfBirth: { year: 2015, month: 7, day: 9 },
          heightCm: null,
          teamName: null,
          createdAt: clock.wallNow(),
          updatedAt: clock.wallNow(),
        },
        basketball: EMPTY_BASKETBALL_PROFILE,
        sports: [{ sport: 'BASKETBALL', active: true }],
      });
      expect(await counts()).toEqual({
        families: 1,
        players: 1,
        player_sports: 1,
        basketball_player_profiles: 1,
        pointer: 1,
      });
      expect(
        await db.getFirstAsync('SELECT * FROM basketball_player_profiles WHERE player_id = ?', [
          created.player.id,
        ]),
      ).toEqual({
        player_id: created.player.id,
        sport: 'BASKETBALL',
        primary_position: null,
        secondary_position: null,
        dominant_hand: null,
        experience: null,
        weekly_frequency: null,
      });
    });

    it('persists canonical values: trimmed name, YYYY-MM-DD date, BASKETBALL assignment', async () => {
      const created = await create(full);
      expect(await db.getFirstAsync('SELECT name, date_of_birth, height_cm FROM players')).toEqual({
        name: 'נועה',
        date_of_birth: '2014-02-28',
        height_cm: 142,
      });
      expect(await db.getAllAsync('SELECT player_id, sport FROM player_sports')).toEqual([
        { player_id: created.player.id, sport: 'BASKETBALL' },
      ]);
      expect(created.basketball).toEqual(full.basketball);
    });

    it.each([
      ['blank name', { ...minimal, player: { ...minimal.player, name: '   ' } }],
      [
        'future date of birth',
        {
          ...minimal,
          player: {
            ...minimal.player,
            dateOfBirth: { year: 2026, month: 10, day: 4 },
          },
        },
      ],
      ['invalid height', { ...minimal, player: { ...minimal.player, heightCm: 0 } }],
      [
        'invalid basketball relationship',
        {
          ...minimal,
          basketball: { primaryPosition: 'MULTIPLE', secondaryPosition: 'PG' },
        },
      ],
    ])('rejects %s and writes nothing', async (_label, input) => {
      const result = await createPlayer(db, input as PlayerProfileInput, {
        ids,
        clock,
      });
      expect(result.ok).toBe(false);
      expect(await counts()).toEqual({
        families: 0,
        players: 0,
        player_sports: 0,
        basketball_player_profiles: 0,
        pointer: 0,
      });
    });

    it('returns typed field errors for both parts of the input', async () => {
      expect(
        await createPlayer(
          db,
          {
            player: { name: '', dateOfBirth: null },
            basketball: { primaryPosition: 'PG', secondaryPosition: 'PG' },
          },
          { ids, clock },
        ),
      ).toEqual({
        ok: false,
        errors: {
          player: { name: 'REQUIRED', dateOfBirth: 'REQUIRED' },
          basketball: { secondaryPosition: 'SAME_AS_PRIMARY' },
        },
      });
    });
  });

  describe('get and list', () => {
    it('round-trips a created player exactly, including null optionals', async () => {
      const a = await create(full);
      const b = await create(minimal);
      expect(await getPlayer(db, a.player.id)).toEqual(a);
      expect(await getPlayer(db, b.player.id)).toEqual(b);
    });

    it('returns null for an unknown id', async () => {
      await create();
      expect(await getPlayer(db, '00000000-0000-4000-8000-0000000000ff')).toBeNull();
      expect(await getPlayer(db, 'not-a-uuid')).toBeNull();
    });

    it('lists independent players ordered by created_at, then id', async () => {
      const first = await create({
        ...minimal,
        player: { ...minimal.player, name: 'First' },
      });
      clock.advance(1000);
      const second = await create({
        ...minimal,
        player: { ...minimal.player, name: 'Second' },
      });
      // Same timestamp as `second`: the id breaks the tie.
      const third = await create({
        ...full,
        player: { ...full.player, name: 'Third' },
      });
      // Out-of-order timestamps prove ordering is by created_at, not insertion.
      await db.runAsync('UPDATE players SET created_at = created_at - 5000 WHERE id = ?', [third.player.id]);

      const listed = await listPlayers(db);
      expect(listed.map((p) => p.player.name)).toEqual(['Third', 'First', 'Second']);
      expect(listed[1]).toEqual(first);
      expect(listed[2]).toEqual(second);

      await db.runAsync('UPDATE players SET created_at = ? WHERE id = ?', [
        second.player.createdAt,
        third.player.id,
      ]);
      expect((await listPlayers(db)).map((p) => p.player.id)).toEqual([
        first.player.id,
        second.player.id,
        third.player.id,
      ]);
    });

    it('lists nothing before the first player', async () => {
      expect(await listPlayers(db)).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates generic and basketball values, preserving identity, family, createdAt and assignment', async () => {
      const created = await create(full);
      clock.advance(60_000);
      const updated = expectOk(
        await updatePlayer(
          db,
          created.player.id,
          {
            player: {
              name: ' Noa ',
              dateOfBirth: { year: 2014, month: 3, day: 1 },
              heightCm: 150,
            },
            basketball: { primaryPosition: 'NOT_SURE', dominantHand: 'BOTH' },
          },
          { clock },
        ),
      );
      expect(updated).toEqual({
        player: {
          id: created.player.id,
          familyId: created.player.familyId,
          name: 'Noa',
          dateOfBirth: { year: 2014, month: 3, day: 1 },
          heightCm: 150,
          teamName: null,
          createdAt: created.player.createdAt,
          updatedAt: created.player.createdAt + 60_000,
        },
        basketball: {
          ...EMPTY_BASKETBALL_PROFILE,
          primaryPosition: 'NOT_SURE',
          dominantHand: 'BOTH',
          // Not in the input, so kept (no longer collected by the V1 UI).
          experience: 'ONE_TO_TWO_YEARS',
          weeklyFrequency: 'TWO_TO_THREE',
        },
        sports: [{ sport: 'BASKETBALL', active: true }],
      });
      expect(await getPlayer(db, created.player.id)).toEqual(updated);
      expect(await db.getAllAsync('SELECT player_id, sport FROM player_sports')).toEqual([
        { player_id: created.player.id, sport: 'BASKETBALL' },
      ]);
      expect(await counts()).toEqual({
        families: 1,
        players: 1,
        player_sports: 1,
        basketball_player_profiles: 1,
        pointer: 1,
      });
    });

    it('adds, changes and removes height', async () => {
      const created = await create(minimal);
      const withHeight = async (heightCm: number | null) =>
        expectOk(
          await updatePlayer(
            db,
            created.player.id,
            { ...minimal, player: { ...minimal.player, heightCm } },
            { clock },
          ),
        ).player.heightCm;
      expect(await withHeight(130)).toBe(130);
      expect(await withHeight(131)).toBe(131);
      expect(await withHeight(null)).toBeNull();
      expect((await getPlayer(db, created.player.id))!.player.heightCm).toBeNull();
    });

    it('clears every basketball value when each is given as empty', async () => {
      const created = await create(full);
      // Dormant fields are cleared only when explicitly given as null.
      const updated = expectOk(
        await updatePlayer(
          db,
          created.player.id,
          { ...full, basketball: { experience: null, weeklyFrequency: null } },
          { clock },
        ),
      );
      expect(updated.basketball).toEqual(EMPTY_BASKETBALL_PROFILE);
      expect((await getPlayer(db, created.player.id))!.basketball).toEqual(EMPTY_BASKETBALL_PROFILE);
    });

    it('fails for an unknown id and inserts nothing', async () => {
      await create();
      const before = await counts();
      await expect(
        updatePlayer(db, '00000000-0000-4000-8000-0000000000ff', minimal, {
          clock,
        }),
      ).rejects.toBeInstanceOf(PlayerNotFoundError);
      expect(await counts()).toEqual(before);
    });

    it('rejects invalid input and leaves the stored player unchanged', async () => {
      const created = await create(full);
      const result = await updatePlayer(
        db,
        created.player.id,
        {
          ...full,
          player: { ...full.player, name: '' },
          basketball: { primaryPosition: 'PG', secondaryPosition: 'PG' },
        },
        { clock },
      );
      expect(result.ok).toBe(false);
      expect(await getPlayer(db, created.player.id)).toEqual(created);
    });
  });

  describe('local family', () => {
    it('creates exactly one family and a pointer to it on the first player', async () => {
      const created = await create();
      const families = await db.getAllAsync<{ id: string }>('SELECT id FROM families');
      expect(families).toEqual([{ id: created.player.familyId }]);
      expect(await pointer()).toBe(created.player.familyId);
    });

    it('reuses the same family for later players; pointer unchanged', async () => {
      const first = await create();
      const pointerAfterFirst = await pointer();
      const second = await create(full);
      const third = await create();
      expect(second.player.familyId).toBe(first.player.familyId);
      expect(third.player.familyId).toBe(first.player.familyId);
      expect(await pointer()).toBe(pointerAfterFirst);
      expect(await db.getAllAsync('SELECT id FROM families')).toEqual([{ id: first.player.familyId }]);
      expect(await db.getAllAsync('SELECT DISTINCT family_id FROM players')).toEqual([
        { family_id: first.player.familyId },
      ]);
    });

    it('fails, without creating a replacement, when the pointer names a missing family', async () => {
      await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', [
        LOCAL_FAMILY_META_KEY,
        '00000000-0000-4000-8000-0000000000aa',
      ]);
      const error = await createPlayer(db, minimal, { ids, clock }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PlayerDataError);
      expect(error).toMatchObject({
        field: 'localFamily',
        reason: 'MISSING_ROW',
      });
      expect(await counts()).toMatchObject({
        families: 0,
        players: 0,
        pointer: 1,
      });
      expect(await pointer()).toBe('00000000-0000-4000-8000-0000000000aa');
    });

    it('fails when the pointer value is not a UUID', async () => {
      await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', [
        LOCAL_FAMILY_META_KEY,
        'garbage',
      ]);
      await expect(createPlayer(db, minimal, { ids, clock })).rejects.toMatchObject({
        name: 'PlayerDataError',
        field: 'localFamily',
        reason: 'INVALID_VALUE',
      });
      expect(await count('families')).toBe(0);
    });

    it('cannot hold a second pointer row (app_meta primary key)', async () => {
      const created = await create();
      await expect(
        db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', [
          LOCAL_FAMILY_META_KEY,
          '00000000-0000-4000-8000-0000000000bb',
        ]),
      ).rejects.toThrow(/UNIQUE/);
      expect(await pointer()).toBe(created.player.familyId);
    });
  });

  describe('atomicity', () => {
    it('rolls back everything, including the new family and pointer, when the first create fails late', async () => {
      const failing = failingOn(db, /INSERT INTO basketball_player_profiles/);
      await expect(createPlayer(failing, full, { ids, clock })).rejects.toThrow('injected failure');
      expect(await counts()).toEqual({
        families: 0,
        players: 0,
        player_sports: 0,
        basketball_player_profiles: 0,
        pointer: 0,
      });
      // The database is still usable and first-use creation works afterwards.
      const created = await create();
      expect(await pointer()).toBe(created.player.familyId);
    });

    it('keeps the existing family and pointer but no part of a later failed create', async () => {
      const existing = await create();
      const failing = failingOn(db, /INSERT INTO basketball_player_profiles/);
      await expect(createPlayer(failing, full, { ids, clock })).rejects.toThrow('injected failure');
      expect(await counts()).toEqual({
        families: 1,
        players: 1,
        player_sports: 1,
        basketball_player_profiles: 1,
        pointer: 1,
      });
      expect(await pointer()).toBe(existing.player.familyId);
      expect(await listPlayers(db)).toEqual([existing]);
    });

    it('rolls back a failed update completely', async () => {
      const created = await create(full);
      clock.advance(1000);
      const failing = failingOn(db, /UPDATE basketball_player_profiles/);
      await expect(
        updatePlayer(
          failing,
          created.player.id,
          { ...minimal, player: { ...minimal.player, name: 'Changed' } },
          { clock },
        ),
      ).rejects.toThrow('injected failure');
      expect(await getPlayer(db, created.player.id)).toEqual(created);
    });
  });

  describe('foreign keys (real inserts)', () => {
    it('rejects a player without a family', async () => {
      await expect(
        db.runAsync(
          `INSERT INTO players (id, family_id, name, date_of_birth, height_cm, created_at, updated_at)
           VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000999', 'X', '2015-01-01', NULL, 1, 1)`,
        ),
      ).rejects.toThrow(/FOREIGN KEY/);
    });

    it('rejects a sport assignment without a player', async () => {
      await expect(
        db.runAsync(
          `INSERT INTO player_sports (player_id, sport) VALUES ('00000000-0000-4000-8000-000000000999', 'BASKETBALL')`,
        ),
      ).rejects.toThrow(/FOREIGN KEY/);
    });

    it('rejects a basketball profile without a matching BASKETBALL assignment', async () => {
      const created = await create();
      // Existing player, but the profile's (player_id, sport) has no assignment row.
      await db.runAsync('DELETE FROM basketball_player_profiles');
      await db.runAsync('DELETE FROM player_sports');
      await expect(
        db.runAsync('INSERT INTO basketball_player_profiles (player_id) VALUES (?)', [created.player.id]),
      ).rejects.toThrow(/FOREIGN KEY/);
      // An assignment to another sport does not satisfy the basketball profile.
      await db.runAsync("INSERT INTO player_sports (player_id, sport) VALUES (?, 'FOOTBALL')", [
        created.player.id,
      ]);
      await expect(
        db.runAsync('INSERT INTO basketball_player_profiles (player_id) VALUES (?)', [created.player.id]),
      ).rejects.toThrow(/FOREIGN KEY/);
      // A non-BASKETBALL profile sport is rejected structurally.
      await expect(
        db.runAsync("INSERT INTO basketball_player_profiles (player_id, sport) VALUES (?, 'FOOTBALL')", [
          created.player.id,
        ]),
      ).rejects.toThrow(/CHECK/);
    });

    it('rejects removing an assignment that a basketball profile depends on', async () => {
      await create();
      await expect(db.runAsync('DELETE FROM player_sports')).rejects.toThrow(/FOREIGN KEY/);
    });
  });

  describe('structural CHECKs', () => {
    const insert = (name: string, dob: string, height: number | string | null) =>
      db.runAsync(
        `INSERT INTO players (id, family_id, name, date_of_birth, height_cm, created_at, updated_at)
         VALUES ('00000000-0000-4000-8000-000000000201', (SELECT id FROM families), ?, ?, ?, 1, 1)`,
        [name, dob, height],
      );

    beforeEach(async () => {
      await create();
    });

    it('rejects a blank name', async () => {
      await expect(insert('  ', '2015-01-01', null)).rejects.toThrow(/CHECK/);
    });

    it('rejects a non-canonical date shape', async () => {
      await expect(insert('X', '2015-1-1', null)).rejects.toThrow(/CHECK/);
    });

    it.each([0, -1, 150.5, 'tall'])('rejects height %p', async (height) => {
      await expect(insert('X', '2015-01-01', height)).rejects.toThrow(/CHECK/);
    });
  });

  describe('malformed stored data fails the read with PlayerDataError', () => {
    const corrupt = async (sql: string) => {
      const created = await create(full);
      await db.runAsync(sql, [created.player.id]);
      return created.player.id;
    };

    it.each([
      [
        'unknown primary position',
        "UPDATE basketball_player_profiles SET primary_position = 'CENTER' WHERE player_id = ?",
        { field: 'primaryPosition', reason: 'UNKNOWN_CODE' },
      ],
      [
        'invalid secondary relationship',
        "UPDATE basketball_player_profiles SET primary_position = 'MULTIPLE' WHERE player_id = ?",
        { field: 'secondaryPosition', reason: 'INVALID_RELATIONSHIP' },
      ],
      [
        'unknown dominant hand',
        "UPDATE basketball_player_profiles SET dominant_hand = 'right' WHERE player_id = ?",
        { field: 'dominantHand', reason: 'UNKNOWN_CODE' },
      ],
      [
        'impossible date of birth',
        "UPDATE players SET date_of_birth = '2025-02-29' WHERE id = ?",
        { field: 'dateOfBirth', reason: 'INVALID_VALUE' },
      ],
      [
        'missing basketball profile',
        'DELETE FROM basketball_player_profiles WHERE player_id = ?',
        { field: 'basketballProfile', reason: 'MISSING_ROW' },
      ],
      [
        'non-canonical name',
        "UPDATE players SET name = ' padded ' WHERE id = ?",
        { field: 'name', reason: 'INVALID_VALUE' },
      ],
    ])('%s', async (_label, sql, expected) => {
      const id = await corrupt(sql);
      await expect(getPlayer(db, id)).rejects.toBeInstanceOf(PlayerDataError);
      await expect(getPlayer(db, id)).rejects.toMatchObject({
        ...expected,
        playerId: id,
      });
      await expect(listPlayers(db)).rejects.toMatchObject(expected);
    });

    it('detects a Basketball profile without its assignment (case 4, foreign keys bypassed)', async () => {
      const created = await create();
      await db.execAsync('PRAGMA foreign_keys = OFF');
      await db.runAsync('DELETE FROM player_sports');
      await db.execAsync('PRAGMA foreign_keys = ON');
      expect(await count('basketball_player_profiles')).toBe(1); // the orphan profile is really there
      await expect(getPlayer(db, created.player.id)).rejects.toMatchObject({
        name: 'PlayerDataError',
        field: 'basketballProfile',
        reason: 'INVALID_RELATIONSHIP',
        playerId: created.player.id,
      });
      await expect(listPlayers(db)).rejects.toMatchObject({ reason: 'INVALID_RELATIONSHIP' });
    });

    it('detects a malformed player id', async () => {
      await create();
      await db.execAsync('PRAGMA foreign_keys = OFF');
      await db.runAsync("UPDATE players SET id = 'not-a-uuid'");
      await db.execAsync('PRAGMA foreign_keys = ON');
      await expect(listPlayers(db)).rejects.toMatchObject({
        field: 'id',
        playerId: 'not-a-uuid',
      });
    });

    it('fails the whole list rather than omitting the malformed player', async () => {
      await create(minimal);
      await corrupt("UPDATE basketball_player_profiles SET experience = 'TEN_YEARS' WHERE player_id = ?");
      await expect(listPlayers(db)).rejects.toBeInstanceOf(PlayerDataError);
    });

    it('fails an update of a player whose stored profile is missing, writing nothing', async () => {
      const id = await corrupt('DELETE FROM basketball_player_profiles WHERE player_id = ?');
      const before = await db.getFirstAsync('SELECT * FROM players WHERE id = ?', [id]);
      clock.advance(1000);
      await expect(updatePlayer(db, id, minimal, { clock })).rejects.toMatchObject({
        field: 'basketballProfile',
        reason: 'MISSING_ROW',
      });
      expect(await db.getFirstAsync('SELECT * FROM players WHERE id = ?', [id])).toEqual(before);
    });
  });

  describe('concurrency (one operation at a time per connection)', () => {
    const named = (name: string, input: PlayerProfileInput = minimal): PlayerProfileInput => ({
      ...input,
      player: { ...input.player, name },
    });

    /** Every family, assignment and profile belongs to a complete player; one local family. */
    async function expectStructurallyValid(expectedPlayers: number) {
      expect(await counts()).toEqual({
        families: 1,
        players: expectedPlayers,
        player_sports: expectedPlayers,
        basketball_player_profiles: expectedPlayers,
        pointer: 1,
      });
      const families = await db.getAllAsync<{ id: string }>('SELECT id FROM families');
      expect(families).toEqual([{ id: await pointer() }]);
      expect(
        await db.getFirstAsync(
          `SELECT count(*) AS n FROM players p
           WHERE p.family_id <> (SELECT value FROM app_meta WHERE key = ?)
              OR NOT EXISTS (SELECT 1 FROM player_sports s WHERE s.player_id = p.id AND s.sport = 'BASKETBALL')
              OR NOT EXISTS (SELECT 1 FROM basketball_player_profiles b WHERE b.player_id = p.id)`,
          [LOCAL_FAMILY_META_KEY],
        ),
      ).toEqual({ n: 0 });
      expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    }

    it('runs two concurrent first creates serially: both complete, one shared local family', async () => {
      const results = await Promise.allSettled([
        createPlayer(db, named('A', full), { ids, clock }),
        createPlayer(db, named('B'), { ids, clock }),
      ]);
      // A rejected call must have left nothing: what is stored is exactly what succeeded.
      const succeeded = results.flatMap((r) => (r.status === 'fulfilled' ? [expectOk(r.value)] : []));
      expect(await listPlayers(db)).toEqual(succeeded);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      const [a, b] = results.map((r) => expectOk((r as PromiseFulfilledResult<SavePlayerResult>).value));
      expect(b!.player.familyId).toBe(a!.player.familyId);
      await expectStructurallyValid(2);
      expect(await pointer()).toBe(a!.player.familyId);
      expect(await listPlayers(db)).toEqual([a, b]);
    });

    it('keeps the existing family and pointer under concurrent later creates', async () => {
      const existing = await create();
      const results = await Promise.all([
        createPlayer(db, named('B'), { ids, clock }),
        createPlayer(db, named('C', full), { ids, clock }),
        createPlayer(db, named('D'), { ids, clock }),
      ]);
      for (const result of results) expect(expectOk(result).player.familyId).toBe(existing.player.familyId);
      expect(await pointer()).toBe(existing.player.familyId);
      await expectStructurallyValid(4);
    });

    it('a concurrent create and update both apply completely', async () => {
      const existing = await create(full);
      clock.advance(1000);
      const [updated, created] = await Promise.all([
        updatePlayer(db, existing.player.id, named('Renamed', minimal), { clock }),
        createPlayer(db, named('New', full), { ids, clock }),
      ]);
      expect(await getPlayer(db, existing.player.id)).toEqual(expectOk(updated));
      expect(expectOk(updated).basketball).toEqual({
        ...EMPTY_BASKETBALL_PROFILE,
        experience: 'ONE_TO_TWO_YEARS', // dormant fields kept (not in the input)
        weeklyFrequency: 'TWO_TO_THREE',
      });
      expect(await getPlayer(db, expectOk(created).player.id)).toEqual(expectOk(created));
      await expectStructurallyValid(2);
    });

    it('two concurrent updates apply one after the other, never mixed', async () => {
      const existing = await create(full);
      const other = await create();
      clock.advance(1000);
      const [first, second, third] = await Promise.all([
        updatePlayer(db, existing.player.id, named('First', minimal), { clock }),
        updatePlayer(db, existing.player.id, named('Second', full), { clock }),
        updatePlayer(db, other.player.id, named('Other', full), { clock }),
      ]);
      expect(expectOk(first).player.name).toBe('First');
      // The later update wins as a whole: name and profile come from the same input.
      expect(await getPlayer(db, existing.player.id)).toEqual(expectOk(second));
      expect(expectOk(second).basketball).toEqual(full.basketball);
      expect(await getPlayer(db, other.player.id)).toEqual(expectOk(third));
      await expectStructurallyValid(2);
    });

    it('a failing operation does not undo or block a concurrent create', async () => {
      const [missing, created] = await Promise.allSettled([
        updatePlayer(db, '00000000-0000-4000-8000-0000000000ff', minimal, { clock }),
        createPlayer(db, named('Kept'), { ids, clock }),
      ]);
      expect(missing.status === 'rejected' && missing.reason).toBeInstanceOf(PlayerNotFoundError);
      expect(created.status).toBe('fulfilled');
      await expectStructurallyValid(1);
      expect((await listPlayers(db)).map((p) => p.player.name)).toEqual(['Kept']);
    });

    it('a read started during a save never sees its uncommitted rows', async () => {
      const [created, listed] = await Promise.all([createPlayer(db, full, { ids, clock }), listPlayers(db)]);
      expect(expectOk(created).player.name).toBe('נועה');
      expect(listed).toHaveLength(1);
    });
  });

  describe('optional Basketball (revised Slice 1.1 contract)', () => {
    const noSport: PlayerProfileInput = {
      player: { name: 'Omer', dateOfBirth: { year: 2016, month: 4, day: 2 } },
      basketball: null,
    };
    const named = (name: string, input: PlayerProfileInput): PlayerProfileInput => ({
      ...input,
      player: { ...input.player, name },
    });

    describe('create', () => {
      it('creates a player without Basketball: no sport rows, local family as usual', async () => {
        const created = await create(noSport);
        expect(created.basketball).toBeNull();
        expect(await counts()).toEqual({
          families: 1,
          players: 1,
          player_sports: 0,
          basketball_player_profiles: 0,
          pointer: 1,
        });
        expect(await pointer()).toBe(created.player.familyId);
        expect(await getPlayer(db, created.player.id)).toEqual(created);
      });

      it('reuses the same local family for players with and without Basketball', async () => {
        const first = await create(noSport);
        const second = await create(full);
        const third = await create(noSport);
        expect(second.player.familyId).toBe(first.player.familyId);
        expect(third.player.familyId).toBe(first.player.familyId);
        expect(await count('families')).toBe(1);
        expect(await counts()).toMatchObject({ players: 3, player_sports: 1, basketball_player_profiles: 1 });
      });

      it('rolls back a failed first create without Basketball, family and pointer included', async () => {
        const failing = failingOn(db, /INSERT INTO players/);
        await expect(createPlayer(failing, noSport, { ids, clock })).rejects.toThrow('injected failure');
        expect(await counts()).toEqual({
          families: 0,
          players: 0,
          player_sports: 0,
          basketball_player_profiles: 0,
          pointer: 0,
        });
      });
    });

    describe('read', () => {
      it('lists players with and without Basketball together, in creation order', async () => {
        const a = await create(noSport);
        clock.advance(1);
        const b = await create(full);
        clock.advance(1);
        const c = await create(named('Lia', noSport));
        expect(await listPlayers(db)).toEqual([a, b, c]);
        expect((await listPlayers(db)).map((p) => p.basketball === null)).toEqual([true, false, true]);
      });
    });

    describe('update', () => {
      it('updates personal fields of a player without Basketball and writes no sport rows', async () => {
        const created = await create(noSport);
        clock.advance(1000);
        const updated = expectOk(
          await updatePlayer(db, created.player.id, named('Omer Levi', noSport), { clock }),
        );
        expect(updated).toEqual({
          player: { ...created.player, name: 'Omer Levi', updatedAt: created.player.updatedAt + 1000 },
          basketball: null,
          sports: [],
        });
        expect(await counts()).toMatchObject({ player_sports: 0, basketball_player_profiles: 0 });
      });

      it('adds Basketball later: assignment and profile written with the update', async () => {
        const created = await create(noSport);
        clock.advance(1000);
        const updated = expectOk(
          await updatePlayer(
            db,
            created.player.id,
            { ...noSport, basketball: { primaryPosition: 'PG', dominantHand: 'LEFT' } },
            { clock },
          ),
        );
        expect(updated.player).toEqual({ ...created.player, updatedAt: created.player.updatedAt + 1000 });
        expect(updated.basketball).toEqual({
          ...EMPTY_BASKETBALL_PROFILE,
          primaryPosition: 'PG',
          dominantHand: 'LEFT',
        });
        expect(await db.getAllAsync('SELECT player_id, sport FROM player_sports')).toEqual([
          { player_id: created.player.id, sport: 'BASKETBALL' },
        ]);
        expect(await count('basketball_player_profiles')).toBe(1);
        expect(await getPlayer(db, created.player.id)).toEqual(updated);
      });

      it('rolls back adding Basketball completely when the profile insert fails', async () => {
        const created = await create(noSport);
        clock.advance(1000);
        const failing = failingOn(db, /INSERT INTO basketball_player_profiles/);
        await expect(
          updatePlayer(
            failing,
            created.player.id,
            { player: { ...noSport.player, name: 'Changed' }, basketball: { primaryPosition: 'C' } },
            { clock },
          ),
        ).rejects.toThrow('injected failure');
        expect(await getPlayer(db, created.player.id)).toEqual(created); // name and updatedAt unchanged
        expect(await counts()).toMatchObject({ player_sports: 0, basketball_player_profiles: 0 });
      });

      it('preserves stored experience and weekly frequency when the input omits them', async () => {
        const created = await create(full);
        await updatePlayer(
          db,
          created.player.id,
          { ...full, basketball: { primaryPosition: 'C', dominantHand: 'RIGHT' } },
          { clock },
        );
        expect(
          await db.getFirstAsync(
            'SELECT primary_position, dominant_hand, experience, weekly_frequency FROM basketball_player_profiles',
          ),
        ).toEqual({
          primary_position: 'C',
          dominant_hand: 'RIGHT',
          experience: 'ONE_TO_TWO_YEARS',
          weekly_frequency: 'TWO_TO_THREE',
        });
      });

      /** Every row of every player table, for zero-write proofs. */
      const snapshot = async () => ({
        families: await db.getAllAsync('SELECT * FROM families'),
        players: await db.getAllAsync('SELECT * FROM players'),
        sports: await db.getAllAsync('SELECT * FROM player_sports'),
        profiles: await db.getAllAsync('SELECT * FROM basketball_player_profiles'),
        meta: await db.getAllAsync('SELECT * FROM app_meta'),
      });

      it('rejects an update of a player with an assignment but no profile, before any write', async () => {
        const created = await create(full);
        await db.runAsync('DELETE FROM basketball_player_profiles WHERE player_id = ?', [created.player.id]);
        const before = await snapshot();
        clock.advance(1000);
        const error = await updatePlayer(
          db,
          created.player.id,
          { player: { ...full.player, name: 'Changed' }, basketball: null },
          { clock },
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlayerDataError);
        expect(error).toMatchObject({
          field: 'basketballProfile',
          reason: 'MISSING_ROW',
          playerId: created.player.id,
        });
        expect(await snapshot()).toEqual(before);
      });

      it('rejects an update of a player with a profile but no assignment, before any write', async () => {
        const created = await create(full);
        await db.execAsync('PRAGMA foreign_keys = OFF');
        await db.runAsync('DELETE FROM player_sports WHERE player_id = ?', [created.player.id]);
        await db.execAsync('PRAGMA foreign_keys = ON');
        const before = await snapshot();
        clock.advance(1000);
        const error = await updatePlayer(
          db,
          created.player.id,
          { player: { ...full.player, name: 'Changed' }, basketball: { primaryPosition: 'C' } },
          { clock },
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlayerDataError); // not a raw SQLite constraint error
        expect(error).toMatchObject({
          field: 'basketballProfile',
          reason: 'INVALID_RELATIONSHIP',
          playerId: created.player.id,
        });
        expect(await snapshot()).toEqual(before);
      });

      // SPORT-LIFE-001 superseded "removal is rejected": `basketball: null` now
      // makes a stored Basketball INACTIVE — and still deletes nothing.
      it('unselecting a stored Basketball makes it inactive: no row deleted, profile untouched', async () => {
        const created = await create(full);
        const before = {
          sports: await db.getAllAsync('SELECT * FROM player_sports'),
          profiles: await db.getAllAsync('SELECT * FROM basketball_player_profiles'),
        };
        clock.advance(1000);
        const updated = expectOk(
          await updatePlayer(
            db,
            created.player.id,
            { player: { ...full.player, name: 'Changed' }, basketball: null },
            { clock },
          ),
        );
        expect(updated.player.name).toBe('Changed');
        expect(updated.basketball).toEqual(created.basketball);
        expect(updated.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
        expect(await db.getAllAsync('SELECT * FROM player_sports')).toEqual(
          (before.sports as Record<string, unknown>[]).map((row) => ({ ...row, active: 0 })),
        );
        expect(await db.getAllAsync('SELECT * FROM basketball_player_profiles')).toEqual(before.profiles);
      });
    });

    it('adding Basketball runs safely alongside a concurrent create', async () => {
      const existing = await create(noSport);
      const [added, created] = await Promise.all([
        updatePlayer(
          db,
          existing.player.id,
          { ...noSport, basketball: { primaryPosition: 'SG' } },
          { clock },
        ),
        createPlayer(db, named('New', noSport), { ids, clock }),
      ]);
      expect(expectOk(added).basketball?.primaryPosition).toBe('SG');
      expect(expectOk(created).basketball).toBeNull();
      expect(await counts()).toEqual({
        families: 1,
        players: 2,
        player_sports: 1,
        basketball_player_profiles: 1,
        pointer: 1,
      });
      expect(await listPlayers(db)).toEqual([expectOk(added), expectOk(created)]);
    });
  });

  describe('restart', () => {
    it('keeps players and the family pointer after close and reopen, without a new family', async () => {
      const a = await create(full);
      const b = await create(minimal);
      await db.closeAsync();

      const reopened = await openLocalDatabase();
      db = reopened.db;
      expect(reopened.migration.applied).toEqual([]);
      expect(await listPlayers(db)).toEqual([a, b]);
      expect(await pointer()).toBe(a.player.familyId);

      const c = await create();
      expect(c.player.familyId).toBe(a.player.familyId);
      expect(await count('families')).toBe(1);
    });
  });
});
