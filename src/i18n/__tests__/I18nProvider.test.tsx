import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { PREFERENCE_KEYS } from '@/preferences/keys';
import type { PreferenceStore } from '@/preferences/store';
import { createFakeDirectionService } from '@/test-support/fakeDirection';

import { I18nProvider, useI18n } from '../I18nProvider';

/** Memory store that also records the order of writes into a shared log. */
function memoryStore(log: string[], initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: PreferenceStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      log.push(`set:${k}=${v}`);
      data.set(k, v);
    },
    removeItem: async (k) => {
      log.push(`remove:${k}`);
      data.delete(k);
    },
  };
  return { store, data };
}

function Probe() {
  const { t, language, directionMismatch, setLanguage } = useI18n();
  return (
    <>
      <Text testID="lang">{language}</Text>
      <Text testID="mismatch">{String(directionMismatch)}</Text>
      <Text testID="title">{t('nav.quickTraining')}</Text>
      <Pressable testID="to-en" onPress={() => void setLanguage('en')} />
      <Pressable testID="to-he" onPress={() => void setLanguage('he')} />
    </>
  );
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('I18nProvider boot', () => {
  it('fresh install on an RTL-matching device renders Hebrew without reloading', async () => {
    const log: string[] = [];
    const { store } = memoryStore(log);
    const direction = createFakeDirectionService(true);
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    expect(await screen.findByTestId('lang')).toHaveTextContent('he');
    expect(screen.getByTestId('title')).toHaveTextContent('אימון מהיר');
    expect(direction.calls).toEqual([]);
  });

  it('fresh install on an LTR device reloads exactly once into RTL and shows no screen meanwhile', async () => {
    const log: string[] = [];
    const { store, data } = memoryStore(log);
    const direction = createFakeDirectionService(false);
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    await waitFor(() => expect(direction.calls).toEqual(['apply:rtl', 'reload']));
    expect(data.get(PREFERENCE_KEYS.rtlReloadTarget)).toBe('rtl');
    expect(screen.queryByTestId('lang')).toBeNull();
    expect(screen.getByTestId('i18n-resolving')).toBeTruthy();
  });

  it('after the reload, a matching direction renders and clears the guard', async () => {
    const log: string[] = [];
    const { store, data } = memoryStore(log, { [PREFERENCE_KEYS.rtlReloadTarget]: 'rtl' });
    const direction = createFakeDirectionService(true);
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    expect(await screen.findByTestId('mismatch')).toHaveTextContent('false');
    expect(data.has(PREFERENCE_KEYS.rtlReloadTarget)).toBe(false);
    expect(direction.calls).toEqual([]);
  });

  it('a mismatch that survived a reload is rendered, flagged and never retried', async () => {
    const log: string[] = [];
    const { store, data } = memoryStore(log, { [PREFERENCE_KEYS.rtlReloadTarget]: 'rtl' });
    const direction = createFakeDirectionService(false);
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    expect(await screen.findByTestId('mismatch')).toHaveTextContent('true');
    expect(direction.calls).toEqual([]);
    expect(data.has(PREFERENCE_KEYS.rtlReloadTarget)).toBe(false);
  });

  it('a failing reload clears the guard and renders with the mismatch flagged', async () => {
    const log: string[] = [];
    const { store, data } = memoryStore(log);
    const direction = createFakeDirectionService(false, () => Promise.reject(new Error('no reload')));
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    expect(await screen.findByTestId('mismatch')).toHaveTextContent('true');
    expect(direction.calls).toEqual(['apply:rtl', 'reload']);
    expect(data.has(PREFERENCE_KEYS.rtlReloadTarget)).toBe(false);
  });

  it('an unreadable guard fails safe: no reload', async () => {
    const direction = createFakeDirectionService(false);
    const store: PreferenceStore = {
      getItem: async (k) => {
        if (k === PREFERENCE_KEYS.rtlReloadTarget) throw new Error('disk');
        return null;
      },
      setItem: async () => {},
      removeItem: async () => {},
    };
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    expect(await screen.findByTestId('mismatch')).toHaveTextContent('true');
    expect(direction.calls).toEqual([]);
  });
});

describe('I18nProvider language switch', () => {
  it('saves the language BEFORE applying the direction and reloading', async () => {
    const log: string[] = [];
    const { store } = memoryStore(log);
    const direction = createFakeDirectionService(true, async () => {
      log.push('reload');
    });
    const originalApply = direction.apply;
    direction.apply = (v) => {
      log.push(`apply:${v ? 'rtl' : 'ltr'}`);
      originalApply(v);
    };
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    await screen.findByTestId('lang');
    log.length = 0;
    await act(async () => fireEvent.press(screen.getByTestId('to-en')));
    await waitFor(() => expect(log).toContain('reload'));
    expect(log).toEqual([
      `set:${PREFERENCE_KEYS.language}=en`,
      `set:${PREFERENCE_KEYS.rtlReloadTarget}=ltr`,
      'apply:ltr',
      'reload',
    ]);
  });

  it('choosing the current language does nothing', async () => {
    const log: string[] = [];
    const { store } = memoryStore(log);
    const direction = createFakeDirectionService(true);
    render(<I18nProvider direction={direction} store={store}><Probe /></I18nProvider>);
    await screen.findByTestId('lang');
    log.length = 0;
    await act(async () => fireEvent.press(screen.getByTestId('to-he')));
    expect(log).toEqual([]);
    expect(direction.calls).toEqual([]);
  });

  it('restores English after a restart when it was saved', async () => {
    const log: string[] = [];
    const { store } = memoryStore(log, { [PREFERENCE_KEYS.language]: 'en' });
    render(<I18nProvider direction={createFakeDirectionService(false)} store={store}><Probe /></I18nProvider>);
    expect(await screen.findByTestId('lang')).toHaveTextContent('en');
    expect(screen.getByTestId('title')).toHaveTextContent('Quick Training');
  });
});

describe('useI18n', () => {
  it('throws outside the provider', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/inside <I18nProvider>/);
    error.mockRestore();
  });
});
