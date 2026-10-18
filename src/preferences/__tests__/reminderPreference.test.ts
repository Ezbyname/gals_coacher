import { DEFAULT_REMINDER_RULES, type ReminderRule } from '@/domain/reminders';

import { PREFERENCE_KEYS } from '../keys';
import { readReminderPreferences, saveEventReminders, saveReminderPreferences } from '../reminderPreference';
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
const EV1 = 'e0000000-0000-4000-8000-000000000001';
const before = (minutes: number): ReminderRule => ({ kind: 'BEFORE_START', minutes });
const base = { enabled: true, rules: [before(45)], players: [MAYA], typeRules: {}, eventRules: {} };

describe('reminder preference (AsyncStorage, device-local, v2)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses a versioned key; the version-1 key is only the migration source', () => {
    expect(PREFERENCE_KEYS.reminders).toBe('@gals-coacher/reminders.v2');
    expect(PREFERENCE_KEYS.remindersV1).toBe('@gals-coacher/reminders.v1');
  });

  it('nothing stored → off, 08:00 / 120 / 30, no type / event rules, and the safe Player preselection', async () => {
    const store = storeOver(new Map());
    expect(await readReminderPreferences([DANIEL], store)).toEqual({ enabled: false, rules: DEFAULT_REMINDER_RULES, players: [DANIEL], typeRules: {}, eventRules: {} });
    expect((await readReminderPreferences([DANIEL, MAYA], store)).players).toEqual([]);
  });

  it('a saved preference survives an app restart exactly, type and event rules included', async () => {
    const backing = new Map<string, string>();
    const prefs = { ...base, typeRules: { GAME: [before(120), { kind: 'AT_START' as const }], RECOVERY: [] }, eventRules: { [EV1]: [{ kind: 'DAY_OF_AT' as const, hour: 7, minute: 30 }] } };
    await saveReminderPreferences(prefs, storeOver(backing));
    expect(await readReminderPreferences([DANIEL, MAYA], storeOver(backing))).toEqual(prefs);
    expect(JSON.parse(backing.get(PREFERENCE_KEYS.reminders)!)).toMatchObject({ version: 2 });
  });

  it('a saved empty rule list (0 reminders) stays empty at every level — never refilled with the defaults', async () => {
    const backing = new Map<string, string>();
    await saveReminderPreferences({ ...base, rules: [], players: [DANIEL], typeRules: { GAME: [] }, eventRules: { [EV1]: [] } }, storeOver(backing));
    const read = await readReminderPreferences([DANIEL], storeOver(backing));
    expect(read.rules).toEqual([]);
    expect(read.typeRules).toEqual({ GAME: [] });
    expect(read.eventRules).toEqual({ [EV1]: [] });
  });

  it('MIGRATION: version-1 settings (the old key) read as version 2 with EMPTY type / event rules — identical behaviour', async () => {
    const backing = new Map<string, string>([
      [PREFERENCE_KEYS.remindersV1, JSON.stringify({ version: 1, enabled: true, rules: [before(45), { kind: 'DAY_OF_AT', hour: 8, minute: 0 }], players: [DANIEL] })],
    ]);
    const read = await readReminderPreferences([DANIEL, MAYA], storeOver(backing));
    expect(read).toEqual({ enabled: true, rules: [before(45), { kind: 'DAY_OF_AT', hour: 8, minute: 0 }], players: [DANIEL], typeRules: {}, eventRules: {} });
    expect(backing.has(PREFERENCE_KEYS.reminders)).toBe(false); // reading never rewrites anything
    // the first v2 save writes the new key and retires the old one
    await saveReminderPreferences(read, storeOver(backing));
    expect(JSON.parse(backing.get(PREFERENCE_KEYS.reminders)!)).toMatchObject({ version: 2, enabled: true, players: [DANIEL] });
    expect(backing.has(PREFERENCE_KEYS.remindersV1)).toBe(false);
  });

  it('the version-2 key wins over a leftover version-1 key', async () => {
    const backing = new Map<string, string>([
      [PREFERENCE_KEYS.remindersV1, JSON.stringify({ version: 1, enabled: false, rules: [], players: [] })],
      [PREFERENCE_KEYS.reminders, JSON.stringify({ version: 2, ...base })],
    ]);
    expect(await readReminderPreferences([], storeOver(backing))).toEqual(base);
  });

  it('invalid / corrupt / other-version data → the defaults, reported (nothing repaired)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = [
      '{not json',
      JSON.stringify({ version: 3, enabled: true, rules: [], players: [] }),
      JSON.stringify({ version: 1, enabled: true, rules: [{ kind: 'BEFORE_START', minutes: 0 }], players: [] }), // 0 minutes is not "at start"
      JSON.stringify({ version: 2, enabled: true, rules: [], players: [], typeRules: { GAME: [{ kind: 'NOPE' }] } }),
      JSON.stringify({ version: 2, enabled: true, rules: [], players: [], eventRules: [] }),
    ];
    for (const raw of bad) {
      const store = storeOver(new Map([[PREFERENCE_KEYS.reminders, raw]]));
      expect(await readReminderPreferences([DANIEL], store)).toEqual({ enabled: false, rules: DEFAULT_REMINDER_RULES, players: [DANIEL], typeRules: {}, eventRules: {} });
    }
    expect(warn).toHaveBeenCalledTimes(bad.length);
  });

  it('saving an invalid preference throws and writes nothing', async () => {
    const backing = new Map<string, string>();
    const six = [5, 10, 15, 20, 25, 30].map(before);
    await expect(saveReminderPreferences({ ...base, rules: six, players: [] }, storeOver(backing))).rejects.toThrow(RangeError);
    await expect(saveReminderPreferences({ ...base, eventRules: { [EV1]: six } }, storeOver(backing))).rejects.toThrow(RangeError);
    expect(backing.size).toBe(0);
  });

  it('saveEventReminders sets a list, an EMPTY list (no reminders) or clears it (inherit) — touching nothing else', async () => {
    const backing = new Map<string, string>();
    await saveReminderPreferences(base, storeOver(backing));
    await saveEventReminders(EV1, [before(15)], [], storeOver(backing));
    expect((await readReminderPreferences([], storeOver(backing))).eventRules).toEqual({ [EV1]: [before(15)] });
    await saveEventReminders(EV1, [], [], storeOver(backing));
    expect((await readReminderPreferences([], storeOver(backing))).eventRules).toEqual({ [EV1]: [] });
    await saveEventReminders(EV1, null, [], storeOver(backing));
    const after = await readReminderPreferences([], storeOver(backing));
    expect(after.eventRules).toEqual({});
    expect({ ...after, eventRules: {} }).toEqual(base);
  });
});
