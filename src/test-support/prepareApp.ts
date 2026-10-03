import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import { directionFor, type Language } from '@/i18n/languages';
import { PREFERENCE_KEYS } from '@/preferences/keys';

/**
 * Puts the app in the state of an already-settled launch for `language`:
 * preference stored (Hebrew = nothing stored, the default) and the native
 * direction already matching, so no reload is attempted.
 */
export async function prepareApp(language: Language): Promise<void> {
  await AsyncStorage.clear();
  if (language !== 'he') await AsyncStorage.setItem(PREFERENCE_KEYS.language, language);
  jest.replaceProperty(I18nManager, 'isRTL', directionFor(language) === 'rtl');
}
