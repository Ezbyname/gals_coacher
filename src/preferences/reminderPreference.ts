import {
  defaultReminderPreferences,
  parseReminderPreferences,
  withEventRules,
  type ReminderPreferences,
  type ReminderRule,
} from '@/domain/reminders';

import { emitDataChanged } from '@/data/changes';

import { PREFERENCE_KEYS } from './keys';
import { asyncStoragePreferenceStore, type PreferenceStore } from './store';

const VERSION = 2;

/**
 * This device's reminder preference (CAL-SYNC-NOTIFY-001A, v2 in CAL-REMINDER-RULES-002). Missing → the
 * defaults (off, 08:00 / 120 / 30, the safe Player preselection for `playerIds`). A stored version-1 value
 * (the old key) reads as version 2 with EMPTY type / event rules: today's behaviour stays exactly the same.
 * Unreadable or invalid → the defaults too (reported, never repaired into something the user did not choose).
 */
export async function readReminderPreferences(
  playerIds: readonly string[],
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<ReminderPreferences> {
  try {
    const raw = (await store.getItem(PREFERENCE_KEYS.reminders)) ?? (await store.getItem(PREFERENCE_KEYS.remindersV1));
    if (raw === null) return defaultReminderPreferences(playerIds);
    const stored = JSON.parse(raw) as unknown;
    const version = typeof stored === 'object' && stored !== null ? (stored as { version?: unknown }).version : undefined;
    const parsed = version === 1 || version === VERSION ? parseReminderPreferences(stored) : null;
    if (parsed === null) {
      console.warn('[reminders] stored preference is invalid; using the defaults.');
      return defaultReminderPreferences(playerIds);
    }
    return parsed;
  } catch (e) {
    console.warn('[reminders] could not read the preference; using the defaults.', e);
    return defaultReminderPreferences(playerIds);
  }
}

/** Persists a VALID preference (validated again here). Throws on invalid input or a storage failure. */
export async function saveReminderPreferences(
  prefs: ReminderPreferences,
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<void> {
  const valid = parseReminderPreferences(prefs);
  if (valid === null) throw new RangeError('saveReminderPreferences: invalid reminder preference');
  await store.setItem(PREFERENCE_KEYS.reminders, JSON.stringify({ version: VERSION, ...valid }));
  await store.removeItem(PREFERENCE_KEYS.remindersV1).catch(() => undefined); // the old key has been superseded
  emitDataChanged('reminders'); // the engine reconciles with the new settings (CAL-SYNC-NOTIFY-001C)
}

/**
 * Sets (a list, possibly EMPTY = no reminders) or clears (null = inherit) ONE event's own reminders, on the fresh stored
 * preference. A device-local write: it never touches the CalendarEvent. Throws on a storage failure (the caller reports it).
 */
export async function saveEventReminders(
  eventId: string,
  rules: readonly ReminderRule[] | null,
  playerIds: readonly string[] = [],
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<void> {
  const current = await readReminderPreferences(playerIds, store);
  await saveReminderPreferences(withEventRules(current, eventId, rules), store);
}
