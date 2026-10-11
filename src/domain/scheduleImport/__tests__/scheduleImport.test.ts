import { calendarDate } from '@/domain/calendarDate';
import { buildCandidates, nextImportWeek, parseSchedule } from '@/domain/calendarImport';
import { WHATSAPP_EXAMPLE_1 } from '@/domain/calendarImport/__tests__/whatsappFixtures';

import {
  distinctTeams,
  findTeam,
  matchupTitle,
  normalizeTeamName,
  sameTeam,
  sideOf,
  weeklyTextAdapter,
  type SourceTeam,
} from '..';

const HOF = 'הפועל חוף הכרמל';
const MAAYAN = 'הפועל חוף הכרמל מעיין צבי';
const team = (name: string, code: string | null = null): SourceTeam => ({ name, code });

describe('team names — exact normalized match, never "contains"', () => {
  it('presentation differences only: spaces, direction marks, geresh / quote / dash look-alikes, Latin case', () => {
    expect(normalizeTeamName(`  הפועל   חוף\u200f הכרמל `)).toBe(normalizeTeamName(HOF));
    expect(sameTeam("הפועל ג'סר אלזרקא", 'הפועל ג׳סר אלזרקא')).toBe(true);
    expect(sameTeam('Maccabi  Tel-Aviv', 'maccabi tel\u2013aviv')).toBe(true);
  });

  it('a longer name that CONTAINS the team is a different team', () => {
    expect(sameTeam(HOF, MAAYAN)).toBe(false);
    expect(findTeam(HOF, [team(MAAYAN, '12696'), team(HOF, '12157')])).toEqual({ kind: 'EXACT', team: team(HOF, '12157') });
    expect(findTeam('הפועל חוף', [team(MAAYAN), team(HOF)])).toEqual({ kind: 'NONE' });
    expect(sameTeam('', '')).toBe(false); // an empty name never matches
  });

  it('two different source teams with the same name (different codes) are AMBIGUOUS — the user chooses', () => {
    const r = findTeam(HOF, [team(HOF, '1'), team(HOF, '2'), team(HOF, '1')]);
    expect(r).toEqual({ kind: 'AMBIGUOUS', teams: [team(HOF, '1'), team(HOF, '2')] });
  });

  it('distinct teams keep first-seen order and drop blanks', () => {
    expect(distinctTeams([team('B', '2'), team('A', '1'), team(' b ', '2'), team('  ', null)])).toEqual([team('B', '2'), team('A', '1')]);
  });
});

describe('HOME / AWAY — derived from the selected team, never ownership', () => {
  const hof = team(HOF, '12157');
  it('by source code when every side has one, else by exact name', () => {
    expect(sideOf(hof, team('מכבי חדרה מרכז', '12884'), team(HOF, '12157'))).toBe('AWAY');
    expect(sideOf(hof, team(HOF, '12157'), team("הפועל ג'סר אלזרקא", '13590'))).toBe('HOME');
    expect(sideOf(hof, team(MAAYAN, '12696'), team('מכבי מי עמי', '13621'))).toBeNull();
    expect(sideOf(team(HOF), team(MAAYAN), team(HOF))).toBe('AWAY'); // names only
    expect(sideOf(team(HOF), team(MAAYAN), team('מכבי מי עמי'))).toBeNull();
  });
  it('the fixture title is "Home – Away" exactly as written', () => {
    expect(matchupTitle({ home: 'מכבי חדרה מרכז ', away: HOF })).toBe('מכבי חדרה מרכז – הפועל חוף הכרמל');
  });
});

describe('source adapter boundary', () => {
  const week = nextImportWeek(calendarDate(2026, 10, 9)!);
  const context = { type: 'TEAM_TRAINING', week, today: calendarDate(2026, 10, 9)! };

  it('the weekly WhatsApp text import behind the boundary: the same candidates, tagged TEXT, no matchup', () => {
    const { candidates, rejected } = weeklyTextAdapter.read(WHATSAPP_EXAMPLE_1, context);
    const direct = buildCandidates(parseSchedule(WHATSAPP_EXAMPLE_1, { weekStart: week.start }).sessions, week, 'TEAM_TRAINING');
    expect(candidates.map(({ source, matchup, ...rest }) => rest)).toEqual(direct);
    expect(candidates.every((c) => c.source.kind === 'TEXT' && c.source.externalId === null && c.matchup === null)).toBe(true);
    expect(candidates[0]!.source.ref).toBe(`line ${direct[0]!.line}`);
    expect(rejected).toEqual([]);
  });

  it('a weekly schedule needs its week (never guessed)', () => {
    expect(() => weeklyTextAdapter.read(WHATSAPP_EXAMPLE_1, { ...context, week: null })).toThrow(RangeError);
  });
});
