import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { Uuid } from '@/domain/ids';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import {
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from '../../calendar/calendarEventRepository';
import { CalendarSportNotAssignedError } from '../../calendar/errors';
import { openLocalDatabase } from '../../database';
import {
  createSelfAssessment,
  listSelfAssessments,
  type SelfAssessmentAnswers,
} from '../../selfAssessments/selfAssessmentRepository';
import { SelfAssessmentSportNotAssignedError } from '../../selfAssessments/errors';
import { PlayerDataError, SportInactiveError } from '../errors';
import {
  createPlayer,
  getPlayer,
  isSportActive,
  listPlayers,
  updatePlayer,
  type PlayerProfileInput,
} from '../playerRepository';

const T0 = new Date(2026, 9, 6, 12).getTime();
const START = new Date(2026, 9, 10, 17).getTime();
const CATEGORIES = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];
const answers = (r = 3): SelfAssessmentAnswers => CATEGORIES.map((category) => ({ category, rating: r }));

const GAL_INPUT: PlayerProfileInput = {
  player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 }, heightCm: 142 },
  basketball: {
    primaryPosition: 'SG',
    secondaryPosition: 'SF',
    dominantHand: 'LEFT',
    experience: 'ONE_TO_TWO_YEARS', // dormant fields (no longer collected by the form)
    weeklyFrequency: 'TWO_TO_THREE',
  },
};
/** What the Player form sends while Basketball is unselected. */
const WITHOUT_BASKETBALL: PlayerProfileInput = { player: GAL_INPUT.player, basketball: null };
/** What the Player form sends when Basketball is selected again (V1 fields only, pre-filled). */
const RESELECTED: PlayerProfileInput = {
  player: GAL_INPUT.player,
  basketball: { primaryPosition: 'SG', secondaryPosition: 'SF', dominantHand: 'LEFT' },
};

describe('Basketball active / inactive lifecycle on real SQLite (SPORT-LIFE-001)', () => {
  let dir: string;
  let file: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let now: number;
  const clock: Clock = { wallNow: () => now, monotonicNow: () => 0 };
  let gal: Uuid;
  let noa: Uuid;

  /** Everything except players / player_sports (whose expected changes are asserted precisely). */
  const history = async () => ({
    families: await db.getAllAsync('SELECT * FROM families ORDER BY id'),
    basketball_player_profiles: await db.getAllAsync(
      'SELECT * FROM basketball_player_profiles ORDER BY player_id',
    ),
    self_assessments: await db.getAllAsync('SELECT * FROM self_assessments ORDER BY id'),
    self_assessment_ratings: await db.getAllAsync(
      'SELECT * FROM self_assessment_ratings ORDER BY assessment_id, category',
    ),
    calendar_events: await db.getAllAsync('SELECT * FROM calendar_events ORDER BY id'),
    app_meta: await db.getAllAsync('SELECT * FROM app_meta ORDER BY key'),
  });
  const assignments = () =>
    db.getAllAsync('SELECT rowid, player_id, sport, active FROM player_sports ORDER BY player_id, sport');
  const deactivate = async () => {
    const result = await updatePlayer(db, gal, WITHOUT_BASKETBALL, { clock });
    if (!result.ok) throw new Error('deactivate failed');
    return result.profile;
  };
  const reactivate = async () => {
    const result = await updatePlayer(db, gal, RESELECTED, { clock });
    if (!result.ok) throw new Error('reactivate failed');
    return result.profile;
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-life-'));
    file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    now = T0;
    const created = await createPlayer(db, GAL_INPUT, { ids, clock });
    const other = await createPlayer(
      db,
      { player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } }, basketball: null },
      { ids, clock },
    );
    if (!created.ok || !other.ok) throw new Error('seed failed');
    gal = created.profile.player.id;
    noa = other.profile.player.id;
    // Basketball history: a self-assessment and a Basketball calendar event.
    if (!(await createSelfAssessment(db, gal, 'BASKETBALL', answers(), { ids, clock })).ok)
      throw new Error('seed');
    const event = await createCalendarEvent(
      db,
      gal,
      { type: 'GAME', sport: 'BASKETBALL', startAt: START },
      { ids, clock },
    );
    if (!event.ok) throw new Error('seed');
    now = T0 + 60_000;
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  describe('deactivation', () => {
    it('makes Basketball inactive with no DELETE; the profile and all history are untouched', async () => {
      const before = { history: await history(), assignments: await assignments() };
      const writes: string[] = [];
      const run = db.runAsync.bind(db);
      jest.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...rest: unknown[]) => {
        writes.push(sql.replace(/\s+/g, ' ').trim());
        return (run as (...a: unknown[]) => Promise<never>)(sql, ...rest);
      });
      const profile = await deactivate();
      (db.runAsync as jest.Mock).mockRestore();

      expect(writes.filter((sql) => /DELETE|DROP|REPLACE/i.test(sql))).toEqual([]);
      expect(
        writes.filter((sql) => /basketball_player_profiles|self_assessment|calendar_events/.test(sql)),
      ).toEqual([]);
      expect(profile.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
      expect(isSportActive(profile, 'BASKETBALL')).toBe(false);
      // The stored profile (all five fields, dormant ones included) is still there, value-identical.
      expect(profile.basketball).toEqual({
        primaryPosition: 'SG',
        secondaryPosition: 'SF',
        dominantHand: 'LEFT',
        experience: 'ONE_TO_TWO_YEARS',
        weeklyFrequency: 'TWO_TO_THREE',
      });
      expect(profile.player.heightCm).toBe(142);
      expect(await history()).toEqual(before.history);
      // Same assignment row (same rowid), only `active` changed.
      expect(await assignments()).toEqual(
        (before.assignments as Record<string, unknown>[]).map((row) => ({ ...row, active: 0 })),
      );
      expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
    });

    it('a Player with no active sport is valid: get / list / update work; history stays readable', async () => {
      await deactivate();
      expect((await getPlayer(db, gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
      expect((await listPlayers(db)).map((p) => [p.player.name, p.sports])).toEqual([
        ['Gal', [{ sport: 'BASKETBALL', active: false }]],
        ['Noa', []],
      ]);
      expect(await listSelfAssessments(db, gal, 'BASKETBALL')).toHaveLength(1);
      expect((await listCalendarEvents(db, gal)).map((e) => e.sport)).toEqual(['BASKETBALL']);
      // A personal-fields update while inactive keeps it inactive and the profile untouched.
      const profiles = await db.getAllAsync('SELECT * FROM basketball_player_profiles');
      const renamed = await updatePlayer(
        db,
        gal,
        { ...WITHOUT_BASKETBALL, player: { ...GAL_INPUT.player, name: 'Gal C' } },
        { clock },
      );
      expect(renamed.ok && renamed.profile.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
      expect(await db.getAllAsync('SELECT * FROM basketball_player_profiles')).toEqual(profiles);
    });

    it('players without Basketball are unaffected', async () => {
      const noaBefore = await getPlayer(db, noa);
      await deactivate();
      expect(await getPlayer(db, noa)).toEqual(noaBefore);
      expect(
        await db.getFirstAsync('SELECT count(*) AS n FROM player_sports WHERE player_id = ?', [noa]),
      ).toEqual({ n: 0 });
    });

    it('survives a restart', async () => {
      await deactivate();
      await db.closeAsync();
      db = (await openLocalDatabase()).db;
      expect((await getPlayer(db, gal))!.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
      expect(await listSelfAssessments(db, gal, 'BASKETBALL')).toHaveLength(1);
    });
  });

  describe('while inactive', () => {
    beforeEach(() => deactivate());

    it('no new self-assessment: SportInactiveError (not "not assigned"), nothing written', async () => {
      const before = await history();
      const attempt = createSelfAssessment(db, gal, 'BASKETBALL', answers(5), { ids, clock });
      await expect(attempt).rejects.toBeInstanceOf(SportInactiveError);
      await expect(attempt).rejects.not.toBeInstanceOf(SelfAssessmentSportNotAssignedError);
      await expect(attempt).rejects.toMatchObject({ playerId: gal, sport: 'BASKETBALL' });
      expect(await history()).toEqual(before);
      // A Player who never had Basketball still gets "not assigned".
      await expect(
        createSelfAssessment(db, noa, 'BASKETBALL', answers(), { ids, clock }),
      ).rejects.toBeInstanceOf(SelfAssessmentSportNotAssignedError);
    });

    it('a new calendar event cannot carry inactive Basketball; a sport-less one can', async () => {
      const before = await history();
      const attempt = createCalendarEvent(
        db,
        gal,
        { type: 'GYM', sport: 'BASKETBALL', startAt: START },
        { ids, clock },
      );
      await expect(attempt).rejects.toBeInstanceOf(SportInactiveError);
      await expect(attempt).rejects.not.toBeInstanceOf(CalendarSportNotAssignedError);
      expect(await history()).toEqual(before);
      expect((await createCalendarEvent(db, gal, { type: 'GYM', startAt: START }, { ids, clock })).ok).toBe(
        true,
      );
    });

    it('an existing Basketball event stays valid and editable: keep its sport, or clear it', async () => {
      const [event] = await listCalendarEvents(db, gal);
      expect(event!.sport).toBe('BASKETBALL');
      const kept = await updateCalendarEvent(
        db,
        gal,
        event!.id,
        { type: 'GAME', sport: 'BASKETBALL', startAt: START, title: 'Final' },
        { clock },
      );
      expect(kept.ok && [kept.event.sport, kept.event.title]).toEqual(['BASKETBALL', 'Final']);
      const cleared = await updateCalendarEvent(
        db,
        gal,
        event!.id,
        { type: 'GAME', sport: null, startAt: START },
        { clock },
      );
      expect(cleared.ok && cleared.event.sport).toBeNull();
      // Once cleared, inactive Basketball cannot be put back on it (that would be a new assignment).
      await expect(
        updateCalendarEvent(
          db,
          gal,
          event!.id,
          { type: 'GAME', sport: 'BASKETBALL', startAt: START },
          { clock },
        ),
      ).rejects.toBeInstanceOf(SportInactiveError);
      expect((await getCalendarEvent(db, gal, event!.id))!.sport).toBeNull();
    });

    it('a sport-less event cannot be given inactive Basketball', async () => {
      const plain = await createCalendarEvent(db, gal, { type: 'GYM', startAt: START + 1 }, { ids, clock });
      if (!plain.ok) throw new Error('seed');
      await expect(
        updateCalendarEvent(
          db,
          gal,
          plain.event.id,
          { type: 'GYM', sport: 'BASKETBALL', startAt: START + 1 },
          { clock },
        ),
      ).rejects.toBeInstanceOf(SportInactiveError);
    });
  });

  describe('reactivation', () => {
    it('reuses the same assignment and profile rows; no duplicates; dormant fields kept; history attached', async () => {
      const original = { history: await history(), assignments: await assignments() };
      await deactivate();
      const profile = await reactivate();

      expect(profile.sports).toEqual([{ sport: 'BASKETBALL', active: true }]);
      expect(profile.basketball).toEqual({
        primaryPosition: 'SG',
        secondaryPosition: 'SF',
        dominantHand: 'LEFT',
        experience: 'ONE_TO_TWO_YEARS',
        weeklyFrequency: 'TWO_TO_THREE',
      });
      expect(await assignments()).toEqual(original.assignments); // same rowid, active again
      expect(await history()).toEqual(original.history); // nothing created or lost
      expect(await db.getFirstAsync('SELECT count(*) AS n FROM basketball_player_profiles')).toEqual({
        n: 1,
      });
      // New Basketball activity works again and joins the same history.
      expect((await createSelfAssessment(db, gal, 'BASKETBALL', answers(4), { ids, clock })).ok).toBe(true);
      expect(await listSelfAssessments(db, gal, 'BASKETBALL')).toHaveLength(2);
      expect(
        (
          await createCalendarEvent(
            db,
            gal,
            { type: 'GAME', sport: 'BASKETBALL', startAt: START + 5 },
            { ids, clock },
          )
        ).ok,
      ).toBe(true);
    });

    it('edited details on reactivation are saved to the same profile row', async () => {
      await deactivate();
      const result = await updatePlayer(
        db,
        gal,
        { ...RESELECTED, basketball: { primaryPosition: 'PG', dominantHand: 'RIGHT' } },
        { clock },
      );
      expect(result.ok && result.profile.basketball).toMatchObject({
        primaryPosition: 'PG',
        secondaryPosition: null,
        dominantHand: 'RIGHT',
        experience: 'ONE_TO_TWO_YEARS',
      });
      expect(await db.getFirstAsync('SELECT count(*) AS n FROM basketball_player_profiles')).toEqual({
        n: 1,
      });
    });

    it('a failed reactivation (injected) rolls back: still inactive, profile unchanged', async () => {
      await deactivate();
      const before = { history: await history(), assignments: await assignments() };
      const run = db.runAsync.bind(db);
      jest.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...rest: unknown[]) => {
        if (/UPDATE player_sports/.test(sql)) throw new Error('injected failure');
        return (run as (...a: unknown[]) => Promise<never>)(sql, ...rest);
      });
      await expect(
        updatePlayer(db, gal, { ...RESELECTED, basketball: { primaryPosition: 'C' } }, { clock }),
      ).rejects.toThrow('injected failure');
      (db.runAsync as jest.Mock).mockRestore();
      expect(await assignments()).toEqual(before.assignments);
      expect(await history()).toEqual(before.history);
    });
  });

  describe('malformed lifecycle data fails the read', () => {
    it.each([
      ['2', 2],
      ['text', "'yes'"],
    ])(
      'active = %s (CHECK bypassed): PlayerDataError sportActive, nothing repaired',
      async (_label, value) => {
        await db.execAsync('PRAGMA ignore_check_constraints = ON');
        try {
          await db.execAsync(`UPDATE player_sports SET active = ${value} WHERE player_id = '${gal}'`);
        } finally {
          await db.execAsync('PRAGMA ignore_check_constraints = OFF');
        }
        const stored = await assignments();
        for (const read of [getPlayer(db, gal), listPlayers(db)]) {
          await expect(read).rejects.toBeInstanceOf(PlayerDataError);
          await expect(read).rejects.toMatchObject({ field: 'sportActive', reason: 'INVALID_VALUE' });
        }
        await expect(updatePlayer(db, gal, WITHOUT_BASKETBALL, { clock })).rejects.toBeInstanceOf(
          PlayerDataError,
        );
        expect(await assignments()).toEqual(stored);
      },
    );
  });

  it('concurrent deactivation and a calendar edit both apply completely', async () => {
    const [event] = await listCalendarEvents(db, gal);
    const [deactivated, edited] = await Promise.all([
      updatePlayer(db, gal, WITHOUT_BASKETBALL, { clock }),
      updateCalendarEvent(
        db,
        gal,
        event!.id,
        { type: 'GAME', sport: 'BASKETBALL', startAt: START, notes: 'Bus 16:00' },
        { clock },
      ),
    ]);
    expect(deactivated.ok && deactivated.profile.sports).toEqual([{ sport: 'BASKETBALL', active: false }]);
    expect(edited.ok && edited.event.notes).toBe('Bus 16:00');
    expect(await db.getFirstAsync('PRAGMA foreign_key_check')).toBeNull();
  });
});
