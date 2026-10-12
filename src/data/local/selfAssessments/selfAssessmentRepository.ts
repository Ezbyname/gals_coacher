import { isUuid } from '@/domain/ids';
import {
  validateSelfAssessment,
  type SelfAssessment,
  type SelfAssessmentCategoryError,
  type SelfAssessmentErrors,
  type SelfAssessmentInput,
} from '@/domain/selfAssessment';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import { SportInactiveError } from '../players/errors';
import type { PlayerDb } from '../players/playerDb';
import { assertActivePlayer } from '../players/playerRepository';

import {
  SelfAssessmentDataError,
  SelfAssessmentSportNotAssignedError,
  type SelfAssessmentDataReason,
} from './errors';

/** The athlete's answers: one per category; an unanswered category is omitted or null. */
export type SelfAssessmentAnswers = SelfAssessmentInput['ratings'];

/** Invalid answers are a result, not an exception: nothing was written. */
export type CreateSelfAssessmentResult =
  | { readonly ok: true; readonly assessment: SelfAssessment }
  | { readonly ok: false; readonly errors: SelfAssessmentErrors };

/**
 * Saves a new, immutable self-assessment taken now (`clock.wallNow()`), with a
 * client-generated id. The answers are validated first (invalid → result,
 * nothing written). Then, one operation at a time per connection and inside
 * one transaction: the player must exist (PlayerNotFoundError), be active
 * (PlayerArchivedError — PLAYER-ARCHIVE-001) and have the
 * sport assignment (SelfAssessmentSportNotAssignedError) ACTIVE
 * (SportInactiveError — history stays listed), and the assessment
 * row and every rating row are inserted together — any failure rolls back
 * all of it. Never updates or replaces an earlier assessment.
 */
export async function createSelfAssessment(
  db: PlayerDb,
  playerId: string,
  sport: string,
  answers: SelfAssessmentAnswers,
  deps: { ids: IdService; clock: Clock },
): Promise<CreateSelfAssessmentResult> {
  const takenAt = deps.clock.wallNow();
  const valid = validateSelfAssessment({ sport, takenAt, ratings: answers });
  if (!valid.ok) return valid;

  const id = deps.ids.newUuid();
  let saved = null as SelfAssessment | null;
  await writeTransaction(db, async () => {
    await assertActivePlayer(db, playerId); // exists and is not archived
    const assignment = await db.getFirstAsync<{ active: unknown }>(
      'SELECT active FROM player_sports WHERE player_id = ? AND sport = ?',
      [playerId, valid.value.sport],
    );
    if (assignment === null) throw new SelfAssessmentSportNotAssignedError(playerId, valid.value.sport);
    // An inactive sport keeps its history but takes no new assessments.
    if (assignment.active !== 1) throw new SportInactiveError(playerId, valid.value.sport);

    await db.runAsync('INSERT INTO self_assessments (id, player_id, sport, taken_at) VALUES (?, ?, ?, ?)', [
      id,
      playerId,
      valid.value.sport,
      valid.value.takenAt,
    ]);
    for (const { category, rating } of valid.value.ratings) {
      await db.runAsync(
        'INSERT INTO self_assessment_ratings (assessment_id, category, rating) VALUES (?, ?, ?)',
        [id, category, rating],
      );
    }
    // Re-read inside the transaction: the saved result is parsed like any read.
    saved =
      parseAssessments(
        await db.getAllAsync<AssessmentRow>(`${SELECT_ASSESSMENTS} WHERE a.id = ?`, [id]),
      )[0] ?? null;
  });
  if (saved === null) throw new Error('createSelfAssessment: transaction finished without the saved row');
  return { ok: true, assessment: saved };
}

/**
 * One player's self-assessments for one sport, newest first (taken_at, then
 * id, both descending), each with its answers in the sport's category order.
 * Never mixes sports. Any malformed stored assessment fails the whole read
 * with SelfAssessmentDataError.
 */
export function listSelfAssessments(
  db: PlayerDb,
  playerId: string,
  sport: string,
): Promise<SelfAssessment[]> {
  return runSerialized(db, async () =>
    parseAssessments(
      await db.getAllAsync<AssessmentRow>(
        `${SELECT_ASSESSMENTS} WHERE a.player_id = ? AND a.sport = ? ORDER BY a.taken_at DESC, a.id DESC`,
        [playerId, sport],
      ),
    ),
  );
}

/**
 * One write transaction at a time per connection (see ../connectionQueue, the
 * same queue the player repository uses).
 */
function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

// Everything is LEFT JOINed from the assessment so every broken state stays
// observable (never silently dropped by an inner join): a missing player, a
// missing (player, sport) assignment, an assessment without any rating row.
// players.id and player_sports' key are unique, so they never multiply rows.
const SELECT_ASSESSMENTS = `
  SELECT a.id, a.player_id, a.sport, a.taken_at, r.category, r.rating,
         p.id AS owner_player_id, ps.player_id AS assignment_player_id
  FROM self_assessments a
  LEFT JOIN players p ON p.id = a.player_id
  LEFT JOIN player_sports ps ON ps.player_id = a.player_id AND ps.sport = a.sport
  LEFT JOIN self_assessment_ratings r ON r.assessment_id = a.id`;

/** Raw SQLite values: nothing is trusted until parsed. */
type AssessmentRow = {
  id: unknown;
  player_id: unknown;
  sport: unknown;
  taken_at: unknown;
  category: unknown;
  rating: unknown;
  owner_player_id: unknown;
  assignment_player_id: unknown;
};

const CATEGORY_REASONS: Record<SelfAssessmentCategoryError, SelfAssessmentDataReason> = {
  MISSING: 'MISSING_CATEGORY',
  UNKNOWN_CATEGORY: 'UNKNOWN_CATEGORY',
  DUPLICATE: 'DUPLICATE_CATEGORY',
  INVALID_RATING: 'INVALID_RATING',
};

/** Groups joined rows by assessment (keeping the query order) and parses each one. */
function parseAssessments(rows: AssessmentRow[]): SelfAssessment[] {
  const groups = new Map<unknown, AssessmentRow[]>();
  for (const row of rows) {
    const group = groups.get(row.id);
    if (group) group.push(row);
    else groups.set(row.id, [row]);
  }
  return [...groups.values()].map(parseAssessment);
}

/**
 * The domain validator is the authority for what a stored assessment may
 * contain (sport, every category exactly once, ratings 1–5, timestamp).
 */
function parseAssessment(rows: AssessmentRow[]): SelfAssessment {
  const first = rows[0]!;
  const rawId = typeof first.id === 'string' ? first.id : null;
  const fail = (
    field: SelfAssessmentDataError['field'],
    reason: SelfAssessmentDataReason,
    category: string | null = null,
  ) => new SelfAssessmentDataError(field, reason, rawId, category);

  if (rawId === null || !isUuid(rawId)) throw fail('id', 'INVALID_VALUE');
  const playerId = first.player_id;
  if (typeof playerId !== 'string' || !isUuid(playerId)) throw fail('playerId', 'INVALID_VALUE');
  if (typeof first.sport !== 'string') throw fail('sport', 'INVALID_VALUE');
  if (typeof first.taken_at !== 'number') throw fail('takenAt', 'INVALID_VALUE');
  // An assessment belongs to an existing player's sport assignment (normally the FK guarantees it).
  if (first.owner_player_id === null) throw fail('playerId', 'INVALID_RELATIONSHIP');
  if (first.assignment_player_id === null) throw fail('sport', 'INVALID_RELATIONSHIP');

  // A LEFT JOIN without a match yields one row with a null category.
  if (rows.length === 1 && first.category === null && first.rating === null)
    throw fail('ratings', 'NO_RATINGS');
  const ratings = rows.map(({ category, rating }) => {
    if (typeof category !== 'string') throw fail('ratings', 'INVALID_VALUE');
    if (typeof rating !== 'number') throw fail('ratings', 'INVALID_RATING', category);
    return { category, rating };
  });

  const valid = validateSelfAssessment({ sport: first.sport, takenAt: first.taken_at, ratings });
  if (!valid.ok) {
    const { errors } = valid;
    if (errors.sport) throw fail('sport', 'UNSUPPORTED_SPORT');
    if (errors.takenAt) throw fail('takenAt', 'INVALID_VALUE');
    if (errors.ratings) throw fail('ratings', 'NO_RATINGS');
    const [category, problem] = Object.entries(errors.categories ?? {})[0] ?? [null, null];
    throw fail('ratings', problem === null ? 'INVALID_VALUE' : CATEGORY_REASONS[problem], category);
  }
  return { id: rawId, playerId, ...valid.value };
}
