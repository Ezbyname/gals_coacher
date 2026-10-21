import { PREFERENCE_KEYS } from './keys';
import { asyncStoragePreferenceStore, type PreferenceStore } from './store';

/**
 * TRAINING-TIMER-001: this device's two workout-timer preferences (device-local, never synced, no schema). Both default ON.
 * Sound and vibration are SUPPLEMENTARY cues: the screen always shows the same state.
 */
export interface TimerPreferences {
  readonly sound: boolean;
  readonly vibration: boolean;
}

export const DEFAULT_TIMER_PREFERENCES: TimerPreferences = { sound: true, vibration: true };
const VERSION = 1;

/** Missing, malformed or unreadable storage -> the defaults (never throws: a preference can never block a workout). */
export async function readTimerPreferences(store: PreferenceStore = asyncStoragePreferenceStore): Promise<TimerPreferences> {
  try {
    const raw = await store.getItem(PREFERENCE_KEYS.timer);
    if (raw === null) return DEFAULT_TIMER_PREFERENCES;
    const v = JSON.parse(raw) as { version?: unknown; sound?: unknown; vibration?: unknown } | null;
    if (v === null || typeof v !== 'object' || v.version !== VERSION) return DEFAULT_TIMER_PREFERENCES;
    return {
      sound: typeof v.sound === 'boolean' ? v.sound : DEFAULT_TIMER_PREFERENCES.sound,
      vibration: typeof v.vibration === 'boolean' ? v.vibration : DEFAULT_TIMER_PREFERENCES.vibration,
    };
  } catch (e) {
    console.warn('[timer] could not read the timer preference; using the defaults.', e);
    return DEFAULT_TIMER_PREFERENCES;
  }
}

export async function saveTimerPreferences(prefs: TimerPreferences, store: PreferenceStore = asyncStoragePreferenceStore): Promise<void> {
  await store.setItem(PREFERENCE_KEYS.timer, JSON.stringify({ version: VERSION, sound: prefs.sound, vibration: prefs.vibration }));
}
