import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, NativeModules } from 'react-native';

import { PREFERENCE_KEYS } from '../keys';
import { readLanguage, saveLanguage } from '../languagePreference';
import type { PreferenceStore } from '../store';

/** A store wrapper over a shared backing map: a new wrapper = an app restart. */
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

describe('language preference', () => {
  beforeEach(() => AsyncStorage.clear());

  it('uses the approved AsyncStorage key', () => {
    expect(PREFERENCE_KEYS.language).toBe('@gals-coacher/ui.language');
  });

  it('missing value → Hebrew', async () => {
    expect(await readLanguage()).toBe('he');
  });

  it('invalid value → Hebrew', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'fr');
    expect(await readLanguage()).toBe('he');
  });

  it('unreadable storage → Hebrew', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: PreferenceStore = {
      getItem: () => Promise.reject(new Error('disk')),
      setItem: async () => {},
      removeItem: async () => {},
    };
    expect(await readLanguage(broken)).toBe('he');
    warn.mockRestore();
  });

  it('English persists across a restart, then Hebrew does', async () => {
    const backing = new Map<string, string>();
    await saveLanguage('en', storeOver(backing));
    expect(await readLanguage(storeOver(backing))).toBe('en');
    await saveLanguage('he', storeOver(backing));
    expect(await readLanguage(storeOver(backing))).toBe('he');
  });

  it('writes through to AsyncStorage', async () => {
    await saveLanguage('en');
    expect(await AsyncStorage.getItem('@gals-coacher/ui.language')).toBe('en');
    expect(await readLanguage()).toBe('en');
  });

  it('never follows the OS language', async () => {
    for (const locale of ['en_US', 'he_IL']) {
      jest.replaceProperty(I18nManager, 'isRTL', locale === 'he_IL');
      NativeModules.SettingsManager = { settings: { AppleLocale: locale, AppleLanguages: [locale] } };
      NativeModules.I18nManager = { localeIdentifier: locale };
      expect(await readLanguage()).toBe('he');
      jest.restoreAllMocks();
    }
  });
});
