import { calendarDate, type CalendarDate } from '../calendarDate';
import type { ParsedTime } from '../calendarImport/parseSchedule';
import type { Weekday } from '../calendarView';

import type { FixtureRow, RejectedRow } from './fixtures';

/**
 * CAL-SCHEDULE-IMPORT-002C — a pasted SEASON / LEAGUE FIXTURE LIST, e.g.
 *
 *   1. יום חמישי, 22-10-2026 | שעה: 17:30
 *      מכבי חדרה מרכז – הפועל חוף הכרמל
 *      מיקום: ביה"ס תחכמוני, חדרה
 *
 * read into the SAME FixtureRow shape as an Excel fixture file (002B), so team
 * filtering, HOME / AWAY, the "Home – Away" title, review, Confirm, the atomic
 * batch write and Undo are shared. This is NOT the weekly WhatsApp schedule:
 * explicit full dates are authoritative (never remapped to a week); a written
 * weekday that disagrees is kept for review, never used to move the date.
 *
 * Text is read with LIGHT normalization only (line breaks, bidi marks, NBSP):
 * team names and venues keep their apostrophes / quotes exactly as written.
 */

export type FixtureTextConfidence = 'HIGH' | 'LOW' | 'NONE';

export interface FixtureTextResult {
  /** HIGH: clearly a fixture list; LOW: maybe — ask the user; NONE: not a fixture list (weekly text). */
  readonly confidence: FixtureTextConfidence;
  readonly fixtures: readonly FixtureRow[];
  readonly rejected: readonly RejectedRow[];
}

const BIDI = /[‎‏‪-‮⁦-⁩؜]/g;
const NBSP = /[   ]/g;
const FULL_DATE = /(?<!\d)(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?!\d)/;
const TIME = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const TIME_RANGE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/;
const ENTRY_NUMBER = /^\s*\d{1,3}\s*[.)]\s*/;
const LOCATION = /^\s*(?:📍\s*)?(?:מיקום|מקום|כתובת|אולם|מגרש|location|venue|place)\s*[:：]\s*(.+?)\s*$/iu;
// " – ", " — ", " - " (spaced, so names like "דור-העתיד" stay whole), "נגד", "vs" / "vs.".
const MATCHUP_SEPARATOR = /\s+[–—-]\s+|\s+נגד\s+|\s+vs\.?\s+/iu;
const HEADER_HINT = /לוח משחקים|ליגת|ליגה|עונת|עונה|מחזור|fixtures?|season|league/iu;
const WEEKDAYS: readonly (readonly [RegExp, Weekday])[] = [
  [/(?:^|[^א-ת])(?:יום\s+)?ראשון(?![א-ת])/u, 0],
  [/(?:^|[^א-ת])(?:יום\s+)?שני(?![א-ת])/u, 1],
  [/(?:^|[^א-ת])(?:יום\s+)?שלישי(?![א-ת])/u, 2],
  [/(?:^|[^א-ת])(?:יום\s+)?רביעי(?![א-ת])/u, 3],
  [/(?:^|[^א-ת])(?:יום\s+)?חמישי(?![א-ת])/u, 4],
  [/(?:^|[^א-ת])(?:יום\s+)?שישי(?![א-ת])/u, 5],
  [/(?:^|[^א-ת])(?:יום\s+)?שבת(?![א-ת])/u, 6],
  [/\bsun(?:day)?\b/i, 0],
  [/\bmon(?:day)?\b/i, 1],
  [/\btue(?:s|sday)?\b/i, 2],
  [/\bwed(?:nesday)?\b/i, 3],
  [/\bthu(?:rs|rsday)?\b/i, 4],
  [/\bfri(?:day)?\b/i, 5],
  [/\bsat(?:urday)?\b/i, 6],
];

interface Line {
  readonly number: number; // 1-based, in the pasted text
  readonly text: string;
}

const lightNormalize = (raw: string) => raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(BIDI, '').replace(NBSP, ' ');
const time = (h: string, m: string): ParsedTime => ({ hour: Number(h), minute: Number(m) });

function writtenWeekday(text: string): Weekday | null {
  const found = new Set(WEEKDAYS.filter(([re]) => re.test(text)).map(([, d]) => d));
  return found.size === 1 ? [...found][0]! : null; // two different weekdays on one line: not trusted
}

/** "Home – Away" (or "Home נגד Away", "Home vs Away") → both sides, trimmed; null when not a matchup. */
export function readMatchup(text: string): { home: string; away: string } | null {
  const t = text.replace(ENTRY_NUMBER, '').trim();
  if (t.length === 0 || FULL_DATE.test(t) || LOCATION.test(t) || /\d{1,2}:\d{2}/.test(t)) return null;
  const parts = t.split(MATCHUP_SEPARATOR);
  if (parts.length !== 2) return null;
  const [home, away] = parts.map((p) => p.trim());
  if (!home || !away || !/\p{L}/u.test(home) || !/\p{L}/u.test(away)) return null;
  return { home, away };
}

interface Entry {
  readonly dateLine: Line;
  readonly lines: readonly Line[]; // the lines after the date line, up to the next entry
}

function entries(lines: readonly Line[]): { header: Line[]; entries: Entry[] } {
  const header: Line[] = [];
  const out: { dateLine: Line; lines: Line[] }[] = [];
  for (const line of lines) {
    if (FULL_DATE.test(line.text)) out.push({ dateLine: line, lines: [] });
    else if (out.length === 0) header.push(line);
    else out[out.length - 1]!.lines.push(line);
  }
  return { header, entries: out };
}

function readEntry(e: Entry): FixtureRow | RejectedRow {
  const ref = `line ${e.dateLine.number}`;
  const all = [e.dateLine, ...e.lines];
  const sourceText = all.map((l) => l.text.trim()).filter((t) => t.length > 0).join(' | ');
  const m = FULL_DATE.exec(e.dateLine.text)!;
  const date: CalendarDate | null = calendarDate(Number(m[3]), Number(m[2]), Number(m[1]));
  if (date === null) return { ref, reason: 'DATE_UNREADABLE', text: sourceText };
  // The start (and an explicit end) from the date line, else from the first line that has a time.
  const timeLine = [e.dateLine, ...e.lines].find((l) => (l.text.match(TIME) ?? []).length > 0 && readMatchup(l.text) === null);
  if (timeLine === undefined) return { ref, reason: 'TIME_UNREADABLE', text: sourceText };
  const range = TIME_RANGE.exec(timeLine.text);
  const first = new RegExp(TIME.source).exec(timeLine.text)!;
  const start = range ? time(range[1]!, range[2]!) : time(first[1]!, first[2]!);
  const end = range ? time(range[3]!, range[4]!) : null;
  const matchup = e.lines.map((l) => readMatchup(l.text)).find((x) => x !== null) ?? readMatchup(e.dateLine.text.replace(FULL_DATE, ''));
  if (!matchup) return { ref, reason: 'TEAM_MISSING', text: sourceText };
  // Each fixture owns ITS location line — never one shared for the list.
  const venue = e.lines.map((l) => LOCATION.exec(l.text)?.[1] ?? null).find((v) => v !== null) ?? null;
  return {
    ref,
    line: e.dateLine.number,
    sourceKind: 'TEXT',
    writtenWeekday: writtenWeekday(e.dateLine.text),
    date,
    start,
    end,
    home: { name: matchup.home, code: null },
    away: { name: matchup.away, code: null },
    venue,
    code: null,
  };
}

/**
 * Reads a pasted text as a fixture list and says how sure that is. The header
 * (league / season / "22 games" summary) and any line before the first dated
 * entry never become candidates.
 */
export function readFixtureText(raw: string): FixtureTextResult {
  const lines = lightNormalize(raw)
    .split('\n')
    .map((text, i) => ({ number: i + 1, text }));
  const { header, entries: found } = entries(lines);
  const read = found.map(readEntry);
  const fixtures = read.filter((r): r is FixtureRow => 'date' in r);
  const rejected = read.filter((r): r is RejectedRow => 'reason' in r);
  const withMatchup = fixtures.length;
  const headerHint = header.some((l) => HEADER_HINT.test(l.text));
  const confidence: FixtureTextConfidence =
    found.length >= 2 && withMatchup >= 2 && withMatchup / found.length >= 0.8
      ? 'HIGH'
      : (found.length >= 1 && withMatchup >= 1) || (headerHint && found.length >= 1)
        ? 'LOW'
        : 'NONE';
  return { confidence, fixtures, rejected };
}
