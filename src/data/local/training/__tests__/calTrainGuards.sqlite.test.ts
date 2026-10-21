import { onDataChanged, type DataTopic } from '@/data/changes';
import { desiredReminders, type LocalClock } from '@/domain/reminders/schedule';
import { workoutEventState } from '@/domain/workoutEventState';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import {
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEventsInRange,
  rescheduleWorkout,
  scheduleWorkout,
  updateCalendarEvent,
} from '../../calendar/calendarEventRepository';
import { WorkoutScheduleError } from '../../calendar/errors';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { savePlannedWorkout } from '../plannedWorkoutCompositionRepository';
import { abandonSession, finishSession, recordSet, startSession } from '../trainingRepository';
import { listStartedWorkoutEventIds, listWorkoutEventLinks } from '../workoutEventLinks';

/** CAL-TRAIN-001 slice D: the schedule is locked by a session (repository level), reminders stop, and the signal is sent. */
const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
let now = NOW;
const clock = { wallNow: () => now, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
const FUTURE = NOW + 30 * HOUR;

async function mk(name: string, startAt = FUTURE, sets = 1) {
  const p = await savePlannedWorkout(
    db,
    { planId: null, playerId: daniel, name, entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets, target: 30, loadKg: null, restSec: 60 } }] },
    deps,
  );
  if (!p.ok) throw new Error('seed');
  const s = await scheduleWorkout(db, { playerId: daniel, planId: p.plan.id, startAt }, deps);
  if (!s.ok) throw new Error('seed');
  return { planId: p.plan.id, event: s.event };
}
const eventRow = async (id: string) => JSON.stringify(await db.getFirstAsync('SELECT * FROM calendar_events WHERE id = ?', [id]));

beforeEach(async () => {
  now = NOW;
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const r = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  daniel = r.profile.player.id as string;
});
afterEach(() => db.closeAsync());

/** Puts a workout's session into each status. */
async function sessionIn(planId: string, status: 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'ABANDONED') {
  const s = await startSession(db, planId, deps);
  if (status === 'IN_PROGRESS') return s;
  if (status === 'ABANDONED') return abandonSession(db, s.id, deps);
  await recordSet(db, s.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
  return finishSession(db, s.id, deps);
}

describe('reschedule guard (21, 22)', () => {
  it('21: before any session the workout can be rescheduled', async () => {
    const w = await mk('A');
    const r = await rescheduleWorkout(db, { playerId: daniel, planId: w.planId, startAt: FUTURE + HOUR }, deps);
    expect(r.ok).toBe(true);
    expect((await getCalendarEvent(db, daniel, w.event.id))!.startAt).toBe(FUTURE + HOUR);
  });

  it.each(['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const)('22: with a %s session the scheduled time cannot change (reschedule and edit), and nothing is written', async (status) => {
    const w = await mk('A');
    await sessionIn(w.planId, status);
    const before = await eventRow(w.event.id);
    const refuse = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);
    const e1 = await refuse(rescheduleWorkout(db, { playerId: daniel, planId: w.planId, startAt: FUTURE + HOUR }, deps));
    expect(e1).toBeInstanceOf(WorkoutScheduleError);
    expect((e1 as WorkoutScheduleError).reason).toBe('SCHEDULE_LOCKED');
    const ev = w.event;
    const base = { type: ev.type, sport: ev.sport, startAt: ev.startAt, endAt: ev.endAt, title: ev.title, notes: ev.notes, location: ev.location };
    expect((await refuse(updateCalendarEvent(db, daniel, ev.id, { ...base, startAt: ev.startAt + HOUR }, deps)) as WorkoutScheduleError).reason).toBe('SCHEDULE_LOCKED');
    expect((await refuse(updateCalendarEvent(db, daniel, ev.id, { ...base, endAt: ev.startAt + 2 * HOUR }, deps)) as WorkoutScheduleError).reason).toBe('SCHEDULE_LOCKED');
    expect(await eventRow(w.event.id)).toBe(before);
    // what is not the schedule stays editable (notes, location)
    const ok = await updateCalendarEvent(db, daniel, ev.id, { ...base, notes: 'Bring water', location: 'Court 2' }, deps);
    expect(ok.ok).toBe(true);
    expect((await getCalendarEvent(db, daniel, ev.id))!.startAt).toBe(ev.startAt);
  });

  it('22 (PARTIAL): a partly done workout is locked too', async () => {
    const w = await mk('A', FUTURE, 2);
    const s = await startSession(db, w.planId, deps);
    await recordSet(db, s.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
    expect((await finishSession(db, s.id, deps)).status).toBe('PARTIAL');
    const e = await rescheduleWorkout(db, { playerId: daniel, planId: w.planId, startAt: FUTURE + HOUR }, deps).catch((x: unknown) => x);
    expect((e as WorkoutScheduleError).reason).toBe('SCHEDULE_LOCKED');
  });

  it('a plain event is unaffected by the guard', async () => {
    const created = await createCalendarEvent(db, daniel, { type: 'OTHER', startAt: FUTURE, endAt: null, title: 'Dentist' }, deps);
    if (!created.ok) throw new Error('seed');
    const ev = created.event;
    const moved = await updateCalendarEvent(db, daniel, ev.id, { type: ev.type, sport: ev.sport, startAt: FUTURE + HOUR, endAt: null, title: ev.title, notes: null, location: null }, deps);
    expect(moved.ok).toBe(true);
  });
});

describe('9: rescheduling an overdue, never-started workout into the future makes it UPCOMING again', () => {
  it('the same event, the same plan: only the derived state changes', async () => {
    const w = await mk('A', NOW + HOUR);
    now = NOW + 3 * HOUR; // the event time has passed
    const stateNow = async () => {
      const ev = (await getCalendarEvent(db, daniel, w.event.id))!;
      const link = (await listWorkoutEventLinks(db, daniel)).get(ev.id)!;
      return workoutEventState({ ...ev, sessionStatus: link.sessionStatus }, now);
    };
    expect(await stateNow()).toBe('OVERDUE');
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM training_sessions')).toEqual({ n: 0 }); // time passing wrote nothing
    const r = await rescheduleWorkout(db, { playerId: daniel, planId: w.planId, startAt: now + 5 * HOUR }, deps);
    expect(r.ok).toBe(true);
    expect(await stateNow()).toBe('UPCOMING');
  });
});

describe('reminders (26-30)', () => {
  const clockStub: LocalClock = { toLocal: () => ({ year: 2026, month: 10, day: 21, hour: 18, minute: 0 }), toEpoch: () => null };
  const prefs = () => ({ enabled: true, players: [daniel], rules: [{ kind: 'BEFORE_START', minutes: 30 }], typeRules: {}, eventRules: {} }) as const;
  async function reminderFor(eventId: string) {
    const started = await listStartedWorkoutEventIds(db);
    const events = (await listCalendarEventsInRange(db, NOW, NOW + 60 * HOUR)).map((e) => ({
      id: e.id,
      playerId: e.playerId,
      startAt: e.startAt,
      type: e.type,
      completion: e.completion,
      hasSession: started.has(e.id),
    }));
    return desiredReminders(events, prefs(), NOW, clockStub).filter((r) => r.eventId === eventId);
  }

  it('26: an upcoming unstarted workout reminds normally', async () => {
    const w = await mk('A');
    expect(await reminderFor(w.event.id)).toHaveLength(1);
  });

  it.each(['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const)('27-30: a workout with a %s session never reminds', async (status) => {
    const w = await mk('A');
    await sessionIn(w.planId, status);
    expect(await reminderFor(w.event.id)).toEqual([]);
  });

  it('30 (PARTIAL): a partly done workout never reminds', async () => {
    const w = await mk('A', FUTURE, 2);
    const s = await startSession(db, w.planId, deps);
    await recordSet(db, s.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
    await finishSession(db, s.id, deps);
    expect(await reminderFor(w.event.id)).toEqual([]);
  });

  it('the legacy manual-completion suppression is kept', () => {
    const events = [{ id: 'e', playerId: daniel, startAt: FUTURE, type: 'PERSONAL_TRAINING', completion: { completedAt: 1 }, hasSession: false }];
    expect(desiredReminders(events, prefs(), NOW, clockStub)).toEqual([]);
  });

  it('starting a scheduled workout emits the calendar signal once, after the commit; an unscheduled plan emits none', async () => {
    const topics: DataTopic[] = [];
    const off = onDataChanged((t) => topics.push(t));
    try {
      const w = await mk('A');
      topics.length = 0;
      await startSession(db, w.planId, deps);
      expect(topics).toEqual(['calendar']);
      const loose = await savePlannedWorkout(db, { planId: null, playerId: daniel, name: 'Loose', entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 1, target: 30, loadKg: null, restSec: 60 } }] }, deps);
      if (!loose.ok) throw new Error('seed');
      const s = await db.getFirstAsync<{ id: string }>("SELECT id FROM training_sessions WHERE status = 'IN_PROGRESS'");
      await abandonSession(db, s!.id, deps);
      topics.length = 0;
      await startSession(db, loose.plan.id, deps);
      expect(topics).toEqual([]);
    } finally {
      off();
    }
  });
});
