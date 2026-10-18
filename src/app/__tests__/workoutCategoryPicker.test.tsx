import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { FlatList, Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { listBlocks } from '@/data/local/training/workoutRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAIN-TAXONOMY-001D: choosing a block's exercise by training category, real routes, real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 8, 17).getTime();

let db: ReturnType<typeof openNodeSqlite> | null = null;
async function open(language: 'he' | 'en' = 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  // Reached the user's way (Workouts → New block), so Save has a screen to return to.
  const app = renderRouter(routes, { initialUrl: '/workouts' });
  fireEvent.press(await screen.findByTestId('workouts-new-block'));
  await screen.findByTestId('block-form-name');
  return app;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
const listed = (): string[] =>
  (screen.UNSAFE_getAllByType(FlatList).filter((l) => l.props.testID === 'taxonomy-scroll').at(-1)?.props.data ?? []).map(
    (e: { id: string }) => e.id,
  );
const nodes = () =>
  screen
    .queryAllByTestId(/^taxonomy-node-[A-Z_]+$/)
    .map((n) => String(n.props.testID).replace('taxonomy-node-', ''));
const items = () =>
  screen
    .queryAllByTestId(/^block-item-\d+-name$/)
    .map((n) => stripBidi(String(n.props.children)));

async function browse(...path: string[]) {
  press('block-form-browse');
  await screen.findByTestId('taxonomy-picker');
  for (const key of path) {
    press(`taxonomy-node-${key}`);
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toMatch(/›|^Basketball$|^Fitness$|^כדורסל$|^אימון כושר$/));
  }
}

describe('Workout Builder: choose by training category', () => {
  it('Browse → Basketball → Shooting → Free Throws adds that exercise and returns to the block', async () => {
    await open();
    type('block-form-name', 'Shots');
    press('block-form-browse');
    await screen.findByTestId('taxonomy-picker');
    expect(text('taxonomy-picker-title')).toBe('Choose an exercise');
    expect(text('taxonomy-breadcrumb')).toBe('Training categories');
    expect(nodes()).toEqual(['FITNESS', 'BASKETBALL', 'FOOTBALL', 'SURFING']);
    expect(screen.queryByTestId('taxonomy-back')).toBeNull(); // top level: nothing to go back to

    press('taxonomy-node-BASKETBALL');
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toBe('Basketball'));
    press('taxonomy-node-BASKETBALL_SHOOTING');
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toBe('Basketball › Shooting'));
    press('taxonomy-node-BASKETBALL_SHOOTING_FREE_THROWS');
    await waitFor(() => expect(listed()).toEqual(['FREE_THROWS']));
    expect(screen.getByTestId('exercise-FREE_THROWS').props.accessibilityLabel).toBe('Add Free Throws');

    press('exercise-FREE_THROWS');
    await waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());
    expect(items()).toEqual(['Free Throws']);
    expect(screen.getByTestId('block-form-name').props.value).toBe('Shots'); // the form kept its state

    press('block-form-save');
    await waitFor(async () => expect(await listBlocks(db!)).toHaveLength(1));
    const [saved] = await listBlocks(db!);
    expect(saved!.items.map((i) => i.exercise.id)).toEqual(['FREE_THROWS']);
  });

  it('the same exercise through two paths is the same exercise id', async () => {
    await open();
    type('block-form-name', 'Pull-ups twice');
    await browse('BASKETBALL', 'BASKETBALL_SHOOTING', 'BASKETBALL_SHOOTING_MID_RANGE');
    press('exercise-PULL_UP_JUMPER');
    await waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());
    await browse('BASKETBALL', 'BASKETBALL_SHOOTING', 'BASKETBALL_SHOOTING_PULL_UP');
    press('exercise-PULL_UP_JUMPER');
    await waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());
    expect(items()).toEqual(['Pull-Up Jumper off the Dribble', 'Pull-Up Jumper off the Dribble']);
    press('block-form-save');
    await waitFor(async () => expect(await listBlocks(db!)).toHaveLength(1));
    const [saved] = await listBlocks(db!);
    expect(saved!.items.map((i) => i.exercise.id)).toEqual(['PULL_UP_JUMPER', 'PULL_UP_JUMPER']);
  });

  it('Back goes up one level; Close returns to the block unchanged; the picker reopens at the top', async () => {
    await open();
    type('block-form-name', 'Keep me');
    await browse('BASKETBALL', 'BASKETBALL_SHOOTING');
    expect(text('taxonomy-breadcrumb')).toBe('Basketball › Shooting');
    press('taxonomy-back');
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toBe('Basketball'));
    press('taxonomy-picker-close');
    await waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());
    expect(items()).toEqual([]);
    expect(screen.getByTestId('block-form-name').props.value).toBe('Keep me');
    press('block-form-browse');
    await screen.findByTestId('taxonomy-picker');
    expect(text('taxonomy-breadcrumb')).toBe('Training categories');
  });

  it('search: the top level searches everything; inside a category it is scoped, one tap searches all', async () => {
    await open();
    press('block-form-browse');
    await screen.findByTestId('taxonomy-picker');
    expect(screen.queryByTestId('taxonomy-search-all')).toBeNull(); // already everything
    type('taxonomy-search', 'goblet');
    await waitFor(() => expect(listed()).toEqual(['GOBLET_SQUAT']));
    type('taxonomy-search', '');
    press('taxonomy-node-BASKETBALL');
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toBe('Basketball'));
    type('taxonomy-search', 'goblet');
    await screen.findByTestId('taxonomy-none');
    press('taxonomy-search-all');
    await waitFor(() => expect(listed()).toEqual(['GOBLET_SQUAT']));
    press('exercise-GOBLET_SQUAT');
    await waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());
    expect(items()).toEqual(['Goblet Squat']);
  });

  it('direct search in the block form still works without the picker', async () => {
    await open();
    type('block-form-search', 'free throw');
    press(await screen.findByTestId('block-form-add-FREE_THROWS').then((n) => n.props.testID));
    expect(items()).toEqual(['Free Throws']);
  });

  it('Hebrew: the picker speaks Hebrew and adds the chosen exercise', async () => {
    await open('he');
    press('block-form-browse');
    await screen.findByTestId('taxonomy-picker');
    expect(text('taxonomy-picker-title')).toBe('בחירת תרגיל');
    expect(text('taxonomy-breadcrumb')).toBe('קטגוריות אימון');
    press('taxonomy-node-FITNESS');
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toBe('אימון כושר'));
    expect(screen.getByTestId('taxonomy-group-BODY_AREA')).toBeTruthy();
    press('taxonomy-node-FITNESS_LEGS');
    await waitFor(() => expect(text('taxonomy-breadcrumb')).toBe('אימון כושר › רגליים'));
    press('exercise-GOBLET_SQUAT');
    await waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());
    expect(items()).toHaveLength(1);
  });
});
