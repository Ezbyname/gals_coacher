import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { readLanguage, saveLanguage } from '@/preferences/languagePreference';
import { clearReloadTarget, markReloadTarget, readReloadTarget } from '@/preferences/rtlReloadGuard';
import { asyncStoragePreferenceStore, type PreferenceStore } from '@/preferences/store';
import type { DirectionService } from '@/services/direction/DirectionService';
import { colors } from '@/ui/theme';

import { directionFor, messagesFor, planDirection, type Direction, type Language } from './languages';
import { translate } from './translate';
import type { TranslationKey, TranslationParams } from './types';

export type I18nContextValue = {
  language: Language;
  /** Direction the language requires. */
  direction: Direction;
  /** Direction the running native layer actually uses. */
  nativeDirection: Direction;
  /** True when the native direction could not be brought in line with the language. */
  directionMismatch: boolean;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** Saves the choice, then applies its direction and reloads the app if needed. */
  setLanguage: (language: Language) => Promise<void>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type State = { status: 'resolving' } | { status: 'ready'; language: Language; directionMismatch: boolean };

type Props = {
  children: ReactNode;
  direction: DirectionService;
  store?: PreferenceStore;
  /** Shown until language and direction are settled. Must not contain text. */
  fallback?: ReactNode;
};

const nativeDirectionOf = (direction: DirectionService): Direction => (direction.isRTL() ? 'rtl' : 'ltr');

/**
 * Settles language and layout direction before any translated screen renders:
 * reads the saved language (Hebrew by default), and when the native direction
 * does not match, applies it and reloads once. The reload guard prevents loops;
 * a mismatch that survives a reload is rendered and exposed, never retried.
 */
export function I18nProvider({ children, direction, store = asyncStoragePreferenceStore, fallback }: Props) {
  const [state, setState] = useState<State>({ status: 'resolving' });

  /** Brings the native direction in line with `language`. Returns null when the app is reloading. */
  const settle = useCallback(
    async (language: Language, attempted: Direction | null): Promise<State | null> => {
      const target = directionFor(language);
      const plan = planDirection(target, nativeDirectionOf(direction), attempted);
      if (plan.action === 'render') {
        await clearReloadTarget(store);
        return { status: 'ready', language, directionMismatch: false };
      }
      if (plan.action === 'render-mismatch') {
        await clearReloadTarget(store);
        console.warn(`[i18n] layout direction is still not ${target} after a reload; not retrying.`);
        return { status: 'ready', language, directionMismatch: true };
      }
      try {
        await markReloadTarget(plan.target, store);
        direction.apply(plan.target === 'rtl');
        await direction.reload();
        return null; // the app is reloading
      } catch (e) {
        await clearReloadTarget(store);
        console.warn('[i18n] could not apply the layout direction; continuing without reload.', e);
        return { status: 'ready', language, directionMismatch: true };
      }
    },
    [direction, store],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const language = await readLanguage(store);
      let attempted: Direction | null;
      try {
        attempted = await readReloadTarget(store);
      } catch (e) {
        // Without a readable guard we cannot rule out a loop: fail safe, never reload.
        console.warn('[i18n] reload guard unreadable; continuing without reload.', e);
        const mismatch = nativeDirectionOf(direction) !== directionFor(language);
        if (!cancelled) setState({ status: 'ready', language, directionMismatch: mismatch });
        return;
      }
      const next = await settle(language, attempted);
      if (next && !cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, store, settle]);

  const setLanguage = useCallback(
    async (language: Language) => {
      if (state.status === 'ready' && state.language === language) return;
      await saveLanguage(language, store); // persist first, so the reload starts in the new language
      const next = await settle(language, null);
      if (next) setState(next);
    },
    [settle, state, store],
  );

  const value = useMemo<I18nContextValue | null>(() => {
    if (state.status !== 'ready') return null;
    const messages = messagesFor(state.language);
    return {
      language: state.language,
      direction: directionFor(state.language),
      nativeDirection: nativeDirectionOf(direction),
      directionMismatch: state.directionMismatch,
      t: (key, params) => translate(messages, key, params),
      setLanguage,
    };
  }, [direction, setLanguage, state]);

  if (!value) return <>{fallback ?? <View style={styles.fallback} testID="i18n-resolving" />}</>;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>.');
  return ctx;
}

const styles = StyleSheet.create({
  fallback: { flex: 1, backgroundColor: colors.background },
});
