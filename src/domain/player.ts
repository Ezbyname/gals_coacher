import { calendarDate, compareCalendarDates, type CalendarDate } from './calendarDate';
import type { Uuid } from './ids';

/**
 * Generic Player (a child; PRODUCT_SPEC §65). Sport-specific profile data lives
 * in its own module (e.g. ./basketball/profile.ts), never here. Age is derived
 * with `ageOn`, never stored. No weight (§66).
 */
export interface Player {
  readonly id: Uuid;
  readonly familyId: Uuid;
  readonly name: string;
  readonly dateOfBirth: CalendarDate;
  /** Whole centimetres; current value only. */
  readonly heightCm: number | null;
  /**
   * The Player's current team, as the user wrote it (e.g. "הפועל חוף הכרמל"),
   * or null. Metadata for schedule imports (filtering a league fixture list,
   * home / away) — never identity, ownership or authorization (CAL-SCHEDULE-IMPORT-002A).
   */
  readonly teamName: string | null;
  /**
   * When the Player was archived (epoch ms), or null while active (PLAYER-ARCHIVE-001).
   * An archived Player is off the active roster and gets no new activity; all of
   * their history is kept, and restoring clears this.
   */
  readonly archivedAt: number | null;
  /** Epoch milliseconds. */
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Raw create/edit input. The date of birth arrives as separate day/month/year numbers. */
export interface PlayerCoreInput {
  readonly name: string;
  readonly dateOfBirth: { readonly year: number; readonly month: number; readonly day: number } | null;
  readonly heightCm?: number | null;
  /** Omitted or blank = no team. */
  readonly teamName?: string | null;
}

/** Validated generic fields, ready to persist. */
export interface PlayerCore {
  readonly name: string;
  readonly dateOfBirth: CalendarDate;
  readonly heightCm: number | null;
  readonly teamName: string | null;
}

/** The longest team name a user may enter (characters, after trimming). */
export const TEAM_NAME_MAX_LENGTH = 60;

export type PlayerCoreErrors = {
  name?: 'REQUIRED';
  dateOfBirth?: 'REQUIRED' | 'INVALID_DATE' | 'IN_FUTURE';
  heightCm?: 'NOT_POSITIVE_INTEGER';
  teamName?: 'TOO_LONG';
};

export type PlayerCoreValidation =
  | { readonly ok: true; readonly value: PlayerCore }
  | { readonly ok: false; readonly errors: PlayerCoreErrors };

/**
 * Validates the generic Player fields against an explicitly supplied `today`
 * (the caller derives it from the device clock). Only name and date of birth
 * are required. No age or height limits — those are not product rules.
 */
export function validatePlayerCore(input: PlayerCoreInput, today: CalendarDate): PlayerCoreValidation {
  const errors: PlayerCoreErrors = {};

  const name = input.name.trim();
  if (name.length === 0) errors.name = 'REQUIRED';

  let dateOfBirth: CalendarDate | null = null;
  if (input.dateOfBirth === null) {
    errors.dateOfBirth = 'REQUIRED';
  } else {
    const { year, month, day } = input.dateOfBirth;
    dateOfBirth = calendarDate(year, month, day);
    if (dateOfBirth === null) errors.dateOfBirth = 'INVALID_DATE';
    else if (compareCalendarDates(dateOfBirth, today) > 0) errors.dateOfBirth = 'IN_FUTURE';
  }

  const heightCm = input.heightCm ?? null;
  if (heightCm !== null && !(Number.isInteger(heightCm) && heightCm > 0)) {
    errors.heightCm = 'NOT_POSITIVE_INTEGER';
  }

  const team = typeof input.teamName === 'string' ? input.teamName.trim() : '';
  const teamName = team.length === 0 ? null : team;
  if (teamName !== null && teamName.length > TEAM_NAME_MAX_LENGTH) errors.teamName = 'TOO_LONG';

  if (Object.keys(errors).length > 0 || dateOfBirth === null) return { ok: false, errors };
  return { ok: true, value: { name, dateOfBirth, heightCm, teamName } };
}
