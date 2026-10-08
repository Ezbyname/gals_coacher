import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { FlatList, Platform, StyleSheet } from 'react-native';

import * as exercises from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { setTaxonomyNodeActive } from '@/data/local/taxonomy/taxonomyRepository';
import { BUILTIN_EXERCISES } from '@/domain/exercise/catalog';
import { BUILTIN_TAXONOMY_MEMBERS } from '@/domain/taxonomy/memberships';
import { BUILTIN_TAXONOMY_NODES } from '@/domain/taxonomy/nodes';
import { buildTaxonomy } from '@/domain/taxonomy/taxonomy';
import { screenStack } from '@/features/navigation/mainDestinations';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import { touch } from '@/ui/theme';

/** TRAIN-TAXONOMY-001C: browsing the library by training category, real routes, real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 8, 9).getTime();

/** The curated shelf of a node, all built-ins active (fresh install). */
const curated = buildTaxonomy(BUILTIN_TAXONOMY_NODES, () => true, BUILTIN_TAXONOMY_MEMBERS);
const shelf = (key: string) => curated.exerciseIdsUnder(key).size;

let db: ReturnType<typeof openNodeSqlite> | null = null;
async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
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

const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const a11y = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.accessibilityLabel));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
/** What a (virtualized) list LISTS, in order — on the top screen (the stack keeps the ones below mounted). */
const listed = (testID: string): string[] =>
  (screen.UNSAFE_getAllByType(FlatList).filter((l) => l.props.testID === testID).at(-1)?.props.data ?? []).map(
    (e: { id: string }) => e.id,
  );
const nodes = () =>
  screen
    .queryAllByTestId(/^taxonomy-node-[A-Z_]+$/)
    .map((n) => String(n.props.testID).replace('taxonomy-node-', ''));

async function open(url: string, language: 'he' | 'en' = 'en') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: url });
  await screen.findByTestId(url === '/exercises' ? 'exercises-count' : 'taxonomy-scroll');
  return app;
}
async function enter(nodeKey: string) {
  press(`taxonomy-node-${nodeKey}`);
  await waitFor(() => expect(text('taxonomy-breadcrumb')).toMatch(/›/));
}

describe('library home', () => {
  it('Add exercise comes first (never only after the list); the training domains are offered with counts', async () => {
    await open('/exercises');
    const order = screen
      .queryAllByTestId(/^(exercises-add|exercises-search|taxonomy-home|exercises-count|exercise-[A-Z0-9_]+)$/)
      .map((n) => n.props.testID);
    expect(order.slice(0, 4)).toEqual(['exercises-add', 'exercises-search', 'taxonomy-home', 'exercises-count']);
    expect(text('taxonomy-home-title')).toBe('Training categories');
    expect(text('taxonomy-domain-FITNESS-label')).toBe('Fitness');
    expect(text('taxonomy-domain-BASKETBALL-count')).toBe(`${shelf('BASKETBALL')} exercises`);
    expect(a11y('taxonomy-domain-BASKETBALL')).toBe(`Basketball, ${shelf('BASKETBALL')} exercises`);
    const button = screen.getByTestId('taxonomy-domain-FITNESS');
    expect(button.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
    // The whole library is still one search away.
    expect(listed('exercises-scroll')).toHaveLength(BUILTIN_EXERCISES.length);
  });

  it('Search All bypasses the hierarchy: typing hides the categories and searches every exercise', async () => {
    await open('/exercises');
    fireEvent.changeText(screen.getByTestId('exercises-search'), 'free throws');
    await waitFor(() => expect(listed('exercises-scroll')).toEqual(['FREE_THROWS']));
    expect(screen.queryByTestId('taxonomy-home')).toBeNull();
    fireEvent.changeText(screen.getByTestId('exercises-search'), '');
    await screen.findByTestId('taxonomy-home');
  });
});

describe('navigation', () => {
  it('Fitness keeps body area and training goal apart; Legs › Hinge lists the hinge exercises', async () => {
    const app = await open('/exercises');
    press('taxonomy-domain-FITNESS');
    await screen.findByTestId('taxonomy-group-BODY_AREA');
    expect(app.getPathname()).toBe('/exercises/categories/FITNESS');
    expect(text('taxonomy-breadcrumb')).toBe('Fitness');
    expect(text('taxonomy-group-BODY_AREA-title')).toBe('By body area');
    expect(text('taxonomy-group-TRAINING_GOAL-title')).toBe('By training goal');
    expect(nodes()).toEqual([
      ...['CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'CORE', 'LEGS', 'FULL_BODY'],
      ...['STRENGTH', 'POWER', 'SPEED', 'AGILITY', 'CONDITIONING', 'MOBILITY', 'WARMUP', 'COOLDOWN'],
    ].map((k) => `FITNESS_${k}`));
    // A domain shows categories, not the whole catalog.
    expect(listed('taxonomy-scroll')).toEqual([]);

    await enter('FITNESS_LEGS');
    expect(text('taxonomy-breadcrumb')).toBe('Fitness › Legs');
    expect(text('taxonomy-exercises-title')).toBe('All exercises in Legs');
    expect(listed('taxonomy-scroll')).toHaveLength(shelf('FITNESS_LEGS'));
    expect(text('taxonomy-count')).toBe(`${shelf('FITNESS_LEGS')} exercises`);

    await enter('FITNESS_LEGS_HINGE');
    expect(app.getPathname()).toBe('/exercises/categories/FITNESS_LEGS_HINGE');
    expect(text('taxonomy-breadcrumb')).toBe('Fitness › Legs › Hinge & Posterior Chain');
    expect(a11y('taxonomy-breadcrumb')).toBe('You are in: Fitness › Legs › Hinge & Posterior Chain');
    expect(text('taxonomy-exercises-title')).toBe('Exercises');
    expect(listed('taxonomy-scroll')).toEqual(expect.arrayContaining(['DEADLIFT', 'ROMANIAN_DEADLIFT']));
    expect(listed('taxonomy-scroll')).not.toContain('GOBLET_SQUAT');
    expect(screenStack(app.getRouterState()).routes).toEqual([
      'exercises',
      'exercises/categories/[nodeKey]',
      'exercises/categories/[nodeKey]',
      'exercises/categories/[nodeKey]',
    ]);
  });

  it('one exercise, many paths: Pull-Up Jumper under Mid-Range and Pull-Up, once under Shooting, one record', async () => {
    const app = await open('/exercises/categories/BASKETBALL_SHOOTING');
    const shooting = listed('taxonomy-scroll');
    expect(shooting.filter((id) => id === 'PULL_UP_JUMPER')).toHaveLength(1);
    expect(new Set(shooting).size).toBe(shooting.length);
    expect(shooting).toHaveLength(shelf('BASKETBALL_SHOOTING'));

    await enter('BASKETBALL_SHOOTING_MID_RANGE');
    expect(listed('taxonomy-scroll')).toEqual(['MID_RANGE_SPOT_SHOOTING', 'PULL_UP_JUMPER']);
    press('exercise-PULL_UP_JUMPER');
    await screen.findByTestId('exercise-details-name');
    expect(app.getPathname()).toBe('/exercises/PULL_UP_JUMPER');

    app.unmount();
    renderRouter(routes, { initialUrl: '/exercises/categories/BASKETBALL_SHOOTING_PULL_UP' });
    await screen.findByTestId('taxonomy-scroll');
    expect(listed('taxonomy-scroll')).toEqual(['PULL_UP_JUMPER']);
  });

  it('Basketball shows its eight categories in coaching order; Shooting › Free Throws', async () => {
    await open('/exercises/categories/BASKETBALL');
    expect(nodes()).toEqual(
      ['SHOOTING', 'FINISHING', 'BALL_HANDLING', 'PASSING', 'DEFENSE', 'FOOTWORK', 'REBOUNDING', 'ATHLETIC'].map(
        (k) => `BASKETBALL_${k}`,
      ),
    );
    expect(screen.queryByTestId('taxonomy-group-BODY_AREA')).toBeNull();
    await enter('BASKETBALL_SHOOTING');
    await enter('BASKETBALL_SHOOTING_FREE_THROWS');
    expect(text('taxonomy-breadcrumb')).toBe('Basketball › Shooting › Free Throws');
    expect(listed('taxonomy-scroll')).toEqual(['FREE_THROWS']);
  });
});

describe('search inside a category', () => {
  it('searches the category by default; one tap searches all exercises; the scope is said in text', async () => {
    await open('/exercises/categories/BASKETBALL_SHOOTING');
    expect(text('taxonomy-search-scope')).toBe('Searching in Shooting only');
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'squat');
    await screen.findByTestId('taxonomy-none');
    expect(screen.queryByTestId('taxonomy-node-BASKETBALL_SHOOTING_FREE_THROWS')).toBeNull();

    press('taxonomy-search-all');
    await waitFor(() => expect(listed('taxonomy-scroll')).toContain('GOBLET_SQUAT'));
    expect(screen.getByTestId('taxonomy-search-all').props.accessibilityState.checked).toBe(true);
    expect(text('taxonomy-search-all-label')).toBe('✓ Search all exercises'); // not colour alone
    expect(text('taxonomy-search-scope')).toBe('Searching all exercises');

    press('taxonomy-search-all');
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'pull');
    await waitFor(() => expect(listed('taxonomy-scroll')).toEqual(['PULL_UP_JUMPER']));
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), '');
    await screen.findByTestId('taxonomy-node-BASKETBALL_SHOOTING_FREE_THROWS');
  });
});

describe('hidden for new selection', () => {
  it('a category whose only exercise is inactive disappears, and its parent count drops; history is not involved', async () => {
    await prepare('en');
    await exercises.setExerciseActive(db!, 'FLOATERS', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/exercises/categories/BASKETBALL_FINISHING' });
    await screen.findByTestId('taxonomy-scroll');
    expect(nodes()).not.toContain('BASKETBALL_FINISHING_FLOATER');
    expect(nodes()).toContain('BASKETBALL_FINISHING_LAYUPS');
    expect(listed('taxonomy-scroll')).not.toContain('FLOATERS');
    expect(text('taxonomy-count')).toBe(`${shelf('BASKETBALL_FINISHING') - 1} exercises`);
  });

  it('an inactive category is hidden; reached directly it says it is not available', async () => {
    await prepare('en');
    await setTaxonomyNodeActive(db!, 'BASKETBALL_REBOUNDING', false, { clock: systemClock });
    const app = renderRouter(routes, { initialUrl: '/exercises/categories/BASKETBALL' });
    await screen.findByTestId('taxonomy-scroll');
    expect(nodes()).not.toContain('BASKETBALL_REBOUNDING');
    app.unmount();
    renderRouter(routes, { initialUrl: '/exercises/categories/BASKETBALL_REBOUNDING' });
    await screen.findByTestId('taxonomy-unavailable');
    expect(screen.queryByTestId('taxonomy-scroll')).toBeNull();
  });

  it('an unknown category key is not available (never a crash)', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/exercises/categories/NO_SUCH_NODE' });
    await screen.findByTestId('taxonomy-unavailable');
  });
});

describe('Hebrew', () => {
  it('labels, breadcrumb and counts in Hebrew; the sections keep their meaning', async () => {
    await open('/exercises', 'he');
    expect(text('taxonomy-home-title')).toBe('קטגוריות אימון');
    expect(a11y('taxonomy-domain-BASKETBALL')).toBe(`כדורסל, ${shelf('BASKETBALL')} תרגילים`);
    press('taxonomy-domain-FITNESS');
    await screen.findByTestId('taxonomy-group-BODY_AREA');
    expect(text('taxonomy-group-BODY_AREA-title')).toBe('לפי אזור בגוף');
    await enter('FITNESS_LEGS');
    await enter('FITNESS_LEGS_HINGE');
    expect(text('taxonomy-breadcrumb')).toBe('אימון כושר › רגליים › ציר ירכיים ושרשרת אחורית');
    expect(text('taxonomy-search-scope')).toBe('מחפשים רק בציר ירכיים ושרשרת אחורית');
  });
});
