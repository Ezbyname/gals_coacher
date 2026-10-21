import { resolveTimeSemantics } from '@/domain/exercise/timeSemantics';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { scheduleWorkout } from '../../calendar/calendarEventRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { savePlannedWorkout } from '../plannedWorkoutCompositionRepository';
import { TrainingRuleError } from '../errors';
import { assignTrainingBlock } from '../trainingBlockAssignment';
import { finishSession, getPlannedWorkout, getSession, recordSet, startOrOpenSession, startSession } from '../trainingRepository';
import { listWorkoutEventLinks } from '../workoutEventLinks';

/** CAL-TRAIN-001 — Start from a scheduled workout: idempotent, one session, plan untouched, any origin, semantics copied. */
const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
const HOUR = 3_600_000;
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;

const sessionCount = async () => (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM training_sessions'))!.n;
const dump = async (table: string) => JSON.stringify(await db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`));

async function mkScheduled(name: string, startAt: number, entries?: Parameters<typeof savePlannedWorkout>[1]['entries']) {
  const p = await savePlannedWorkout(
    db,
    {
      planId: null,
      playerId: daniel,
      name,
      entries: entries ?? [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 3, target: 30, loadKg: null, restSec: 60 } }],
    },
    deps,
  );
  if (!p.ok) throw new Error('seed');
  const s = await scheduleWorkout(db, { playerId: daniel, planId: p.plan.id, startAt }, deps);
  if (!s.ok) throw new Error('seed');
  return { planId: p.plan.id, eventId: s.event.id };
}

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const r = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  daniel = r.profile.player.id as string;
});
afterEach(() => db.closeAsync());

describe('Start / open (idempotent)', () => {
  it('10 + 11 + 12: the first Start creates exactly one session; a repeated or stale Start opens the same one', async () => {
    const w = await mkScheduled('A', NOW + HOUR);
    const first = await startOrOpenSession(db, w.planId, deps);
    expect(first.created).toBe(true);
    expect(await sessionCount()).toBe(1);
    const again = await startOrOpenSession(db, w.planId, deps); // a stale screen pressing Start
    expect(again.created).toBe(false);
    expect(again.session.id).toBe(first.session.id);
    expect(await sessionCount()).toBe(1);
    // the database guard itself is untouched: a plain second startSession is still refused
    await expect(startSession(db, w.planId, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
    expect(await sessionCount()).toBe(1);
  });

  it('11: a finished session is opened, never replaced (completed and stopped workouts cannot be recreated)', async () => {
    const w = await mkScheduled('A', NOW + HOUR);
    const s = (await startOrOpenSession(db, w.planId, deps)).session;
    await recordSet(db, s.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
    const closed = await finishSession(db, s.id, deps); // PARTIAL: 1 of 3 sets
    expect(closed.status).toBe('PARTIAL');
    const again = await startOrOpenSession(db, w.planId, deps);
    expect(again.created).toBe(false);
    expect(again.session.id).toBe(s.id);
    expect(again.session.status).toBe('PARTIAL');
    expect(await sessionCount()).toBe(1);
  });

  it('other refusals are not hidden: another session in progress is still SESSION_IN_PROGRESS', async () => {
    const a = await mkScheduled('A', NOW + HOUR);
    const b = await mkScheduled('B', NOW + 2 * HOUR);
    await startOrOpenSession(db, a.planId, deps);
    const err = await startOrOpenSession(db, b.planId, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TrainingRuleError);
    expect((err as TrainingRuleError).rule).toBe('SESSION_IN_PROGRESS');
    expect(await sessionCount()).toBe(1);
  });

  it('13 + 15: an overdue workout can be started; starting early or late never moves the event', async () => {
    const w = await mkScheduled('A', NOW + HOUR);
    const eventBefore = await dump('calendar_events');
    const later = { ids, clock: { wallNow: () => NOW + 10 * HOUR, monotonicNow: () => 0 } }; // the event is now overdue
    const { session } = await startOrOpenSession(db, w.planId, later);
    expect(session.startedAt).toBe(NOW + 10 * HOUR); // the session records the actual start
    expect(await dump('calendar_events')).toBe(eventBefore); // WHEN stays exactly as scheduled
    const links = await listWorkoutEventLinks(db, daniel);
    expect(links.get(w.eventId)).toMatchObject({ sessionStatus: 'IN_PROGRESS' });
  });
});

describe('planned vs actual, history', () => {
  it('16 + 17: the plan never changes; the actual values exist only in the session tables', async () => {
    const w = await mkScheduled('A', NOW + HOUR);
    const planBefore = JSON.stringify(await getPlannedWorkout(db, w.planId));
    const itemsBefore = await dump('planned_workout_items');
    const s = (await startOrOpenSession(db, w.planId, deps)).session;
    const [s1, s2, s3] = s.exercises[0]!.sets;
    await recordSet(db, s1!.id, { DURATION_S: 30 }, deps);
    await recordSet(db, s2!.id, { DURATION_S: 28 }, deps);
    await recordSet(db, s3!.id, { DURATION_S: 12 }, deps);
    await finishSession(db, s.id, deps);
    const plan = (await getPlannedWorkout(db, w.planId))!;
    expect(await dump('planned_workout_items')).toBe(itemsBefore);
    expect(plan.items[0]!.prescription.target).toBe(30); // planned stays 30
    expect(JSON.stringify({ ...plan, sessionId: null })).toBe(JSON.stringify({ ...JSON.parse(planBefore), sessionId: null }));
    const done = (await getSession(db, s.id))!;
    expect(done.exercises[0]!.sets.map((x) => x.plannedTarget)).toEqual([30, 30, 30]);
    expect(done.exercises[0]!.sets.map((x) => x.measurements[0]!.finalValue)).toEqual([30, 28, 12]);
    // actual values live ONLY in set_measurements (no result column on plan items or events)
    const cols = (t: string) => db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`).then((r) => r.map((c) => c.name));
    expect((await cols('planned_workout_items')).some((c) => /measured|final|actual/.test(c))).toBe(false);
    expect((await cols('calendar_events')).some((c) => /measured|final|actual|session/.test(c))).toBe(false);
  });

  it('20: deleting the calendar event keeps the plan, the session and every measurement', async () => {
    const w = await mkScheduled('A', NOW + HOUR);
    const s = (await startOrOpenSession(db, w.planId, deps)).session;
    await recordSet(db, s.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
    await finishSession(db, s.id, deps);
    const history = [await dump('planned_workouts'), await dump('training_sessions'), await dump('session_exercises'), await dump('session_sets'), await dump('set_measurements')];
    await db.runAsync('DELETE FROM calendar_events WHERE id = ?', [w.eventId]);
    expect([await dump('planned_workouts'), await dump('training_sessions'), await dump('session_exercises'), await dump('session_sets'), await dump('set_measurements')]).toEqual(history);
  });
});

describe('any origin behaves identically; time semantics are copied, never re-derived (31-36)', () => {
  const semantics = async (sessionId: string) =>
    (await getSession(db, sessionId))!.exercises.map((e) => [e.exercise.exerciseId, e.timeSemantics ?? null] as const);

  it('manual plan: DURATION_TARGET / PERFORMANCE_GOAL_TIME / COMPLETION_TIME_CAP / legacy NULL TIME', async () => {
    const w = await mkScheduled('Manual', NOW + HOUR, [
      { kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 1, target: 30, loadKg: null, restSec: null } },
      { kind: 'EXERCISE', exerciseId: 'SPRINT_10M', prescription: { sets: 1, target: 3, loadKg: null, restSec: null, timeSemantics: 'PERFORMANCE_GOAL_TIME' } },
      { kind: 'EXERCISE', exerciseId: 'SPRINT_20M', prescription: { sets: 1, target: 7, loadKg: null, restSec: null, timeSemantics: 'COMPLETION_TIME_CAP' } },
      { kind: 'EXERCISE', exerciseId: 'SPRINT_30M_FLYING', prescription: { sets: 1, target: 5, loadKg: null, restSec: null } },
    ]);
    const { session } = await startOrOpenSession(db, w.planId, deps);
    const got = new Map(await semantics(session.id));
    expect(got.get('PLANK')).toBeNull(); // DURATION is stored as no meaning...
    expect(resolveTimeSemantics('DURATION', got.get('PLANK'))).toBe('DURATION_TARGET'); // ...and always reads as a duration target
    expect(got.get('SPRINT_10M')).toBe('PERFORMANCE_GOAL_TIME');
    expect(got.get('SPRINT_20M')).toBe('COMPLETION_TIME_CAP');
    expect(got.get('SPRINT_30M_FLYING')).toBeNull(); // legacy NULL TIME
    expect(resolveTimeSemantics('TIME', got.get('SPRINT_30M_FLYING'))).toBe('PERFORMANCE_GOAL_TIME');
  });

  it('Training Block plan scheduled and started from its event: same flow, same semantics as the plan', async () => {
    const times = Array.from({ length: 12 }, (_, i) => NOW + (i + 1) * 24 * HOUR);
    const result = await assignTrainingBlock(db, { blockId: 'ATHLETICISM-FOUNDATION-6W-01', playerId: daniel, language: 'en', startTimes: times }, deps);
    let capped: string | null = null;
    for (const planId of result.planIds) {
      const plan = (await getPlannedWorkout(db, planId))!;
      if (plan.items.some((i) => i.prescription.timeSemantics === 'COMPLETION_TIME_CAP')) {
        capped = planId;
        break;
      }
    }
    expect(capped).not.toBeNull();
    const plan = (await getPlannedWorkout(db, capped!))!;
    const links = await listWorkoutEventLinks(db, daniel);
    const eventId = [...links.values()].find((l) => l.planId === capped)!.eventId;
    expect(links.get(eventId)!.sessionStatus).toBeNull();
    const { session, created } = await startOrOpenSession(db, capped!, deps);
    expect(created).toBe(true);
    expect(session.exercises.map((e) => e.timeSemantics ?? null)).toEqual(plan.items.map((i) => i.prescription.timeSemantics ?? null));
    expect((await startOrOpenSession(db, capped!, deps)).session.id).toBe(session.id);
    expect(await sessionCount()).toBe(1);
    expect((await listWorkoutEventLinks(db, daniel)).get(eventId)).toMatchObject({ sessionId: session.id, sessionStatus: 'IN_PROGRESS' });
  });
});
