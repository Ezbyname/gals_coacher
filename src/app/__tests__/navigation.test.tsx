import { reloadAppAsync } from 'expo';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, I18nManager } from 'react-native';

import { stripBidi } from '@/i18n/bidi';
import { prepareApp } from '@/test-support/prepareApp';

import EditPlayerScreen from '../children/[id]';
import PlayersScreen from '../children/index';
import NewPlayerScreen from '../children/new';
import DiagnosticsScreen from '../diagnostics';
import ExercisesScreen from '../exercises';
import HistoryScreen from '../history';
import HomeScreen from '../index';
import QuickTrainingScreen from '../quick-training';
import SettingsScreen from '../settings';
import RootLayout from '../_layout';

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  'quick-training': QuickTrainingScreen,
  'children/index': PlayersScreen,
  'children/new': NewPlayerScreen,
  'children/[id]': EditPlayerScreen,
  exercises: ExercisesScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
  diagnostics: DiagnosticsScreen,
};

const textOf = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));

afterEach(() => jest.restoreAllMocks());

describe('navigation — Hebrew (default)', () => {
  beforeEach(() => prepareApp('he'));

  it('opens on a Hebrew Home and navigates to Quick Training', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('🏀 מוכנים לאימון?')).toBeTruthy();
    expect(screen.getByText('בוחרים שחקן, בוחרים תרגיל, יוצאים לדרך.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-quick-training'));
    await waitFor(() => expect(app.getPathname()).toBe('/quick-training'));
    expect(screen.getByText('בקרוב')).toBeTruthy();
    expect(screen.queryByText(/Phase|ROADMAP/)).toBeNull();
  });

  it('opens Players from Home (no longer a placeholder)', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('home-players')); // Home's button (the nav bar has one too)
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await screen.findByText('עדיין אין שחקנים')).toBeTruthy();
    expect(screen.queryByText('בקרוב')).toBeNull();
  });

  it('opens the Exercise Library (no longer a placeholder)', async () => {
    renderRouter(routes, { initialUrl: '/exercises' });
    expect(await screen.findByTestId('exercises-search')).toBeTruthy();
    expect(screen.getByTestId('exercises-count')).toBeTruthy();
    expect(screen.queryByText('בקרוב')).toBeNull();
  });

  it.each([['/history', 'היסטוריה']])('shows the Hebrew placeholder on %s', async (url, title) => {
    renderRouter(routes, { initialUrl: url });
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByText('בקרוב')).toBeTruthy();
  });

  it('reports database, direction and the measurement sample on בדיקות מערכת', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('home-diagnostics'));
    await waitFor(() => expect(app.getPathname()).toBe('/diagnostics'));
    await waitFor(() => expect(textOf('diag-sqlite')).toBe('מוכן · סכמה v12 (הוחלו בהפעלה זו: 12)'));
    expect(textOf('diag-direction')).toBe('בפועל: rtl · צפוי: rtl');
    const sample = textOf('diag-rtl-sample');
    for (const v of ['18/20', '80%', '4.38', '00:45', '20m']) expect(sample).toContain(v);
  });

  it('Settings lists both languages and switching to English saves, applies LTR and reloads', async () => {
    const order: string[] = [];
    jest.spyOn(I18nManager, 'forceRTL').mockImplementation((v) => void order.push(`forceRTL(${v})`));
    jest.spyOn(I18nManager, 'allowRTL').mockImplementation((v) => void order.push(`allowRTL(${v})`));
    (reloadAppAsync as jest.Mock).mockImplementationOnce(async () => void order.push('reload'));
    jest.spyOn(Alert, 'alert').mockImplementation((title, _body, buttons) => {
      order.push(`alert:${title}`);
      buttons?.find((b) => b.style !== 'cancel')?.onPress?.();
    });

    renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByText('שפה')).toBeTruthy();
    expect(screen.getByTestId('settings-language-he').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('settings-language-en'));
    await waitFor(() => expect(order).toContain('reload'));
    expect(order).toEqual(['alert:החלפת שפה', 'forceRTL(false)', 'allowRTL(false)', 'reload']);
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
    expect(await AsyncStorage.getItem('@gals-coacher/ui.language')).toBe('en');
    // The explicit switch marks the coming reload as a language change (no 5 s splash).
    expect(Number(await AsyncStorage.getItem('@gals-coacher/startup.languageSwitchAt'))).toBeGreaterThan(0);
  });
});

describe('navigation — English', () => {
  beforeEach(() => prepareApp('en'));

  it('restores English and LTR after a restart', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('🏀 Ready to train?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-quick-training'));
    await waitFor(() => expect(app.getPathname()).toBe('/quick-training'));
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('shows the English diagnostics lines', async () => {
    renderRouter(routes, { initialUrl: '/diagnostics' });
    await waitFor(() => expect(textOf('diag-sqlite')).toBe('ready · schema v12 (applied this launch: 12)'));
    expect(textOf('diag-direction')).toBe('actual: ltr · expected: ltr');
  });
});
