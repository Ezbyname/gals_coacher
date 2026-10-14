import { emitDataChanged } from '@/data/changes';
import { DEFAULT_CALENDAR_SYNC, parseCalendarSyncPreferences, type CalendarSyncPreferences } from '@/domain/calendarSync';

import { PREFERENCE_KEYS } from './keys';
import { asyncStoragePreferenceStore, type PreferenceStore } from './store';

const VERSION = 1;

/**
 * This device's calendar-sync preference (CAL-SYNC-NOTIFY-001D). Separate from the
 * reminder preference: its own switch, calendar and Players. Missing / invalid →
 * OFF with nothing chosen (never repaired into a choice the user did not make).
 */
export async function readCalendarSyncPreferences(store: PreferenceStore = asyncStoragePreferenceStore): Promise<CalendarSyncPreferences> {
  try {
    const raw = await store.getItem(PREFERENCE_KEYS.calendarSync);
    if (raw === null) return DEFAULT_CALENDAR_SYNC;
    const stored = JSON.parse(raw) as unknown;
    const parsed =
      typeof stored === 'object' && stored !== null && (stored as { version?: unknown }).version === VERSION
        ? parseCalendarSyncPreferences(stored)
        : null;
    if (parsed === null) console.warn('[calendarSync] stored preference is invalid; sync stays off.');
    return parsed ?? DEFAULT_CALENDAR_SYNC;
  } catch (e) {
    console.warn('[calendarSync] could not read the preference; sync stays off.', e);
    return DEFAULT_CALENDAR_SYNC;
  }
}

/** Persists VALID preferences and signals the sync engine. Throws on invalid input or a storage failure. */
export async function saveCalendarSyncPreferences(
  prefs: CalendarSyncPreferences,
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<void> {
  const valid = parseCalendarSyncPreferences(prefs);
  if (valid === null) throw new RangeError('saveCalendarSyncPreferences: invalid preference');
  await store.setItem(PREFERENCE_KEYS.calendarSync, JSON.stringify({ version: VERSION, ...valid }));
  emitDataChanged('calendarSync');
}
