import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { openLocalDatabase } from '../../database';
import { PlayerNotFoundError } from '../../players/errors';
import type { PlayerDb } from '../../players/playerDb';
import { createPlayer, updatePlayer, type PlayerProfileInput } from '../../players/playerRepository';
import { SelfAssessmentDataError, SelfAssessmentSportNotAssignedError } from '../errors';
import {
  createSelfAssessment,
  listSelfAssessments,
  type CreateSelfAssessmentResult,
  type SelfAssessmentAnswers,
} from '../selfAssessmentRepository';

const ORDER = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];
const T0 = new Date(2026, 9, 4, 18, 30).getTime();

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}

/** Complete Basketball answers; `values` in canonical order. */
const answers = (values: number[] = [3, 2, 4, 1, 5, 3]): SelfAssessmentAnswers =>
  ORDER.map((category, i) => ({ category, rating: values[i] }));

const expectOk = (result: CreateSelfAssessmentResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.assessment;
};

const BASKETBALL_PLAYER: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
  basketball: { primaryPosition: 'PG', experience: 'ONE_TO_TWO_YEARS' },
};
const NO_SPORT_PLAYER: PlayerProfileInput = {
  player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } },
  basketball: null,
};

describe('self-assessment repository on real SQLite', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  let gal: Uuid;
  let noa: Uuid;

  const count = async (table: string) =>
    (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n;
  const assessmentCounts = async () => ({
    self_assessments: await count('self_assessments'),
    self_assessment_ratings: await count('self_assessment_ratings'),
  });
  /** Everything outside the two self-assessment tables. */
  const otherTables = async () => ({
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    players: await db.getAllAsync('SELECT * FROM players ORDER BY id'),
    player_sports: await db.getAllAsync('SELECT * FROM player_sports ORDER BY player_id, sport'),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  });
  const create = async (values?: number[], playerId: string = gal) =>
    expectOk(await createSelfAssessment(db, playerId, 'BASKETBALL', answers(values), { ids, clock }));
  const list = (playerId: string = gal, sport = 'BASKETBALL') => listSelfAssessments(db, playerId, sport);

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-self-'));
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
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('saves a complete Basketball assessment: one row + six ratings, taken now, client id', async () => {
      const saved = await create();
      expect(saved).toEqual({
        id: '00000000-0000-4000-8000-000000000004', // ids 1–3: the two seeded players + local family
        playerId: gal,
        sport: 'BASKETBALL',
        takenAt: T0,
        ratings: [
          { category: 'SHOOTING', rating: 3 },
          { category: 'BALL_HANDLING', rating: 2 },
          { category: 'PASSING', rating: 4 },
          { category: 'FINISHING', rating: 1 },
          { category: 'DEFENSE', rating: 5 },
          { category: 'SPEED', rating: 3 },
        ],
      });
      expect(await assessmentCounts()).toEqual({ self_assessments: 1, self_assessment_ratings: 6 });
      expect(await db.getAllAsync('SELECT * FROM self_assessments')).toEqual([
        { id: saved.id, player_id: gal, sport: 'BASKETBALL', taken_at: T0 },
      ]);
      expect(await list()).toEqual([saved]);
    });

    it('accepts answers in any order and stores / returns the canonical order', async () => {
      const shuffled = [...answers()].reverse();
      const saved = expectOk(await createSelfAssessment(db, gal, 'BASKETBALL', shuffled, { ids, clock }));
      expect(saved.ratings.map((r) => r.category)).toEqual(ORDER);
      expect((await list())[0]!.ratings.map((r) => r.category)).toEqual(ORDER);
    });

    it('writes only the two self-assessment tables', async () => {
      const before = await otherTables();
      await create();
      await create([1, 1, 1, 1, 1, 1]);
      expect(await otherTables()).toEqual(before);
    });

    it.each([
      ['a missing category', answers().slice(0, 5)],
      ['an unanswered (null) category', answers().map((a, i) => (i === 2 ? { ...a, rating: null } : a))],
      ['rating 0', answers([0, 2, 4, 1, 5, 3])],
      ['rating 6', answers([3, 2, 4, 1, 5, 6])],
      ['rating 2.5', answers([3, 2.5, 4, 1, 5, 3])],
      ['a duplicate category', [...answers(), { category: 'SHOOTING', rating: 3 }]],
      ['an unknown category', [...answers(), { category: 'DUNKING', rating: 3 }]],
      ['"__proto__"', [...answers(), { category: '__proto__', rating: 3 }]],
      ['no answers', []],
    ])('invalid answers (%s): a validation result, zero writes', async (_label, input) => {
      const before = await otherTables();
      const result = await createSelfAssessment(db, gal, 'BASKETBALL', input, { ids, clock });
      expect(result.ok).toBe(false);
      expect(await assessmentCounts()).toEqual({ self_assessments: 0, self_assessment_ratings: 0 });
      expect(await otherTables()).toEqual(before);
    });

    it('an unsupported sport is a validation result, zero writes', async () => {
      const result = await createSelfAssessment(db, gal, 'FOOTBALL', answers(), { ids, clock });
      expect(result).toEqual({ ok: false, errors: { sport: 'UNSUPPORTED_SPORT' } });
      expect(await assessmentCounts()).toEqual({ self_assessments: 0, self_assessment_ratings: 0 });
    });

    it('an unknown player: PlayerNotFoundError, zero writes', async () => {
      const unknown = '00000000-0000-4000-8000-000000000999';
      await expect(
        createSelfAssessment(db, unknown, 'BASKETBALL', answers(), { ids, clock }),
      ).rejects.toEqual(new PlayerNotFoundError(unknown));
      expect(await assessmentCounts()).toEqual({ self_assessments: 0, self_assessment_ratings: 0 });
    });

    it('a player without Basketball: SelfAssessmentSportNotAssignedError, zero writes', async () => {
      const before = await otherTables();
      const attempt = createSelfAssessment(db, noa, 'BASKETBALL', answers(), { ids, clock });
      await expect(attempt).rejects.toBeInstanceOf(SelfAssessmentSportNotAssignedError);
      await expect(attempt).rejects.toMatchObject({ playerId: noa, sport: 'BASKETBALL' });
      expect(await assessmentCounts()).toEqual({ self_assessments: 0, self_assessment_ratings: 0 });
      expect(await otherTables()).toEqual(before);
    });

    it('works once Basketball has been added to that player', async () => {
      const added = await updatePlayer(db, noa, { ...NO_SPORT_PLAYER, basketball: {} }, { clock });
      expect(added.ok).toBe(true);
      expect((await create(undefined, noa)).playerId).toBe(noa);
    });
  });

  describe('atomicity', () => {
    /** Fails the Nth statement matching `pattern`, after the earlier writes ran. */
    function failingOnNth(pattern: RegExp, n: number): PlayerDb {
      let seen = 0;
      return {
        getFirstAsync: (sql, params) => db.getFirstAsync(sql, params),
        getAllAsync: (sql, params) => db.getAllAsync(sql, params),
        withTransactionAsync: (task) => db.withTransactionAsync(task),
        runAsync: async (sql, params) => {
          if (pattern.test(sql) && ++seen === n) throw new Error('injected failure');
          return db.runAsync(sql, params);
        },
      };
    }

    it.each([1, 4, 6])(
      'a failure on rating insert #%p rolls back the assessment and every earlier rating',
      async (n) => {
        const failing = failingOnNth(/INSERT INTO self_assessment_ratings/, n);
        await expect(
          createSelfAssessment(failing, gal, 'BASKETBALL', answers(), { ids, clock }),
        ).rejects.toThrow('injected failure');
        expect(await assessmentCounts()).toEqual({ self_assessments: 0, self_assessment_ratings: 0 });
        // The connection is still usable and the next save is complete.
        await create();
        expect(await assessmentCounts()).toEqual({ self_assessments: 1, self_assessment_ratings: 6 });
      },
    );

    it('a failed later save never touches an earlier assessment', async () => {
      const first = await create();
      clock.set(T0 + 1000);
      const failing = failingOnNth(/INSERT INTO self_assessment_ratings/, 3);
      await expect(
        createSelfAssessment(failing, gal, 'BASKETBALL', answers(), { ids, clock }),
      ).rejects.toThrow();
      expect(await list()).toEqual([first]);
    });
  });

  describe('history (repeatable, immutable)', () => {
    it('a second assessment is a new row; the first is unchanged; newest first', async () => {
      const first = await create([1, 1, 2, 2, 3, 3]);
      const firstRows = {
        assessment: await db.getAllAsync('SELECT * FROM self_assessments WHERE id = ?', [first.id]),
        ratings: await db.getAllAsync(
          'SELECT * FROM self_assessment_ratings WHERE assessment_id = ? ORDER BY category',
          [first.id],
        ),
      };
      clock.set(T0 + 60_000);
      const second = await create([5, 4, 4, 3, 5, 4]);

      expect(second.id).not.toBe(first.id);
      expect(await list()).toEqual([second, first]);
      expect(await assessmentCounts()).toEqual({ self_assessments: 2, self_assessment_ratings: 12 });
      expect(await db.getAllAsync('SELECT * FROM self_assessments WHERE id = ?', [first.id])).toEqual(
        firstRows.assessment,
      );
      expect(
        await db.getAllAsync(
          'SELECT * FROM self_assessment_ratings WHERE assessment_id = ? ORDER BY category',
          [first.id],
        ),
      ).toEqual(firstRows.ratings);
    });

    it('orders by taken_at, not by insertion order', async () => {
      clock.set(T0 + 10_000);
      const later = await create([5, 5, 5, 5, 5, 5]);
      clock.set(T0);
      const earlier = await create([1, 1, 1, 1, 1, 1]);
      expect(await list()).toEqual([later, earlier]);
    });

    it('several on the same day and the same millisecond are all kept, ordered by id descending', async () => {
      // Ids are assigned out of order relative to insertion to rule out insertion order.
      const fixedIds = [
        '00000000-0000-4000-8000-0000000000b2',
        '00000000-0000-4000-8000-0000000000b9',
        '00000000-0000-4000-8000-0000000000b5',
      ] as Uuid[];
      const queue = [...fixedIds];
      const fixed: IdService = { newUuid: () => queue.shift()! };
      for (const v of [1, 2, 3]) {
        expectOk(
          await createSelfAssessment(db, gal, 'BASKETBALL', answers([v, v, v, v, v, v]), {
            ids: fixed,
            clock,
          }),
        );
      }
      const history = await list();
      expect(history.map((a) => a.id)).toEqual([fixedIds[1], fixedIds[2], fixedIds[0]]);
      expect(history.every((a) => a.takenAt === T0)).toBe(true);
    });

    it('an empty history is []', async () => {
      expect(await list()).toEqual([]);
      expect(await list(noa)).toEqual([]);
    });

    it('filters by player', async () => {
      await updatePlayer(db, noa, { ...NO_SPORT_PLAYER, basketball: {} }, { clock });
      const galsOwn = await create([1, 1, 1, 1, 1, 1], gal);
      const noasOwn = await create([5, 5, 5, 5, 5, 5], noa);
      expect(await list(gal)).toEqual([galsOwn]);
      expect(await list(noa)).toEqual([noasOwn]);
    });

    it('filters by sport (a raw, FK-valid fixture of another sport never appears)', async () => {
      const own = await create();
      // Test-only fixture: production has no FOOTBALL self-assessment.
      await db.runAsync('INSERT INTO player_sports (player_id, sport) VALUES (?, ?)', [gal, 'FOOTBALL']);
      await db.runAsync('INSERT INTO self_assessments (id, player_id, sport, taken_at) VALUES (?, ?, ?, ?)', [
        '00000000-0000-4000-8000-0000000000f1',
        gal,
        'FOOTBALL',
        T0 + 999_999,
      ]);
      await db.runAsync(
        'INSERT INTO self_assessment_ratings (assessment_id, category, rating) VALUES (?, ?, ?)',
        ['00000000-0000-4000-8000-0000000000f1', 'SHOOTING', 4],
      );
      expect(await list(gal, 'BASKETBALL')).toEqual([own]);
    });

    it('survives closing and reopening the database (restart)', async () => {
      const saved = await create();
      await db.closeAsync();
      const reopened = await openLocalDatabase();
      expect(reopened.migration.applied).toEqual([]);
      db = reopened.db;
      expect(await list()).toEqual([saved]);
      expect(await assessmentCounts()).toEqual({ self_assessments: 1, self_assessment_ratings: 6 });
    });
  });

  describe('malformed stored data fails the whole read', () => {
    const A = '00000000-0000-4000-8000-0000000000c1';

    /** Inserts raw rows; `bypass` switches off CHECK and/or FK enforcement for the corruption only. */
    async function corrupt(
      rows: { assessment?: [string, string, string, unknown]; ratings?: [string, string, unknown][] },
      bypass: { checks?: boolean; foreignKeys?: boolean } = {},
    ) {
      if (bypass.checks) await db.execAsync('PRAGMA ignore_check_constraints = ON');
      if (bypass.foreignKeys) await db.execAsync('PRAGMA foreign_keys = OFF');
      try {
        if (rows.assessment) {
          await db.runAsync(
            'INSERT INTO self_assessments (id, player_id, sport, taken_at) VALUES (?, ?, ?, ?)',
            rows.assessment as never,
          );
        }
        for (const rating of rows.ratings ?? []) {
          await db.runAsync(
            'INSERT INTO self_assessment_ratings (assessment_id, category, rating) VALUES (?, ?, ?)',
            rating as never,
          );
        }
      } finally {
        await db.execAsync('PRAGMA ignore_check_constraints = OFF');
        await db.execAsync('PRAGMA foreign_keys = ON');
      }
      expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      expect(await db.getFirstAsync('PRAGMA ignore_check_constraints')).toEqual({
        ignore_check_constraints: 0,
      });
    }
    const sixRatings = (id: string, overrides: Record<string, unknown> = {}): [string, string, unknown][] =>
      ORDER.map((category) => [id, category, category in overrides ? overrides[category] : 3]);

    async function expectReadFails(field: string, reason: string, category: string | null = null) {
      const attempt = list();
      await expect(attempt).rejects.toBeInstanceOf(SelfAssessmentDataError);
      await expect(attempt).rejects.toMatchObject({ field, reason, category });
    }

    beforeEach(async () => {
      await create(); // a valid assessment next to the corrupt one: no partial history either
    });

    it('an unknown category', async () => {
      await corrupt({
        assessment: [A, gal, 'BASKETBALL', T0],
        ratings: [...sixRatings(A), [A, 'DUNKING', 3]],
      });
      await expectReadFails('ratings', 'UNKNOWN_CATEGORY', 'DUNKING');
    });

    it.each(['__proto__', 'constructor', 'toString'])('a prototype-like category %p', async (category) => {
      await corrupt({
        assessment: [A, gal, 'BASKETBALL', T0],
        ratings: [...sixRatings(A), [A, category, 3]],
      });
      await expectReadFails('ratings', 'UNKNOWN_CATEGORY', category);
    });

    it('a missing category', async () => {
      await corrupt({ assessment: [A, gal, 'BASKETBALL', T0], ratings: sixRatings(A).slice(0, 5) });
      await expectReadFails('ratings', 'MISSING_CATEGORY', 'SPEED');
    });

    it('an assessment with no ratings', async () => {
      await corrupt({ assessment: [A, gal, 'BASKETBALL', T0] });
      await expectReadFails('ratings', 'NO_RATINGS');
    });

    it.each([0, 6, 2.5])('an out-of-range rating %p (CHECK bypassed)', async (rating) => {
      await corrupt(
        { assessment: [A, gal, 'BASKETBALL', T0], ratings: sixRatings(A, { PASSING: rating }) },
        { checks: true },
      );
      await expectReadFails('ratings', 'INVALID_RATING', 'PASSING');
    });

    it('a text rating (CHECK bypassed)', async () => {
      await corrupt(
        { assessment: [A, gal, 'BASKETBALL', T0], ratings: sixRatings(A, { DEFENSE: 'high' }) },
        { checks: true },
      );
      await expectReadFails('ratings', 'INVALID_RATING', 'DEFENSE');
    });

    it.each([1.5, 'yesterday'])('a malformed taken_at %p (CHECK bypassed)', async (takenAt) => {
      await corrupt(
        { assessment: [A, gal, 'BASKETBALL', takenAt], ratings: sixRatings(A) },
        { checks: true },
      );
      await expectReadFails('takenAt', 'INVALID_VALUE');
    });

    it('a malformed assessment id', async () => {
      await corrupt({ assessment: ['not-a-uuid', gal, 'BASKETBALL', T0], ratings: sixRatings('not-a-uuid') });
      await expectReadFails('id', 'INVALID_VALUE');
    });

    it('an unsupported stored sport (FK-valid fixture)', async () => {
      await db.runAsync('INSERT INTO player_sports (player_id, sport) VALUES (?, ?)', [gal, 'FOOTBALL']);
      await corrupt({ assessment: [A, gal, 'FOOTBALL', T0], ratings: sixRatings(A) });
      const attempt = listSelfAssessments(db, gal, 'FOOTBALL');
      await expect(attempt).rejects.toMatchObject({ field: 'sport', reason: 'UNSUPPORTED_SPORT' });
    });

    describe('relationship to an existing player + sport assignment (FK bypassed)', () => {
      const UNKNOWN_PLAYER = '00000000-0000-4000-8000-000000000999';

      /** Runs raw SQL with FK enforcement off for the corruption only, then proves it is back on. */
      async function withoutForeignKeys(sql: string, params: (string | number)[]) {
        await db.execAsync('PRAGMA foreign_keys = OFF');
        try {
          await db.runAsync(sql, params);
        } finally {
          await db.execAsync('PRAGMA foreign_keys = ON');
        }
        expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
      }

      it('a valid relationship reads normally', async () => {
        const history = await list();
        expect(history).toHaveLength(1);
        expect(history[0]!.playerId).toBe(gal);
      });

      it('the assignment was removed: a complete, valid assessment fails as INVALID_RELATIONSHIP', async () => {
        const [stored] = await list();
        await withoutForeignKeys('DELETE FROM player_sports WHERE player_id = ? AND sport = ?', [
          gal,
          'BASKETBALL',
        ]);
        expect(
          await db.getFirstAsync('SELECT count(*) AS n FROM player_sports WHERE player_id = ?', [gal]),
        ).toEqual({
          n: 0,
        });
        const attempt = list();
        await expect(attempt).rejects.toBeInstanceOf(SelfAssessmentDataError);
        await expect(attempt).rejects.toMatchObject({
          field: 'sport',
          reason: 'INVALID_RELATIONSHIP',
          assessmentId: stored!.id,
        });
        // Observed, not hidden or repaired: the row is still there.
        expect(await assessmentCounts()).toEqual({ self_assessments: 1, self_assessment_ratings: 6 });
      });

      it('an existing player that never had the sport: a valid assessment fails as INVALID_RELATIONSHIP', async () => {
        await corrupt(
          { assessment: [A, noa, 'BASKETBALL', T0], ratings: sixRatings(A) },
          { foreignKeys: true },
        );
        const attempt = listSelfAssessments(db, noa, 'BASKETBALL');
        await expect(attempt).rejects.toBeInstanceOf(SelfAssessmentDataError);
        await expect(attempt).rejects.toMatchObject({
          field: 'sport',
          reason: 'INVALID_RELATIONSHIP',
          assessmentId: A,
        });
      });

      it('a valid-looking UUID with no player at all fails as INVALID_RELATIONSHIP (not INVALID_VALUE)', async () => {
        await corrupt(
          { assessment: [A, UNKNOWN_PLAYER, 'BASKETBALL', T0], ratings: sixRatings(A) },
          { foreignKeys: true },
        );
        const attempt = listSelfAssessments(db, UNKNOWN_PLAYER, 'BASKETBALL');
        await expect(attempt).rejects.toBeInstanceOf(SelfAssessmentDataError);
        await expect(attempt).rejects.toMatchObject({
          field: 'playerId',
          reason: 'INVALID_RELATIONSHIP',
          assessmentId: A,
        });
      });

      it('the player row was removed but its assignment remains: fails as INVALID_RELATIONSHIP', async () => {
        await withoutForeignKeys('DELETE FROM players WHERE id = ?', [gal]);
        await expectReadFails('playerId', 'INVALID_RELATIONSHIP');
      });

      it('a malformed player id is still INVALID_VALUE (syntax, not relationship)', async () => {
        await corrupt(
          { assessment: [A, 'not-a-uuid', 'BASKETBALL', T0], ratings: sixRatings(A) },
          { foreignKeys: true },
        );
        await expect(listSelfAssessments(db, 'not-a-uuid', 'BASKETBALL')).rejects.toMatchObject({
          field: 'playerId',
          reason: 'INVALID_VALUE',
        });
      });
    });

    it('duplicate category rows (a read that bypasses the primary key) fail as DUPLICATE_CATEGORY', async () => {
      // The PK makes this impossible in the file; inject the duplicate at the read boundary.
      const valid = (await list())[0]!;
      const injected: PlayerDb = {
        runAsync: (sql, params) => db.runAsync(sql, params),
        getFirstAsync: (sql, params) => db.getFirstAsync(sql, params),
        withTransactionAsync: (task) => db.withTransactionAsync(task),
        getAllAsync: async <T>(sql: string, params: (string | number | null)[]) => {
          const rows = (await db.getAllAsync<T>(sql, params)) as Record<string, unknown>[];
          return [...rows, { ...rows[rows.length - 1]!, category: 'SHOOTING', rating: 4 }] as T[];
        },
      };
      const attempt = listSelfAssessments(injected, gal, 'BASKETBALL');
      await expect(attempt).rejects.toMatchObject({
        reason: 'DUPLICATE_CATEGORY',
        category: 'SHOOTING',
        assessmentId: valid.id,
      });
    });

    it('nothing is repaired or deleted by a failed read', async () => {
      await corrupt({
        assessment: [A, gal, 'BASKETBALL', T0],
        ratings: [...sixRatings(A), [A, 'DUNKING', 3]],
      });
      await expect(list()).rejects.toBeInstanceOf(SelfAssessmentDataError);
      expect(await assessmentCounts()).toEqual({ self_assessments: 2, self_assessment_ratings: 13 });
    });
  });

  describe('concurrency (one operation at a time per connection)', () => {
    it('concurrent creates on one connection all complete, with no partial rows', async () => {
      const results = await Promise.allSettled([
        createSelfAssessment(db, gal, 'BASKETBALL', answers([1, 1, 1, 1, 1, 1]), { ids, clock }),
        createSelfAssessment(db, gal, 'BASKETBALL', answers([2, 2, 2, 2, 2, 2]), { ids, clock }),
        createSelfAssessment(db, gal, 'BASKETBALL', answers([3, 3, 3, 3, 3, 3]), { ids, clock }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
      const saved = results.map((r) =>
        expectOk((r as PromiseFulfilledResult<CreateSelfAssessmentResult>).value),
      );
      expect(await assessmentCounts()).toEqual({ self_assessments: 3, self_assessment_ratings: 18 });
      const history = await list();
      expect(history).toHaveLength(3);
      for (const assessment of saved) expect(history).toContainEqual(assessment);
      expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    });

    it('a concurrent player update and assessment create both apply completely', async () => {
      const [updated, assessment] = await Promise.all([
        updatePlayer(
          db,
          gal,
          { ...BASKETBALL_PLAYER, player: { ...BASKETBALL_PLAYER.player, name: 'Gal C' } },
          { clock },
        ),
        createSelfAssessment(db, gal, 'BASKETBALL', answers(), { ids, clock }),
      ]);
      expect(updated.ok && updated.profile.player.name).toBe('Gal C');
      expect(await list()).toEqual([expectOk(assessment)]);
    });
  });
});

describe('self-assessment persistence stays subjective storage', () => {
  it.each(['../selfAssessmentRepository.ts', '../errors.ts'])(
    '%s has no measurement / comparison / result coupling and no update or delete',
    (file) => {
      const code = readFileSync(resolve(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/measurement|comparison|MeasurementType|['"]RATING['"]|result_|results/i);
      expect(code).not.toMatch(/\bUPDATE\b|\bDELETE\b|REPLACE|UPSERT|ON CONFLICT/i);
      expect(code).not.toMatch(/Date\.now|new Date/);
    },
  );

  it('exports only create and list (no update / delete / replace API)', () => {
    const exported = Object.keys(jest.requireActual('../selfAssessmentRepository'));
    expect(exported.sort()).toEqual(['createSelfAssessment', 'listSelfAssessments']);
  });
});
