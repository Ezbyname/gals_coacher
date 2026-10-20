import type { CalendarDate } from '../../calendarDate';
import type { EvidenceClass, SourceKey } from '../../exercise/catalog/provenance';
import type { Difficulty } from '../../exercise/taxonomy';
import type { Pair, ReviewStatus, WorkoutAdjustment } from '../professional/types';

/**
 * TRAINING-BLOCKS-001 — a Training Block is an ordered multi-week programme made of Professional Workouts (read-only managed
 * content, in code: no table, no row). Assigning it to a Player creates independent PlannedWorkout COPIES, one per session;
 * nothing of the block is stored on the Player (no block instance, no "Week 3 of 6" — a later slice). A block is NOT one giant
 * workout, and it is neither a PlannedWorkout, a CalendarEvent nor a TrainingSession.
 */

/** One session of the block: which workout, and how this week's progression changes it. */
export interface BlockSession {
  /** 1-based week and 1-based slot within the week. */
  readonly week: number;
  readonly slot: number;
  readonly workoutId: string;
  /** Short name of the session, used in the plan name (e.g. "Accel"). */
  readonly label: Pair;
  readonly adjust?: WorkoutAdjustment;
  /** A progression cue for the coach or athlete (e.g. "add a small load when every rep is clean"). */
  readonly note?: Pair;
}

/** One programming decision with its evidence class (never one label for a whole block). */
export interface BlockDecision {
  readonly decision: Pair;
  readonly evidence: EvidenceClass;
  readonly sources: readonly SourceKey[];
}

export interface TrainingBlock {
  readonly id: string;
  readonly name: Pair;
  /** A short label for plan names (about 12 characters). */
  readonly shortName: Pair;
  readonly summary: Pair;
  readonly goal: Pair;
  readonly athlete: Pair;
  readonly prerequisite: Pair;
  /** Content complexity and progression — never an age or a medical readiness. */
  readonly difficulty: Difficulty;
  readonly weeks: number;
  readonly sessionsPerWeek: number;
  readonly schedule: readonly BlockSession[];
  readonly progression: readonly Pair[];
  readonly recovery: Pair;
  readonly equipment: Pair;
  readonly substitutions: readonly Pair[];
  readonly safety: Pair;
  readonly decisions: readonly BlockDecision[];
  readonly sources: readonly SourceKey[];
  readonly reviewStatus: ReviewStatus;
}

export const totalSessions = (block: TrainingBlock): number => block.weeks * block.sessionsPerWeek;

/** The longest plan name the app allows (shared with PlannedWorkout names). */
export const PLAN_NAME_MAX = 35;

/** One generated session in a preview (no database, no clock). */
export interface BlockPreviewRow {
  /** 0-based position across the whole block. */
  readonly index: number;
  readonly week: number;
  readonly slot: number;
  readonly planName: string;
  readonly workoutId: string;
  readonly workoutName: string;
  /** The civil date, when the user chose scheduling. */
  readonly date: CalendarDate | null;
}

export type ScheduleErrorCode = 'WEEKDAY_COUNT' | 'WEEKDAY_INVALID' | 'WEEKDAYS_ADJACENT' | 'START_DATE_INVALID';
