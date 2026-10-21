import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { createCalendarEvent, scheduleWorkout } from '../../calendar/calendarEventRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import { savePlannedWorkout } from '../plannedWorkoutCompositionRepository';
import { abandonSession, finishSession, recordSet, startSession } from '../trainingRepository';
import { listWorkoutEventLinks, listWorkoutEventLinksInRange } from '../workoutEventLinks';

const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
const HOUR = 3_600_000;
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
let alice: string;

const mkPlayer = async (name: string) => {
  const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  return r.profile.player.id as string;
};
async function mkScheduled(playerId: string, name: string, startAt: number) {
  const p = await savePlannedWorkout(
    db,
    { planId: null, playerId, name, entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets: 1, target: 30, loadKg: null, restSec: 60 } }] },
    deps,
  );
  if (!p.ok) throw new Error('seed');
  const s = await scheduleWorkout(db, { playerId, planId: p.plan.id, startAt }, deps);
  if (!s.ok) throw new Error('seed');
  return { planId: p.plan.id, eventId: s.event.id };
}

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  daniel = await mkPlayer('Daniel');
  alice = await mkPlayer('Alice');
});
afterEach(() => db.closeAsync());

describe('workout event links: one bulk read, event -> plan -> session', () => {
  it('returns every state in ONE query; a plain event has no entry', async () => {
    const a = await mkScheduled(daniel, 'A', NOW + HOUR);
    const b = await mkScheduled(daniel, 'B', NOW + 2 * HOUR);
    const c = await mkScheduled(daniel, 'C', NOW + 3 * HOUR);
    const d = await mkScheduled(daniel, 'D', NOW + 4 * HOUR);
    const plain = await createCalendarEvent(db, daniel, { type: 'OTHER', startAt: NOW + HOUR, endAt: null, title: 'Dentist' }, deps);
    if (!plain.ok) throw new Error('seed');

    const sB = await startSession(db, b.planId, deps);
    await abandonSession(db, sB.id, deps);
    const sC = await startSession(db, c.planId, deps);
    expect((await recordSet(db, sC.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps)).ok).toBe(true);
    await finishSession(db, sC.id, deps);
    const sD = await startSession(db, d.planId, deps);

    const spy = jest.spyOn(db, 'getAllAsync');
    const links = await listWorkoutEventLinks(db, daniel);
    expect(spy).toHaveBeenCalledTimes(1); // N+1 proof: four workout events, one read
    spy.mockRestore();

    expect(links.size).toBe(4);
    expect(links.has(plain.event.id)).toBe(false);
    expect(links.get(a.eventId)).toMatchObject({ planId: a.planId, sessionId: null, sessionStatus: null });
    expect(links.get(b.eventId)).toMatchObject({ sessionId: sB.id, sessionStatus: 'ABANDONED' });
    expect(links.get(c.eventId)).toMatchObject({ sessionId: sC.id, sessionStatus: 'COMPLETED' });
    expect(links.get(d.eventId)).toMatchObject({ sessionId: sD.id, sessionStatus: 'IN_PROGRESS' });
  });

  it('is scoped to the Player; the range form covers every Player and the overlap rule', async () => {
    const a = await mkScheduled(daniel, 'A', NOW + HOUR);
    const x = await mkScheduled(alice, 'X', NOW + 48 * HOUR);
    expect([...(await listWorkoutEventLinks(db, alice)).keys()]).toEqual([x.eventId]);
    expect([...(await listWorkoutEventLinksInRange(db, NOW, NOW + 24 * HOUR)).keys()]).toEqual([a.eventId]);
    expect((await listWorkoutEventLinksInRange(db, NOW, NOW + 72 * HOUR)).size).toBe(2);
  });

  it('reading changes nothing', async () => {
    await mkScheduled(daniel, 'A', NOW + HOUR);
    const dump = async () =>
      JSON.stringify([
        await db.getAllAsync('SELECT * FROM calendar_events'),
        await db.getAllAsync('SELECT * FROM training_sessions'),
        await db.getAllAsync('SELECT * FROM planned_workouts'),
      ]);
    const before = await dump();
    await listWorkoutEventLinks(db, daniel);
    expect(await dump()).toBe(before);
  });
});
