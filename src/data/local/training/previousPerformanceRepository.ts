import type { MeasurementType } from '@/domain/measurement';
import { performanceFromSession, type PreviousExercisePerformance } from '@/domain/training/previousPerformance';

import { runSerialized } from '../connectionQueue';
import type { PlayerDb } from '../players/playerDb';

import { readSessionUnserialized } from './trainingRepository';

/**
 * TRAINING-PROGRESSION-001 (P1) — READ-ONLY lookup of a Player's Last Performance per exercise. It never writes: no row of any table is
 * inserted, updated or deleted, so opening Previous Performance changes nothing (plan, session, result, template or block).
 *
 * The Player is ALWAYS an argument and always part of the query (the Builder passes its route-scoped player id): there is no path that omits it.
 * Matching is by `exercise_id` plus the compatible (equal) `measurement_type`; a name is never compared.
 * SQLite does the cheap pre-filtering (Player, TRAINING purpose, COMPLETED / PARTIAL, an occurrence with a DONE planned set that holds a result),
 * newest first; the pure selector (`performanceFromSession`) then re-applies the full eligibility rules and decides among duplicate occurrences.
 * No new index is needed (measured on schema v23: well under 5 ms even for a Player with 1,500 sessions and an exercise never performed).
 */
export interface PerformanceQuery {
  readonly exerciseId: string;
  readonly measurementType: MeasurementType;
}
export const performanceKey = (q: PerformanceQuery): string => `${q.exerciseId}|${q.measurementType}`;

const PAGE = 20;

/** The Last Performance of every distinct (exercise, measurement type) asked for; null where there is none. One serialized read pass. */
export function findPreviousPerformances(
  db: PlayerDb,
  playerId: string,
  queries: readonly PerformanceQuery[],
): Promise<Map<string, PreviousExercisePerformance | null>> {
  const distinct = [...new Map(queries.map((q) => [performanceKey(q), q])).values()];
  return runSerialized(db, async () => {
    const out = new Map<string, PreviousExercisePerformance | null>();
    for (const q of distinct) out.set(performanceKey(q), await lookup(db, playerId, q));
    return out;
  });
}

export async function findPreviousPerformance(db: PlayerDb, playerId: string, query: PerformanceQuery): Promise<PreviousExercisePerformance | null> {
  return (await findPreviousPerformances(db, playerId, [query])).get(performanceKey(query)) ?? null;
}

async function lookup(db: PlayerDb, playerId: string, q: PerformanceQuery): Promise<PreviousExercisePerformance | null> {
  for (let offset = 0; ; offset += PAGE) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT s.id FROM training_sessions s
        WHERE s.player_id = ? AND s.purpose = 'TRAINING' AND s.status IN ('COMPLETED', 'PARTIAL')
          AND EXISTS (
            SELECT 1 FROM session_exercises e
             WHERE e.session_id = s.id AND e.exercise_id = ? AND e.measurement_type = ?
               AND EXISTS (SELECT 1 FROM session_sets t JOIN set_measurements m ON m.set_id = t.id
                            WHERE t.session_exercise_id = e.id AND t.planned = 1 AND t.status = 'DONE'))
        ORDER BY s.started_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      [playerId, q.exerciseId, q.measurementType, PAGE, offset],
    );
    for (const row of rows) {
      const found = performanceFromSession(await readSessionUnserialized(db, row.id), q.exerciseId, q.measurementType);
      if (found !== null) return found;
    }
    if (rows.length < PAGE) return null;
  }
}

/**
 * TRAINING-PROGRESSION-002 (S1) — the newest `count` (<= 2) eligible occurrences per exercise, newest first (one per session), for the
 * deterministic progression suggestion. Same rules and same query as `findPreviousPerformances` (so the first element IS the Last Performance);
 * READ-ONLY, Player-scoped, no new index. An exercise with no eligible history maps to an empty array.
 */
export const MAX_SUGGESTION_OCCURRENCES = 2;

export function findRecentPerformances(
  db: PlayerDb,
  playerId: string,
  queries: readonly PerformanceQuery[],
  count: number = MAX_SUGGESTION_OCCURRENCES,
): Promise<Map<string, PreviousExercisePerformance[]>> {
  const limit = Math.max(1, Math.min(count, MAX_SUGGESTION_OCCURRENCES));
  const distinct = [...new Map(queries.map((q) => [performanceKey(q), q])).values()];
  return runSerialized(db, async () => {
    const out = new Map<string, PreviousExercisePerformance[]>();
    for (const q of distinct) out.set(performanceKey(q), await lookupMany(db, playerId, q, limit));
    return out;
  });
}

async function lookupMany(db: PlayerDb, playerId: string, q: PerformanceQuery, limit: number): Promise<PreviousExercisePerformance[]> {
  const found: PreviousExercisePerformance[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT s.id FROM training_sessions s
        WHERE s.player_id = ? AND s.purpose = 'TRAINING' AND s.status IN ('COMPLETED', 'PARTIAL')
          AND EXISTS (
            SELECT 1 FROM session_exercises e
             WHERE e.session_id = s.id AND e.exercise_id = ? AND e.measurement_type = ?
               AND EXISTS (SELECT 1 FROM session_sets t JOIN set_measurements m ON m.set_id = t.id
                            WHERE t.session_exercise_id = e.id AND t.planned = 1 AND t.status = 'DONE'))
        ORDER BY s.started_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      [playerId, q.exerciseId, q.measurementType, PAGE, offset],
    );
    for (const row of rows) {
      const one = performanceFromSession(await readSessionUnserialized(db, row.id), q.exerciseId, q.measurementType);
      if (one !== null) found.push(one);
      if (found.length >= limit) return found;
    }
    if (rows.length < PAGE) return found;
  }
}
