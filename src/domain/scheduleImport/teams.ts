import { normalizeMessage } from '../calendarImport/normalize';

/**
 * CAL-SCHEDULE-IMPORT-002A — which team in a fixture source is the Player's.
 *
 * Team names are compared EXACTLY after a presentation-only normalization:
 * Unicode NFC, direction marks removed, dash / geresh / gershayim / quote
 * look-alikes unified, whitespace collapsed and trimmed, Latin letters
 * case-folded. Never substring ("contains") and never fuzzy: "הפועל חוף הכרמל"
 * and "הפועל חוף הכרמל מעיין צבי" are different teams.
 */
export function normalizeTeamName(name: string): string {
  return normalizeMessage(name).replace(/\s+/g, ' ').trim().toLowerCase();
}

export function sameTeam(a: string, b: string): boolean {
  const x = normalizeTeamName(a);
  return x.length > 0 && x === normalizeTeamName(b);
}

/** A team as a source names it, with the source's own code when it has one (e.g. a league's team code). */
export interface SourceTeam {
  readonly name: string;
  readonly code: string | null;
}

export type TeamMatch =
  | { readonly kind: 'EXACT'; readonly team: SourceTeam }
  /** No team in the source matches the name: the user must choose (never guessed). */
  | { readonly kind: 'NONE' }
  /** Several different source teams normalize to the name (e.g. two codes): the user must choose. */
  | { readonly kind: 'AMBIGUOUS'; readonly teams: readonly SourceTeam[] };

/** The distinct teams of a source, by normalized name + code, in first-seen order. */
export function distinctTeams(teams: readonly SourceTeam[]): SourceTeam[] {
  const seen = new Set<string>();
  const out: SourceTeam[] = [];
  for (const team of teams) {
    const id = `${normalizeTeamName(team.name)}\u0000${team.code ?? ''}`;
    if (normalizeTeamName(team.name).length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(team);
  }
  return out;
}

/** The source team that IS `teamName` (exact normalized match), if exactly one. */
export function findTeam(teamName: string, teams: readonly SourceTeam[]): TeamMatch {
  const matches = distinctTeams(teams).filter((team) => sameTeam(team.name, teamName));
  if (matches.length === 0) return { kind: 'NONE' };
  if (matches.length > 1) return { kind: 'AMBIGUOUS', teams: matches };
  return { kind: 'EXACT', team: matches[0]! };
}

/**
 * The selected team's side in a fixture: by source code when both sides carry
 * one (more reliable within one source), else by exact normalized name.
 * null when neither side is the selected team (the fixture is not the Player's).
 */
export function sideOf(team: SourceTeam, home: SourceTeam, away: SourceTeam): 'HOME' | 'AWAY' | null {
  const byCode = team.code !== null && home.code !== null && away.code !== null;
  const isTeam = (side: SourceTeam) => (byCode ? side.code === team.code : sameTeam(side.name, team.name));
  if (isTeam(home)) return 'HOME';
  if (isTeam(away)) return 'AWAY';
  return null;
}
