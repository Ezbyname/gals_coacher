import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { ScrollView, StyleSheet } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as repository from '@/data/local/players/playerRepository';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { expectBottomInsetOnMainNavOnly } from '@/test-support/mainNav';
import { prepareApp } from '@/test-support/prepareApp';
import { spacing } from '@/ui/theme';

import EditPlayerScreen from '../children/[id]';
import PlayersScreen from '../children/index';
import NewPlayerScreen from '../children/new';
import HomeScreen from '../index';
import RootLayout from '../_layout';

// The test renderer has no device insets; each test sets the bottom inset the
// "device" reports (3-button bar, gesture bar, none).
let mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  'children/index': PlayersScreen,
  'children/new': NewPlayerScreen,
  'children/[id]': EditPlayerScreen,
};

const NOW = new Date(2026, 9, 3, 12, 0, 0).getTime();
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
let db: ReturnType<typeof openNodeSqlite> | null = null;

async function prepare(language: 'he' | 'en', bottomInset: number) {
  mockInsets = { top: 0, left: 0, right: 0, bottom: bottomInset };
  await prepareApp(language);
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const formContentStyle = () => {
  const scroll = screen.UNSAFE_getAllByType(ScrollView).find((n) => n.props.testID === 'player-form-scroll');
  return StyleSheet.flatten(scroll!.props.contentContainerStyle);
};

/** Save and Cancel are the last two controls, in normal layout flow. */
function expectSaveAndCancelLastInFlow() {
  const order = screen
    .getAllByTestId(/^player-(section-(personal|sport|basketball)|save|cancel)$/)
    .map((n) => n.props.testID);
  expect(order.slice(-2)).toEqual(['player-save', 'player-cancel']);
  for (const id of ['player-save', 'player-cancel']) {
    const style = StyleSheet.flatten(screen.getByTestId(id).props.style) ?? {};
    expect(style.position).toBeUndefined();
  }
}

describe.each(['he', 'en'] as const)('Player form bottom safe area (%s)', (language) => {
  it.each([0, 24, 48])('bottom inset %p: Basketball collapsed and expanded', async (bottom) => {
    await prepare(language, bottom);
    renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');

    // The form really runs in this language (Hebrew RTL / English LTR).
    expect(screen.getByText(language === 'he' ? 'שמירה' : 'Save')).toBeTruthy();
    expect(screen.getByText(language === 'he' ? 'ביטול' : 'Cancel')).toBeTruthy();

    // Collapsed (no sport).
    expect(screen.queryByTestId('player-section-basketball')).toBeNull();
    // The main navigation bar below the form carries the inset (NAV-001); the form adds none.
    expect(formContentStyle()).toMatchObject({ padding: spacing.lg, paddingBottom: spacing.lg });
    expectBottomInsetOnMainNavOnly(bottom);
    expectSaveAndCancelLastInFlow();

    // Expanded (the long form that hid Cancel on the device).
    fireEvent.press(screen.getByTestId('player-sport-BASKETBALL'));
    fireEvent.press(screen.getByTestId('player-primary-PG')); // secondary row appears too
    expect(screen.getByTestId('player-section-basketball')).toBeTruthy();
    expect(screen.getByTestId('player-secondary')).toBeTruthy();
    expect(formContentStyle()).toMatchObject({
      padding: spacing.lg,
      gap: spacing.xl,
      paddingBottom: spacing.lg,
    });
    expectBottomInsetOnMainNavOnly(bottom);
    expectSaveAndCancelLastInFlow();
  });

  it('Edit of an existing Basketball player (expanded) is kept clear of the inset too', async () => {
    await prepare(language, 48);
    const result = await repository.createPlayer(
      db!,
      {
        player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
        basketball: { primaryPosition: 'SF', dominantHand: 'LEFT' },
      },
      { ids: createSequentialIdService(), clock },
    );
    if (!result.ok) throw new Error('seed failed');
    renderRouter(routes, { initialUrl: `/children/${result.profile.player.id}` });
    expect(await screen.findByDisplayValue('Gal')).toBeTruthy();
    expect(screen.getByTestId('player-section-basketball')).toBeTruthy();
    expect(formContentStyle()).toMatchObject({ padding: spacing.lg, paddingBottom: spacing.lg });
    expectBottomInsetOnMainNavOnly(48);
    expectSaveAndCancelLastInFlow();
  });
});
