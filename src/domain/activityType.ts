import { isUuid } from './ids';

/**
 * Activity Types (ACTIVITY-001): what kind of planned item a calendar event
 * is — a catalog, not a fixed list. Sport-neutral and independent of Sport.
 *
 * Identity is the `id`, never a label: the six built-ins keep the stable codes
 * every existing event already stores; a custom type gets a client UUID. A
 * type is never deleted — it becomes inactive (not offered for new events)
 * and history keeps referencing it; making it active again reuses the same id.
 */

/** The built-in types, in their display order. Labels come from i18n. */
export const BUILTIN_ACTIVITY_TYPES = [
  'TEAM_TRAINING',
  'PERSONAL_TRAINING',
  'GAME',
  'GYM',
  'RECOVERY',
  'OTHER',
] as const;
export type BuiltinActivityType = (typeof BUILTIN_ACTIVITY_TYPES)[number];

/** A stored Activity Type id: a built-in code or a custom type's UUID. */
export type ActivityTypeId = string;

export function isBuiltinActivityType(value: unknown): value is BuiltinActivityType {
  return typeof value === 'string' && (BUILTIN_ACTIVITY_TYPES as readonly string[]).includes(value);
}

/** Well-formed as an id (built-in code or UUID). Whether it exists is the catalog's question. */
export function isActivityTypeId(value: unknown): value is ActivityTypeId {
  return isBuiltinActivityType(value) || (typeof value === 'string' && isUuid(value));
}

/** OTHER is only an input classification: an event of that type says what it is in its title. */
export const OTHER_ACTIVITY_TYPE: BuiltinActivityType = 'OTHER';

export function requiresTitle(typeId: ActivityTypeId): boolean {
  return typeId === OTHER_ACTIVITY_TYPE;
}

export interface ActivityType {
  readonly id: ActivityTypeId;
  /** The built-in code (= id) for a built-in type; null for a custom one. */
  readonly builtin: BuiltinActivityType | null;
  /** A custom type's name exactly as the user entered it (trimmed); null for built-ins (translated). */
  readonly name: string | null;
  /** Inactive: not offered for new events; still valid for every existing event. */
  readonly active: boolean;
  /** Epoch ms; 0 for built-ins (part of the app from the start). */
  readonly createdAt: number;
  /** Epoch ms of the last real change (activation state); 0 for an untouched built-in. */
  readonly updatedAt: number;
}

/** What an event's reader needs to show its type (a read-time view of the catalog row). */
export type ActivityTypeRef = Pick<ActivityType, 'id' | 'builtin' | 'name' | 'active'>;

/**
 * The longest custom type name (characters, after trimming). The same limit
 * the owner approved for a calendar event Title: a type name is shown in the
 * same chips, cards and legends. Owner may change it here.
 */
export const ACTIVITY_TYPE_NAME_MAX_LENGTH = 35;

export type CustomActivityTypeNameError = 'REQUIRED' | 'TOO_LONG' | 'DUPLICATE';

/**
 * A new custom type's name: trimmed (nothing else is changed), not blank, at
 * most ACTIVITY_TYPE_NAME_MAX_LENGTH characters, and not the name of an
 * existing custom type (compared case-insensitively after trimming) — an
 * existing one, even inactive, is made active again instead of duplicated.
 */
export function validateCustomActivityTypeName(
  input: unknown,
  existingCustomNames: readonly string[],
): { ok: true; value: string } | { ok: false; error: CustomActivityTypeNameError } {
  const name = typeof input === 'string' ? input.trim() : '';
  if (name.length === 0) return { ok: false, error: 'REQUIRED' };
  if (name.length > ACTIVITY_TYPE_NAME_MAX_LENGTH) return { ok: false, error: 'TOO_LONG' };
  const key = name.toLocaleLowerCase();
  if (existingCustomNames.some((other) => other.trim().toLocaleLowerCase() === key)) {
    return { ok: false, error: 'DUPLICATE' };
  }
  return { ok: true, value: name };
}

/** Display order: built-ins in their fixed order, then custom types by creation (createdAt, id). */
export function sortActivityTypes<T extends Pick<ActivityType, 'id' | 'builtin' | 'createdAt'>>(
  types: readonly T[],
): T[] {
  const rank = (t: T) =>
    t.builtin === null ? BUILTIN_ACTIVITY_TYPES.length : BUILTIN_ACTIVITY_TYPES.indexOf(t.builtin);
  return [...types].sort(
    (a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The types a form offers: the active ones, plus the type the event already
 * has (`kept`) even when inactive — history stays editable without forcing a
 * change, and is never reactivated by being kept.
 */
export function selectableActivityTypes<
  T extends Pick<ActivityType, 'id' | 'builtin' | 'createdAt' | 'active'>,
>(catalog: readonly T[], kept: ActivityTypeId | null = null): T[] {
  return sortActivityTypes(catalog.filter((type) => type.active || type.id === kept));
}
