import type { Exercise } from '@/domain/exercise/exercise';
import { isUuid } from '@/domain/ids';
import {
  finishedStatus,
  isMeasurementKind,
  isMeasurementSource,
  isSessionPurpose,
  isSessionStatus,
  isSetStatus,
  isValidConfidence,
  storedMeasurement,
  validatePrescription,
  validateSetValues,
  type ExerciseSnapshot,
  type MeasurementKind,
  type MeasurementSource,
  type Prescription,
  type SessionPurpose,
  type SessionStatus,
  type SetStatus,
  type SetValueErrors,
  type SetValues,
} from '@/domain/training/training';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import { readExercisesUnserialized } from '../exercises/exerciseRepository';
import type { PlayerDb } from '../players/playerDb';

import { TrainingDataError, TrainingNotFoundError, TrainingRuleError } from './errors';
import { readTemplate, writeTransaction } from './workoutRepository';

/**
 * Planned workouts and training sessions (TRAIN-002, ARCHITECTURE §15).
 *
 * - Planning a template writes a FROZEN snapshot (exercise names, measurement
 *   and prescription as they are now). Nothing ever updates it.
 * - Starting a planned workout creates a SEPARATE session; its sets copy the
 *   per-set plan and record actual values next to it — never adjusted to it.
 * - Each actual value is a measurement with its own source (MANUAL here) and
 *   measured / final / edited. A finished session is read-only.
 */

export interface PlannedItem {
  readonly position: number;
  readonly blockName: string | null;
  readonly exercise: ExerciseSnapshot;
  readonly prescription: Prescription;
}
export interface PlannedWorkout {
  readonly id: string;
  readonly playerId: string;
  /** Provenance only: the template it was planned from (may have changed since). */
  readonly templateId: string | null;
  readonly name: string;
  readonly items: readonly PlannedItem[];
  /** The session that performed it, if any (at most one). */
  readonly sessionId: string | null;
  readonly createdAt: number;
}

export interface Measurement {
  readonly kind: MeasurementKind;
  readonly measuredValue: number;
  readonly finalValue: number;
  readonly wasEdited: boolean;
  readonly source: MeasurementSource;
  readonly confidence: number | null;
}
export interface SessionSet {
  readonly id: string;
  readonly setNumber: number;
  /** False for an extra set the plan did not contain. */
  readonly planned: boolean;
  readonly plannedTarget: number | null;
  readonly plannedLoadKg: number | null;
  readonly status: SetStatus;
  readonly measurements: readonly Measurement[];
}
export interface SessionExercise {
  readonly id: string;
  readonly position: number;
  readonly plannedPosition: number | null;
  readonly blockName: string | null;
  readonly exercise: ExerciseSnapshot;
  readonly restSec: number | null;
  readonly sets: readonly SessionSet[];
}
export interface TrainingSession {
  readonly id: string;
  readonly playerId: string;
  readonly plannedWorkoutId: string | null;
  readonly name: string;
  readonly purpose: SessionPurpose;
  readonly status: SessionStatus;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly exercises: readonly SessionExercise[];
}

export type RecordSetResult =
  | { readonly ok: true; readonly session: TrainingSession }
  | { readonly ok: false; readonly errors: SetValueErrors };

// ---------------------------------------------------------------- planning

/** Plans a template for a player: a frozen snapshot. The template may change later; this never does. */
export async function planWorkout(
  db: PlayerDb,
  input: { playerId: string; templateId: string },
  deps: { ids: IdService; clock: Clock },
): Promise<PlannedWorkout> {
  let result = null as PlannedWorkout | null;
  await writeTransaction(db, async () => {
    const id = await insertPlan(db, input, deps);
    result = await readPlan(db, id);
  });
  return result!;
}

/** Plans a template and starts it at once (one transaction): plan + session. */
export async function planAndStart(
  db: PlayerDb,
  input: { playerId: string; templateId: string },
  deps: { ids: IdService; clock: Clock },
): Promise<TrainingSession> {
  let result = null as TrainingSession | null;
  await writeTransaction(db, async () => {
    const planId = await insertPlan(db, input, deps);
    result = await readSession(db, await insertSession(db, planId, deps));
  });
  return result!;
}

export function getPlannedWorkout(db: PlayerDb, id: string): Promise<PlannedWorkout | null> {
  return runSerialized(db, async () => {
    const exists = await db.getFirstAsync('SELECT id FROM planned_workouts WHERE id = ?', [id]);
    return exists === null ? null : readPlan(db, id);
  });
}

// ---------------------------------------------------------------- sessions

/** Starts a planned workout. At most one session per plan and one in progress per player. */
export async function startSession(
  db: PlayerDb,
  plannedWorkoutId: string,
  deps: { ids: IdService; clock: Clock },
): Promise<TrainingSession> {
  let result = null as TrainingSession | null;
  await writeTransaction(db, async () => {
    result = await readSession(db, await insertSession(db, plannedWorkoutId, deps));
  });
  return result!;
}

export function getSession(db: PlayerDb, id: string): Promise<TrainingSession | null> {
  return runSerialized(db, async () => {
    const exists = await db.getFirstAsync('SELECT id FROM training_sessions WHERE id = ?', [id]);
    return exists === null ? null : readSession(db, id);
  });
}

export interface TrainingOverview {
  /** Planned and not started yet, newest first. */
  readonly planned: readonly PlannedWorkout[];
  /** Every session, newest first (the in-progress one included). */
  readonly sessions: readonly TrainingSession[];
}

/** A player's planned workouts (not started) and sessions. */
export function listTraining(db: PlayerDb, playerId: string): Promise<TrainingOverview> {
  return runSerialized(db, async () => {
    const plans = await db.getAllAsync<{ id: string }>(
      `SELECT p.id FROM planned_workouts p
        WHERE p.player_id = ? AND NOT EXISTS (SELECT 1 FROM training_sessions s WHERE s.planned_workout_id = p.id)
        ORDER BY p.created_at DESC, p.id DESC`,
      [playerId],
    );
    const sessions = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM training_sessions WHERE player_id = ? ORDER BY started_at DESC, id DESC',
      [playerId],
    );
    const planned: PlannedWorkout[] = [];
    for (const p of plans) planned.push(await readPlan(db, p.id));
    const read: TrainingSession[] = [];
    for (const s of sessions) read.push(await readSession(db, s.id));
    return { planned, sessions: read };
  });
}

/**
 * Records the actual values of one set (MANUAL). The first value of a kind
 * is the measured value; a later different value changes only the final
 * value and marks it edited. Never adjusted toward the plan.
 */
export async function recordSet(
  db: PlayerDb,
  setId: string,
  values: SetValues,
  deps: { ids: IdService; clock: Clock },
): Promise<RecordSetResult> {
  const now = deps.clock.wallNow();
  let result = null as RecordSetResult | null;
  await writeTransaction(db, async () => {
    const { session, exercise } = await locateSet(db, setId);
    if (session.status !== 'IN_PROGRESS') throw new TrainingRuleError('SESSION_CLOSED');
    const valid = validateSetValues(exercise.exercise.measurement, values);
    if (!valid.ok) {
      result = valid;
      return;
    }
    const existing = await db.getAllAsync<{ id: string; kind: string; final_value: number }>(
      'SELECT id, kind, final_value FROM set_measurements WHERE set_id = ?',
      [setId],
    );
    for (const [kind, value] of Object.entries(valid.values)) {
      const before = existing.find((m) => m.kind === kind);
      if (!before) {
        await db.runAsync(
          `INSERT INTO set_measurements
             (id, set_id, kind, measured_value, final_value, was_edited, source, confidence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 'MANUAL', NULL, ?, ?)`,
          [deps.ids.newUuid(), setId, kind, value, value, now, now],
        );
      } else if (before.final_value !== value) {
        await db.runAsync(
          'UPDATE set_measurements SET final_value = ?, was_edited = 1, updated_at = ? WHERE id = ?',
          [value, now, before.id],
        );
      }
    }
    await db.runAsync(
      "UPDATE session_sets SET status = 'DONE', updated_at = ? WHERE id = ? AND status <> 'DONE'",
      [now, setId],
    );
    await touch(db, session.id, now);
    result = { ok: true, session: await readSession(db, session.id) };
  });
  return result!;
}

/** Marks a not-yet-performed set as skipped (a performed set cannot be skipped). */
export async function skipSet(db: PlayerDb, setId: string, deps: { clock: Clock }): Promise<TrainingSession> {
  const now = deps.clock.wallNow();
  let result = null as TrainingSession | null;
  await writeTransaction(db, async () => {
    const { session, set } = await locateSet(db, setId);
    if (session.status !== 'IN_PROGRESS') throw new TrainingRuleError('SESSION_CLOSED');
    if (set.status === 'DONE') throw new TrainingRuleError('SET_ALREADY_RECORDED');
    if (set.status === 'PENDING') {
      await db.runAsync("UPDATE session_sets SET status = 'SKIPPED', updated_at = ? WHERE id = ?", [
        now,
        setId,
      ]);
      await touch(db, session.id, now);
    }
    result = await readSession(db, session.id);
  });
  return result!;
}

/** Adds an extra set (no plan) after the exercise's last set. */
export async function addSet(
  db: PlayerDb,
  sessionExerciseId: string,
  deps: { ids: IdService; clock: Clock },
): Promise<TrainingSession> {
  const now = deps.clock.wallNow();
  let result = null as TrainingSession | null;
  await writeTransaction(db, async () => {
    const row = await db.getFirstAsync<{ session_id: string }>(
      'SELECT session_id FROM session_exercises WHERE id = ?',
      [sessionExerciseId],
    );
    if (row === null) throw new TrainingNotFoundError('sessionExercise', sessionExerciseId);
    const session = await readSession(db, row.session_id);
    if (session.status !== 'IN_PROGRESS') throw new TrainingRuleError('SESSION_CLOSED');
    const exercise = session.exercises.find((e) => e.id === sessionExerciseId)!;
    const next = Math.max(0, ...exercise.sets.map((s) => s.setNumber)) + 1;
    await db.runAsync(
      `INSERT INTO session_sets (id, session_exercise_id, set_number, planned, planned_target, planned_load_kg,
         status, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, NULL, 'PENDING', ?, ?)`,
      [deps.ids.newUuid(), sessionExerciseId, next, now, now],
    );
    await touch(db, session.id, now);
    result = await readSession(db, session.id);
  });
  return result!;
}

/** Finishes a session: COMPLETED when every planned set was performed, else PARTIAL. */
export async function finishSession(
  db: PlayerDb,
  id: string,
  deps: { clock: Clock },
): Promise<TrainingSession> {
  return close(db, id, deps, (session) => {
    const status = finishedStatus(
      session.exercises.flatMap((e) => e.sets.map((s) => ({ planned: s.planned, status: s.status }))),
    );
    if (status === null) throw new TrainingRuleError('NOTHING_PERFORMED');
    return status;
  });
}

/** Stops a session without finishing it. What was recorded stays. */
export function abandonSession(db: PlayerDb, id: string, deps: { clock: Clock }): Promise<TrainingSession> {
  return close(db, id, deps, () => 'ABANDONED');
}

// ---------------------------------------------------------------- internals

async function close(
  db: PlayerDb,
  id: string,
  deps: { clock: Clock },
  decide: (session: TrainingSession) => SessionStatus,
): Promise<TrainingSession> {
  const now = deps.clock.wallNow();
  let result = null as TrainingSession | null;
  await writeTransaction(db, async () => {
    const exists = await db.getFirstAsync('SELECT id FROM training_sessions WHERE id = ?', [id]);
    if (exists === null) throw new TrainingNotFoundError('session', id);
    const session = await readSession(db, id);
    if (session.status !== 'IN_PROGRESS') throw new TrainingRuleError('SESSION_CLOSED');
    const status = decide(session);
    await db.runAsync('UPDATE training_sessions SET status = ?, ended_at = ?, updated_at = ? WHERE id = ?', [
      status,
      Math.max(now, session.startedAt),
      now,
      id,
    ]);
    result = await readSession(db, id);
  });
  return result!;
}

async function touch(db: PlayerDb, sessionId: string, now: number): Promise<void> {
  await db.runAsync('UPDATE training_sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
}

function snapshotOf(exercise: Exercise): ExerciseSnapshot {
  return { exerciseId: exercise.id, name: exercise.name, measurement: exercise.measurement };
}

async function insertPlan(
  db: PlayerDb,
  input: { playerId: string; templateId: string },
  deps: { ids: IdService; clock: Clock },
): Promise<string> {
  const now = deps.clock.wallNow();
  const player = await db.getFirstAsync('SELECT id FROM players WHERE id = ?', [input.playerId]);
  if (player === null) throw new TrainingNotFoundError('player', input.playerId);
  const template = await readTemplate(db, input.templateId, await readExercisesUnserialized(db));
  if (!template.active) throw new TrainingRuleError('TEMPLATE_INACTIVE');
  const id = deps.ids.newUuid();
  await db.runAsync(
    'INSERT INTO planned_workouts (id, player_id, template_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.playerId, template.id, template.name, now, now],
  );
  let position = 0;
  for (const block of template.blocks) {
    for (const item of block.items) {
      const s = snapshotOf(item.exercise);
      const p = item.prescription;
      await db.runAsync(
        `INSERT INTO planned_workout_items
           (planned_workout_id, position, block_name, exercise_id, exercise_name_he, exercise_name_en,
            measurement_type, comparison_policy, uses_load, distance_m, sets, target, load_kg, rest_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          position,
          block.name,
          s.exerciseId,
          s.name.he,
          s.name.en,
          s.measurement.type,
          s.measurement.comparison,
          s.measurement.usesLoad ? 1 : 0,
          s.measurement.distanceM,
          p.sets,
          p.target,
          p.loadKg,
          p.restSec,
        ],
      );
      position += 1;
    }
  }
  return id;
}

async function insertSession(
  db: PlayerDb,
  plannedWorkoutId: string,
  deps: { ids: IdService; clock: Clock },
): Promise<string> {
  const now = deps.clock.wallNow();
  const exists = await db.getFirstAsync('SELECT id FROM planned_workouts WHERE id = ?', [plannedWorkoutId]);
  if (exists === null) throw new TrainingNotFoundError('plannedWorkout', plannedWorkoutId);
  const plan = await readPlan(db, plannedWorkoutId);
  if (plan.sessionId !== null) throw new TrainingRuleError('PLAN_ALREADY_STARTED');
  const running = await db.getFirstAsync(
    "SELECT id FROM training_sessions WHERE player_id = ? AND status = 'IN_PROGRESS'",
    [plan.playerId],
  );
  if (running !== null) throw new TrainingRuleError('SESSION_IN_PROGRESS');
  const id = deps.ids.newUuid();
  await db.runAsync(
    `INSERT INTO training_sessions (id, player_id, planned_workout_id, name, purpose, status, started_at,
       ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'TRAINING', 'IN_PROGRESS', ?, NULL, ?, ?)`,
    [id, plan.playerId, plan.id, plan.name, now, now, now],
  );
  for (const item of plan.items) {
    const exerciseId = deps.ids.newUuid();
    const s = item.exercise;
    await db.runAsync(
      `INSERT INTO session_exercises (id, session_id, position, planned_position, block_name, exercise_id,
         exercise_name_he, exercise_name_en, measurement_type, comparison_policy, uses_load, distance_m, rest_sec,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        exerciseId,
        id,
        item.position,
        item.position,
        item.blockName,
        s.exerciseId,
        s.name.he,
        s.name.en,
        s.measurement.type,
        s.measurement.comparison,
        s.measurement.usesLoad ? 1 : 0,
        s.measurement.distanceM,
        item.prescription.restSec,
        now,
        now,
      ],
    );
    for (let n = 1; n <= item.prescription.sets; n += 1) {
      await db.runAsync(
        `INSERT INTO session_sets (id, session_exercise_id, set_number, planned, planned_target, planned_load_kg,
           status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, 'PENDING', ?, ?)`,
        [deps.ids.newUuid(), exerciseId, n, item.prescription.target, item.prescription.loadKg, now, now],
      );
    }
  }
  return id;
}

async function locateSet(db: PlayerDb, setId: string) {
  const row = await db.getFirstAsync<{ session_id: string }>(
    `SELECT e.session_id FROM session_sets t JOIN session_exercises e ON e.id = t.session_exercise_id
      WHERE t.id = ?`,
    [setId],
  );
  if (row === null) throw new TrainingNotFoundError('set', setId);
  const session = await readSession(db, row.session_id);
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((s) => s.id === setId);
    if (set) return { session, exercise, set };
  }
  throw new TrainingDataError('set', 'MISSING_ROW', setId);
}

type SnapshotRow = {
  exercise_id: unknown;
  exercise_name_he: unknown;
  exercise_name_en: unknown;
  measurement_type: unknown;
  comparison_policy: unknown;
  uses_load: unknown;
  distance_m: unknown;
};

function readSnapshot(row: SnapshotRow, field: string, rowId: string): ExerciseSnapshot {
  const measurement = storedMeasurement(row);
  if (measurement === null) throw new TrainingDataError(`${field}.measurement`, 'UNKNOWN_CODE', rowId);
  const { exercise_id: id, exercise_name_he: he, exercise_name_en: en } = row;
  if (
    typeof id !== 'string' ||
    typeof he !== 'string' ||
    typeof en !== 'string' ||
    !he.trim() ||
    !en.trim()
  ) {
    throw new TrainingDataError(`${field}.exercise`, 'INVALID_VALUE', rowId);
  }
  return { exerciseId: id, name: { he, en }, measurement };
}

const nullableNumber = (v: unknown): number | null => (v === null ? null : typeof v === 'number' ? v : NaN);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

async function readPlan(db: PlayerDb, id: string): Promise<PlannedWorkout> {
  const row = await db.getFirstAsync<{
    id: unknown;
    player_id: unknown;
    template_id: unknown;
    name: unknown;
    created_at: unknown;
  }>('SELECT id, player_id, template_id, name, created_at FROM planned_workouts WHERE id = ?', [id]);
  if (row === null) throw new TrainingNotFoundError('plannedWorkout', id);
  if (typeof row.id !== 'string' || !isUuid(row.id))
    throw new TrainingDataError('plan.id', 'INVALID_VALUE', id);
  if (typeof row.name !== 'string' || !row.name.trim())
    throw new TrainingDataError('plan.name', 'INVALID_VALUE', id);
  if (!isInt(row.created_at)) throw new TrainingDataError('plan.createdAt', 'INVALID_VALUE', id);
  const items = await db.getAllAsync<
    SnapshotRow & {
      position: unknown;
      block_name: unknown;
      sets: unknown;
      target: unknown;
      load_kg: unknown;
      rest_sec: unknown;
    }
  >('SELECT * FROM planned_workout_items WHERE planned_workout_id = ? ORDER BY position', [id]);
  if (items.length === 0) throw new TrainingDataError('plan.items', 'MISSING_ROW', id);
  const session = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM training_sessions WHERE planned_workout_id = ?',
    [id],
  );
  return {
    id: row.id,
    playerId: String(row.player_id),
    templateId: typeof row.template_id === 'string' ? row.template_id : null,
    name: row.name,
    createdAt: row.created_at,
    sessionId: session?.id ?? null,
    items: items.map((item) => {
      const exercise = readSnapshot(item, 'plan', id);
      const prescription: Prescription = {
        sets: nullableNumber(item.sets) as number,
        target: nullableNumber(item.target),
        loadKg: nullableNumber(item.load_kg),
        restSec: nullableNumber(item.rest_sec),
      };
      if (!validatePrescription(exercise.measurement, prescription).ok) {
        throw new TrainingDataError('plan.prescription', 'INVALID_VALUE', id);
      }
      if (item.block_name !== null && typeof item.block_name !== 'string') {
        throw new TrainingDataError('plan.blockName', 'INVALID_VALUE', id);
      }
      return { position: item.position as number, blockName: item.block_name, exercise, prescription };
    }),
  };
}

async function readSession(db: PlayerDb, id: string): Promise<TrainingSession> {
  const row = await db.getFirstAsync<{
    id: unknown;
    player_id: unknown;
    planned_workout_id: unknown;
    name: unknown;
    purpose: unknown;
    status: unknown;
    started_at: unknown;
    ended_at: unknown;
  }>('SELECT * FROM training_sessions WHERE id = ?', [id]);
  if (row === null) throw new TrainingNotFoundError('session', id);
  if (typeof row.id !== 'string' || !isUuid(row.id))
    throw new TrainingDataError('session.id', 'INVALID_VALUE', id);
  if (!isSessionStatus(row.status)) throw new TrainingDataError('session.status', 'UNKNOWN_CODE', id);
  if (!isSessionPurpose(row.purpose)) throw new TrainingDataError('session.purpose', 'UNKNOWN_CODE', id);
  if (typeof row.name !== 'string' || !row.name.trim())
    throw new TrainingDataError('session.name', 'INVALID_VALUE', id);
  if (!isInt(row.started_at) || (row.ended_at !== null && !isInt(row.ended_at))) {
    throw new TrainingDataError('session.time', 'INVALID_VALUE', id);
  }
  const exercises = await db.getAllAsync<
    SnapshotRow & {
      id: string;
      position: unknown;
      planned_position: unknown;
      block_name: unknown;
      rest_sec: unknown;
    }
  >('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY position', [id]);
  const sets = await db.getAllAsync<{
    id: string;
    session_exercise_id: string;
    set_number: unknown;
    planned: unknown;
    planned_target: unknown;
    planned_load_kg: unknown;
    status: unknown;
  }>(
    `SELECT t.* FROM session_sets t JOIN session_exercises e ON e.id = t.session_exercise_id
      WHERE e.session_id = ? ORDER BY t.set_number`,
    [id],
  );
  const measurements = await db.getAllAsync<{
    set_id: string;
    kind: unknown;
    measured_value: unknown;
    final_value: unknown;
    was_edited: unknown;
    source: unknown;
    confidence: unknown;
  }>(
    `SELECT m.* FROM set_measurements m JOIN session_sets t ON t.id = m.set_id
       JOIN session_exercises e ON e.id = t.session_exercise_id WHERE e.session_id = ? ORDER BY m.kind`,
    [id],
  );
  return {
    id: row.id,
    playerId: String(row.player_id),
    plannedWorkoutId: typeof row.planned_workout_id === 'string' ? row.planned_workout_id : null,
    name: row.name,
    purpose: row.purpose,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at as number | null,
    exercises: exercises.map((e) => {
      const exercise = readSnapshot(e, 'sessionExercise', e.id);
      return {
        id: e.id,
        position: e.position as number,
        plannedPosition: e.planned_position as number | null,
        blockName: typeof e.block_name === 'string' ? e.block_name : null,
        exercise,
        restSec: e.rest_sec as number | null,
        sets: sets
          .filter((s) => s.session_exercise_id === e.id)
          .map((s) => {
            if (!isSetStatus(s.status)) throw new TrainingDataError('set.status', 'UNKNOWN_CODE', s.id);
            const own = measurements
              .filter((m) => m.set_id === s.id)
              .map((m): Measurement => {
                if (!isMeasurementKind(m.kind))
                  throw new TrainingDataError('measurement.kind', 'UNKNOWN_CODE', s.id);
                if (!isMeasurementSource(m.source)) {
                  throw new TrainingDataError('measurement.source', 'UNKNOWN_CODE', s.id);
                }
                const confidence = nullableNumber(m.confidence);
                if (
                  typeof m.measured_value !== 'number' ||
                  typeof m.final_value !== 'number' ||
                  (m.was_edited !== 0 && m.was_edited !== 1) ||
                  !isValidConfidence(m.source, confidence)
                ) {
                  throw new TrainingDataError('measurement.value', 'INVALID_VALUE', s.id);
                }
                return {
                  kind: m.kind,
                  measuredValue: m.measured_value,
                  finalValue: m.final_value,
                  wasEdited: m.was_edited === 1,
                  source: m.source,
                  confidence,
                };
              });
            // A performed set holds exactly its exercise's kinds; others hold none.
            const expected = s.status === 'DONE';
            if (expected !== own.length > 0)
              throw new TrainingDataError('set.measurements', 'MISSING_ROW', s.id);
            return {
              id: s.id,
              setNumber: s.set_number as number,
              planned: s.planned === 1,
              plannedTarget: nullableNumber(s.planned_target),
              plannedLoadKg: nullableNumber(s.planned_load_kg),
              status: s.status,
              measurements: own,
            };
          }),
      };
    }),
  };
}
