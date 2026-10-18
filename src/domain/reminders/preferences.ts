import { DEFAULT_REMINDER_RULES, validateReminderRules, type ReminderRule } from './rules';

/**
 * CAL-SYNC-NOTIFY-001A + CAL-REMINDER-RULES-002 — this device's reminder preference. Device-local (never
 * a domain field, never synced): it is about THIS phone's notifications, so even an event's own reminders live here
 * (keyed by event id) and never touch the CalendarEvent.
 *
 * Hierarchy (owner 2026-10-18):  EVENT override  >  ACTIVITY-TYPE default  >  GENERAL (the fallback list).
 *  - a key ABSENT from typeRules / eventRules  = inherit the next level;
 *  - a key PRESENT with [] = explicitly NO reminders at that level;
 *  - the master switch, the Player subscription and Player archive gate every level (an override cannot bypass them).
 *
 * Player targeting (owner 2026-10-10): the device is never silently subscribed
 * to every Player. Exactly one Player → it may be preselected (and is shown);
 * several → none until the user chooses; a Player added later is NOT added.
 */
export type RulesByKey = Readonly<Record<string, readonly ReminderRule[]>>;

export interface ReminderPreferences {
  /** Master switch; off until the user turns reminders on. */
  readonly enabled: boolean;
  /** The GENERAL fallback list: 0–5 rules, in the user's order. */
  readonly rules: readonly ReminderRule[];
  /** The Players whose events remind on this device (explicit ids only). */
  readonly players: readonly string[];
  /** Activity-type defaults, by Activity Type id (built-in code or custom UUID). */
  readonly typeRules: RulesByKey;
  /** Event-specific overrides, by CalendarEvent id. Pruned when the event no longer exists. */
  readonly eventRules: RulesByKey;
}

/** The preference before the user has saved one: off, the 3 default rules, no type / event rules, the safe Player preselection. */
export function defaultReminderPreferences(playerIds: readonly string[]): ReminderPreferences {
  return { enabled: false, rules: DEFAULT_REMINDER_RULES, players: preselectedPlayers(playerIds), typeRules: {}, eventRules: {} };
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

const has = (map: RulesByKey, key: string) => Object.prototype.hasOwnProperty.call(map, key);

export type RuleSource = 'EVENT' | 'TYPE' | 'GENERAL';

/** What a type / event inherits when it has no rules of its own: the type default, else the general list. */
export function inheritedRules(prefs: ReminderPreferences, typeId: string | null): { readonly rules: readonly ReminderRule[]; readonly source: 'TYPE' | 'GENERAL' } {
  if (typeId !== null && has(prefs.typeRules, typeId)) return { rules: prefs.typeRules[typeId]!, source: 'TYPE' };
  return { rules: prefs.rules, source: 'GENERAL' };
}

/** The rules that apply to one event: its own override, else its type's default, else the general list. */
export function effectiveRules(
  prefs: ReminderPreferences,
  event: { readonly id: string; readonly type: string },
): { readonly rules: readonly ReminderRule[]; readonly source: RuleSource } {
  if (has(prefs.eventRules, event.id)) return { rules: prefs.eventRules[event.id]!, source: 'EVENT' };
  return inheritedRules(prefs, event.type);
}

/** One level changed: `null` removes the entry (inherit), a list (possibly empty) sets it. Never mutates. */
function withEntry(map: RulesByKey, key: string, rules: readonly ReminderRule[] | null): RulesByKey {
  const rest = Object.entries(map).filter(([k]) => k !== key);
  return Object.fromEntries(rules === null ? rest : [...rest, [key, rules]]);
}
export const withEventRules = (prefs: ReminderPreferences, eventId: string, rules: readonly ReminderRule[] | null): ReminderPreferences => ({
  ...prefs,
  eventRules: withEntry(prefs.eventRules, eventId, rules),
});
export const withTypeRules = (prefs: ReminderPreferences, typeId: string, rules: readonly ReminderRule[] | null): ReminderPreferences => ({
  ...prefs,
  typeRules: withEntry(prefs.typeRules, typeId, rules),
});

/** Drops event overrides whose event no longer exists. Returns the SAME object when nothing was orphaned. */
export function pruneEventRules(prefs: ReminderPreferences, existingEventIds: ReadonlySet<string>): ReminderPreferences {
  const kept = Object.entries(prefs.eventRules).filter(([id]) => existingEventIds.has(id));
  return kept.length === Object.keys(prefs.eventRules).length ? prefs : { ...prefs, eventRules: Object.fromEntries(kept) };
}

/** Optional, explicit suggestion (previewed before it is applied; never applied silently): Game and Team training. */
export const SUGGESTED_TYPE_DEFAULTS: Readonly<Record<'GAME' | 'TEAM_TRAINING', readonly ReminderRule[]>> = {
  GAME: [
    { kind: 'DAY_OF_AT', hour: 8, minute: 0 },
    { kind: 'BEFORE_START', minutes: 120 },
    { kind: 'BEFORE_START', minutes: 30 },
  ],
  TEAM_TRAINING: [{ kind: 'BEFORE_START', minutes: 60 }],
};

/** A stored map as valid rule lists per non-empty key (absent → {}); anything else → null (nothing is repaired silently). */
function parseRulesByKey(value: unknown): RulesByKey | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: [string, readonly ReminderRule[]][] = [];
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (key.length === 0) return null;
    const rules = validateReminderRules(list);
    if (!rules.ok) return null;
    out.push([key, rules.value]);
  }
  return Object.fromEntries(out);
}

/** A stored / incoming value as a valid preference (a version-1 value has no type / event rules: they are empty), or null. */
export function parseReminderPreferences(value: unknown): ReminderPreferences | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') return null;
  const rules = validateReminderRules(v.rules);
  if (!rules.ok) return null;
  if (!Array.isArray(v.players) || !v.players.every((p) => typeof p === 'string' && p.length > 0)) return null;
  const players = [...new Set(v.players as string[])];
  const typeRules = parseRulesByKey(v.typeRules);
  const eventRules = parseRulesByKey(v.eventRules);
  if (typeRules === null || eventRules === null) return null;
  return { enabled: v.enabled, rules: rules.value, players, typeRules, eventRules };
}
