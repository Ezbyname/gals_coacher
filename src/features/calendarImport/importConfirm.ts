import type { ActivityTypeId } from '@/domain/activityType';
import { validateCalendarEvent, type CalendarEventInput } from '@/domain/calendarEvent';
import { toMinutes, type ImportCandidate } from '@/domain/calendarImport';
import type { SportKey } from '@/domain/sport';
import { localDateTimeToEpoch } from '@/services/clock/localCalendarDate';

import { reviewedBatch, viewOf, type ImportReviewState } from './importReview';

/**
 * CAL-TEXT-IMPORT-001D — the reviewed Preview is AUTHORITATIVE. This turns the
 * reviewed, INCLUDED candidates into repository inputs, exactly as the user
 * left them: nothing is re-parsed, re-typed, moved, de-duplicated or completed
 * (no end time is ever invented). It only re-checks the batch STRUCTURALLY
 * before the write; any problem → nothing is written at all.
 */
export interface ConfirmContext {
  /** The route's Player now (ActivePlayerContext). */
  readonly playerId: string;
  /** The Player the Preview was analyzed for — a different one is a stale context. */
  readonly analyzedFor: string;
  /** Activity Types that may be used now (active). */
  readonly activeTypes: ReadonlySet<ActivityTypeId>;
  /** The Player's active sports, and the sport chosen for the batch (or none). */
  readonly sports: readonly SportKey[];
  readonly sport: SportKey | null;
}

export type CandidateProblem =
  | 'UNRESOLVED_REVIEW' // a review decision is still open (e.g. duplicate without "Keep anyway")
  | 'END_NOT_CONFIRMED' // no end time, and the user did not choose "Keep without end time"
  | 'END_NOT_AFTER_START'
  | 'TIME_DOES_NOT_EXIST' // an impossible date / a local time skipped by DST
  | 'TYPE_UNAVAILABLE'
  | 'INVALID'; // refused by the CalendarEvent domain validator

export type ConfirmResult =
  | { readonly ok: true; readonly keys: readonly string[]; readonly inputs: readonly CalendarEventInput[] }
  | {
      readonly ok: false;
      readonly batch: 'NOTHING_INCLUDED' | 'STALE_PLAYER' | 'SPORT_UNAVAILABLE' | null;
      readonly candidates: ReadonlyMap<string, readonly CandidateProblem[]>;
    };

/** The repository input of one reviewed candidate, or the local time that does not exist. */
export function candidateInput(c: ImportCandidate, sport: SportKey | null): CalendarEventInput | null {
  const startAt = localDateTimeToEpoch({ ...c.date, ...c.start });
  const endAt = c.end === null ? null : localDateTimeToEpoch({ ...c.date, ...c.end });
  if (startAt === null || (c.end !== null && endAt === null)) return null;
  return { type: c.type, sport, startAt, endAt, title: c.title, notes: c.details, location: c.location };
}

export function prepareImport(state: ImportReviewState, ctx: ConfirmContext): ConfirmResult {
  const candidates = new Map<string, CandidateProblem[]>();
  const fail = (batch: 'NOTHING_INCLUDED' | 'STALE_PLAYER' | 'SPORT_UNAVAILABLE' | null) =>
    ({ ok: false, batch, candidates }) as const;

  if (ctx.playerId !== ctx.analyzedFor) return fail('STALE_PLAYER');
  const batch = reviewedBatch(state);
  if (batch.length === 0) return fail('NOTHING_INCLUDED');
  if (ctx.sport !== null && !ctx.sports.includes(ctx.sport)) return fail('SPORT_UNAVAILABLE');

  // The user's own decisions, on the same reviewed data (no new duplicate search, no new data).
  const { summary } = viewOf(state);
  const inputs: CalendarEventInput[] = [];
  for (const c of batch) {
    const problems: CandidateProblem[] = [];
    if (summary.needsReview.has(c.key)) problems.push('UNRESOLVED_REVIEW');
    if (c.end === null && !(state.acknowledged.get(c.key)?.has('END_TIME_MISSING') ?? false)) {
      problems.push('END_NOT_CONFIRMED');
    }
    if (c.end !== null && toMinutes(c.end) <= toMinutes(c.start)) problems.push('END_NOT_AFTER_START');
    if (!ctx.activeTypes.has(c.type)) problems.push('TYPE_UNAVAILABLE');
    const input = candidateInput(c, ctx.sport);
    if (input === null) problems.push('TIME_DOES_NOT_EXIST');
    else if (!validateCalendarEvent(input).ok) problems.push('INVALID');
    if (problems.length > 0) candidates.set(c.key, problems);
    else if (input !== null) inputs.push(input);
  }
  if (candidates.size > 0) return fail(null);
  return { ok: true, keys: batch.map((c) => c.key), inputs };
}
