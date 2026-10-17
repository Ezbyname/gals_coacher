import { onDataChanged, type DataTopic } from '@/data/changes';
import { planCalendarSync, type SyncEvent } from '@/domain/calendarSync/plan';
import { desiredReminders, type LocalClock } from '@/domain/reminders/schedule';
import type { Prescription } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { PlayerArchivedError } from '../../players/errors';
import { archivePlayer, createPlayer } from '../../players/playerRepository';
import { createPlannedWorkout, savePlannedWorkout, updatePlannedItem } from '../../training/plannedWorkoutCompositionRepository';
import { TrainingRuleError } from '../../training/errors';
import { abandonSession, getPlannedWorkout, startSession } from '../../training/trainingRepository';
import {
  getCalendarEvent,
  getEventWorkout,
  getWorkoutSchedule,
  listCalendarEvents,
  listCalendarEventsInRange,
  listWorkoutSchedules,
  rescheduleWorkout,
  scheduleWorkout,
  unscheduleWorkout,
  updateCalendarEvent,
} from '../calendarEventRepository';
import { WorkoutScheduleError } from '../errors';

/**
 * QB-WORKOUT-BUILDER-001D — PlannedWorkout (WHAT) ↔ CalendarEvent (WHEN), WB-SCHED-01…12, on real SQLite.
 * The clock is a variable so "now / future only" is proven at the boundary (the current minute is allowed).
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
let now = new Date(2026, 9, 20, 12, 0, 30).getTime(); // 12:00:30 — mid-minute on purpose
const clock = { wallNow: () => now, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
let alice: string;
const rx = (sets: number, target: number | null): Prescription => ({ sets, target, loadKg: null, restSec: 60 });
const mkPlayer = async (name: string) => {
  const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  return r.profile.player.id;
};
async function mkPlan(playerId: string, name = 'Shooting + Fitness') {
  const r = await savePlannedWorkout(db, { planId: null, playerId, name, entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: rx(2, 30) }] }, deps);
  if (!r.ok) throw new Error('seed');
  return r.plan;
}
const FUTURE = () => new Date(2026, 9, 21, 18, 0).getTime(); // tomorrow 18:00
const eventRows = async () => db.getAllAsync('SELECT * FROM calendar_events ORDER BY rowid');
const linkedCount = async () => (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events WHERE planned_workout_id IS NOT NULL'))!.n;
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (e: unknown) => e,
  );
}

beforeEach(async () => {
  now = new Date(2026, 9, 20, 12, 0, 30).getTime();
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  daniel = await mkPlayer('Daniel');
  alice = await mkPlayer('Alice');
});
afterEach(() => db.closeAsync());

describe('schedule (WB-SCHED-01 / 02 / 03 / 08 / 09 / 11)', () => {
  it('WB-SCHED-01: scheduling creates exactly ONE linked event; the workout itself is untouched', async () => {
    const plan = await mkPlan(daniel);
    const before = await getPlannedWorkout(db, plan.id);
    const r = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE(), endAt: FUTURE() + HOUR }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toMatchObject({ playerId: daniel, type: 'PERSONAL_TRAINING', title: 'Shooting + Fitness', sport: null, startAt: FUTURE(), endAt: FUTURE() + HOUR, completion: null, source: null });
    expect(await linkedCount()).toBe(1);
    expect((await eventRows()).length).toBe(1);
    expect(await getPlannedWorkout(db, plan.id)).toEqual(before); // the plan holds no date and did not change
    expect(await getWorkoutSchedule(db, plan.id)).toEqual({ planId: plan.id, eventId: r.event.id, startAt: FUTURE(), endAt: FUTURE() + HOUR });
    expect(await getEventWorkout(db, r.event.id)).toEqual({ planId: plan.id, name: 'Shooting + Fitness' });
  });

  it('WB-SCHED-02: a second schedule is refused (one event per workout) and writes nothing', async () => {
    const plan = await mkPlan(daniel);
    await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    const rows = await eventRows();
    const e = await failure(scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() + HOUR }, deps));
    expect(e).toBeInstanceOf(WorkoutScheduleError);
    expect((e as WorkoutScheduleError).reason).toBe('ALREADY_SCHEDULED');
    expect(await eventRows()).toEqual(rows);
  });

  it('WB-SCHED-03: a workout that already has a TrainingSession cannot be newly scheduled', async () => {
    const plan = await mkPlan(daniel);
    const session = await startSession(db, plan.id, deps);
    await abandonSession(db, session.id, { clock }); // a session EXISTS (frozen); none is running
    const e = await failure(scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps));
    expect((e as WorkoutScheduleError).reason).toBe('PLAN_ALREADY_STARTED');
    expect(await eventRows()).toEqual([]);
    // the database itself says the same (not only this function)
    await expect(
      db.runAsync(`INSERT INTO calendar_events (id, player_id, type, start_at, created_at, updated_at, planned_workout_id) VALUES (?, ?, 'PERSONAL_TRAINING', ?, ?, ?, ?)`, [ids.newUuid(), daniel, FUTURE(), now, now, plan.id]),
    ).rejects.toThrow(/started workout cannot be newly scheduled/);
  });

  it('a workout with nothing in it is not scheduled (it could never start); nothing is written', async () => {
    const empty = await createPlannedWorkout(db, { playerId: daniel, name: 'Empty' }, deps);
    if (!empty.ok) throw new Error('seed');
    const e = await failure(scheduleWorkout(db, { playerId: daniel, planId: empty.plan.id, startAt: FUTURE() }, deps));
    expect((e as WorkoutScheduleError).reason).toBe('PLAN_EMPTY');
    expect(await eventRows()).toEqual([]);
  });

  it('WB-SCHED-08: an archived Player cannot schedule; nothing is written', async () => {
    const plan = await mkPlan(daniel);
    await archivePlayer(db, daniel, { clock });
    expect(await failure(scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps))).toBeInstanceOf(PlayerArchivedError);
    expect(await eventRows()).toEqual([]);
  });

  it("WB-SCHED-09: another Player's workout is refused by the repository AND by the database", async () => {
    const plan = await mkPlan(alice, 'Alice plan');
    const e = await failure(scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps));
    expect((e as WorkoutScheduleError).reason).toBe('PLAYER_MISMATCH');
    expect(await eventRows()).toEqual([]);
    await expect(
      db.runAsync(`INSERT INTO calendar_events (id, player_id, type, start_at, created_at, updated_at, planned_workout_id) VALUES (?, ?, 'PERSONAL_TRAINING', ?, ?, ?, ?)`, [ids.newUuid(), daniel, FUTURE(), now, now, plan.id]),
    ).rejects.toThrow(/own player only/);
    expect(((await failure(scheduleWorkout(db, { playerId: daniel, planId: 'no-such-plan', startAt: FUTURE() }, deps))) as WorkoutScheduleError).reason).toBe('PLAN_NOT_FOUND');
  });

  it('WB-SCHED-11: the end time is optional and NEVER invented: null stays null, now and after a reschedule', async () => {
    const plan = await mkPlan(daniel);
    const r = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    expect(r.ok && r.event.endAt).toBe(null);
    expect(await db.getFirstAsync("SELECT end_at FROM calendar_events WHERE planned_workout_id = ?", [plan.id])).toEqual({ end_at: null });
    const moved = await rescheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() + 2 * HOUR }, deps);
    expect(moved.ok && moved.event.endAt).toBe(null);
    // an end that is not after the start is returned, nothing is written
    const bad = await rescheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE(), endAt: FUTURE() }, deps);
    expect(bad).toEqual({ ok: false, errors: { endAt: 'NOT_AFTER_START' } });
  });
});

describe('time rules: now / future only (WB-SCHED-05)', () => {
  it('WB-SCHED-05: scheduling or rescheduling into the past is refused; the current minute and the future are fine', async () => {
    const plan = await mkPlan(daniel);
    const startOfThisMinute = now - (now % MIN);
    expect(await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: startOfThisMinute - MIN }, deps)).toEqual({ ok: false, errors: { startAt: 'BEFORE_NOW' } });
    expect(await eventRows()).toEqual([]);
    expect(await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: Number.NaN }, deps)).toEqual({ ok: false, errors: { startAt: 'INVALID_TIMESTAMP' } });
    const ok = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: startOfThisMinute }, deps); // "now" = this minute
    expect(ok.ok).toBe(true);
    // reschedule into the past: refused, the event is exactly as it was
    const rows = await eventRows();
    expect(await rescheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: startOfThisMinute - HOUR }, deps)).toEqual({ ok: false, errors: { startAt: 'BEFORE_NOW' } });
    expect(await eventRows()).toEqual(rows);
    // the generic event edit enforces the same rule for a scheduled workout ...
    const event = (await listCalendarEvents(db, daniel))[0]!;
    const edit = (startAt: number) => updateCalendarEvent(db, daniel, event.id, { type: event.type, startAt, endAt: null, title: event.title, notes: 'bring water' }, deps);
    expect(await edit(startOfThisMinute - HOUR)).toEqual({ ok: false, errors: { startAt: 'BEFORE_NOW' } });
    // ... but a historical linked event stays readable and its OTHER fields stay editable (the start is unchanged)
    now = startOfThisMinute + 3 * HOUR; // the event is now in the past
    const history = await edit(startOfThisMinute);
    expect(history.ok && history.event.notes).toBe('bring water');
    expect((await getCalendarEvent(db, daniel, event.id))!.startAt).toBe(startOfThisMinute);
  });
});

describe('reschedule / unschedule (WB-SCHED-04 / 06)', () => {
  it('WB-SCHED-04: rescheduling keeps the SAME event and the same link', async () => {
    const plan = await mkPlan(daniel);
    const first = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    if (!first.ok) throw new Error('seed');
    const moved = await rescheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() + 24 * HOUR, endAt: FUTURE() + 25 * HOUR }, deps);
    expect(moved.ok).toBe(true);
    expect(moved.ok && moved.event.id).toBe(first.event.id);
    expect((await listWorkoutSchedules(db, daniel))).toEqual([{ planId: plan.id, eventId: first.event.id, startAt: FUTURE() + 24 * HOUR, endAt: FUTURE() + 25 * HOUR }]);
    expect(await linkedCount()).toBe(1);
    expect(((await failure(rescheduleWorkout(db, { playerId: daniel, planId: (await mkPlan(daniel, 'Other')).id, startAt: FUTURE() }, deps))) as WorkoutScheduleError).reason).toBe('NOT_SCHEDULED');
  });

  it('WB-SCHED-06: unscheduling deletes the event and keeps the workout; it can be scheduled again', async () => {
    const plan = await mkPlan(daniel);
    const before = await getPlannedWorkout(db, plan.id);
    await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    await unscheduleWorkout(db, daniel, plan.id);
    expect(await eventRows()).toEqual([]);
    expect(await getWorkoutSchedule(db, plan.id)).toBeNull();
    expect(await getPlannedWorkout(db, plan.id)).toEqual(before); // composition, name, session state: untouched
    expect(((await failure(unscheduleWorkout(db, daniel, plan.id))) as WorkoutScheduleError).reason).toBe('NOT_SCHEDULED');
    expect((await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps)).ok).toBe(true);
  });

  it('unscheduling a workout that was already performed keeps the plan, its session and the history', async () => {
    const plan = await mkPlan(daniel);
    await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    const session = await startSession(db, plan.id, deps);
    await abandonSession(db, session.id, { clock });
    await unscheduleWorkout(db, daniel, plan.id);
    expect((await getPlannedWorkout(db, plan.id))!.sessionId).toBe(session.id);
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM training_sessions')).toEqual({ n: 1 });
  });
});

describe('start from the calendar / titles (WB-SCHED-07 / 10)', () => {
  it('WB-SCHED-07: starting creates the session and freezes the plan; the event stays and is NOT completed', async () => {
    const plan = await mkPlan(daniel);
    const r = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    if (!r.ok) throw new Error('seed');
    const session = await startSession(db, plan.id, deps); // what "Start workout" on the event does
    expect((await getPlannedWorkout(db, plan.id))!.sessionId).toBe(session.id);
    const e = await failure(updatePlannedItem(db, plan.id, 0, rx(9, 99), deps));
    expect(e).toBeInstanceOf(TrainingRuleError);
    expect((e as TrainingRuleError).rule).toBe('PLAN_ALREADY_STARTED');
    expect((await getCalendarEvent(db, daniel, r.event.id))!.completion).toBeNull(); // calendar completion stays explicit
    expect(await linkedCount()).toBe(1); // the link is untouched by the session
  });

  it('WB-SCHED-10: renaming an EDITABLE workout renames its linked event; the event title cannot diverge; a frozen workout cannot be renamed at all', async () => {
    const plan = await mkPlan(daniel, 'Shooting + Fitness');
    const r = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
    if (!r.ok) throw new Error('seed');
    const renamed = await savePlannedWorkout(db, { planId: plan.id, playerId: daniel, name: 'Basketball Workout', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [rx(2, 30)] }] }, deps);
    expect(renamed.ok).toBe(true);
    const event = (await getCalendarEvent(db, daniel, r.event.id))!;
    expect(event.title).toBe('Basketball Workout');
    expect(event.startAt).toBe(FUTURE()); // only the title followed; WHEN is untouched
    expect(event.updatedAt).toBe(now);
    // the event's own edit form cannot make the title diverge while the plan is editable
    const edited = await updateCalendarEvent(db, daniel, event.id, { type: event.type, startAt: FUTURE(), endAt: null, title: 'Something else' }, deps);
    expect(edited.ok && edited.event.title).toBe('Basketball Workout');
    // once a session exists the plan is frozen: no rename is possible, so the event title (the workout name) stays as it is
    const session = await startSession(db, plan.id, deps);
    await abandonSession(db, session.id, { clock });
    const refused = await failure(savePlannedWorkout(db, { planId: plan.id, playerId: daniel, name: 'Renamed late', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [rx(2, 30)] }] }, deps));
    expect((refused as TrainingRuleError).rule).toBe('PLAN_ALREADY_STARTED');
    const still = await updateCalendarEvent(db, daniel, event.id, { type: event.type, startAt: FUTURE(), endAt: null, title: 'My own title' }, deps);
    expect(still.ok && still.event.title).toBe('Basketball Workout');
    expect((await getPlannedWorkout(db, plan.id))!.name).toBe('Basketball Workout');
  });
});

describe('signals reach reminders and the phone-calendar sync (WB-SCHED-12)', () => {
  it('WB-SCHED-12: every successful change emits the calendar signal once, a refusal emits nothing, and the pure planners see the event', async () => {
    const topics: DataTopic[] = [];
    const off = onDataChanged((t) => topics.push(t));
    try {
      const plan = await mkPlan(daniel, 'Shooting');
      expect(topics).toEqual([]); // creating a workout is not a calendar change
      const refused = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: now - HOUR }, deps);
      expect(refused.ok).toBe(false);
      expect(topics).toEqual([]);
      const r = await scheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE() }, deps);
      expect(topics).toEqual(['calendar']);
      if (!r.ok) throw new Error('seed');

      // reminders: the linked event is an ordinary event to the reminder planner
      const clockStub: LocalClock = { toLocal: () => ({ year: 2026, month: 10, day: 21, hour: 18, minute: 0 }), toEpoch: () => null };
      const prefs = { enabled: true, players: [daniel], rules: [{ kind: 'BEFORE_START', minutes: 30 }] } as const;
      const events = await listCalendarEventsInRange(db, now, now + 30 * 24 * HOUR);
      const reminders = desiredReminders(events, prefs, now, clockStub);
      expect(reminders.map((x) => [x.eventId, x.at])).toEqual([[r.event.id, FUTURE() - 30 * MIN]]);

      // phone calendar: no end -> NEEDS_END_TIME (nothing invented); with an end -> CREATE
      const sync = (event: typeof r.event): ReturnType<typeof planCalendarSync> =>
        planCalendarSync({
          prefs: { enabled: true, calendarId: 'cal-1', players: [daniel] },
          roster: new Set([daniel]),
          events: [toSyncEvent(event)],
          links: [],
          external: new Map(),
          now,
        });
      expect(sync(r.event).map((a) => a.kind)).toEqual(['NEEDS_END_TIME']);
      const moved = await rescheduleWorkout(db, { playerId: daniel, planId: plan.id, startAt: FUTURE(), endAt: FUTURE() + HOUR }, deps);
      expect(topics).toEqual(['calendar', 'calendar']);
      if (!moved.ok) throw new Error('seed');
      expect(sync(moved.event).map((a) => a.kind)).toEqual(['CREATE']);

      // a rename of the editable workout re-titles the event and signals once
      await savePlannedWorkout(db, { planId: plan.id, playerId: daniel, name: 'Shooting v2', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [rx(2, 30)] }] }, deps);
      expect(topics).toEqual(['calendar', 'calendar', 'calendar']);
      // saving without a rename does not signal
      await savePlannedWorkout(db, { planId: plan.id, playerId: daniel, name: 'Shooting v2', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [rx(3, 30)] }] }, deps);
      expect(topics).toHaveLength(3);

      // unschedule: the event is gone for both planners
      await unscheduleWorkout(db, daniel, plan.id);
      expect(topics).toEqual(['calendar', 'calendar', 'calendar', 'calendar']);
      expect(desiredReminders(await listCalendarEventsInRange(db, now, now + 30 * 24 * HOUR), prefs, now, clockStub)).toEqual([]);
    } finally {
      off();
    }
  });
});

function toSyncEvent(event: { id: string; playerId: string; startAt: number; endAt: number | null; title: string | null; notes: string | null; location: string | null }): SyncEvent {
  return {
    id: event.id,
    playerId: event.playerId,
    startAt: event.startAt,
    payload: event.endAt === null ? null : { title: event.title ?? '', startAt: event.startAt, endAt: event.endAt, location: event.location, notes: event.notes },
  };
}
