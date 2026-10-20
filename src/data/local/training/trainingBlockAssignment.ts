import { trainingBlock } from '@/domain/training/blocks/registry';
import { orderedSessions, planName } from '@/domain/training/blocks/schedule';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { emitDataChanged } from '../../changes';
import { scheduleTimingErrors, scheduleWorkoutWithinTransaction } from '../calendar/calendarEventRepository';
import type { PlayerDb } from '../players/playerDb';

import { assignContentWithinTransaction } from './plannedWorkoutCompositionRepository';
import { writeTransaction } from './workoutRepository';

/**
 * TRAINING-BLOCKS-001 — assign a Training Block to a Player: one independent PlannedWorkout COPY per session (and, when the
 * user chose dates, one CalendarEvent per plan), as ONE write transaction PER PLAYER.
 *
 * The invariant: for one Player every intended plan and requested event is created, or NONE is. A failure at any session
 * (a refused item, an invalid time, a database rule, the 12th event) rolls the whole Player back — never a half-created
 * programme. Several Players are independent: one can succeed while another fails completely.
 *
 * It must NOT call `assignContentToPlayers` or `scheduleWorkout` from inside its transaction: both queue their own and would
 * never return. It uses their non-transactional pieces instead. Nothing of the block is stored on the Player (no block
 * instance, no week counter) and the source workouts, the block and every other Player are never written.
 */

export type BlockAssignmentErrorCode = 'BLOCK_NOT_FOUND' | 'SCHEDULE_MISMATCH' | 'INVALID_START' | 'START_IN_PAST' | 'DUPLICATE_PLAYER';

export class TrainingBlockAssignmentError extends Error {
  constructor(
    readonly code: BlockAssignmentErrorCode,
    /** The 0-based session the problem belongs to, when it belongs to one. */
    readonly sessionIndex: number | null = null,
  ) {
    super(`training block assignment: ${code}${sessionIndex === null ? '' : ` (session ${sessionIndex})`}`);
    this.name = 'TrainingBlockAssignmentError';
  }
}

/** A session failed inside the transaction; everything written for that Player was rolled back. */
export class TrainingBlockSessionError extends Error {
  constructor(
    readonly sessionIndex: number,
    readonly causeError: unknown,
  ) {
    super(`training block assignment: session ${sessionIndex} failed and nothing was created`);
    this.name = 'TrainingBlockSessionError';
  }
}

export interface BlockAssignment {
  readonly playerId: string;
  readonly planIds: readonly string[];
  readonly planNames: readonly string[];
  readonly eventIds: readonly string[];
}

export interface BlockAssignmentInput {
  readonly blockId: string;
  readonly playerId: string;
  readonly language: 'he' | 'en';
  /** Epoch ms of each session's start, in session order; null = create the plans only (no calendar events). */
  readonly startTimes: readonly number[] | null;
}

export async function assignTrainingBlock(
  db: PlayerDb,
  input: BlockAssignmentInput,
  deps: { ids: IdService; clock: Clock },
): Promise<BlockAssignment> {
  const block = trainingBlock(input.blockId);
  if (block === null) throw new TrainingBlockAssignmentError('BLOCK_NOT_FOUND');
  const sessions = orderedSessions(block);
  const now = deps.clock.wallNow();
  // everything that needs no database is checked BEFORE the transaction opens
  if (input.startTimes !== null) {
    if (input.startTimes.length !== sessions.length) throw new TrainingBlockAssignmentError('SCHEDULE_MISMATCH');
    input.startTimes.forEach((startAt, index) => {
      const errors = scheduleTimingErrors({ startAt }, now);
      if (errors.startAt === 'BEFORE_NOW') throw new TrainingBlockAssignmentError('START_IN_PAST', index);
      if (errors.startAt) throw new TrainingBlockAssignmentError('INVALID_START', index);
    });
  }
  let result: BlockAssignment | null = null;
  await writeTransaction(db, async () => {
    const planIds: string[] = [];
    const planNames: string[] = [];
    const eventIds: string[] = [];
    for (const [index, session] of sessions.entries()) {
      try {
        const name = planName(block, session, input.language);
        const assigned = await assignContentWithinTransaction(
          db,
          { kind: 'PROFESSIONAL', workoutId: session.workoutId, language: input.language, ...(session.adjust ? { adjust: session.adjust } : {}) },
          { playerId: input.playerId, destination: { type: 'NEW', name } },
          deps,
          now,
        );
        planIds.push(assigned.planId);
        planNames.push(name);
        if (input.startTimes !== null) {
          const event = await scheduleWorkoutWithinTransaction(
            db,
            { playerId: input.playerId, planId: assigned.planId, startAt: input.startTimes[index]!, endAt: null },
            deps,
            now,
          );
          eventIds.push(event.id);
        }
      } catch (e) {
        throw new TrainingBlockSessionError(index, e); // rolls back this Player's whole programme
      }
    }
    result = { playerId: input.playerId, planIds, planNames, eventIds };
  });
  if (result === null) throw new Error('assignTrainingBlock: the transaction finished without a result');
  const done: BlockAssignment = result;
  if (done.eventIds.length > 0) emitDataChanged('calendar'); // once, after the commit; a rollback emits nothing
  return done;
}

export type BlockAssignmentOutcome =
  | { readonly ok: true; readonly assignment: BlockAssignment }
  | { readonly ok: false; readonly playerId: string; readonly error: unknown };

/** Several Players: each is its OWN all-or-nothing assignment, in order; a failure never undoes another Player's success. */
export async function assignTrainingBlockToPlayers(
  db: PlayerDb,
  blockId: string,
  targets: readonly { playerId: string; startTimes: readonly number[] | null }[],
  language: 'he' | 'en',
  deps: { ids: IdService; clock: Clock },
): Promise<BlockAssignmentOutcome[]> {
  if (new Set(targets.map((t) => t.playerId)).size !== targets.length) throw new TrainingBlockAssignmentError('DUPLICATE_PLAYER');
  const outcomes: BlockAssignmentOutcome[] = [];
  for (const target of targets) {
    try {
      outcomes.push({ ok: true, assignment: await assignTrainingBlock(db, { blockId, playerId: target.playerId, language, startTimes: target.startTimes }, deps) });
    } catch (error) {
      outcomes.push({ ok: false, playerId: target.playerId, error });
    }
  }
  return outcomes;
}
