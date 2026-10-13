import type { ReminderPreferences } from './preferences';
import { MAX_BEFORE_START_MINUTES, MAX_REMINDER_RULES, sameRule, type ReminderRule } from './rules';

/**
 * CAL-SYNC-NOTIFY-001B — editing the reminder preference (pure; the Settings
 * screen only renders and stores). Every edit keeps the 001A invariants: 0–5
 * rules, no duplicate, explicit Players only. A refused edit changes nothing.
 */
export type BeforeUnit = 'MINUTES' | 'HOURS' | 'DAYS';
export const BEFORE_UNITS: readonly BeforeUnit[] = ['MINUTES', 'HOURS', 'DAYS'];
const UNIT_MINUTES: Readonly<Record<BeforeUnit, number>> = { MINUTES: 1, HOURS: 60, DAYS: 24 * 60 };

export type RuleEditError = 'TOO_MANY' | 'DUPLICATE' | 'INVALID' | 'TOO_LONG';
export type RuleEdit = { readonly ok: true; readonly rules: readonly ReminderRule[] } | { readonly ok: false; readonly error: RuleEditError };

/** "2" + HOURS → BEFORE_START 120. Whole positive numbers only; at most one week (MAX_BEFORE_START_MINUTES). */
export function beforeStartRule(value: string, unit: BeforeUnit): { readonly ok: true; readonly rule: ReminderRule } | { readonly ok: false; readonly error: 'INVALID' | 'TOO_LONG' } {
  const trimmed = value.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return { ok: false, error: 'INVALID' };
  const minutes = Number(trimmed) * UNIT_MINUTES[unit];
  if (minutes < 1) return { ok: false, error: 'INVALID' };
  if (minutes > MAX_BEFORE_START_MINUTES) return { ok: false, error: 'TOO_LONG' };
  return { ok: true, rule: { kind: 'BEFORE_START', minutes } };
}

/** A "before" rule shown in its largest whole unit: 120 → 2 HOURS, 90 → 90 MINUTES, 2880 → 2 DAYS. */
export function beforeStartParts(minutes: number): { readonly value: number; readonly unit: BeforeUnit } {
  for (const unit of ['DAYS', 'HOURS'] as const) {
    if (minutes % UNIT_MINUTES[unit] === 0) return { value: minutes / UNIT_MINUTES[unit], unit };
  }
  return { value: minutes, unit: 'MINUTES' };
}

/** Adds a rule at the end. At most 5; an identical rule is refused (never silently merged). */
export function addRule(rules: readonly ReminderRule[], rule: ReminderRule): RuleEdit {
  if (rules.length >= MAX_REMINDER_RULES) return { ok: false, error: 'TOO_MANY' };
  if (rules.some((r) => sameRule(r, rule))) return { ok: false, error: 'DUPLICATE' };
  return { ok: true, rules: [...rules, rule] };
}

/** Replaces rule `index` in place (its position is the user's); identical to ANOTHER rule → refused. */
export function replaceRule(rules: readonly ReminderRule[], index: number, rule: ReminderRule): RuleEdit {
  if (index < 0 || index >= rules.length) return { ok: false, error: 'INVALID' };
  if (rules.some((r, i) => i !== index && sameRule(r, rule))) return { ok: false, error: 'DUPLICATE' };
  return { ok: true, rules: rules.map((r, i) => (i === index ? rule : r)) };
}

export function removeRule(rules: readonly ReminderRule[], index: number): readonly ReminderRule[] {
  return rules.filter((_, i) => i !== index);
}

/** Selects / unselects one Player — never "all", never anyone the user did not tap. */
export function togglePlayer(prefs: ReminderPreferences, playerId: string): ReminderPreferences {
  const players = prefs.players.includes(playerId) ? prefs.players.filter((p) => p !== playerId) : [...prefs.players, playerId];
  return { ...prefs, players };
}
