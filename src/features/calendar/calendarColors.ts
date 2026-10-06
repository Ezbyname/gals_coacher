import type { ActivityTypeRef, BuiltinActivityType } from '@/domain/activityType';
import { playerColorSlot, type ColorMeaning } from '@/domain/calendarView';
import type { CalendarEvent } from '@/domain/calendarEvent';

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

/** One fixed colour per built-in activity type (the same type always looks the same). */
export const TYPE_COLORS: Record<BuiltinActivityType, string> = {
  TEAM_TRAINING: '#1F5FA8',
  PERSONAL_TRAINING: '#6A3FA0',
  GAME: '#B0303F',
  GYM: '#A65400',
  RECOVERY: '#2E7D32',
  OTHER: '#546E7A',
};

/** One glyph per built-in activity type: the type is readable without its colour. */
export const TYPE_GLYPHS: Record<BuiltinActivityType, string> = {
  TEAM_TRAINING: '👥',
  PERSONAL_TRAINING: '🎯',
  GAME: '🏆',
  GYM: '💪',
  RECOVERY: '🧘',
  OTHER: '📌',
};

/**
 * Custom activity type colours (ACTIVITY-001). A custom type's colour comes
 * from a stable hash of its id (a UUID) — never its name or its place in a
 * list — so it is the same across restarts, filters and reordering, and a
 * name never decides it. Nothing is stored. White text keeps ≥ 4.5:1.
 */
export const CUSTOM_TYPE_PALETTE = [
  '#00695C', // teal
  '#AD1457', // magenta
  '#5D4037', // brown
  '#283593', // indigo
  '#6D4C41', // umber
  '#00838F', // cyan
  '#7B1FA2', // violet
  '#4E342E', // espresso
] as const;

/** FNV-1a (32-bit) of a string: a small, stable, platform-independent hash. */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function customTypeColor(typeId: string): string {
  return CUSTOM_TYPE_PALETTE[stableHash(typeId) % CUSTOM_TYPE_PALETTE.length]!;
}

/** An activity type's colour: fixed for a built-in, id-derived for a custom type. */
export function activityTypeColor(type: Pick<ActivityTypeRef, 'id' | 'builtin'>): string {
  return type.builtin !== null ? TYPE_COLORS[type.builtin] : customTypeColor(type.id);
}

/** An activity type's marker text: a built-in's glyph, or a custom type's initial (its name is shown too). */
export function activityTypeGlyph(type: Pick<ActivityTypeRef, 'builtin' | 'name'>): string {
  return type.builtin !== null ? TYPE_GLYPHS[type.builtin] : playerInitial(type.name ?? '?');
}

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
  event: Pick<CalendarEvent, 'playerId' | 'activityType'>,
  meaning: ColorMeaning,
  players: readonly PlayerRef[],
): { color: string; text: string } {
  if (meaning === 'TYPE') {
    return { color: activityTypeColor(event.activityType), text: activityTypeGlyph(event.activityType) };
  }
  const player = players.find((p) => p.id === event.playerId);
  return { color: playerColor(players, event.playerId), text: player ? playerInitial(player.name) : '?' };
}
