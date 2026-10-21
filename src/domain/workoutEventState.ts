import { agendaSection } from './calendarEvent';
import type { SessionStatus } from './training/training';

/**
 * CAL-TRAIN-001. What a calendar event that schedules a workout looks like RIGHT NOW. Purely derived and never stored:
 * the CalendarEvent only says WHEN, the TrainingSession (reached through the plan) only says what happened. Time passing
 * changes the presentation (UPCOMING -> OVERDUE) and nothing else: it never writes, creates a session, completes or skips.
 */
export const WORKOUT_EVENT_STATES = ['UPCOMING', 'OVERDUE', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'ABANDONED'] as const;
export type WorkoutEventState = (typeof WORKOUT_EVENT_STATES)[number];

export interface WorkoutEventStateInput {
  readonly startAt: number;
  readonly endAt: number | null;
  /** The old manual completion mark (CAL-COMP-001): honoured for a linked event that has no session, never created for one. */
  readonly completion: unknown;
  /** The status of the plan's TrainingSession, or null while there is none. */
  readonly sessionStatus: SessionStatus | null;
}

/** Same past / future rule as the agenda (`agendaSection`): an event is overdue once its end (or its start) has passed. */
export function workoutEventState(event: WorkoutEventStateInput, now: number): WorkoutEventState {
  switch (event.sessionStatus) {
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PARTIAL':
      return 'PARTIAL';
    case 'ABANDONED':
      return 'ABANDONED';
    default:
      if (event.completion != null) return 'COMPLETED'; // legacy manual mark, no session
      return agendaSection(event, now) === 'PAST' ? 'OVERDUE' : 'UPCOMING';
  }
}

/** The state has no session behind it: a workout that can still be started. */
export const isStartableState = (state: WorkoutEventState): boolean => state === 'UPCOMING' || state === 'OVERDUE';

/** A TrainingSession of any status exists (reminders stop, the schedule can no longer move). */
export const hasSessionState = (state: WorkoutEventState): boolean =>
  state === 'IN_PROGRESS' || state === 'COMPLETED' || state === 'PARTIAL' || state === 'ABANDONED';
