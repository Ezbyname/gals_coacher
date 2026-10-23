import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import {
  assignContentToPlayers,
  reorderPlannedItem,
  savePlannedWorkout,
  type SaveEntry,
} from '@/data/local/training/plannedWorkoutCompositionRepository';
import {
  addSet,
  finishSession,
  getPlannedWorkout,
  recordSet,
  skipSet,
  startSession,
  type TrainingSession,
} from '@/data/local/training/trainingRepository';
import { createBlock } from '@/data/local/training/workoutRepository';
import { PROFESSIONAL_WORKOUTS } from '@/domain/training/professional';
import type { Prescription, SetValues } from '@/domain/training/training';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

/**
 * TRAINING-STOPWATCH-001 — Python QA scenario EXPORT. Not a product test: when STOPWATCH_QA_OUT is set it builds the
 * scenarios of the Python QA suite (product_qa/tests/training_stopwatch) through the app's REAL repositories on a REAL
 * schema-v22 SQLite engine, and writes self-contained database files plus a manifest.json. The Python suite then opens
 * those files with its own sqlite3 driver and checks the persisted data independently. Without the variable the suite
 * is skipped, so normal Jest runs are unaffected.
 */
const OUT = process.env.STOPWATCH_QA_OUT;
const run = OUT ? describe : describe.skip;

type Db = ReturnType<typeof openNodeSqlite>;
const clockOf = () => {
  let wall = new Date(2026, 9, 20, 12, 0, 0).getTime();
  return { wallNow: () => (wall += 1000), monotonicNow: () => 0 };
};
const rx = (sets: number, target: number | null, loadKg: number | null = null, extra: Partial<Prescription> = {}): Prescription => ({
  sets,
  target,
  loadKg,
  restSec: 60,
  ...extra,
});
const manifest: Record<string, unknown> = {};

async function world() {
  const db: Db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const deps = { ids: createSequentialIdService(), clock: clockOf() };
  const p = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  return { db, deps, playerId: p.profile.player.id };
}
async function plan(w: Awaited<ReturnType<typeof world>>, name: string, entries: SaveEntry[]) {
  const r = await savePlannedWorkout(w.db, { planId: null, playerId: w.playerId, name, entries }, w.deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const ex = (exerciseId: string, prescription: Prescription): SaveEntry => ({ kind: 'EXERCISE', exerciseId, prescription });
const snapshot = (db: Db, file: string) => {
  mkdirSync(OUT!, { recursive: true });
  db.raw.exec(`VACUUM INTO '${join(OUT!, file).replace(/\\/g, '/').replace(/'/g, "''")}'`);
  return file;
};
const setOf = (s: TrainingSession, exercise: number, setNumber: number) => s.exercises[exercise]!.sets.find((x) => x.setNumber === setNumber)!;
async function record(w: Awaited<ReturnType<typeof world>>, session: TrainingSession, exercise: number, setNumber: number, values: SetValues) {
  const r = await recordSet(w.db, setOf(session, exercise, setNumber).id, values, w.deps);
  return r;
}

run('stopwatch QA scenario export', () => {
  afterAll(() => {
    writeFileSync(join(OUT!, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  });

  it('main session: reps, timed (cap), reps+load, timed+load, refused records, extra set, edit; open and closed', async () => {
    const w = await world();
    const planned = await plan(w, 'Stopwatch scenario', [
      ex('PUSH_UP', rx(3, 10)),
      ex('SPRINT_10M', rx(2, 5, null, { timeSemantics: 'COMPLETION_TIME_CAP' })),
      ex('BARBELL_BENCH_PRESS', rx(2, 8, 40)),
      ex('SLED_PUSH', rx(2, 20, 50)),
      ex('FARMER_CARRY', rx(1, 30, 16)),
      ex('PLANK', rx(3, 30)),
    ]);
    let s = await startSession(w.db, planned.id, w.deps);
    const attempts: Record<string, unknown> = {};

    // PUSH_UP: plan 10 reps, actual 8; set 2 actual 10; set 3 skipped
    await record(w, s, 0, 1, { REPETITIONS: 8 });
    await record(w, s, 0, 2, { REPETITIONS: 10 });
    s = await skipSet(w.db, setOf(s, 0, 3).id, w.deps);
    // SPRINT_10M (cap 5 s): actual above the cap (7.2) and below it (4.83)
    await record(w, s, 1, 1, { TIME_S: 7.2 });
    await record(w, s, 1, 2, { TIME_S: 4.83 });
    // BENCH: reps + load per set; set 2 first 6 reps, then edited to 7
    await record(w, s, 2, 1, { REPETITIONS: 8, LOAD_KG: 42.5 });
    await record(w, s, 2, 2, { REPETITIONS: 6, LOAD_KG: 40 });
    await record(w, s, 2, 2, { REPETITIONS: 7, LOAD_KG: 40 });
    // SLED_PUSH (TIME + load): set 1 both kinds; set 2 time only -> refused, stays PENDING
    await record(w, s, 3, 1, { TIME_S: 6.12, LOAD_KG: 60 });
    const sledOnly = await record(w, s, 3, 2, { TIME_S: 6.4 });
    attempts.sledTimeOnly = { ok: sledOnly.ok, errors: sledOnly.ok ? null : sledOnly.errors };
    // FARMER_CARRY (DURATION + load): time only -> refused
    const carryOnly = await record(w, s, 4, 1, { DURATION_S: 30 });
    attempts.carryDurationOnly = { ok: carryOnly.ok, errors: carryOnly.ok ? null : carryOnly.errors };
    // PLANK: 3 planned sets, a 4th EXTRA set
    await record(w, s, 5, 1, { DURATION_S: 30 });
    await record(w, s, 5, 2, { DURATION_S: 28 });
    await record(w, s, 5, 3, { DURATION_S: 25 });
    s = await addSet(w.db, s.exercises[5]!.id, w.deps);
    await record(w, s, 5, 4, { DURATION_S: 20 });

    const open = snapshot(w.db, 'main_open.db');
    const closed = await finishSession(w.db, s.id, w.deps);
    const closedFile = snapshot(w.db, 'main_closed.db');
    manifest.main = { open, closed: closedFile, planId: planned.id, sessionId: s.id, playerId: w.playerId, closedStatus: closed.status, attempts };
  });

  it('PY-13: a later session of the same player / exercise cannot rewrite the earlier one', async () => {
    const w = await world();
    const first = await plan(w, 'Earlier', [ex('PUSH_UP', rx(2, 10))]);
    let s1 = await startSession(w.db, first.id, w.deps);
    await record(w, s1, 0, 1, { REPETITIONS: 8 });
    await record(w, s1, 0, 2, { REPETITIONS: 9 });
    s1 = await finishSession(w.db, s1.id, w.deps);
    const before = snapshot(w.db, 'py13_before.db');
    const second = await plan(w, 'Later', [ex('PUSH_UP', rx(3, 12))]);
    const s2 = await startSession(w.db, second.id, w.deps);
    await record(w, s2, 0, 1, { REPETITIONS: 12 });
    await record(w, s2, 0, 2, { REPETITIONS: 11 });
    await record(w, s2, 0, 2, { REPETITIONS: 10 }); // an edit inside the LATER session
    await finishSession(w.db, s2.id, w.deps);
    const after = snapshot(w.db, 'py13_after.db');
    manifest.py13 = { before, after, earlierSessionId: s1.id, laterSessionId: s2.id };
  });

  it('PY-REORDER: A,B,C,D -> D,B,A,C; session snapshot; refusal after a session exists', async () => {
    const w = await world();
    const entries = [ex('PUSH_UP', rx(3, 10)), ex('PLANK', rx(2, 30)), ex('BODYWEIGHT_SQUAT', rx(3, 12)), ex('GLUTE_BRIDGE', rx(2, 15))];
    const planned = await plan(w, 'Reorder', entries);
    const before = snapshot(w.db, 'reorder_before.db');
    await reorderPlannedItem(w.db, planned.id, 3, 0, w.deps); // D,A,B,C
    const after = await reorderPlannedItem(w.db, planned.id, 2, 1, w.deps); // D,B,A,C
    const afterFile = snapshot(w.db, 'reorder_after.db');
    const session = await startSession(w.db, planned.id, w.deps);
    const sessionFile = snapshot(w.db, 'reorder_session.db');
    let refusal: string | null = null;
    try {
      await reorderPlannedItem(w.db, planned.id, 3, 0, w.deps);
    } catch (e) {
      refusal = (e as { rule?: string }).rule ?? String(e);
    }
    const refusedFile = snapshot(w.db, 'reorder_after_refusal.db');
    manifest.reorder = {
      planId: planned.id,
      before,
      after: afterFile,
      session: sessionFile,
      refusedAfter: refusedFile,
      sessionId: session.id,
      expectedOrder: ['GLUTE_BRIDGE', 'PLANK', 'PUSH_UP', 'BODYWEIGHT_SQUAT'],
      afterOrderFromApp: after.items.map((i) => i.exercise.exerciseId),
      refusal,
    };
  });

  it('PY-REORDER-05: plans copied from a Block and from a Professional Workout; the sources stay unchanged', async () => {
    const w = await world();
    const made = await createBlock(w.db, { name: 'Source block', items: ['PUSH_UP', 'PLANK', 'BODYWEIGHT_SQUAT'].map((exerciseId) => ({ exerciseId, prescription: rx(2, 10) })) }, w.deps);
    if (!made.ok) throw new Error('seed');
    const fromBlock = await plan(w, 'From block', [{ kind: 'BLOCK', blockId: made.block.id, prescriptions: made.block.items.map((i) => i.prescription) }]);
    const workout = PROFESSIONAL_WORKOUTS.find((x) => x.sections.some((sec) => sec.items.length > 1))!;
    const [assigned] = await assignContentToPlayers(w.db, { kind: 'PROFESSIONAL', workoutId: workout.id, language: 'en' }, [{ playerId: w.playerId, destination: { type: 'NEW', name: 'From professional' } }], w.deps);
    const sourceBefore = snapshot(w.db, 'source_before.db');
    const proJsonBefore = JSON.stringify(workout);
    await reorderPlannedItem(w.db, fromBlock.id, 2, 0, w.deps);
    const items = (await getPlannedWorkout(w.db, assigned!.planId))!.items;
    const start = items.findIndex((it, n) => n + 1 < items.length && it.blockName === items[n + 1]!.blockName);
    await reorderPlannedItem(w.db, assigned!.planId, start, start + 1, w.deps);
    const sourceAfter = snapshot(w.db, 'source_after.db');
    manifest.sources = {
      before: sourceBefore,
      after: sourceAfter,
      blockId: made.block.id,
      blockPlanId: fromBlock.id,
      professionalPlanId: assigned!.planId,
      professionalWorkoutId: workout.id,
      professionalUnchanged: JSON.stringify(PROFESSIONAL_WORKOUTS.find((x) => x.id === workout.id)) === proJsonBefore,
    };
  });
});
