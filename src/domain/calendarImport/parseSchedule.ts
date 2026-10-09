import { calendarDate, type CalendarDate } from '../calendarDate';
import type { BuiltinActivityType } from '../activityType';
import { daysBetween, type Weekday } from '../calendarView';
import {
  cleanLine,
  GERESH,
  HEBREW_LETTER,
  isDigit,
  isHebrewLetter,
  LOCATION_PIN,
  normalizeMessage,
} from './normalize';

/**
 * CAL-TEXT-IMPORT-001A — deterministic parser for a pasted weekly schedule.
 *
 * Text in, STRUCTURED SESSIONS out. It never writes anything, never invents a
 * value (no end time, no year guessed beyond "nearest to the chosen week"),
 * and never decides what the user meant when the text is ambiguous: every
 * session it returns is reviewed by the user before anything is saved
 * (review.ts turns sessions into candidates with issues).
 *
 * Line-based. A line produces sessions only when it has a DAY (a Hebrew
 * weekday or an explicit date) and a TIME. Everything else — greetings, emoji,
 * announcements — produces nothing; lines that look like a schedule but lack a
 * day or a valid time are reported in `unparsed`, never dropped silently.
 */

export interface ParsedTime {
  readonly hour: number;
  readonly minute: number;
}

/** Where a session's location came from: its own line, or a whole-message line ("כל האימונים ב…"). */
export type LocationSource = 'LINE' | 'MESSAGE';

export interface ParsedSession {
  /** Stable within one parse: "s1", "s2", … in message order. */
  readonly key: string;
  /** 1-based line number in the pasted text (for showing the source). */
  readonly line: number;
  /** The original line, as pasted (trimmed). */
  readonly sourceText: string;
  /** The weekday named in the text (null when only a date was given). */
  readonly weekday: Weekday | null;
  /** An explicit date in the text (year resolved), null when only a weekday was given. */
  readonly explicitDate: CalendarDate | null;
  readonly start: ParsedTime;
  /** null when the text gives only a start — never invented. */
  readonly end: ParsedTime | null;
  readonly location: string | null;
  readonly locationSource: LocationSource | null;
  /** The rest of the line (e.g. "אחרי בית ספר"), kept as details; never turned into a title here. */
  readonly details: string | null;
  /** A type the wording strongly suggests (e.g. "משחק" → GAME). A suggestion only — shown, never applied. */
  readonly suggestedType: BuiltinActivityType | null;
}

export type UnparsedReason = 'NO_TIME' | 'NO_DAY' | 'INVALID_TIME';

export interface UnparsedLine {
  readonly line: number;
  readonly text: string;
  readonly reason: UnparsedReason;
}

export interface ParseResult {
  readonly sessions: readonly ParsedSession[];
  /** Lines that look like part of a schedule but could not be turned into a session. */
  readonly unparsed: readonly UnparsedLine[];
  /** A location the message gives for every session ("כל האימונים בעין כרמל"), if any. */
  readonly messageLocation: string | null;
}

export interface ParseOptions {
  /** First day of the chosen week; resolves the year of a date written without one. */
  readonly weekStart: CalendarDate;
}

// ------------------------------------------------------------------ weekdays

const WEEKDAY_WORDS: readonly (readonly [string, Weekday])[] = [
  ['ראשון', 0],
  ['שני', 1],
  ['שלישי', 2],
  ['רביעי', 3],
  ['חמישי', 4],
  ['שישי', 5],
  ['שבת', 6],
];
const WEEKDAY_LETTERS: Readonly<Record<string, Weekday>> = { א: 0, ב: 1, ג: 2, ד: 3, ה: 4, ו: 5, ש: 6 };

/** How a weekday appeared: after "יום" (strong), joined to a previous one ("ורביעי"), or bare. */
type MentionKind = 'DAY_WORD' | 'BARE';

interface Mention {
  readonly weekday: Weekday;
  readonly start: number; // incl. a "יום / ביום" prefix
  readonly end: number;
  readonly kind: MentionKind;
  readonly conjunction: boolean;
}

const DAY_PREFIX = /(?:^|[^א-ת])(ביום|יום|בימי|ימי)[\s-]*$/;

function weekdayMentions(line: string): Mention[] {
  const found: Mention[] = [];
  const consider = (index: number, length: number, weekday: Weekday, letterForm: boolean) => {
    let s = index;
    let conjunction = false;
    // An attached "ו" (and): "ורביעי".
    if (s > 0 && line[s - 1] === 'ו' && !isHebrewLetter(line[s - 2])) {
      s -= 1;
      conjunction = true;
    }
    if (isHebrewLetter(line[s - 1])) return; // inside a word
    if (isHebrewLetter(line[index + length])) return;
    const prefix = conjunction ? null : DAY_PREFIX.exec(line.slice(0, s));
    if (letterForm && prefix === null && line[index + 1] !== GERESH) return; // bare letter needs a geresh
    found.push({
      weekday,
      // A "יום / ביום" prefix belongs to the mention (removed from the details with it).
      start: prefix ? line.lastIndexOf(prefix[1]!, s - 1) : s,
      end: index + length,
      kind: prefix ? 'DAY_WORD' : 'BARE',
      conjunction,
    });
  };
  for (const [word, weekday] of WEEKDAY_WORDS) {
    let at = line.indexOf(word);
    while (at !== -1) {
      consider(at, word.length, weekday, false);
      at = line.indexOf(word, at + 1);
    }
  }
  // Letter forms: "א׳" … "ש׳", or after "יום": "יום א".
  for (let i = 0; i < line.length; i++) {
    const weekday = WEEKDAY_LETTERS[line[i]!];
    if (weekday === undefined) continue;
    const withGeresh = line[i + 1] === GERESH;
    consider(i, withGeresh ? 2 : 1, weekday, true);
  }
  // Overlapping finds (e.g. a word and its first letter) keep the earliest, longest one.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Mention[] = [];
  for (const m of found) {
    const last = kept[kept.length - 1];
    if (last === undefined || m.start >= last.end) kept.push(m);
  }
  return kept;
}

/**
 * The weekdays a line is about. Strong mentions ("יום שני", "ביום ד׳") win;
 * otherwise a bare weekday counts only at the very start of the line
 * ("ראשון- אחרי בית ספר"), so "שני אימונים" (two trainings) mid-text is not
 * Monday. Mentions chained right after an accepted one ("שני ורביעי",
 * "ב׳, ד׳") are accepted too.
 */
function selectWeekdays(line: string, mentions: readonly Mention[]): Mention[] {
  if (mentions.length === 0) return [];
  const strong = mentions.filter((m) => m.kind === 'DAY_WORD');
  // A bare weekday must open the line and be followed by a separator, a digit or nothing
  // ("ראשון- …", "שני 18:00", "ד׳: …") — not by another word ("שני אימונים" = two trainings).
  const chainedAfter = (m: Mention) =>
    mentions.some((n) => n.start >= m.end && /^[\s,ו-]*$/.test(line.slice(m.end, n.start)));
  const opensLine = (m: Mention) =>
    !/[א-ת\d]/.test(line.slice(0, m.start)) &&
    (!isHebrewLetter(line.slice(m.end).trimStart()[0]) || chainedAfter(m));
  const anchors = strong.length > 0 ? strong : mentions.filter(opensLine);
  if (anchors.length === 0) return [];
  const chosen: Mention[] = [];
  for (const m of mentions) {
    if (anchors.includes(m)) {
      chosen.push(m);
      continue;
    }
    const previous = chosen[chosen.length - 1];
    if (previous && /^[\s,ו-]*$/.test(line.slice(previous.end, m.start))) chosen.push(m);
  }
  return chosen;
}

// --------------------------------------------------------------------- times

interface TimeToken {
  readonly start: number;
  readonly end: number;
  readonly time: ParsedTime | null; // null = malformed (e.g. 25:00)
}

function timeTokens(line: string): TimeToken[] {
  const out: TimeToken[] = [];
  const re = /(\d{1,2}):(\d{2})/g;
  for (let m = re.exec(line); m !== null; m = re.exec(line)) {
    const start = m.index;
    const end = start + m[0].length;
    if (isDigit(line[start - 1]) || line[start - 1] === ':' || isDigit(line[end])) continue;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    out.push({ start, end, time: hour <= 23 && minute <= 59 ? { hour, minute } : null });
  }
  return out;
}

const RANGE_JOINER = /^\s*(?:-|עד(?:\s+השעה)?|ל-?)\s*$/;
const TIME_PREPOSITION = /(^|[\s,-])(בשעה|משעה|מהשעה|מ|ב)[\s-]*$/;

interface Slot {
  readonly start: ParsedTime;
  readonly end: ParsedTime | null;
  readonly spanStart: number;
  readonly spanEnd: number;
}

function timeSlots(line: string, tokens: readonly TimeToken[]): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i]!;
    if (first.time === null) continue;
    const next = tokens[i + 1];
    const isRange = next !== undefined && next.time !== null && RANGE_JOINER.test(line.slice(first.end, next.start));
    const prep = TIME_PREPOSITION.exec(line.slice(0, first.start));
    const spanStart = prep ? prep.index + prep[1]!.length : first.start;
    if (isRange) {
      slots.push({ start: first.time, end: next.time, spanStart, spanEnd: next.end });
      i += 1;
    } else {
      slots.push({ start: first.time, end: null, spanStart, spanEnd: first.end });
    }
  }
  return slots;
}

// --------------------------------------------------------------------- dates

interface DateToken {
  readonly start: number;
  readonly end: number;
  readonly date: CalendarDate;
}

/** The year that puts day/month closest to the chosen week (handles a December/January week). */
function nearestYear(day: number, month: number, weekStart: CalendarDate): CalendarDate | null {
  let best: CalendarDate | null = null;
  for (const year of [weekStart.year - 1, weekStart.year, weekStart.year + 1]) {
    const d = calendarDate(year, month, day);
    if (d === null) continue;
    if (best === null || Math.abs(daysBetween(weekStart, d)) < Math.abs(daysBetween(weekStart, best))) best = d;
  }
  return best;
}

function dateTokens(line: string, times: readonly TimeToken[], weekStart: CalendarDate): DateToken[] {
  const out: DateToken[] = [];
  const re = /(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?/g;
  for (let m = re.exec(line); m !== null; m = re.exec(line)) {
    const start = m.index;
    const end = start + m[0].length;
    const before = line[start - 1];
    if (isDigit(before) || before === ':' || before === '.' || before === '/' || isDigit(line[end]) || line[end] === ':') continue;
    if (times.some((t) => start < t.end && end > t.start)) continue; // part of a time ("18:40-20:10")
    const day = Number(m[1]);
    const month = Number(m[2]);
    const yearText = m[3];
    const date =
      yearText === undefined
        ? nearestYear(day, month, weekStart)
        : calendarDate(yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText), month, day);
    if (date !== null) out.push({ start, end, date });
  }
  return out;
}

// ------------------------------------------------------------------ location

/** Words starting with ב that are not "at <place>" ("בית ספר" is not "at ית ספר"). */
const NOT_A_PLACE = new Set([
  'בית', 'בבית', 'בוקר', 'בבוקר', 'בערב', 'בצהריים', 'בצהרים', 'בלילה', 'בשעה', 'ביום', 'בימי', 'בשבוע',
  'בהצלחה', 'בשורות', 'בריאות', 'ברוך', 'ברוכים', 'בגלל', 'בלי', 'בערך', 'בדיוק', 'בזמן', 'בכל', 'בנוסף',
  'בקבוצה', 'במקום', 'בהמשך', 'בבקשה', 'ביחד',
]);

function cleanPlace(text: string): string | null {
  const place = text.replace(/^[\s:,.\-–]+|[\s:,.!?\-–]+$/g, '').replace(/\s+/g, ' ');
  return place.length > 0 && /[א-תA-Za-z]/.test(place) ? place : null;
}

/** "כל האימונים בעין כרמל", "האימונים יתקיימו ב…", "מיקום: …", "📍 …" — a location for every session. */
function messageLocationOf(rawLine: string, line: string): string | null {
  if (rawLine.includes(LOCATION_PIN)) return cleanPlace(line);
  const labelled = /^(?:מיקום|מקום)\s*:\s*(.+)$/.exec(line);
  if (labelled) return cleanPlace(labelled[1]!);
  const all = /^(?:כל\s+)?ה?אימונים\s+(?:יתקיימו\s+|יהיו\s+)?ב[-\s]?([א-ת].*)$/.exec(line);
  return all ? cleanPlace(all[1]!) : null;
}

/** The trailing "ב<place>" of what is left of a line: "משחק … בעין כרמל" → ["עין כרמל", "משחק …"]. */
function splitLineLocation(rest: string): { location: string | null; details: string } {
  const words = rest.split(' ').filter((w) => w.length > 0);
  for (let i = words.length - 1; i >= Math.max(0, words.length - 3); i--) {
    const word = words[i]!;
    if (word === 'ב' || word === 'ב-') {
      const place = cleanPlace(words.slice(i + 1).join(' '));
      if (place) return { location: place, details: words.slice(0, i).join(' ') };
      continue;
    }
    if (word.startsWith('ב') && word.length >= 3 && isHebrewLetter(word[1] === '-' ? word[2] : word[1])) {
      if (NOT_A_PLACE.has(word)) return { location: null, details: rest };
      const place = cleanPlace([word.replace(/^ב-?/, ''), ...words.slice(i + 1)].join(' '));
      if (place) return { location: place, details: words.slice(0, i).join(' ') };
    }
  }
  return { location: null, details: rest };
}

// ---------------------------------------------------------------------- type

function suggestType(details: string | null): BuiltinActivityType | null {
  if (details === null) return null;
  if (/משחק/.test(details)) return 'GAME';
  if (/חדר\s*כושר|אימון\s*כוח/.test(details)) return 'GYM';
  if (/אימון\s*אישי/.test(details)) return 'PERSONAL_TRAINING';
  if (/התאוששות/.test(details)) return 'RECOVERY';
  return null;
}

// ---------------------------------------------------------------------- main

function removeSpans(line: string, spans: readonly (readonly [number, number])[]): string {
  let out = '';
  let at = 0;
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (s > at) out += line.slice(at, s);
    out += ' ';
    at = Math.max(at, e);
  }
  out += line.slice(at);
  return out;
}

function tidyDetails(text: string): string | null {
  const t = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,.\-–]+|[\s:,.\-–]+$/g, '')
    .replace(/^(?:יום|ביום)$/, '')
    .trim();
  return t.length > 0 && new RegExp(`[${HEBREW_LETTER}A-Za-z]`).test(t) ? t : null;
}

export function parseSchedule(raw: string, options: ParseOptions): ParseResult {
  const rawLines = normalizeMessage(raw).split('\n');
  const sessions: ParsedSession[] = [];
  const unparsed: UnparsedLine[] = [];
  let messageLocation: string | null = null;
  // A day named alone on its line, waiting for a time on the next line ("יום שני" ↵ "18:40-20:10").
  let pending: { weekdays: Weekday[]; dates: CalendarDate[]; lineNo: number; text: string } | null = null;

  rawLines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = cleanLine(rawLine);
    if (line.length === 0) return;

    const tokens = timeTokens(line);
    const slots = timeSlots(line, tokens);
    const dates = dateTokens(line, tokens, options.weekStart);
    const weekdays = selectWeekdays(line, weekdayMentions(line));

    if (slots.length === 0) {
      if (pending) unparsed.push({ line: pending.lineNo, text: pending.text, reason: 'NO_TIME' });
      pending = null;
      if (weekdays.length > 0 || dates.length > 0) {
        if (tokens.length > 0) {
          unparsed.push({ line: lineNo, text: rawLine.trim(), reason: 'INVALID_TIME' });
        } else if (tidyDetails(removeSpans(line, [...weekdays, ...dates].map((t) => [t.start, t.end] as const))) === null) {
          // Only a day: its time may be on the next line.
          pending = { weekdays: weekdays.map((w) => w.weekday), dates: dates.map((d) => d.date), lineNo, text: rawLine.trim() };
        } else {
          unparsed.push({ line: lineNo, text: rawLine.trim(), reason: 'NO_TIME' });
        }
        return;
      }
      const place = messageLocationOf(rawLine, line);
      if (place !== null && messageLocation === null) messageLocation = place;
      return; // greeting / announcement / emoji: nothing
    }

    let dayWeekdays = weekdays.map((w) => w.weekday);
    let dayDates = dates.map((d) => d.date);
    if (dayWeekdays.length === 0 && dayDates.length === 0 && pending !== null) {
      dayWeekdays = pending.weekdays;
      dayDates = pending.dates;
    } else if (pending !== null) {
      unparsed.push({ line: pending.lineNo, text: pending.text, reason: 'NO_TIME' });
    }
    pending = null;
    if (dayWeekdays.length === 0 && dayDates.length === 0) {
      unparsed.push({ line: lineNo, text: rawLine.trim(), reason: 'NO_DAY' });
      return;
    }

    const spans: (readonly [number, number])[] = [
      ...weekdays.map((w) => [w.start, w.end] as const),
      ...dates.map((d) => [d.start, d.end] as const),
      ...slots.map((s) => [s.spanStart, s.spanEnd] as const),
    ];
    const rest = tidyDetails(removeSpans(line, spans)) ?? '';
    const split = splitLineLocation(rest);
    const details = tidyDetails(split.details);
    const location = split.location ?? null;

    // Explicit dates are the stronger evidence; a single weekday next to a single date is kept for the mismatch check.
    const days: { weekday: Weekday | null; date: CalendarDate | null }[] =
      dayDates.length > 0
        ? dayDates.map((date) => ({ weekday: dayDates.length === 1 && dayWeekdays.length === 1 ? dayWeekdays[0]! : null, date }))
        : dayWeekdays.map((weekday) => ({ weekday, date: null }));

    for (const day of days) {
      for (const slot of slots) {
        sessions.push({
          key: `s${sessions.length + 1}`,
          line: lineNo,
          sourceText: rawLine.trim(),
          weekday: day.weekday,
          explicitDate: day.date,
          start: slot.start,
          end: slot.end,
          location,
          locationSource: location !== null ? 'LINE' : null,
          details,
          suggestedType: suggestType(details),
        });
      }
    }
  });
  if (pending !== null) {
    const p = pending as { lineNo: number; text: string };
    unparsed.push({ line: p.lineNo, text: p.text, reason: 'NO_TIME' });
  }

  // The message-wide location fills sessions that have none of their own (a line's own place wins).
  const filled =
    messageLocation === null
      ? sessions
      : sessions.map((s) =>
          s.location === null ? { ...s, location: messageLocation, locationSource: 'MESSAGE' as const } : s,
        );
  return { sessions: filled, unparsed, messageLocation };
}
