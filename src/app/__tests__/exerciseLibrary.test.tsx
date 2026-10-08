import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, FlatList, Platform, StyleSheet, type AlertButton } from 'react-native';

import * as exercises from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { BUILTIN_EXERCISES, builtinExercise } from '@/domain/exercise/catalog';
import { screenStack } from '@/features/navigation/mainDestinations';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import { touch } from '@/ui/theme';

/** TRAIN-001 through the real route tree, real SQLite, Hebrew and English. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 7, 9).getTime();
const TOTAL = BUILTIN_EXERCISES.length;

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

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const plain = (testID: string) => stripBidi(text(testID));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
/** The library is virtualized: what it LISTS is its data, in order (rows render as they scroll in). */
const shown = (): string[] =>
  (screen.UNSAFE_getAllByType(FlatList).find((l) => l.props.testID === 'exercises-scroll')?.props.data ?? []).map(
    (e: { id: string }) => e.id,
  );
const rendered = () =>
  screen
    .queryAllByTestId(/^exercise-[A-Z0-9_]+$|^exercise-[0-9a-f-]{36}$/)
    .map((n) => n.props.testID.replace('exercise-', ''));
/**
 * Brings a built-in row into the rendered window the way a user finds it:
 * by searching for its name (the virtualized list renders only nearby rows).
 */
async function reveal(id: string) {
  if (rendered().includes(id)) return;
  search(builtinExercise(id)!.name.en);
  await waitFor(() => expect(rendered()).toContain(id));
}
async function openLibrary(language: 'he' | 'en' = 'en') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: '/exercises' });
  await screen.findByTestId('exercises-count');
  return app;
}
const search = (query: string) => fireEvent.changeText(screen.getByTestId('exercises-search'), query);
const openFilters = () => {
  if (!screen.queryByTestId('exercises-filters')) press('exercises-filters-toggle');
};

describe('library', () => {
  it('Hebrew: reached from the Exercises tab; every built-in exercise listed with its coaching summary', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('main-nav-exercises'));
    await screen.findByTestId('exercises-count');
    expect(app.getPathname()).toBe('/exercises');
    expect(screen.getByTestId('main-nav-exercises').props.accessibilityState.selected).toBe(true);
    expect(plain('exercises-count')).toBe(`${TOTAL} תרגילים`);
    expect(shown()).toHaveLength(TOTAL);
    await reveal('PUSH_UP');
    expect(text('exercise-PUSH_UP-name')).toBe('שכיבות סמיכה');
    expect(text('exercise-PUSH_UP-categories')).toBe('כוח');
    expect(text('exercise-PUSH_UP-meta')).toBe('מתחילים · בלי ציוד');
    expect(text('exercise-PUSH_UP-style')).toBe('חזרות');
    await reveal('GOBLET_SQUAT');
    expect(text('exercise-GOBLET_SQUAT-meta')).toBe('מתחילים · קטלבל או משקולות יד');
    await reveal('PUSH_UP');
    const row = screen.getByTestId('exercise-PUSH_UP');
    expect(row.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
  });

  it('search in English and Hebrew', async () => {
    await openLibrary('en');
    search('goblet');
    await waitFor(() => expect(shown()).toEqual(['GOBLET_SQUAT']));
    search('דדליפט');
    await waitFor(() => expect(shown()).toEqual(expect.arrayContaining(['ROMANIAN_DEADLIFT', 'DEADLIFT'])));
    search('nothing like this');
    await waitFor(() => expect(text('exercises-none')).toBe('No exercises match.'));
  });

  it('“Equipment I have”: a home kit shows what can be done with it; “No equipment at all”; clear', async () => {
    await openLibrary('en');
    openFilters();
    press('exercises-filter-equipment-DUMBBELL');
    await waitFor(() => expect(shown()).toContain('GOBLET_SQUAT'));
    expect(plain('exercises-filter-equipment-DUMBBELL-label')).toBe('✓ Dumbbells'); // not colour alone
    expect(shown()).toContain('PUSH_UP'); // bodyweight always fits
    expect(shown()).not.toContain('BARBELL_BACK_SQUAT');
    expect(shown()).not.toContain('DUMBBELL_BENCH_PRESS'); // needs a bench too
    press('exercises-filter-equipment-BENCH');
    await waitFor(() => expect(shown()).toContain('DUMBBELL_BENCH_PRESS'));
    press('exercises-filter-flags-BODYWEIGHT');
    await waitFor(() => expect(shown()).not.toContain('GOBLET_SQUAT'));
    expect(shown()).toContain('PLANK');
    expect(plain('exercises-filters-toggle-label')).toBe('Filters (1)');
    press('exercises-filters-clear');
    await waitFor(() => expect(shown()).toHaveLength(TOTAL));
  });

  it('category, body area, muscle, difficulty and sport filters combine', async () => {
    await openLibrary('en');
    openFilters();
    press('exercises-filter-category-PLYOMETRIC');
    await waitFor(() => expect(shown()).toContain('BOX_JUMP'));
    press('exercises-filter-difficulty-ADVANCED');
    await waitFor(() => expect(shown()).toEqual(['TUCK_JUMP']));
    press('exercises-filters-clear');
    openFilters();
    press('exercises-filter-sport-BASKETBALL');
    await waitFor(() => expect(shown()).toContain('FREE_THROWS'));
    expect(shown()).not.toContain('PUSH_UP');
    press('exercises-filter-sport-BASKETBALL');
    press('exercises-filter-area-POSTERIOR_CHAIN');
    await waitFor(() => expect(shown()).toContain('KETTLEBELL_SWING'));
    expect(shown()).not.toContain('NORDIC_HAMSTRING'); // one chain muscle is not “posterior chain”
    press('exercises-filter-area-POSTERIOR_CHAIN');
    press('exercises-filter-muscle-HAMSTRINGS');
    await waitFor(() => expect(shown()).toContain('NORDIC_HAMSTRING'));
  });
});

describe('details', () => {
  it('English: a coach’s view — targets, equipment options, measurement, defaults, how-to, cues, mistakes, safety', async () => {
    const app = await openLibrary('en');
    await reveal('ROMANIAN_DEADLIFT');
    press('exercise-ROMANIAN_DEADLIFT');
    await screen.findByTestId('exercise-details-name');
    expect(app.getPathname()).toBe('/exercises/ROMANIAN_DEADLIFT');
    expect(screenStack(app.getRouterState()).routes).toEqual(['exercises', 'exercises/[exerciseId]/index']);
    expect(text('exercise-details-name')).toBe('Romanian Deadlift');
    expect(text('exercise-details-origin')).toBe('Built-in exercise');
    expect(text('exercise-details-status')).toBe('Active');
    expect(text('exercise-details-primary-value')).toBe('Hamstrings · Glutes');
    expect(text('exercise-details-secondary-value')).toBe('Lower back · Abdominals · Forearms / grip');
    expect(text('exercise-details-areas-value')).toContain('Posterior chain');
    expect(plain('exercise-details-equipment-0')).toBe('• Option 1: Barbell');
    expect(plain('exercise-details-equipment-2')).toBe('• Option 3: Kettlebell');
    expect(text('exercise-details-measurement-value')).toBe('Reps × load (kg)');
    expect(plain('exercise-details-defaults-value')).toBe('3 sets · 8 · rest 120 s');
    expect(text('exercise-details-instructions-value')).toMatch(/^Knees softly bent/);
    expect(plain('exercise-details-cues-0')).toBe('• Hips go back — the back doesn’t bend');
    expect(plain('exercise-details-mistakes-0')).toBe('• Rounding the lower back');
    expect(text('exercise-details-safety-value')).toMatch(/with a coach/);
    expect(screen.queryByTestId('exercise-details-edit')).toBeNull(); // built-ins are curated, not editable
  });

  it('Hebrew: a sprint is time over a distance; no load is asked for', async () => {
    await openLibrary('he');
    await reveal('SPRINT_20M');
    press('exercise-SPRINT_20M');
    await screen.findByTestId('exercise-details-name');
    expect(text('exercise-details-name')).toBe('ספרינט 20 מטר');
    expect(plain('exercise-details-measurement-value')).toBe('זמן ל־20 מ׳ — מהר יותר עדיף');
    expect(plain('exercise-details-equipment-0')).toBe('• מגרש / שטח ריצה');
  });

  it('make inactive asks (Keep active is the default); it then hides from the library unless asked; active again without asking', async () => {
    await openLibrary('en');
    await reveal('PLANK');
    press('exercise-PLANK');
    await screen.findByTestId('exercise-details-toggle');
    const dialogs: { title: string; buttons: AlertButton[] }[] = [];
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((title, _body, buttons = []) => void dialogs.push({ title, buttons }));
    press('exercise-details-toggle');
    expect(stripBidi(dialogs[0]!.title)).toBe('Make "Plank" inactive?');
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Keep active', 'cancel'],
      ['Make inactive', undefined],
    ]);
    await act(async () => dialogs[0]!.buttons[1]!.onPress!());
    await waitFor(() => expect(text('exercise-details-status')).toBe('Inactive'));
    expect((await exercises.getExercise(db!, 'PLANK'))!.active).toBe(false);
    press('exercise-details-toggle'); // make active: no dialog
    await waitFor(() => expect(text('exercise-details-status')).toBe('Active'));
    expect(dialogs).toHaveLength(1);
  });

  it('an inactive exercise is hidden from the library until “show inactive”', async () => {
    await prepare('en');
    await exercises.setExerciseActive(db!, 'PLANK', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/exercises' });
    await screen.findByTestId('exercises-count');
    expect(shown()).not.toContain('PLANK');
    openFilters();
    press('exercises-filter-flags-INACTIVE');
    await waitFor(() => expect(shown()).toContain('PLANK'));
    await reveal('PLANK');
    expect(text('exercise-PLANK-inactive')).toBe('Inactive');
  });
});

describe('custom exercises', () => {
  async function fillValid() {
    fireEvent.changeText(screen.getByTestId('exercise-form-name'), '  Kettlebell March  ');
    press('exercise-form-categories-STRENGTH');
    press('exercise-form-difficulty-BEGINNER');
    press('exercise-form-primary-GLUTES');
    press('exercise-form-equipment-KETTLEBELL');
    press('exercise-form-alternative-DUMBBELL');
    press('exercise-form-measurement-DURATION');
    press('exercise-form-comparison-HIGHER_IS_BETTER');
    press('exercise-form-load-LOAD');
  }

  it('English: required fields are explained; a valid custom exercise saves and is shown as entered', async () => {
    const app = await openLibrary('en');
    press('exercises-add');
    await screen.findByTestId('exercise-form-name');
    expect(app.getPathname()).toBe('/exercises/new');
    press('exercise-form-save');
    expect(await screen.findByText('Please enter a name.')).toBeTruthy();
    expect(screen.getByText('Choose at least one training type.')).toBeTruthy();
    expect(screen.getByText('Choose a difficulty.')).toBeTruthy();
    expect(screen.getByText('Choose at least one primary muscle.')).toBeTruthy();
    expect(screen.getByText('Choose what is measured.')).toBeTruthy();
    await fillValid();
    press('exercise-form-save');
    await waitFor(() => expect(app.getPathname()).toBe('/exercises'));
    const custom = (await exercises.listExercises(db!)).at(-1)!;
    expect(custom).toMatchObject({
      builtin: false,
      name: { en: 'Kettlebell March', he: 'Kettlebell March' },
      equipment: [['KETTLEBELL'], ['DUMBBELL']],
      measurement: { type: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: true },
    });
    search('march');
    await waitFor(() => expect(shown()).toEqual([custom.id]));
    press(`exercise-${custom.id}`);
    await screen.findByTestId('exercise-details-name');
    expect(text('exercise-details-origin')).toBe('Added by you');
    expect(text('exercise-details-measurement-value')).toBe('Time under load (kg)');
    expect(plain('exercise-details-equipment-1')).toBe('• Option 2: Dumbbells');
  });

  it('Hebrew: the custom name is the user’s text (not translated); edit keeps the same exercise', async () => {
    await openLibrary('he');
    press('exercises-add');
    await screen.findByTestId('exercise-form-name');
    fireEvent.changeText(screen.getByTestId('exercise-form-name'), 'הליכת דוב עם משקל');
    press('exercise-form-categories-CONDITIONING');
    press('exercise-form-difficulty-INTERMEDIATE');
    press('exercise-form-primary-SHOULDERS');
    press('exercise-form-measurement-REPETITIONS');
    press('exercise-form-save');
    await waitFor(() => expect(screen.queryByTestId('exercise-form-name')).toBeNull());
    const custom = (await exercises.listExercises(db!)).at(-1)!;
    expect(custom.name).toEqual({ he: 'הליכת דוב עם משקל', en: 'הליכת דוב עם משקל' });
    search('הליכת דוב');
    await waitFor(() => expect(shown()).toEqual([custom.id]));
    press(`exercise-${custom.id}`);
    fireEvent.press(await screen.findByTestId('exercise-details-edit'));
    await screen.findByTestId('exercise-form-name');
    expect(screen.getByTestId('exercise-form-name').props.value).toBe('הליכת דוב עם משקל');
    fireEvent.changeText(screen.getByTestId('exercise-form-name'), 'זחילת דוב עם משקל');
    press('exercise-form-save');
    await waitFor(() => expect(text('exercise-details-name')).toBe('זחילת דוב עם משקל'));
    expect((await exercises.listExercises(db!)).filter((e) => !e.builtin)).toHaveLength(1);
  });

  it('unsaved changes: a typed form asks before leaving; an untouched one and Cancel do not', async () => {
    const dialogs: string[] = [];
    await openLibrary('en');
    jest.spyOn(Alert, 'alert').mockImplementation((title) => void dialogs.push(title));
    press('exercises-add');
    await screen.findByTestId('exercise-form-name');
    press('main-nav-home'); // untouched: leaves freely
    await waitFor(() => expect(screen.queryByTestId('exercise-form-name')).toBeNull());
    expect(dialogs).toEqual([]);
    fireEvent.press(await screen.findByTestId('main-nav-exercises'));
    fireEvent.press(await screen.findByTestId('exercises-add'));
    fireEvent.changeText(await screen.findByTestId('exercise-form-name'), 'Sled Drag');
    press('main-nav-home');
    await waitFor(() => expect(dialogs).toEqual(['Leave without saving?']));
    press('exercise-form-cancel'); // explicit Cancel discards without asking
    await waitFor(() => expect(screen.queryByTestId('exercise-form-name')).toBeNull());
    expect(dialogs).toHaveLength(1);
    expect((await exercises.listExercises(db!)).filter((e) => !e.builtin)).toEqual([]);
  });

  it('a custom exercise survives a restart (a fresh mount reads it back)', async () => {
    await prepare('en');
    const created = await exercises.createCustomExercise(
      db!,
      {
        name: 'Court Shuffle',
        categories: ['AGILITY'],
        primaryMuscles: ['HIP_STABILIZERS'],
        secondaryMuscles: [],
        difficulty: 'BEGINNER',
        sports: ['BASKETBALL'],
        equipment: [['CONES']],
        measurementType: 'TIME',
        comparison: null,
        usesLoad: false,
        instructions: '',
        tutorialUrl: '',
      },
      { ids: createSequentialIdService(), clock: systemClock },
    );
    expect(created.ok).toBe(true);
    const first = renderRouter(routes, { initialUrl: '/exercises' });
    await screen.findByTestId('exercises-count');
    expect(shown()).toContain('00000000-0000-4000-8000-000000000001');
    first.unmount();
    renderRouter(routes, { initialUrl: '/exercises/00000000-0000-4000-8000-000000000001' });
    expect(await screen.findByTestId('exercise-details-name')).toBeTruthy();
    expect(text('exercise-details-name')).toBe('Court Shuffle');
    expect(within(screen.getByTestId('exercise-details-sports')).getByText('Basketball')).toBeTruthy();
  });
});
