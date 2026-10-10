import { DEFAULT_REMINDER_RULES, validateReminderRules, type ReminderRule } from './rules';

/**
 * CAL-SYNC-NOTIFY-001A — this device's reminder preference. Device-local (never
 * a domain field, never synced): it is about THIS phone's notifications.
 *
 * Player targeting (owner 2026-10-10): the device is never silently subscribed
 * to every Player. Exactly one Player → it may be preselected (and is shown);
 * several → none until the user chooses; a Player added later is NOT added.
 */
export interface ReminderPreferences {
  /** Master switch; off until the user turns reminders on. */
  readonly enabled: boolean;
  /** 0–5 rules, in the user's order. */
  readonly rules: readonly ReminderRule[];
  /** The Players whose events remind on this device (explicit ids only). */
  readonly players: readonly string[];
}

/** The preference before the user has saved one: off, the 3 default rules, the safe Player preselection. */
export function defaultReminderPreferences(playerIds: readonly string[]): ReminderPreferences {
  return { enabled: false, rules: DEFAULT_REMINDER_RULES, players: preselectedPlayers(playerIds) };
}

/** Exactly one Player → that Player (shown to the user); none or several → nobody until chosen. */
export function preselectedPlayers(playerIds: readonly string[]): readonly string[] {
  return playerIds.length === 1 ? [playerIds[0]!] : [];
}

/** The subscribed Players that still exist — never adds anyone. */
export function subscribedPlayers(prefs: ReminderPreferences, existingPlayerIds: readonly string[]): readonly string[] {
  const existing = new Set(existingPlayerIds);
  return prefs.players.filter((id) => existing.has(id));
}

/** A stored / incoming value as a valid preference, or null (nothing is repaired silently). */
export function parseReminderPreferences(value: unknown): ReminderPreferences | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') return null;
  const rules = validateReminderRules(v.rules);
  if (!rules.ok) return null;
  if (!Array.isArray(v.players) || !v.players.every((p) => typeof p === 'string' && p.length > 0)) return null;
  const players = [...new Set(v.players as string[])];
  return { enabled: v.enabled, rules: rules.value, players };
}
