import { playerColorSlot, type ColorMeaning } from '@/domain/calendarView';
import type { CalendarEvent, CalendarEventType } from '@/domain/calendarEvent';

/**
 * Event colours of the Full Calendar (CAL-COLOR-001). Colour is only ever a
 * second signal: every marker also carries text (a Player's initial or an
 * activity glyph), every row its words, and a legend says what colours mean.
 * Each colour keeps white marker text above a 4.5:1 contrast ratio.
 * Cosmetic only — nothing is stored.
 */

/** Player colours, assigned by creation order (see playerColorSlot). */
export const PLAYER_PALETTE = [
  '#1F5FA8', // blue
  '#B0303F', // red
  '#2E7D32', // green
  '#6A3FA0', // purple
  '#A65400', // amber
  '#00695C', // teal
  '#AD1457', // magenta
  '#5D4037', // brown
] as const;

/** One fixed colour per activity type (the same type always looks the same). */
export const TYPE_COLORS: Record<CalendarEventType, string> = {
  TEAM_TRAINING: '#1F5FA8',
  PERSONAL_TRAINING: '#6A3FA0',
  GAME: '#B0303F',
  GYM: '#A65400',
  RECOVERY: '#2E7D32',
  OTHER: '#546E7A',
};

/** One glyph per activity type: the type is readable without its colour. */
export const TYPE_GLYPHS: Record<CalendarEventType, string> = {
  TEAM_TRAINING: '👥',
  PERSONAL_TRAINING: '🎯',
  GAME: '🏆',
  GYM: '💪',
  RECOVERY: '🧘',
  OTHER: '📌',
};

/** Shown for an event whose Player is not in the loaded list (never fabricated). */
export const UNKNOWN_COLOR = '#757575';

type PlayerRef = { readonly id: string; readonly name: string; readonly createdAt: number };

export function playerColor(players: readonly PlayerRef[], playerId: string): string {
  const slot = playerColorSlot(players, playerId, PLAYER_PALETTE.length);
  return slot === null ? UNKNOWN_COLOR : PLAYER_PALETTE[slot]!;
}

/** The first character of the name (a whole grapheme for most scripts), upper-cased. */
export function playerInitial(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase();
}

/** The colour and the always-present text of an event's marker for the current meaning. */
export function eventMarker(
  event: Pick<CalendarEvent, 'playerId' | 'type'>,
  meaning: ColorMeaning,
  players: readonly PlayerRef[],
): { color: string; text: string } {
  if (meaning === 'TYPE') return { color: TYPE_COLORS[event.type], text: TYPE_GLYPHS[event.type] };
  const player = players.find((p) => p.id === event.playerId);
  return { color: playerColor(players, event.playerId), text: player ? playerInitial(player.name) : '?' };
}
