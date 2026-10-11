import { readFileSync } from 'node:fs';

import { findHeader, findTeam, fixtureCandidates, fixtureTeams, readFixtures, readWorkbook } from '..';

/**
 * LOCAL ACCEPTANCE (not part of `npm test`): the owner's real league workbook,
 * read from the path in GC_ACCEPTANCE_XLSX (never committed). Run with:
 *   GC_ACCEPTANCE_XLSX=<path> npx jest --testMatch "**\/__acceptance__/**" --testPathIgnorePatterns "/node_modules/"
 */
const path = process.env.GC_ACCEPTANCE_XLSX;

(path ? describe : describe.skip)('real workbook acceptance — 22 of 132 for הפועל חוף הכרמל', () => {
  it('one sheet, 132 games, 12 teams; exact team → exactly 22 candidates (never the 42 of "contains")', () => {
    const wb = readWorkbook(new Uint8Array(readFileSync(path!)));
    expect(wb.sheets.map((s) => s.name)).toEqual(['2026']);
    const sheet = wb.sheets[0]!;
    const header = findHeader(sheet);
    if (!header.ok) throw new Error(`header: missing ${header.missing.join(', ')}`);
    const { fixtures, rejected } = readFixtures(sheet, header, wb.date1904);
    expect(rejected).toEqual([]);
    expect(fixtures).toHaveLength(132);
    const teams = fixtureTeams(fixtures);
    expect(teams).toHaveLength(12);

    const match = findTeam('הפועל חוף הכרמל', teams);
    if (match.kind !== 'EXACT') throw new Error(`team match ${match.kind}`);
    expect(match.team.code).toBe('12157');
    const games = fixtureCandidates(fixtures, match.team, 'GAME');
    expect(games).toHaveLength(22);

    // Never the prefix-sharing club.
    expect(games.every((g) => g.matchup!.home === 'הפועל חוף הכרמל' || g.matchup!.away === 'הפועל חוף הכרמל')).toBe(true);
    const contains = fixtures.filter((f) => `${f.home.name}|${f.away.name}`.includes('הפועל חוף הכרמל'));
    expect(contains).toHaveLength(42);

    const first = games[0]!;
    expect(first).toMatchObject({
      date: { year: 2026, month: 10, day: 22 },
      start: { hour: 17, minute: 30 },
      end: null,
      title: 'מכבי חדרה מרכז – הפועל חוף הכרמל',
      location: 'ביה"ס תחכמוני, רח\' יצחק כושי עפגין 15, חדרה',
      matchup: { side: 'AWAY' },
      source: { kind: 'XLSX' },
    });
    const home = games.find((g) => g.matchup!.home === 'הפועל חוף הכרמל')!;
    expect(home.matchup!.side).toBe('HOME');
    expect(new Set(games.map((g) => g.location)).size).toBeGreaterThan(1); // each row owns its venue
    process.stdout.write(
      `ACCEPTANCE: sheets=${wb.sheets.length} games=${fixtures.length} teams=${teams.length} selected=${games.length} contains=${contains.length} ` +
        `HOME=${games.filter((g) => g.matchup!.side === 'HOME').length} AWAY=${games.filter((g) => g.matchup!.side === 'AWAY').length} ` +
        `firstDate=${games[0]!.date.day}/${games[0]!.date.month}/${games[0]!.date.year} lastDate=${games.at(-1)!.date.day}/${games.at(-1)!.date.month}/${games.at(-1)!.date.year}\n`,
    );
  });
});
