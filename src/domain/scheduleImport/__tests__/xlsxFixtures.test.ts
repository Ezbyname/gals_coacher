import { calendarDate } from '@/domain/calendarDate';
import { buildXlsx, FIXTURE_HEADER, FIXTURE_ROWS, HOF, MAAYAN } from '@/test-support/buildXlsx';

import {
  columnIndex,
  excelSerialDate,
  findHeader,
  findTeam,
  fixtureCandidates,
  fixtureTeams,
  readDate,
  readFixtures,
  readTime,
  readWorkbook,
  XlsxReadError,
} from '..';

const league = (rows = FIXTURE_ROWS, header = FIXTURE_HEADER) => readWorkbook(buildXlsx([{ name: '2026', rows: [header, ...rows] }]));
const fixturesOf = (wb = league()) => {
  const sheet = wb.sheets[0]!;
  const header = findHeader(sheet);
  if (!header.ok) throw new Error(`missing ${header.missing.join()}`);
  return readFixtures(sheet, header, wb.date1904);
};

describe('XLSX reader (pure, local)', () => {
  it('reads sheet names and every cell (shared strings, numbers); blank cells are null', () => {
    const wb = readWorkbook(buildXlsx([{ name: 'A', rows: [['x', 1, null, 'y']] }, { name: 'Second', rows: [['z']] }]));
    expect(wb.sheets.map((s) => s.name)).toEqual(['A', 'Second']);
    expect(wb.sheets[0]!.rows[0]).toEqual({ number: 1, cells: ['x', 1, null, 'y'] });
    expect(wb.date1904).toBe(false);
  });

  it('column letters → indexes; XML entities and Hebrew survive', () => {
    expect([columnIndex('A'), columnIndex('Z'), columnIndex('AA'), columnIndex('AM')]).toEqual([0, 25, 26, 38]);
    const wb = readWorkbook(buildXlsx([{ name: 'ש', rows: [['ביה"ס <תחכמוני> & בית']] }]));
    expect(wb.sheets[0]!.rows[0]!.cells[0]).toBe('ביה"ס <תחכמוני> & בית');
  });

  it('a file that is not a workbook is a clear error, never a guess', () => {
    expect(() => readWorkbook(new Uint8Array([1, 2, 3]))).toThrow(XlsxReadError);
  });
});

describe('fixture columns — recognised by header, never by position', () => {
  it('maps the real league header (Hebrew + English names)', () => {
    const header = findHeader(league().sheets[0]!);
    expect(header).toMatchObject({ ok: true, headerRow: 1, columns: { date: 3, time: 5, home: 6, away: 8, venue: 10, code: 1, homeCode: 7, awayCode: 9, league: 0, round: 4, weekday: 2 } });
  });

  it('finds a header under a title row and accepts Hebrew aliases', () => {
    const wb = readWorkbook(buildXlsx([{ name: 'S', rows: [['לוח משחקים 2026'], ['קבוצת בית', 'קבוצת חוץ', 'תאריך', 'שעה', 'מיקום'], [HOF, 'מכבי מי עמי', '19-11-2026', '19:00', 'אולם']] }]));
    const header = findHeader(wb.sheets[0]!);
    expect(header).toMatchObject({ ok: true, headerRow: 2, columns: { home: 0, away: 1, date: 2, time: 3, venue: 4 } });
  });

  it('missing required columns → which ones, nothing guessed', () => {
    const wb = readWorkbook(buildXlsx([{ name: 'S', rows: [['Date', 'Home Team', 'Venue']] }]));
    expect(findHeader(wb.sheets[0]!)).toEqual({ ok: false, missing: ['time', 'away'] });
  });
});

describe('dates and times exactly as written', () => {
  it('DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY and Excel date cells (1900 and 1904 systems)', () => {
    expect(readDate('22-10-2026', false)).toEqual(calendarDate(2026, 10, 22));
    expect(readDate('29/10/2026', false)).toEqual(calendarDate(2026, 10, 29));
    expect(readDate('05.11.2026', false)).toEqual(calendarDate(2026, 11, 5));
    expect(readDate(46317, false)).toEqual(calendarDate(2026, 10, 22)); // Excel serial
    expect(excelSerialDate(46317 - 1462, true)).toEqual(calendarDate(2026, 10, 22));
    expect(readDate('31-02-2026', false)).toBeNull(); // impossible date: never moved
    expect(readDate('22-10', false)).toBeNull(); // no year: never inferred
  });

  it('times as text or Excel fractions; never an invented end', () => {
    expect(readTime('17:30')).toEqual({ hour: 17, minute: 30 });
    expect(readTime('7:05')).toEqual({ hour: 7, minute: 5 });
    expect(readTime('19:00:00')).toEqual({ hour: 19, minute: 0 });
    expect(readTime(0.729166666666667)).toEqual({ hour: 17, minute: 30 });
    expect(readTime('25:00')).toBeNull();
  });
});

describe("the Player's team — exact match, by code within the file", () => {
  it('6 games → teams with their codes; HOF has exactly 4 games (never the prefix-sharing club)', () => {
    const { fixtures, rejected } = fixturesOf();
    expect(rejected).toEqual([]);
    expect(fixtures).toHaveLength(6);
    const teams = fixtureTeams(fixtures);
    expect(teams).toContainEqual({ name: HOF, code: '12157' });
    expect(teams).toContainEqual({ name: MAAYAN, code: '12696' });
    const match = findTeam(HOF, teams);
    if (match.kind !== 'EXACT') throw new Error(match.kind);
    const games = fixtureCandidates(fixtures, match.team, 'GAME');
    expect(games.map((g) => g.title)).toEqual([
      `מכבי חדרה מרכז – ${HOF}`,
      `${HOF} – הפועל ג'סר אלזרקא`,
      `${HOF} – ${MAAYAN}`,
      `הפועל אור עקיבא דור העתיד – ${HOF}`,
    ]);
    expect(games.map((g) => g.matchup!.side)).toEqual(['AWAY', 'HOME', 'HOME', 'AWAY']);
  });

  it('every candidate keeps its own venue, explicit date / time, no end, GAME suggested, XLSX provenance', () => {
    const { fixtures } = fixturesOf();
    const [first, second] = fixtureCandidates(fixtures, { name: HOF, code: '12157' }, 'TEAM_TRAINING');
    expect(first).toMatchObject({
      date: calendarDate(2026, 10, 22),
      dateFrom: 'EXPLICIT_DATE',
      textWeekday: null,
      start: { hour: 17, minute: 30 },
      end: null,
      location: 'ביה"ס תחכמוני, חדרה',
      details: null,
      type: 'TEAM_TRAINING', // the user's choice; GAME is only suggested
      suggestedType: 'GAME',
      source: { kind: 'XLSX', ref: '2026!2', externalId: '791001' },
    });
    expect(second!.location).toBe('ביה"ס כרמל וים, קיבוץ עין כרמל');
  });

  it('without team codes the exact normalized NAME decides (still never "contains")', () => {
    const noCodes = FIXTURE_ROWS.map((r) => r.map((v, i) => (i === 7 || i === 9 ? null : v)));
    const { fixtures } = fixturesOf(league(noCodes));
    const games = fixtureCandidates(fixtures, { name: '  הפועל  חוף הכרמל ', code: null }, 'GAME');
    expect(games).toHaveLength(4);
  });

  it('an unreadable row is reported, never silently dropped', () => {
    const bad = [...FIXTURE_ROWS, ['ילדים א', 1, '', 'לא תאריך', 4, '19:00', HOF, 12157, 'מכבי מי עמי', 13621, 'אולם', null, null]];
    expect(fixturesOf(league(bad)).rejected).toEqual([expect.objectContaining({ ref: '2026!8', reason: 'DATE_UNREADABLE' })]);
  });

  it('an explicit End column is used when present (otherwise end stays null)', () => {
    const wb = readWorkbook(buildXlsx([{ name: 'S', rows: [['Date', 'Time', 'End Time', 'Home', 'Away'], ['19-11-2026', '19:00', '20:30', HOF, 'מכבי מי עמי']] }]));
    const header = findHeader(wb.sheets[0]!);
    if (!header.ok) throw new Error('header');
    const [game] = fixtureCandidates(readFixtures(wb.sheets[0]!, header, false).fixtures, { name: HOF, code: null }, 'GAME');
    expect(game!.end).toEqual({ hour: 20, minute: 30 });
  });
});
