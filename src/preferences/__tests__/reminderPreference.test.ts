import { DEFAULT_REMINDER_RULES } from '@/domain/reminders';

import { PREFERENCE_KEYS } from '../keys';
import { readReminderPreferences, saveReminderPreferences } from '../reminderPreference';
import type { PreferenceStore } from '../store';

/** A store over a shared backing map: a new wrapper = an app restart. */
function storeOver(backing: Map<string, string>): PreferenceStore {
  return {
    getItem: async (k) => backing.get(k) ?? null,
    setItem: async (k, v) => {
      backing.set(k, v);
    },
    removeItem: async (k) => {
      backing.delete(k);
    },
  };
}
const DANIEL = 'd0000000-0000-4000-8000-000000000001';
const MAYA = 'd0000000-0000-4000-8000-000000000002';

describe('reminder preference (AsyncStorage, device-local)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses its own versioned key', () => {
    expect(PREFERENCE_KEYS.reminders).toBe('@gals-coacher/reminders.v1');
  });

  it('nothing stored → off, 08:00 / 120 / 30, and the safe Player preselection', async () => {
    const store = storeOver(new Map());
    expect(await readReminderPreferences([DANIEL], store)).toEqual({ enabled: false, rules: DEFAULT_REMINDER_RULES, players: [DANIEL] });
    expect((await readReminderPreferences([DANIEL, MAYA], store)).players).toEqual([]);
  });

  it('a saved preference survives an app restart exactly', async () => {
    const backing = new Map<string, string>();
    const prefs = { enabled: true, rules: [{ kind: 'BEFORE_START' as const, minutes: 45 }], players: [MAYA] };
    await saveReminderPreferences(prefs, storeOver(backing));
    expect(await readReminderPreferences([DANIEL, MAYA], storeOver(backing))).toEqual(prefs);
    expect(JSON.parse(backing.get(PREFERENCE_KEYS.reminders)!)).toMatchObject({ version: 1 });
  });

  it('a saved empty rule list (0 reminders) stays empty — never refilled with the defaults', async () => {
    const backing = new Map<string, string>();
    await saveReminderPreferences({ enabled: true, rules: [], players: [DANIEL] }, storeOver(backing));
    expect((await readReminderPreferences([DANIEL], storeOver(backing))).rules).toEqual([]);
  });

  it('invalid / corrupt / other-version data → the defaults, reported (nothing repaired)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (const raw of ['{not json', JSON.stringify({ version: 2, enabled: true, rules: [], players: [] }),
      JSON.stringify({ version: 1, enabled: true, rules: [{ kind: 'BEFORE_START', minutes: 0 }], players: [] })]) {
      const store = storeOver(new Map([[PREFERENCE_KEYS.reminders, raw]]));
      expect(await readReminderPreferences([DANIEL], store)).toEqual({ enabled: false, rules: DEFAULT_REMINDER_RULES, players: [DANIEL] });
    }
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('saving an invalid preference throws and writes nothing', async () => {
    const backing = new Map<string, string>();
    const six = [5, 10, 15, 20, 25, 30].map((minutes) => ({ kind: 'BEFORE_START' as const, minutes }));
    await expect(saveReminderPreferences({ enabled: true, rules: six, players: [] }, storeOver(backing))).rejects.toThrow(RangeError);
    expect(backing.size).toBe(0);
  });
});
