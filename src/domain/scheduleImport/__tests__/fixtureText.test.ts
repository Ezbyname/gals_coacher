import { calendarDate } from '@/domain/calendarDate';
import { candidateIssues } from '@/domain/calendarImport';
import { WHATSAPP_EXAMPLE_1, WHATSAPP_EXAMPLE_2 } from '@/domain/calendarImport/__tests__/whatsappFixtures';

import { findTeam, fixtureCandidates, fixtureTeams, readFixtureText, readMatchup } from '..';

import { HOF_SEASON_TEXT } from './seasonFixtures';

const HOF = 'הפועל חוף הכרמל';
const MAAYAN = 'הפועל חוף הכרמל מעיין צבי';

describe('season fixture text (CAL-SCHEDULE-IMPORT-002C) — the owner\'s real 22-game list', () => {
  const read = readFixtureText(HOF_SEASON_TEXT);

  it('is detected with HIGH confidence: 22 fixtures, nothing rejected; the header / season / "22 games" lines are not fixtures', () => {
    expect(read.confidence).toBe('HIGH');
    expect(read.fixtures).toHaveLength(22);
    expect(read.rejected).toEqual([]);
    expect(read.fixtures[0]!.line).toBe(5); // the first numbered entry, after the 3 header lines + a blank line
    expect(read.fixtures.every((f) => f.sourceKind === 'TEXT' && f.code === null)).toBe(true);
  });

  it('explicit dates and start times are exactly as written; no end; each fixture keeps ITS own location', () => {
    const [first, second, , , , , , , , , , , , fourteenth, , , , , , , , last] = read.fixtures;
    expect(first).toMatchObject({
      date: calendarDate(2026, 10, 22), start: { hour: 17, minute: 30 }, end: null, writtenWeekday: 4,
      home: { name: 'מכבי חדרה מרכז', code: null }, away: { name: HOF, code: null },
      venue: 'ביה"ס תחכמוני, רח\' יצחק כושי עפגין 15, חדרה',
    });
    expect(second).toMatchObject({ date: calendarDate(2026, 10, 29), start: { hour: 19, minute: 0 }, venue: 'ביה"ס כרמל וים, קיבוץ עין כרמל' });
    expect(second!.away.name).toBe("הפועל ג'סר אלזרקא"); // the apostrophe exactly as written
    expect(fourteenth).toMatchObject({ date: calendarDate(2027, 2, 18), start: { hour: 18, minute: 0 }, venue: "אולם ספורט, ג'סר אל זרקא" });
    expect(last).toMatchObject({ date: calendarDate(2027, 5, 13), start: { hour: 19, minute: 30 }, venue: 'ביה"ס דרור, שד\' ירושלים, אור עקיבא' });
    expect(new Set(read.fixtures.map((f) => f.venue)).size).toBeGreaterThan(5);
  });

  it("the Player's team (exact, never contains): all 22 are HOF's; HOME / AWAY; full \"Home – Away\" titles; GAME suggested", () => {
    const teams = fixtureTeams(read.fixtures);
    expect(teams).toContainEqual({ name: MAAYAN, code: null });
    const match = findTeam(HOF, teams);
    if (match.kind !== 'EXACT') throw new Error(match.kind);
    const games = fixtureCandidates(read.fixtures, match.team, 'GAME');
    expect(games).toHaveLength(22);
    expect(games.filter((g) => g.matchup!.side === 'HOME')).toHaveLength(11);
    expect(games[0]).toMatchObject({ title: `מכבי חדרה מרכז – ${HOF}`, location: 'ביה"ס תחכמוני, רח\' יצחק כושי עפגין 15, חדרה', end: null,
      matchup: { side: 'AWAY' }, suggestedType: 'GAME', textWeekday: 4, dateFrom: 'EXPLICIT_DATE', source: { kind: 'TEXT', ref: 'line 5' } });
    expect(games[2]).toMatchObject({ title: `${HOF} – ${MAAYAN}`, matchup: { side: 'HOME' } });
    expect(games[11]).toMatchObject({ title: `${MAAYAN} – ${HOF}`, matchup: { side: 'AWAY' } });
    // Maayan Tzvi's OWN team: only the two games against HOF exist in this list.
    const maayan = findTeam(MAAYAN, teams);
    if (maayan.kind !== 'EXACT') throw new Error(maayan.kind);
    expect(fixtureCandidates(read.fixtures, maayan.team, 'GAME')).toHaveLength(2);
  });

  it('every weekday written in the list agrees with its date: no review issue from it', () => {
    const games = fixtureCandidates(read.fixtures, { name: HOF, code: null }, 'GAME');
    for (const g of games) expect(candidateIssues(g, null, { duplicate: false, today: calendarDate(2026, 10, 13) })).toEqual(['END_TIME_MISSING']);
  });
});

describe('detection and the rules around it', () => {
  it('the weekly WhatsApp schedules are NOT fixture lists (weekly import unchanged)', () => {
    expect(readFixtureText(WHATSAPP_EXAMPLE_1).confidence).toBe('NONE');
    expect(readFixtureText(WHATSAPP_EXAMPLE_2).confidence).toBe('NONE');
  });

  it('a single dated matchup is only LOW (ask the user), never silently a fixture list', () => {
    expect(readFixtureText('משחק ידידות\n15-11-2026 18:00\nמכבי מי עמי – הפועל חוף הכרמל').confidence).toBe('LOW');
  });

  it('a written weekday that disagrees: the explicit date is KEPT and the candidate is flagged for review', () => {
    const r = readFixtureText('1. יום שלישי, 22-10-2026 | 17:30\nא – ב\n2. יום חמישי, 29-10-2026 | 19:00\nג – ד');
    const [wrong] = fixtureCandidates(r.fixtures, { name: 'ב', code: null }, 'GAME');
    expect(wrong!.date).toEqual(calendarDate(2026, 10, 22)); // a Thursday; "Tuesday" was written
    expect(candidateIssues(wrong!, null, { duplicate: false, today: calendarDate(2026, 10, 13) })).toContain('WEEKDAY_DATE_MISMATCH');
  });

  it('a past fixture is BLOCKING (edit the date or remove — never keep anyway)', () => {
    const r = readFixtureText('1. 01-10-2026 18:00\nא – ב\n2. 29-10-2026 19:00\nב – ג');
    const [past] = fixtureCandidates(r.fixtures, { name: 'ב', code: null }, 'GAME');
    expect(candidateIssues(past!, null, { duplicate: false, today: calendarDate(2026, 10, 13) })).toContain('DATE_IN_PAST');
  });

  it('separators: "–", "—", spaced "-", "נגד", "vs"; a hyphenated name stays whole; non-matchups are refused', () => {
    for (const line of ['א – ב', 'א — ב', 'א - ב', 'א נגד ב', 'א vs ב', 'א VS. ב']) expect(readMatchup(line)).toEqual({ home: 'א', away: 'ב' });
    expect(readMatchup('הפועל דור-העתיד – מכבי א')).toEqual({ home: 'הפועל דור-העתיד', away: 'מכבי א' });
    for (const line of ['מיקום: אולם – צפון', 'סך הכול: 22 משחקים', '22-10-2026 – 17:30', 'א – ב – ג', '']) expect(readMatchup(line)).toBeNull();
  });

  it('an entry without a time or a matchup, or with an impossible date, is reported — never invented', () => {
    const r = readFixtureText('1. 22-10-2026\nא – ב\n2. 31-02-2027 19:00\nג – ד\n3. 05-11-2026 19:00\nרק טקסט\n4. 12-11-2026 19:00\nה – ו');
    expect(r.rejected.map((x) => x.reason)).toEqual(['TIME_UNREADABLE', 'DATE_UNREADABLE', 'TEAM_MISSING']);
    expect(r.fixtures).toHaveLength(1);
  });

  it('an explicit time range keeps its end; otherwise end stays NULL', () => {
    const r = readFixtureText('1. 22-10-2026 | 17:30-19:00\nא – ב\n2. 29-10-2026 | 19:00\nג – ד');
    expect(r.fixtures.map((f) => f.end)).toEqual([{ hour: 19, minute: 0 }, null]);
  });
});
