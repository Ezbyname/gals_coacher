import type { PreferenceStore } from '@/preferences/store';

import {
  LANGUAGE_SWITCH_MARKER_KEY,
  LANGUAGE_SWITCH_MARKER_TTL_MS,
  consumeLanguageSwitch,
  markLanguageSwitch,
} from '../languageSwitchMarker';

function memory(): PreferenceStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

describe('language-switch marker', () => {
  it('is namespaced', () => {
    expect(LANGUAGE_SWITCH_MARKER_KEY).toBe('@gals-coacher/startup.languageSwitchAt');
  });

  it('no marker → genuine cold start', async () => {
    expect(await consumeLanguageSwitch(1_000, memory())).toBe(false);
  });

  it('4. a fresh marker is honoured once, then consumed', async () => {
    const store = memory();
    await markLanguageSwitch(10_000, store);
    expect(await consumeLanguageSwitch(12_000, store)).toBe(true);
    expect(store.data.has(LANGUAGE_SWITCH_MARKER_KEY)).toBe(false);
    expect(await consumeLanguageSwitch(12_100, store)).toBe(false);
  });

  it('5. a stale marker is ignored (and removed), so a later cold start keeps its splash', async () => {
    const store = memory();
    await markLanguageSwitch(10_000, store);
    expect(await consumeLanguageSwitch(10_000 + LANGUAGE_SWITCH_MARKER_TTL_MS + 1, store)).toBe(false);
    expect(store.data.has(LANGUAGE_SWITCH_MARKER_KEY)).toBe(false);
  });

  it('ignores a marker from the future or with garbage content', async () => {
    const store = memory();
    await markLanguageSwitch(50_000, store);
    expect(await consumeLanguageSwitch(10_000, store)).toBe(false);
    store.data.set(LANGUAGE_SWITCH_MARKER_KEY, 'not-a-time');
    expect(await consumeLanguageSwitch(10_000, store)).toBe(false);
  });

  it('an unreadable store means cold start', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: PreferenceStore = {
      getItem: () => Promise.reject(new Error('disk')),
      setItem: async () => {},
      removeItem: async () => {},
    };
    expect(await consumeLanguageSwitch(1_000, broken)).toBe(false);
    warn.mockRestore();
  });
});
