import type { CalendarDate } from './calendarDate';
import { daysInMonth } from './calendarDate';
import type { ActivityTypeId } from './activityType';
import type { SportKey } from './sport';

/**
 * The Full Calendar (CAL-VIEW-001 / CAL-FILTER-001 / CAL-COLOR-001): pure
 * civil-date arithmetic, filtering and colour-meaning rules. Nothing here
 * reads the clock or the device timezone (local-day boundaries live in
 * services/clock/localCalendarDate.ts) and nothing changes an event: the
 * calendar only shows the stored schedule.
 */

/** Day of the week, 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The first day of a calendar week. OWNER DECISION PENDING: the repository
 * had no rule; Sunday (the Israeli convention of this Hebrew-first app) is
 * used for BOTH languages so switching language never rearranges the grid.
 * One constant — change it here.
 */
export const WEEK_STARTS_ON: Weekday = 0;

/** Days since 1970-01-01 for a civil date (proleptic Gregorian; no Date, no timezone). */
function dayNumber({ year, month, day }: CalendarDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date `n` days after 1970-01-01 (inverse of dayNumber). */
function fromDayNumber(n: number): CalendarDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Whole days from `a` to `b` (negative when `b` is before `a`). */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return dayNumber(b) - dayNumber(a);
}

export function weekdayOf(date: CalendarDate): Weekday {
  // 1970-01-01 was a Thursday (4).
  return ((((dayNumber(date) + 4) % 7) + 7) % 7) as Weekday;
}

export function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** A stable key for maps, e.g. "2026-10-06". */
export function dateKey({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The first day of the week containing `date`. */
export function startOfWeek(date: CalendarDate, weekStartsOn: Weekday = WEEK_STARTS_ON): CalendarDate {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

/** The seven dates of the week containing `date`, in order. */
export function weekDates(date: CalendarDate, weekStartsOn: Weekday = WEEK_STARTS_ON): CalendarDate[] {
  const first = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/**
 * The visible month grid: whole weeks from the week of the 1st to the week of
 * the last day (4–6 rows), so days of the neighbouring months fill the edges.
 */
export function monthGrid(
  year: number,
  month: number,
  weekStartsOn: Weekday = WEEK_STARTS_ON,
): CalendarDate[][] {
  const first = startOfWeek({ year, month, day: 1 }, weekStartsOn);
  const last = { year, month, day: daysInMonth(year, month) };
  const weeks: CalendarDate[][] = [];
  for (let start = first; daysBetween(start, last) >= 0; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** The same day in the month `delta` months away, clamped to that month's length (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: CalendarDate, delta: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export type CalendarViewMode = 'MONTH' | 'WEEK';

/** The first and last visible dates (inclusive) for a mode around the selected date. */
export function visibleDates(
  mode: CalendarViewMode,
  selected: CalendarDate,
  weekStartsOn: Weekday = WEEK_STARTS_ON,
): { first: CalendarDate; last: CalendarDate } {
  if (mode === 'WEEK') {
    const first = startOfWeek(selected, weekStartsOn);
    return { first, last: addDays(first, 6) };
  }
  const weeks = monthGrid(selected.year, selected.month, weekStartsOn);
  return { first: weeks[0]![0]!, last: weeks[weeks.length - 1]![6]! };
}

/**
 * Every civil date in `first..last` (inclusive) clipped to `range`. Used with
 * an event's local dates, so a long event never iterates outside the view.
 */
export function datesWithin(
  first: CalendarDate,
  last: CalendarDate,
  range: { first: CalendarDate; last: CalendarDate },
): CalendarDate[] {
  const from = daysBetween(range.first, first) > 0 ? first : range.first;
  const to = daysBetween(last, range.last) > 0 ? last : range.last;
  const count = daysBetween(from, to) + 1;
  return count > 0 ? Array.from({ length: count }, (_, i) => addDays(from, i)) : [];
}

// ---------------------------------------------------------------------------
// Filters (CAL-FILTER-001)

/** The event has no sport. A filter value of its own, next to the sport codes. */
export const NO_SPORT = 'NONE' as const;
export type SportFilterValue = SportKey | typeof NO_SPORT;

/**
 * Each dimension is a set of accepted values; an EMPTY set means "All".
 * Inside a dimension values combine with OR; across dimensions with AND.
 * The sport is the event's stored sport, never the Player's current
 * assignment state: history of an inactive sport stays visible.
 */
export interface CalendarFilter {
  readonly playerIds: readonly string[];
  readonly sports: readonly SportFilterValue[];
  readonly types: readonly ActivityTypeId[];
}

/** What filtering looks at: the stored Player, sport and type of an event. */
export type FilterableEvent = {
  readonly playerId: string;
  readonly sport: SportKey | null;
  readonly type: ActivityTypeId;
};

export const NO_FILTER: CalendarFilter = { playerIds: [], sports: [], types: [] };

export function isFilterActive(filter: CalendarFilter): boolean {
  return filter.playerIds.length + filter.sports.length + filter.types.length > 0;
}

/** How many dimensions are narrowed (0–3). */
export function activeFilterCount(filter: CalendarFilter): number {
  return [filter.playerIds, filter.sports, filter.types].filter((values) => values.length > 0).length;
}

export function matchesFilter(event: FilterableEvent, filter: CalendarFilter): boolean {
  const accepts = <T>(values: readonly T[], value: T) => values.length === 0 || values.includes(value);
  return (
    accepts(filter.playerIds, event.playerId) &&
    accepts<SportFilterValue>(filter.sports, event.sport ?? NO_SPORT) &&
    accepts(filter.types, event.type)
  );
}

/** The events that pass the filter, in their given order. Never changes an event. */
export function filterCalendarEvents<T extends FilterableEvent>(
  events: readonly T[],
  filter: CalendarFilter,
): T[] {
  return events.filter((event) => matchesFilter(event, filter));
}

/** Adds the value to a dimension, or removes it when present (multi-select chips). */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

// ---------------------------------------------------------------------------
// Colour meaning (CAL-COLOR-001)

/**
 * What an event's colour identifies: the Player when the view can show more
 * than one Player, the activity type when it shows exactly one. Decided by
 * the Player filter (or, unfiltered, by how many Players exist) — not by
 * which events happen to be in the visible range, so it does not flip while
 * browsing.
 */
export type ColorMeaning = 'PLAYER' | 'TYPE';

export function colorMeaning(filter: CalendarFilter, allPlayerIds: readonly string[]): ColorMeaning {
  const visible = filter.playerIds.length > 0 ? filter.playerIds : allPlayerIds;
  return visible.length === 1 ? 'TYPE' : 'PLAYER';
}

/**
 * A Player's colour slot: its place in creation order (createdAt, then id),
 * modulo the palette size. Independent of the name (a rename keeps it), of
 * filtering and of display order; Players are never deleted, so slots are
 * stable across restarts. Unknown Player → null.
 */
export function playerColorSlot(
  players: readonly { readonly id: string; readonly createdAt: number }[],
  playerId: string,
  paletteSize: number,
): number | null {
  const ordered = [...players].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const index = ordered.findIndex((p) => p.id === playerId);
  return index < 0 ? null : index % paletteSize;
}

/** Chronological order inside a day: start, then id (completion never reorders). */
export function byStartThenId(
  a: { readonly startAt: number; readonly id: string },
  b: { readonly startAt: number; readonly id: string },
) {
  return a.startAt - b.startAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Each civil date of `range` → the events that occupy it, in chronological
 * order (start, then id). `datesOf` gives an event's first and last local
 * dates (the device-local projection is passed in, so this stays pure). An
 * event appears on every date it occupies within the range, never elsewhere.
 */
export function eventsByDate<T extends { readonly startAt: number; readonly id: string }>(
  events: readonly T[],
  datesOf: (event: T) => { first: CalendarDate; last: CalendarDate },
  range: { first: CalendarDate; last: CalendarDate },
): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const event of events) {
    const { first, last } = datesOf(event);
    for (const date of datesWithin(first, last, range)) {
      const key = dateKey(date);
      days.set(key, [...(days.get(key) ?? []), event]);
    }
  }
  for (const list of days.values()) list.sort(byStartThenId);
  return days;
}
