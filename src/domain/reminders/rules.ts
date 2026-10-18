/**
 * CAL-SYNC-NOTIFY-001A — reminder rules (pure). A rule says WHEN, relative to
 * an event, this device reminds: at a clock time on the event's local day, or
 * a number of minutes before its start, or exactly AT its start (CAL-REMINDER-RULES-002: an explicit kind, never
 * "before 0 minutes"). Owner decisions 2026-10-10: 0–5 rules per list (a compatibility / UX constraint, not an
 * architectural invariant), default 08:00 on the event day · 120 min before · 30 min before.
 */
export type ReminderRule =
  | { readonly kind: 'AT_START' }
  | { readonly kind: 'DAY_OF_AT'; readonly hour: number; readonly minute: number }
  | { readonly kind: 'BEFORE_START'; readonly minutes: number };

export const MAX_REMINDER_RULES = 5;
/** The longest "before" a rule may have: one week (the reminder window is 30 days). */
export const MAX_BEFORE_START_MINUTES = 7 * 24 * 60;

export const DEFAULT_REMINDER_RULES: readonly ReminderRule[] = [
  { kind: 'DAY_OF_AT', hour: 8, minute: 0 },
  { kind: 'BEFORE_START', minutes: 120 },
  { kind: 'BEFORE_START', minutes: 30 },
];

export type ReminderRulesError =
  | { readonly code: 'NOT_A_LIST' }
  | { readonly code: 'TOO_MANY'; readonly max: number }
  | { readonly code: 'INVALID_RULE'; readonly index: number }
  | { readonly code: 'DUPLICATE'; readonly index: number; readonly sameAs: number };

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** A well-formed rule (unknown input → null). */
export function parseReminderRule(value: unknown): ReminderRule | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'AT_START') return { kind: 'AT_START' };
  if (v.kind === 'DAY_OF_AT' && isInt(v.hour, 0, 23) && isInt(v.minute, 0, 59)) {
    return { kind: 'DAY_OF_AT', hour: v.hour, minute: v.minute };
  }
  if (v.kind === 'BEFORE_START' && isInt(v.minutes, 1, MAX_BEFORE_START_MINUTES)) {
    return { kind: 'BEFORE_START', minutes: v.minutes };
  }
  return null;
}

export function sameRule(a: ReminderRule, b: ReminderRule): boolean {
  if (a.kind === 'AT_START' && b.kind === 'AT_START') return true;
  if (a.kind === 'DAY_OF_AT' && b.kind === 'DAY_OF_AT') return a.hour === b.hour && a.minute === b.minute;
  if (a.kind === 'BEFORE_START' && b.kind === 'BEFORE_START') return a.minutes === b.minutes;
  return false;
}

/** 0–5 well-formed rules with no duplicate; the first problem is reported. Order is kept (it is the user's). */
export function validateReminderRules(
  value: unknown,
): { readonly ok: true; readonly value: readonly ReminderRule[] } | { readonly ok: false; readonly error: ReminderRulesError } {
  if (!Array.isArray(value)) return { ok: false, error: { code: 'NOT_A_LIST' } };
  if (value.length > MAX_REMINDER_RULES) return { ok: false, error: { code: 'TOO_MANY', max: MAX_REMINDER_RULES } };
  const rules: ReminderRule[] = [];
  for (let index = 0; index < value.length; index++) {
    const rule = parseReminderRule(value[index]);
    if (rule === null) return { ok: false, error: { code: 'INVALID_RULE', index } };
    const sameAs = rules.findIndex((r) => sameRule(r, rule));
    if (sameAs >= 0) return { ok: false, error: { code: 'DUPLICATE', index, sameAs } };
    rules.push(rule);
  }
  return { ok: true, value: rules };
}
