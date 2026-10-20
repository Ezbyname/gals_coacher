import { TRAINING_BLOCKS, trainingBlock } from '@/domain/training/blocks';
import { orderedSessions, planName, sessionSections } from '@/domain/training/blocks';
import { GENERAL_ATHLETIC_WORKOUTS, PROFESSIONAL_WORKOUTS } from '@/domain/training/professional';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { onDataChanged, type DataTopic } from '../../../changes';
import { setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { archivePlayer, createPlayer } from '../../players/playerRepository';
import { assignContentToPlayers, savePlannedWorkout } from '../plannedWorkoutCompositionRepository';
import { assignTrainingBlock, assignTrainingBlockToPlayers, TrainingBlockAssignmentError, TrainingBlockSessionError } from '../trainingBlockAssignment';
import { getPlannedWorkout, startSession } from '../trainingRepository';
import { writeTransaction } from '../workoutRepository';

/**
 * TRAINING-BLOCKS-001 — assigning a Training Block on real SQLite (schema v21). The invariant under test: for ONE Player every
 * intended plan and requested calendar event is created, or none is; Players are independent; copies are independent; history
 * and the registry are never touched.
 */
const NOW = new Date(2026, 9, 18, 12).getTime();
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
const DAY = 86_400_000;
let ids = createSequentialIdService();
const deps = () => ({ ids, clock });
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let daniel: string;
let alice: string;
let events: DataTopic[];
let off: () => void;
const times = (count: number) => Array.from({ length: count }, (_, i) => new Date(2026, 9, 20, 18).getTime() + i * 3 * DAY);
const count = async (table: string, playerId?: string) =>
  ((await db.getFirstAsync<{ n: number }>(playerId ? `SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?` : `SELECT COUNT(*) AS n FROM ${table}`, playerId ? [playerId] : []))!).n;
const items = async (planId: string) => (await getPlannedWorkout(db, planId))!.items;
const everything = async () =>
  Object.fromEntries(
    await Promise.all(
      ['planned_workouts', 'planned_workout_items', 'calendar_events', 'training_sessions'].map(
        async (t) => [t, await db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)] as const,
      ),
    ),
  );
const mk = async (name: string) => {
  const r = await createPlayer(db, { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps());
  if (!r.ok) throw new Error('seed');
  return r.profile.player.id;
};

beforeEach(async () => {
  ids = createSequentialIdService();
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  daniel = await mk('Daniel');
  alice = await mk('Alice');
  events = [];
  off = onDataChanged((topic) => events.push(topic));
});
afterEach(async () => {
  off();
  await db.closeAsync();
});

describe('assigning a block to one Player', () => {
  it.each(TRAINING_BLOCKS.map((b) => [b.id, b.weeks * b.sessionsPerWeek] as const))('%s: creates exactly %s independent plans, in order, named and adjusted per session', async (blockId, total) => {
    const block = trainingBlock(blockId)!;
    const result = await assignTrainingBlock(db, { blockId, playerId: daniel, language: 'en', startTimes: null }, deps());
    expect(result.planIds).toHaveLength(total);
    expect(await count('planned_workouts', daniel)).toBe(total);
    expect(await count('calendar_events')).toBe(0); // no dates chosen: no events
    const sessions = orderedSessions(block);
    for (const [i, session] of sessions.entries()) {
      const plan = (await getPlannedWorkout(db, result.planIds[i]!))!;
      expect(plan.name).toBe(planName(block, session, 'en'));
      expect(plan.sessionId).toBeNull(); // an editable plan, never started
      const expected = sessionSections(session).flatMap((s) => s.items.map((it) => ({ id: it.exerciseId, dosage: it.dosage })));
      expect(plan.items.map((it) => it.exercise.exerciseId)).toEqual(expected.map((e) => e.id));
      for (const [n, e] of expected.entries()) {
        if (e.dosage) expect(plan.items[n]!.prescription).toEqual({ sets: e.dosage.sets, target: e.dosage.target, loadKg: null, restSec: e.dosage.restSec });
      }
    }
  });

  it('every general workout can be copied: all its Exercises exist, are active, and every prescription validates', async () => {
    for (const w of GENERAL_ATHLETIC_WORKOUTS) {
      const [r] = await assignContentToPlayers(db, { kind: 'PROFESSIONAL', workoutId: w.id, language: 'he' }, [{ playerId: daniel, destination: { type: 'NEW', name: w.name[0].slice(0, 35) } }], deps());
      expect(r!.created).toBe(true);
    }
    expect(await count('planned_workouts', daniel)).toBe(13);
  });

  it('with dates: one linked calendar event per plan at the chosen time, and ONE calendar-change signal after the commit', async () => {
    const block = trainingBlock('ATHLETICISM-FOUNDATION-6W-01')!;
    const startTimes = times(12);
    const result = await assignTrainingBlock(db, { blockId: block.id, playerId: daniel, language: 'en', startTimes }, deps());
    expect(result.eventIds).toHaveLength(12);
    const rows = await db.getAllAsync<{ planned_workout_id: string; start_at: number; title: string; player_id: string }>(
      'SELECT planned_workout_id, start_at, title, player_id FROM calendar_events ORDER BY start_at',
    );
    expect(rows.map((r) => r.start_at)).toEqual(startTimes);
    expect(rows.map((r) => r.planned_workout_id)).toEqual([...result.planIds]);
    expect(new Set(rows.map((r) => r.player_id))).toEqual(new Set([daniel]));
    expect(events.filter((e) => e === 'calendar')).toHaveLength(1);
  });

  it('without dates no calendar signal is emitted', async () => {
    await assignTrainingBlock(db, { blockId: 'STRENGTH-FOUNDATION-6W-01', playerId: daniel, language: 'en', startTimes: null }, deps());
    expect(events).toEqual([]);
  });

  it('the source is read-only: the registry and every source workout are byte-identical afterwards', async () => {
    const before = JSON.stringify([TRAINING_BLOCKS, PROFESSIONAL_WORKOUTS, GENERAL_ATHLETIC_WORKOUTS]);
    await assignTrainingBlock(db, { blockId: 'EXPLOSIVE-POWER-8W-01', playerId: daniel, language: 'he', startTimes: null }, deps());
    expect(JSON.stringify([TRAINING_BLOCKS, PROFESSIONAL_WORKOUTS, GENERAL_ATHLETIC_WORKOUTS])).toBe(before);
  });
});

describe('all or nothing, per Player', () => {
  it('a failure at session 10 rolls back the nine plans already written: no plan, item or event for that Player', async () => {
    // LATERAL_BOUNDS first appears in session index 9 of this block, so sessions 0–8 are written before it is refused
    await setExerciseActive(db, 'LATERAL_BOUNDS', false, { clock });
    const before = await everything();
    const failure = await assignTrainingBlock(db, { blockId: 'EXPLOSIVE-POWER-8W-01', playerId: daniel, language: 'en', startTimes: times(16) }, deps()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(TrainingBlockSessionError);
    expect((failure as TrainingBlockSessionError).sessionIndex).toBe(9);
    expect(await everything()).toEqual(before);
    expect(events).toEqual([]); // a rollback emits nothing
  });

  it('a failure while writing the LAST calendar event rolls back every plan and every earlier event', async () => {
    const startTimes = times(12);
    const last = startTimes[11]!;
    await db.execAsync(`CREATE TRIGGER fail_last_event BEFORE INSERT ON calendar_events WHEN NEW.start_at = ${last} BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    const before = await everything();
    const failure = await assignTrainingBlock(db, { blockId: 'ATHLETICISM-FOUNDATION-6W-01', playerId: daniel, language: 'en', startTimes }, deps()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(TrainingBlockSessionError);
    expect((failure as TrainingBlockSessionError).sessionIndex).toBe(11);
    expect(await everything()).toEqual(before);
    expect(events).toEqual([]);
  });

  it('timing is validated before anything is written: a start in the past or a wrong number of dates writes nothing', async () => {
    const before = await everything();
    const past = times(12);
    past[5] = NOW - 60_000 * 60;
    await expect(assignTrainingBlock(db, { blockId: 'ATHLETICISM-FOUNDATION-6W-01', playerId: daniel, language: 'en', startTimes: past }, deps())).rejects.toMatchObject({ code: 'START_IN_PAST', sessionIndex: 5 });
    await expect(assignTrainingBlock(db, { blockId: 'ATHLETICISM-FOUNDATION-6W-01', playerId: daniel, language: 'en', startTimes: times(11) }, deps())).rejects.toMatchObject({ code: 'SCHEDULE_MISMATCH' });
    await expect(assignTrainingBlock(db, { blockId: 'NO-SUCH-BLOCK', playerId: daniel, language: 'en', startTimes: null }, deps())).rejects.toBeInstanceOf(TrainingBlockAssignmentError);
    expect(await everything()).toEqual(before);
  });

  it('Player A succeeds completely while Player B fails completely (B is archived): A has the whole programme, B has nothing', async () => {
    await archivePlayer(db, alice, { clock });
    const outcomes = await assignTrainingBlockToPlayers(
      db,
      'ATHLETICISM-FOUNDATION-6W-01',
      [
        { playerId: alice, startTimes: times(12) },
        { playerId: daniel, startTimes: times(12) },
      ],
      'en',
      deps(),
    );
    expect(outcomes.map((o) => [o.ok, o.ok ? o.assignment.playerId : o.playerId])).toEqual([
      [false, alice],
      [true, daniel],
    ]); // the failure of the first Player does not stop the second
    expect(await count('planned_workouts', alice)).toBe(0);
    expect(await count('calendar_events', alice)).toBe(0);
    expect(await count('planned_workouts', daniel)).toBe(12);
    expect(await count('calendar_events', daniel)).toBe(12);
    expect(events.filter((e) => e === 'calendar')).toHaveLength(1);
  });

  it('two Players both succeed with independent programmes (never a shared plan)', async () => {
    const outcomes = await assignTrainingBlockToPlayers(db, 'STRENGTH-FOUNDATION-6W-01', [{ playerId: daniel, startTimes: null }, { playerId: alice, startTimes: null }], 'en', deps());
    expect(outcomes.every((o) => o.ok)).toBe(true);
    const [a, b] = outcomes.map((o) => (o.ok ? o.assignment : null)!);
    expect(new Set([...a!.planIds, ...b!.planIds]).size).toBe(24);
    // editing Daniel's plan changes neither Alice's copy nor the source
    const target = (await getPlannedWorkout(db, a!.planIds[1]!))!;
    const mate = await items(b!.planIds[1]!);
    const save = await savePlannedWorkout(
      db,
      { planId: target.id, playerId: daniel, name: 'Edited', entries: target.items.slice(0, 1).map((i) => ({ kind: 'EXERCISE', exerciseId: i.exercise.exerciseId, prescription: { sets: 1, target: 1, loadKg: null, restSec: 1 } }) as const) },
      deps(),
    );
    expect(save.ok).toBe(true);
    expect(await items(b!.planIds[1]!)).toEqual(mate);
  });

  it('refuses the same Player twice', async () => {
    await expect(
      assignTrainingBlockToPlayers(db, 'STRENGTH-FOUNDATION-6W-01', [{ playerId: daniel, startTimes: null }, { playerId: daniel, startTimes: null }], 'en', deps()),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PLAYER' });
  });
});

describe('history and the transaction rule', () => {
  it('existing plans, started sessions and earlier events are untouched', async () => {
    const own = await savePlannedWorkout(
      db,
      { planId: null, playerId: daniel, name: 'Mine', entries: [{ kind: 'EXERCISE', exerciseId: 'PUSH_UP', prescription: { sets: 3, target: 8, loadKg: null, restSec: 60 } }] },
      deps(),
    );
    if (!own.ok) throw new Error('seed');
    await startSession(db, own.plan.id, deps());
    const before = await everything();
    await assignTrainingBlock(db, { blockId: 'ATHLETICISM-FOUNDATION-6W-01', playerId: daniel, language: 'en', startTimes: times(12) }, deps());
    const after = await everything();
    for (const table of ['planned_workouts', 'planned_workout_items', 'calendar_events', 'training_sessions'] as const) {
      expect((after[table] as unknown[]).slice(0, (before[table] as unknown[]).length)).toEqual(before[table]); // the old rows are byte-identical
    }
    expect(await count('training_sessions')).toBe(1);
  });

  it('the existing public functions cannot be called from inside an open write transaction (they never return) — which is why the block uses the non-transactional pieces', async () => {
    const outcome = await Promise.race([
      writeTransaction(db, async () => {
        await assignContentToPlayers(db, { kind: 'PROFESSIONAL', workoutId: 'ATH-MOVEMENT-FOUNDATION-01', language: 'en' }, [{ playerId: daniel, destination: { type: 'NEW', name: 'x' } }], deps());
      }).then(() => 'RETURNED'),
      new Promise((resolve) => setTimeout(() => resolve('NEVER-RETURNED'), 1500)),
    ]);
    expect(outcome).toBe('NEVER-RETURNED');
  }, 20_000);
});
