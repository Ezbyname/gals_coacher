import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/i18n/languages';

import { PREFERENCE_KEYS } from './keys';
import { asyncStoragePreferenceStore, type PreferenceStore } from './store';

/**
 * The app language. Missing, invalid or unreadable → Hebrew. The OS language
 * is never consulted: Hebrew is the default on every fresh install.
 */
export async function readLanguage(store: PreferenceStore = asyncStoragePreferenceStore): Promise<Language> {
  try {
    const value = await store.getItem(PREFERENCE_KEYS.language);
    return isLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch (e) {
    console.warn('[i18n] could not read the language preference; using Hebrew.', e);
    return DEFAULT_LANGUAGE;
  }
}

/** Persists the user's explicit choice. Throws if it cannot be stored. */
export async function saveLanguage(
  language: Language,
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<void> {
  await store.setItem(PREFERENCE_KEYS.language, language);
}
