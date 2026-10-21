import type { SessionStatus } from '@/domain/training/training';
import { isSessionStatus } from '@/domain/training/training';

import { runSerialized } from '../connectionQueue';
import type { PlayerDb } from '../players/playerDb';

import { TrainingDataError } from './errors';

/**
 * CAL-TRAIN-001: the workout behind each calendar event, read in ONE query (no per-row reads): event -> plan -> session.
 * Both links are 1:1 (v18 `calendar_events_one_per_plan`, v9 `training_sessions_one_per_plan`), so a join cannot multiply
 * rows. Read-only; a plain event has no entry.
 */
export interface WorkoutEventLink {
  readonly eventId: string;
  readonly planId: string;
  readonly sessionId: string | null;
  readonly sessionStatus: SessionStatus | null;
}

type Row = { event_id: string; plan_id: string; session_id: string | null; status: string | null };

const SELECT = `SELECT e.id AS event_id, e.planned_workout_id AS plan_id, s.id AS session_id, s.status AS status
  FROM calendar_events e LEFT JOIN training_sessions s ON s.planned_workout_id = e.planned_workout_id
 WHERE e.planned_workout_id IS NOT NULL`;

function toMap(rows: readonly Row[]): Map<string, WorkoutEventLink> {
  const links = new Map<string, WorkoutEventLink>();
  for (const r of rows) {
    if (r.status !== null && !isSessionStatus(r.status)) throw new TrainingDataError('session.status', 'UNKNOWN_CODE', r.session_id ?? r.event_id);
    links.set(r.event_id, { eventId: r.event_id, planId: r.plan_id, sessionId: r.session_id, sessionStatus: r.status });
  }
  return links;
}

/** Every workout event of one Player (the agenda). */
export function listWorkoutEventLinks(db: PlayerDb, playerId: string): Promise<Map<string, WorkoutEventLink>> {
  return runSerialized(db, async () => toMap(await db.getAllAsync<Row>(`${SELECT} AND e.player_id = ?`, [playerId])));
}

/** Every workout event overlapping [from, to) (the Full Calendar), same overlap rule as `listCalendarEventsInRange`. */
export function listWorkoutEventLinksInRange(db: PlayerDb, from: number, to: number): Promise<Map<string, WorkoutEventLink>> {
  return runSerialized(db, async () =>
    toMap(
      await db.getAllAsync<Row>(
        `${SELECT} AND e.start_at < ? AND (CASE WHEN e.end_at IS NULL THEN e.start_at >= ? ELSE e.end_at > ? END)`,
        [to, from, from],
      ),
    ),
  );
}

/** Every workout event whose workout already has a TrainingSession of any status (the reminder engine skips these). */
export function listStartedWorkoutEventIds(db: PlayerDb): Promise<Set<string>> {
  return runSerialized(db, async () => {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT e.id AS id FROM calendar_events e JOIN training_sessions s ON s.planned_workout_id = e.planned_workout_id
        WHERE e.planned_workout_id IS NOT NULL`,
      [],
    );
    return new Set(rows.map((r) => r.id));
  });
}
