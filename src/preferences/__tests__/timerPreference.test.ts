import { PREFERENCE_KEYS } from '../keys';
import type { PreferenceStore } from '../store';
import { DEFAULT_TIMER_PREFERENCES, readTimerPreferences, saveTimerPreferences } from '../timerPreference';

/** TRAINING-TIMER-001: exactly two device-local preferences, both ON by default, never able to break a workout. */
function memoryStore(initial: Record<string, string> = {}): PreferenceStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => (k in data ? data[k]! : null),
    setItem: async (k, v) => void (data[k] = v),
    removeItem: async (k) => void delete data[k],
  };
}

describe('timer preferences', () => {
  it('default: sounds ON and vibration ON', async () => {
    expect(DEFAULT_TIMER_PREFERENCES).toEqual({ sound: true, vibration: true });
    expect(await readTimerPreferences(memoryStore())).toEqual({ sound: true, vibration: true });
  });

  it('saves and reads back each switch independently, under its own key', async () => {
    const store = memoryStore();
    await saveTimerPreferences({ sound: false, vibration: true }, store);
    expect(await readTimerPreferences(store)).toEqual({ sound: false, vibration: true });
    await saveTimerPreferences({ sound: false, vibration: false }, store);
    expect(await readTimerPreferences(store)).toEqual({ sound: false, vibration: false });
    expect(Object.keys(store.data)).toEqual([PREFERENCE_KEYS.timer]);
    expect(PREFERENCE_KEYS.timer).toBe('@gals-coacher/timer.v1');
  });

  it('malformed, unknown-version or unreadable storage falls back to the defaults (never throws)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (const raw of ['not json', 'null', '{"version":9,"sound":false}', '{"version":1,"sound":"no","vibration":0}']) {
      const got = await readTimerPreferences(memoryStore({ [PREFERENCE_KEYS.timer]: raw }));
      expect(got).toEqual(raw.includes('"sound":"no"') ? { sound: true, vibration: true } : DEFAULT_TIMER_PREFERENCES);
    }
    const broken: PreferenceStore = { getItem: async () => Promise.reject(new Error('disk')), setItem: async () => {}, removeItem: async () => {} };
    expect(await readTimerPreferences(broken)).toEqual(DEFAULT_TIMER_PREFERENCES);
    warn.mockRestore();
  });
});
