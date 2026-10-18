import type { Uuid } from '@/domain/ids';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import {
  createCalendarEvent,
  createCalendarEventBatch,
  listCalendarEvents,
  updateCalendarEvent,
} from '../../calendar/calendarEventRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createSelfAssessment, listSelfAssessments, type SelfAssessmentAnswers } from '../../selfAssessments/selfAssessmentRepository';
import { finishSession, getPlannedWorkout, getSession, listTraining, planAndStart, planWorkout, recordSet, startSession } from '../../training/trainingRepository';
import { createBlock, createTemplate } from '../../training/workoutRepository';
import { PlayerArchivedError, PlayerNotFoundError } from '../errors';
import {
  archivePlayer,
  createPlayer,
  getPlayer,
  listPlayers,
  restorePlayer,
  updatePlayer,
  type PlayerProfileInput,
} from '../playerRepository';

/**
 * PLAYER-ARCHIVE-001 (owner 2026-10-12) on real SQLite: a Player leaves the
 * active roster by ARCHIVE; training history is never destructively deleted.
 */
const T0 = new Date(2026, 9, 12, 17).getTime();
const HOUR = 3_600_000;
const GAL: PlayerProfileInput = { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: { primaryPosition: 'PG' } };
const NOA: PlayerProfileInput = { player: { name: 'Noa', dateOfBirth: { year: 2013, month: 1, day: 2 } }, basketball: { primaryPosition: 'C' } };
const NEW_KID: PlayerProfileInput = { player: { name: 'Ido', dateOfBirth: { year: 2015, month: 5, day: 5 } }, basketball: null };
const ANSWERS: SelfAssessmentAnswers = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'].map((category) => ({ category, rating: 3 }));
const rx = (sets: number, target: number, loadKg: number | null) => ({ sets, target, loadKg, restSec: 60 }) satisfies Prescription;

/** Every table holding Player-owned history. */
const HISTORY = [
  'player_sports', 'basketball_player_profiles', 'self_assessments', 'self_assessment_ratings', 'calendar_events',
  'planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements',
];

describe('Archive Player (schema v15)', () => {
  let db: ReturnType<typeof openNodeSqlite>;
  const ids = createSequentialIdService();
  let now = T0;
  const clock = { wallNow: () => now, monotonicNow: () => 0 };
  const deps = { ids, clock };
  let gal: Uuid;
  let noa: Uuid;
  let templateId: string;

  const counts = async (tables = HISTORY) => {
    const out: Record<string, number> = {};
    for (const t of tables) out[t] = (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${t}`))!.n;
    return out;
  };
  const dump = async (tables = HISTORY) => {
    const out: Record<string, unknown[]> = {};
    for (const t of tables) out[t] = await db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`);
    return out;
  };
  /**
   * History in every table: an event, a self-assessment, an unstarted plan, and a started plan with a recorded set
   * that is FINISHED (QB safety gate S1: a Player cannot be archived while a workout is in progress).
   */
  async function history(playerId: Uuid) {
    if (!(await createSelfAssessment(db, playerId, 'BASKETBALL', ANSWERS, deps)).ok) throw new Error('assessment');
    const event = await createCalendarEvent(db, playerId, { type: 'GYM', startAt: T0, endAt: T0 + HOUR }, deps);
    if (!event.ok) throw new Error('event');
    const plan = await planWorkout(db, { playerId, templateId }, deps);
    const session = await planAndStart(db, { playerId, templateId }, deps);
    const recorded = await recordSet(db, session.exercises[0]!.sets[0]!.id, { REPETITIONS: 10, LOAD_KG: 50 }, deps);
    if (!recorded.ok) throw new Error('set');
    const finished = await finishSession(db, recorded.session.id, deps);
    return { event: event.event, plan, session: finished };
  }

  beforeEach(async () => {
    now = T0;
    db = openNodeSqlite(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await runMigrations(db, migrations);
    const a = await createPlayer(db, GAL, deps);
    const b = await createPlayer(db, NOA, deps);
    if (!a.ok || !b.ok) throw new Error('players');
    gal = a.profile.player.id;
    noa = b.profile.player.id;
    const block = await createBlock(db, { name: 'Strength', items: [{ exerciseId: 'BARBELL_BENCH_PRESS', prescription: rx(2, 10, 50) }] }, deps);
    if (!block.ok) throw new Error('block');
    const template = await createTemplate(db, { name: 'Gym', blockIds: [block.block.id] }, deps);
    if (!template.ok) throw new Error('template');
    templateId = template.template.id;
  });
  afterEach(() => db.closeAsync());

  describe('migration v15', () => {
    it('upgrades a v14 database: every Player stays as it was, active (archived_at NULL); the column is nullable', async () => {
      const old = openNodeSqlite(':memory:');
      await old.execAsync('PRAGMA foreign_keys = ON');
      await runMigrations(old, migrations.filter((m) => m.version <= 14));
      const p = await createPlayer(old, GAL, deps);
      if (!p.ok) throw new Error('seed');
      const before = await old.getFirstAsync('SELECT * FROM players');
      await runMigrations(old, migrations);
      expect(await old.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 19 });
      expect(await old.getFirstAsync('SELECT * FROM players')).toEqual({ ...(before as object), archived_at: null });
      expect(await old.getFirstAsync("SELECT type, \"notnull\", dflt_value FROM pragma_table_info('players') WHERE name = 'archived_at'"))
        .toEqual({ type: 'INTEGER', notnull: 0, dflt_value: null });
      expect((await getPlayer(old, p.profile.player.id))!.player.archivedAt).toBeNull();
      await old.closeAsync();
    });

    it('the CHECK accepts only NULL or a positive integer time', async () => {
      for (const bad of [0, -5, 1.5, "'yesterday'"]) {
        await expect(db.execAsync(`UPDATE players SET archived_at = ${bad} WHERE id = '${gal}'`)).rejects.toThrow(/CHECK/);
      }
      await db.execAsync(`UPDATE players SET archived_at = ${T0} WHERE id = '${gal}'`);
    });

    it('no cascade anywhere; the training-history delete guards are untouched and still refuse', async () => {
      expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE sql LIKE '%CASCADE%'")).toEqual([]);
      const { plan, session } = await history(gal);
      await archivePlayer(db, gal, { clock });
      const before = await counts();
      await expect(db.runAsync('DELETE FROM training_sessions WHERE id = ?', [session.id])).rejects.toThrow(/never deleted/);
      await expect(db.runAsync('DELETE FROM planned_workouts WHERE id = ?', [plan.id])).rejects.toThrow(/never deleted/);
      await expect(db.runAsync('DELETE FROM session_exercises')).rejects.toThrow(/never deleted/);
      expect(await counts()).toEqual(before);
    });
  });

  describe('archive', () => {
    it('a Player with no history can be archived: off the roster, still readable by id', async () => {
      const kid = await createPlayer(db, NEW_KID, deps);
      if (!kid.ok) throw new Error('seed');
      now = T0 + HOUR;
      expect(await archivePlayer(db, kid.profile.player.id, { clock })).toBe(T0 + HOUR);
      expect((await listPlayers(db)).map((p) => p.player.name)).toEqual(['Gal', 'Noa']);
      expect((await listPlayers(db, { includeArchived: true })).map((p) => p.player.name)).toEqual(['Gal', 'Noa', 'Ido']);
      expect((await getPlayer(db, kid.profile.player.id))!.player).toMatchObject({ name: 'Ido', archivedAt: T0 + HOUR, updatedAt: T0 + HOUR });
    });

    it('a Player with PlannedWorkouts, a TrainingSession, events and assessments: every history row unchanged and still readable', async () => {
      const { event, plan, session } = await history(gal);
      await history(noa);
      const before = await dump();
      const noaBefore = await getPlayer(db, noa);
      const trainingBefore = await listTraining(db, gal);

      now = T0 + 2 * HOUR;
      await archivePlayer(db, gal, { clock });

      expect(await dump()).toEqual(before); // nothing deleted, nothing changed — not even in another table
      expect((await db.getAllAsync('PRAGMA foreign_key_check'))).toEqual([]);
      // Historical reads by player_id keep working for the archived Player.
      expect(await getPlannedWorkout(db, plan.id)).not.toBeNull();
      expect(await getSession(db, session.id)).toEqual(session);
      expect(await listTraining(db, gal)).toEqual(trainingBefore);
      expect((await listCalendarEvents(db, gal)).map((e) => e.id)).toEqual([event.id]);
      expect(await listSelfAssessments(db, gal, 'BASKETBALL')).toHaveLength(1);
      // Only Gal changed.
      expect(await getPlayer(db, noa)).toEqual(noaBefore);
      expect((await listPlayers(db)).map((p) => p.player.id)).toEqual([noa]);
    });

    it('archiving again keeps the original time; an unknown Player → PlayerNotFoundError', async () => {
      await archivePlayer(db, gal, { clock });
      now = T0 + HOUR;
      expect(await archivePlayer(db, gal, { clock })).toBe(T0);
      expect((await getPlayer(db, gal))!.player.archivedAt).toBe(T0);
      await expect(archivePlayer(db, 'missing', { clock })).rejects.toBeInstanceOf(PlayerNotFoundError);
    });

    it('transactional: a failure leaves the Player active', async () => {
      await db.execAsync("CREATE TRIGGER refuse BEFORE UPDATE OF archived_at ON players BEGIN SELECT RAISE(ABORT, 'refused'); END");
      await expect(archivePlayer(db, gal, { clock })).rejects.toThrow('refused');
      expect((await getPlayer(db, gal))!.player.archivedAt).toBeNull();
      expect((await listPlayers(db)).map((p) => p.player.id)).toEqual([gal, noa]);
    });
  });

  describe('no new Player-owned activity for an archived Player', () => {
    it('event, import batch, self-assessment, planned workout, session: refused, nothing written', async () => {
      const unstarted = await planWorkout(db, { playerId: gal, templateId }, deps);
      await archivePlayer(db, gal, { clock });
      const before = await counts();
      await expect(createCalendarEvent(db, gal, { type: 'GYM', startAt: T0, endAt: null }, deps)).rejects.toBeInstanceOf(PlayerArchivedError);
      await expect(
        createCalendarEventBatch(db, gal, { events: [{ type: 'GAME', startAt: T0, endAt: null }], source: 'XLSX_IMPORT' }, deps),
      ).rejects.toBeInstanceOf(PlayerArchivedError);
      await expect(createSelfAssessment(db, gal, 'BASKETBALL', ANSWERS, deps)).rejects.toBeInstanceOf(PlayerArchivedError);
      await expect(planWorkout(db, { playerId: gal, templateId }, deps)).rejects.toBeInstanceOf(PlayerArchivedError);
      await expect(planAndStart(db, { playerId: gal, templateId }, deps)).rejects.toBeInstanceOf(PlayerArchivedError);
      // An existing plan cannot be started either: the database itself refuses.
      await expect(startSession(db, unstarted.id, deps)).rejects.toThrow(/archived player gets no new activity/);
      expect(await counts()).toEqual(before);
      // Other Players are unaffected.
      expect((await createCalendarEvent(db, noa, { type: 'GYM', startAt: T0, endAt: null }, deps)).ok).toBe(true);
    });

    it('the database refuses even a direct insert (defence in depth)', async () => {
      await archivePlayer(db, gal, { clock });
      await expect(
        db.runAsync(
          "INSERT INTO calendar_events (id, player_id, type, start_at, created_at, updated_at) VALUES ('e-direct', ?, 'GYM', ?, ?, ?)",
          [gal, T0, T0, T0],
        ),
      ).rejects.toThrow(/archived player gets no new activity/);
    });

    it('existing history stays editable (an archived Player is not frozen)', async () => {
      const { event } = await history(gal);
      await archivePlayer(db, gal, { clock });
      const edited = await updateCalendarEvent(db, gal, event.id, { type: 'GYM', startAt: T0, endAt: T0 + 2 * HOUR, location: 'אולם' }, { clock });
      expect(edited.ok).toBe(true);
    });
  });

  describe('restore', () => {
    it('back on the roster with every history row unchanged; new activity allowed again', async () => {
      await history(gal);
      await archivePlayer(db, gal, { clock });
      const before = await dump();
      now = T0 + HOUR;
      await restorePlayer(db, gal, { clock });
      expect((await getPlayer(db, gal))!.player.archivedAt).toBeNull();
      expect((await listPlayers(db)).map((p) => p.player.id)).toEqual([gal, noa]);
      expect(await dump()).toEqual(before);
      expect((await createCalendarEvent(db, gal, { type: 'GYM', startAt: T0, endAt: null }, deps)).ok).toBe(true);
      await expect(restorePlayer(db, 'missing', { clock })).rejects.toBeInstanceOf(PlayerNotFoundError);
    });

    it('editing an active Player never touches archived_at', async () => {
      const updated = await updatePlayer(db, gal, { player: { name: 'Gal B', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: { primaryPosition: 'PG' } }, { clock });
      expect(updated.ok && updated.profile.player.archivedAt).toBeNull();
    });
  });
});
