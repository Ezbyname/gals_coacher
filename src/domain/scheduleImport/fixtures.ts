import type { ActivityTypeId } from '../activityType';
import { calendarDate, type CalendarDate } from '../calendarDate';
import type { ParsedTime } from '../calendarImport';
import type { Weekday } from '../calendarView';
import { matchupTitle, type ImportSourceKind, type NormalizedImportCandidate } from './candidate';
import { distinctTeams, normalizeTeamName, sideOf, type SourceTeam } from './teams';
import type { CellValue, Sheet } from './xlsx';

/**
 * CAL-SCHEDULE-IMPORT-002B — a league fixture sheet → normalized candidates
 * for ONE team. Columns are recognised by their header (aliases below), never
 * by position or file name. Required: date, start time, home team, away team.
 * Missing required columns → a clear error, nothing guessed. Dates and times
 * are used exactly as written (text "DD-MM-YYYY" / "DD/MM/YYYY" / "DD.MM.YYYY"
 * or an Excel date / time cell); no week, no inferred year, no invented end.
 */
export type FixtureColumn =
  | 'date' | 'time' | 'home' | 'away'
  | 'venue' | 'end' | 'code' | 'homeCode' | 'awayCode' | 'league' | 'round' | 'weekday';

export const REQUIRED_COLUMNS: readonly FixtureColumn[] = ['date', 'time', 'home', 'away'];

/** Accepted header names (compared after the team-name normalization: trimmed, spaces collapsed, Latin lower-case). */
export const COLUMN_ALIASES: Readonly<Record<FixtureColumn, readonly string[]>> = {
  date: ['date', 'תאריך'],
  time: ['time', 'start time', 'start', 'שעה', 'שעת התחלה'],
  home: ['home team', 'home', 'קבוצת בית', 'קבוצה מארחת', 'בית'],
  away: ['away team', 'away', 'קבוצת חוץ', 'קבוצה אורחת', 'חוץ'],
  venue: ['venue', 'location', 'מיקום', 'אולם', 'מגרש'],
  end: ['end time', 'end', 'שעת סיום'],
  code: ['code', 'game code', 'קוד', 'קוד משחק'],
  homeCode: ['home team code', 'home code', 'קוד קבוצת בית'],
  awayCode: ['away team code', 'away code', 'קוד קבוצת חוץ'],
  league: ['league', 'ליגה'],
  round: ['round', 'מחזור'],
  weekday: ['week day', 'weekday', 'day', 'יום'],
};

export type ColumnMap = Partial<Record<FixtureColumn, number>>;

export type HeaderResult =
  | { readonly ok: true; readonly headerRow: number; readonly columns: ColumnMap }
  | { readonly ok: false; readonly missing: readonly FixtureColumn[] };

const HEADER_SEARCH_ROWS = 10;

/** The first of the top rows whose cells name every required column. */
export function findHeader(sheet: Sheet): HeaderResult {
  let best: { missing: FixtureColumn[] } | null = null;
  for (const row of sheet.rows.slice(0, HEADER_SEARCH_ROWS)) {
    const columns: ColumnMap = {};
    row.cells.forEach((cell, index) => {
      if (typeof cell !== 'string') return;
      const name = normalizeTeamName(cell);
      for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [FixtureColumn, readonly string[]][]) {
        if (columns[column] === undefined && aliases.includes(name)) columns[column] = index;
      }
    });
    const missing = REQUIRED_COLUMNS.filter((c) => columns[c] === undefined);
    if (missing.length === 0) return { ok: true, headerRow: row.number, columns };
    if (best === null || missing.length < best.missing.length) best = { missing };
  }
  return { ok: false, missing: best?.missing ?? REQUIRED_COLUMNS };
}

export interface FixtureRow {
  /** "<sheet>!<row number>" (XLSX) or "line <n>" (pasted text, 002C) — shown to the user, kept as provenance. */
  readonly ref: string;
  /** The row number in the sheet, or the line number in the pasted text. */
  readonly line: number;
  readonly sourceKind: ImportSourceKind;
  /** The weekday the source WROTE next to the date (text lists), else null. The date stays authoritative:
   *  a disagreement is a review issue (WEEKDAY_DATE_MISMATCH), never a moved date. */
  readonly writtenWeekday: Weekday | null;
  readonly date: CalendarDate;
  readonly start: ParsedTime;
  readonly end: ParsedTime | null;
  readonly home: SourceTeam;
  readonly away: SourceTeam;
  readonly venue: string | null;
  readonly code: string | null;
}

export interface RejectedRow {
  readonly ref: string;
  readonly line?: number;
  readonly reason: 'DATE_UNREADABLE' | 'TIME_UNREADABLE' | 'TEAM_MISSING';
  readonly text: string;
}

const text = (v: CellValue | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
};
const codeText = (v: CellValue | undefined): string | null =>
  typeof v === 'number' && Number.isInteger(v) ? String(v) : text(v);

/** Excel serial day → calendar date (1900 system incl. its 1900-02-29 quirk, or 1904). */
export function excelSerialDate(serial: number, date1904: boolean): CalendarDate | null {
  const days = Math.floor(serial);
  if (!Number.isFinite(days) || days < 1) return null;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + days * 86_400_000);
  return calendarDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** "22-10-2026", "22/10/2026", "22.10.2026" (day first) or an Excel date cell. */
export function readDate(v: CellValue, date1904: boolean): CalendarDate | null {
  if (typeof v === 'number') return excelSerialDate(v, date1904);
  const m = typeof v === 'string' ? /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*$/.exec(v) : null;
  return m ? calendarDate(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

/** "17:30", "7:30", "17:30:00" or an Excel time cell (fraction of a day). */
export function readTime(v: CellValue): ParsedTime | null {
  if (typeof v === 'number') {
    const fraction = v - Math.floor(v);
    const minutes = Math.round(fraction * 24 * 60);
    if (minutes >= 24 * 60) return null;
    return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
  }
  const m = typeof v === 'string' ? /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(v) : null;
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** Every data row under the header as a fixture, or the reason it cannot be one (never silently dropped). */
export function readFixtures(
  sheet: Sheet,
  header: Extract<HeaderResult, { ok: true }>,
  date1904: boolean,
): { fixtures: FixtureRow[]; rejected: RejectedRow[] } {
  const col = header.columns;
  const fixtures: FixtureRow[] = [];
  const rejected: RejectedRow[] = [];
  for (const row of sheet.rows) {
    if (row.number <= header.headerRow) continue;
    const cell = (c: FixtureColumn) => (col[c] === undefined ? null : (row.cells[col[c]!] ?? null));
    if (row.cells.every((v) => text(v) === null)) continue; // blank row
    const ref = `${sheet.name}!${row.number}`;
    const raw = row.cells.map((v) => text(v) ?? '').filter(Boolean).join(' | ');
    const home = text(cell('home'));
    const away = text(cell('away'));
    if (home === null || away === null) {
      rejected.push({ ref, line: row.number, reason: 'TEAM_MISSING', text: raw });
      continue;
    }
    const date = readDate(cell('date'), date1904);
    if (date === null) {
      rejected.push({ ref, line: row.number, reason: 'DATE_UNREADABLE', text: raw });
      continue;
    }
    const start = readTime(cell('time'));
    if (start === null) {
      rejected.push({ ref, line: row.number, reason: 'TIME_UNREADABLE', text: raw });
      continue;
    }
    const endCell = cell('end');
    fixtures.push({
      ref,
      line: row.number,
      sourceKind: 'XLSX',
      writtenWeekday: null,
      date,
      start,
      end: endCell === null || text(endCell) === null ? null : readTime(endCell),
      home: { name: home, code: codeText(cell('homeCode')) },
      away: { name: away, code: codeText(cell('awayCode')) },
      venue: text(cell('venue')),
      code: codeText(cell('code')),
    });
  }
  return { fixtures, rejected };
}

/** The distinct teams of the fixtures (home and away), for the "which team is the Player's?" choice. */
export function fixtureTeams(fixtures: readonly FixtureRow[]): SourceTeam[] {
  return distinctTeams(fixtures.flatMap((f) => [f.home, f.away]));
}

/**
 * The selected team's fixtures as normalized candidates (the shared contract):
 * a row is the team's when either side is it — by the source's team code when
 * every side carries one, else by exact normalized name (sideOf). Never
 * "contains". Title "Home – Away" exactly; Venue → location; no end unless the
 * sheet gives one; GAME shown as a suggestion only.
 */
export function fixtureCandidates(
  fixtures: readonly FixtureRow[],
  team: SourceTeam,
  type: ActivityTypeId,
): NormalizedImportCandidate[] {
  const out: NormalizedImportCandidate[] = [];
  for (const f of fixtures) {
    const side = sideOf(team, f.home, f.away);
    if (side === null) continue;
    const title = matchupTitle({ home: f.home.name, away: f.away.name });
    out.push({
      key: `x${out.length + 1}`,
      line: f.line,
      sourceText: title,
      date: f.date,
      dateFrom: 'EXPLICIT_DATE',
      textWeekday: f.writtenWeekday,
      start: f.start,
      end: f.end,
      location: f.venue,
      details: null,
      title,
      type,
      suggestedType: 'GAME',
      source: { kind: f.sourceKind, ref: f.ref, externalId: f.code },
      matchup: { home: f.home.name, away: f.away.name, side },
    });
  }
  return out;
}
