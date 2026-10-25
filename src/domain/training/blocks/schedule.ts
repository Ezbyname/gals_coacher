import { calendarDate, type CalendarDate } from '../../calendarDate';
import { adjustedSections } from '../professional/adjust';
import { professionalWorkout } from '../professional';
import type { ProfessionalSection } from '../professional/types';

import { PLAN_NAME_MAX, totalSessions, type BlockPreviewRow, type BlockSession, type ScheduleErrorCode, type TrainingBlock } from './types';

/**
 * TRAINING-BLOCKS-001 — pure planning for a Training Block: the plan name of each session, the workout sections it copies, the
 * civil dates when the user schedules it, and the preview shown before the user confirms. No database, no clock, no device
 * timezone (the caller turns a civil date and a time into an instant).
 */

type Language = 'he' | 'en';

/** The name of the PlannedWorkout generated for a session, e.g. "Athleticism 3.2 Accel". Never longer than the plan-name limit. */
export function planName(block: TrainingBlock, session: BlockSession, language: Language): string {
  const i = language === 'he' ? 0 : 1;
  const name = `${block.shortName[i]} ${session.week}.${session.slot} ${session.label[i]}`;
  return name.length > PLAN_NAME_MAX ? name.slice(0, PLAN_NAME_MAX).trimEnd() : name;
}

/** The sessions in the order they are performed (week, then slot). */
export const orderedSessions = (block: TrainingBlock): readonly BlockSession[] =>
  [...block.schedule].sort((a, b) => a.week - b.week || a.slot - b.slot);

/** The sections the session copies into the Player's plan (the workout after this session's adjustment). */
export function sessionSections(session: BlockSession): readonly ProfessionalSection[] {
  const workout = professionalWorkout(session.workoutId);
  if (workout === null) throw new Error(`block references unknown workout ${session.workoutId}`);
  return adjustedSections(workout, session.adjust);
}

const MS_PER_DAY = 86_400_000;
const utc = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day);
const fromUtc = (ms: number): CalendarDate => {
  const dt = new Date(ms);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
};
/** 0 = Sunday … 6 = Saturday, for a civil date. */
export const weekdayOf = (d: CalendarDate): number => new Date(utc(d)).getUTCDay();

/**
 * The civil date of every session, in order: the first date on or after `start` that falls on one of the chosen weekdays,
 * then the next matching days. Weekdays must be as many as the block's sessions per week, valid, unique, and never on two
 * consecutive days (the days wrap, so Saturday and Sunday are consecutive) — there is always a rest day between sessions.
 */
export function planSessionDates(
  block: TrainingBlock,
  start: CalendarDate,
  weekdays: readonly number[],
): { ok: true; dates: CalendarDate[] } | { ok: false; error: ScheduleErrorCode } {
  if (calendarDate(start.year, start.month, start.day) === null) return { ok: false, error: 'START_DATE_INVALID' };
  if (weekdays.length !== block.sessionsPerWeek) return { ok: false, error: 'WEEKDAY_COUNT' };
  if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(weekdays).size !== weekdays.length) {
    return { ok: false, error: 'WEEKDAY_INVALID' };
  }
  const set = new Set(weekdays);
  if (block.allowAdjacentTrainingDays !== true && weekdays.some((d) => set.has((d + 1) % 7))) return { ok: false, error: 'WEEKDAYS_ADJACENT' };
  const dates: CalendarDate[] = [];
  for (let day = utc(start); dates.length < totalSessions(block); day += MS_PER_DAY) {
    const d = fromUtc(day);
    if (set.has(weekdayOf(d))) dates.push(d);
  }
  return { ok: true, dates };
}

/** The preview the user confirms: every plan that will be created (and its date, when scheduling is chosen). */
export function previewBlock(block: TrainingBlock, language: Language, dates: readonly CalendarDate[] | null): BlockPreviewRow[] {
  return orderedSessions(block).map((session, index) => {
    const workout = professionalWorkout(session.workoutId);
    return {
      index,
      week: session.week,
      slot: session.slot,
      planName: planName(block, session, language),
      workoutId: session.workoutId,
      workoutName: workout === null ? session.workoutId : workout.name[language === 'he' ? 0 : 1],
      date: dates?.[index] ?? null,
    };
  });
}
