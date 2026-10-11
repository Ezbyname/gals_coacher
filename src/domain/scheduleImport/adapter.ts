import type { ActivityTypeId } from '../activityType';
import type { CalendarDate } from '../calendarDate';
import { buildCandidates, parseSchedule, type ImportWeek, type UnparsedLine } from '../calendarImport';
import type { NormalizedImportCandidate } from './candidate';

/**
 * CAL-SCHEDULE-IMPORT-002A — the boundary every import source implements.
 * An adapter only READS its input and returns normalized candidates plus what
 * it could not use; it writes nothing and decides nothing for the user (the
 * Preview's review rules do). 002B adds the XLSX adapter, 002C the season
 * fixture text mode — both behind this same contract.
 */
export interface AdapterContext {
  /** The Activity Type chosen for the batch (each candidate may be changed in the Preview). */
  readonly type: ActivityTypeId;
  /** The import week — weekly text only; a fixture source uses its explicit dates. */
  readonly week: ImportWeek | null;
  readonly today: CalendarDate;
}

/** Something in the source that could not become a candidate, shown to the user (never silently dropped). */
export interface AdapterRejection {
  readonly ref: string;
  readonly text: string;
  readonly reason: string;
}

export interface AdapterResult {
  readonly candidates: readonly NormalizedImportCandidate[];
  readonly rejected: readonly AdapterRejection[];
}

export interface ScheduleSourceAdapter<Input> {
  readonly kind: NormalizedImportCandidate['source']['kind'];
  read(input: Input, context: AdapterContext): AdapterResult;
}

/**
 * The existing weekly WhatsApp text import (CAL-TEXT-IMPORT-001) behind the new
 * boundary — same parser, same candidates, only tagged with their source. It
 * needs the week (weekday lines resolve inside it).
 */
export const weeklyTextAdapter: ScheduleSourceAdapter<string> = {
  kind: 'TEXT',
  read(text, context) {
    if (context.week === null) throw new RangeError('weeklyTextAdapter: a weekly schedule needs its week');
    const parsed = parseSchedule(text, { weekStart: context.week.start });
    const candidates = buildCandidates(parsed.sessions, context.week, context.type).map(
      (c): NormalizedImportCandidate => ({
        ...c,
        source: { kind: 'TEXT', ref: `line ${c.line}`, externalId: null },
        matchup: null,
      }),
    );
    return { candidates, rejected: parsed.unparsed.map(toRejection) };
  },
};

function toRejection(u: UnparsedLine): AdapterRejection {
  return { ref: `line ${u.line}`, text: u.text, reason: u.reason };
}
