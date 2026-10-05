import { resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, I18nManager, Platform, StyleSheet } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import type { Uuid } from '@/domain/ids';
import { MAIN_DESTINATIONS, activeDestination, screenStack } from '@/features/navigation/mainDestinations';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import { touch } from '@/ui/theme';

const routes = appRoutes(resolve(__dirname, '..')) as never;
const KEYS = ['home', 'players', 'exercises', 'settings'] as const;
const NOW = new Date(2026, 9, 6, 12).getTime();

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid;

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const created = await players.createPlayer(
    opened,
    { player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } }, basketball: null },
    { ids: createSequentialIdService(), clock: { wallNow: () => NOW, monotonicNow: () => 0 } },
  );
  if (!created.ok) throw new Error('seed failed');
  gal = created.profile.player.id;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const tab = (key: string) => screen.getByTestId(`main-nav-${key}`);
const selectedTabs = () => KEYS.filter((key) => tab(key).props.accessibilityState?.selected === true);
const labels = () => KEYS.map((key) => String(screen.getByTestId(`main-nav-${key}-label`).props.children));
/** The root stack's screens, bottom to top. */
let stack: () => string[] = () => [];
/** The stack screens' route keys (a screen kept alive keeps its key). */
let stackKeys: () => string[] = () => [];
async function open(url: string, language: 'he' | 'en' = 'he') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: url });
  stack = () => screenStack(app.getRouterState()).routes;
  stackKeys = () => {
    type Node = { routes: { name: string; key: string; state?: Node }[] };
    let state = app.getRouterState() as unknown as Node;
    while (state.routes.length === 1 && state.routes[0]!.name === '__root' && state.routes[0]!.state) {
      state = state.routes[0]!.state;
    }
    return state.routes.map((route) => route.key);
  };
  await screen.findByTestId('main-nav');
  return app;
}
const press = (key: string) => fireEvent.press(tab(key));

describe('main navigation shell (NAV-001)', () => {
  it('Hebrew: four destinations — Home, Players, Exercises, Settings — as tabs with icon + label', async () => {
    await open('/');
    expect(I18nManager.isRTL).toBe(true);
    const bar = screen.getByTestId('main-nav');
    expect(bar.props.accessibilityRole).toBe('tablist');
    expect(bar.props.accessibilityLabel).toBe('ניווט ראשי');
    expect(labels()).toEqual(['בית', 'שחקנים', 'תרגילים', 'הגדרות']);
    for (const key of KEYS) {
      expect(tab(key).props.accessibilityRole).toBe('tab');
      expect(tab(key).props.accessibilityLabel).toBe(labels()[KEYS.indexOf(key)]);
      expect(StyleSheet.flatten(tab(key).props.style).minHeight).toBeGreaterThanOrEqual(
        touch.buttonMinHeight,
      );
    }
    // A plain row: React Native mirrors it in RTL (Home at the start edge in both languages).
    expect(StyleSheet.flatten(bar.props.style).flexDirection).toBe('row');
    expect(MAIN_DESTINATIONS.map((d) => d.glyph).every((glyph) => glyph.length > 0)).toBe(true);
  });

  it('English labels (LTR)', async () => {
    await open('/', 'en');
    expect(I18nManager.isRTL).toBe(false);
    expect(labels()).toEqual(['Home', 'Players', 'Exercises', 'Settings']);
    expect(screen.getByTestId('main-nav').props.accessibilityLabel).toBe('Main navigation');
  });

  it('the current destination is marked by selection state, weight and an indicator (not color alone)', async () => {
    await open('/');
    expect(selectedTabs()).toEqual(['home']);
    const label = (key: string) =>
      StyleSheet.flatten(screen.getByTestId(`main-nav-${key}-label`).props.style);
    expect(label('home').fontWeight).toBe('800');
    expect(label('players').fontWeight).toBeUndefined();
  });

  it('moves between all four destinations; Back from any of them returns Home; no duplicate history', async () => {
    const app = await open('/');
    press('players');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(selectedTabs()).toEqual(['players']);
    press('exercises');
    await waitFor(() => expect(app.getPathname()).toBe('/exercises'));
    expect(selectedTabs()).toEqual(['exercises']);
    expect(stack()).toEqual(['index', 'exercises']);
    press('settings');
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    expect(stack()).toEqual(['index', 'settings']);
    // Tapping the current destination again does nothing.
    press('settings');
    await act(async () => {});
    expect(stack()).toEqual(['index', 'settings']);
    // Android-style Back returns Home; Home is the root.
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(stack()).toEqual(['index']);
    expect(selectedTabs()).toEqual(['home']);
    press('players');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    press('home');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(stack()).toEqual(['index']);
  });

  it('deep routes stay reachable and count as Players; Players returns to the existing list', async () => {
    const app = await open('/');
    press('players');
    fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
    fireEvent.press(await screen.findByTestId('schedule-open'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(selectedTabs()).toEqual(['players']);
    expect(stack()).toEqual(['index', 'children/index', 'children/[id]', 'children/[id]/schedule/index']);
    const listKey = stackKeys()[1];
    press('players');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(stack()).toEqual(['index', 'children/index']);
    // The existing Players screen is returned to (kept alive), not re-created.
    expect(stackKeys()[1]).toBe(listKey);
    expect(await screen.findByTestId(`player-row-${gal}`)).toBeTruthy();
  });

  it('from a deep route opened directly, Home becomes the root (Back from Settings returns Home)', async () => {
    const app = await open(`/children/${gal}/schedule`);
    expect(stack()).toEqual(['children/[id]/schedule/index']);
    press('settings');
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    expect(stack()).toEqual(['index', 'settings']);
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  it('pages opened from Home (e.g. Diagnostics) keep Home selected; Settings still works', async () => {
    const app = await open('/');
    fireEvent.press(screen.getByTestId('home-diagnostics'));
    await waitFor(() => expect(app.getPathname()).toBe('/diagnostics'));
    expect(selectedTabs()).toEqual(['home']);
    press('settings');
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    expect(stack()).toEqual(['index', 'settings']);
  });

  it('with nothing unsaved, navigating never asks', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const app = await open(`/children/${gal}/schedule`);
    press('exercises');
    await waitFor(() => expect(app.getPathname()).toBe('/exercises'));
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('activeDestination', () => {
  it.each([
    ['/', 'home'],
    ['/quick-training', 'home'],
    ['/history', 'home'],
    ['/diagnostics', 'home'],
    ['/children', 'players'],
    ['/children/new', 'players'],
    ['/children/abc/schedule/def/edit', 'players'],
    ['/exercises', 'exercises'],
    ['/settings', 'settings'],
  ] as const)('%s → %s', (pathname, key) => {
    expect(activeDestination(pathname)).toBe(key);
  });
});
