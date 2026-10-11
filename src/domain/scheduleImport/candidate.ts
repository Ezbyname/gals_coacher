import type { ImportCandidate } from '../calendarImport/review';

/**
 * CAL-SCHEDULE-IMPORT-002A — the ONE candidate shape every import source
 * produces (pasted text, an Excel / XLSX fixture file, …). It is the reviewed
 * CAL-TEXT-IMPORT candidate plus where it came from and, for a fixture, the
 * matchup — so the existing Preview, review rules, Confirm and atomic
 * CalendarEvent batch write are reused unchanged. A source never creates a
 * PlannedWorkout / TrainingSession / template / block, and never decides the
 * Player: the target Player comes from ActivePlayerContext or an explicit choice.
 */
export type ImportSourceKind = 'TEXT' | 'XLSX';

export interface ImportSourceRef {
  readonly kind: ImportSourceKind;
  /** Where in the source, for showing it to the user: "line 5", "2026!7" (sheet + row). */
  readonly ref: string;
  /** The source's own id for the row when it has one (e.g. a league game code); never a CalendarEvent id. */
  readonly externalId: string | null;
}

/** A fixture: both teams exactly as the source writes them, and the Player's side once their team is known. */
export interface Matchup {
  readonly home: string;
  readonly away: string;
  /** Derived presentation only — never ownership. null until the Player's team is resolved. */
  readonly side: 'HOME' | 'AWAY' | null;
}

export interface NormalizedImportCandidate extends ImportCandidate {
  readonly source: ImportSourceRef;
  readonly matchup: Matchup | null;
}

/** The title a fixture keeps: "Home – Away", exactly as written (no "vs", no "(home)"). */
export function matchupTitle(matchup: Pick<Matchup, 'home' | 'away'>): string {
  return `${matchup.home.trim()} – ${matchup.away.trim()}`;
}
