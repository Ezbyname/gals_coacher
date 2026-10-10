import {
  defaultReminderPreferences,
  parseReminderPreferences,
  type ReminderPreferences,
} from '@/domain/reminders';

import { PREFERENCE_KEYS } from './keys';
import { asyncStoragePreferenceStore, type PreferenceStore } from './store';

const VERSION = 1;

/**
 * This device's reminder preference (CAL-SYNC-NOTIFY-001A). Missing → the
 * defaults (off, 08:00 / 120 / 30, the safe Player preselection for
 * `playerIds`). Unreadable or invalid → the defaults too (reported, never
 * repaired into something the user did not choose).
 */
export async function readReminderPreferences(
  playerIds: readonly string[],
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<ReminderPreferences> {
  try {
    const raw = await store.getItem(PREFERENCE_KEYS.reminders);
    if (raw === null) return defaultReminderPreferences(playerIds);
    const stored = JSON.parse(raw) as unknown;
    const parsed =
      typeof stored === 'object' && stored !== null && (stored as { version?: unknown }).version === VERSION
        ? parseReminderPreferences(stored)
        : null;
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
}
