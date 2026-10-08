import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { setTaxonomyNodeActive } from '@/data/local/taxonomy/taxonomyRepository';
import { createBlock, createTemplate, listTemplates } from '@/data/local/training/workoutRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAIN-TAXONOMY-001E: classifying a workout template with the shared category picker. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 8, 18).getTime();

let db: ReturnType<typeof openNodeSqlite> | null = null;
let blockId = '';
const deps = { ids: createSequentialIdService(), clock: systemClock };
async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const block = await createBlock(
    opened,
    { name: 'Shots', items: [{ exerciseId: 'FREE_THROWS', prescription: { sets: 2, target: 10, loadKg: null, restSec: null } }] },
    deps,
  );
  if (!block.ok) throw new Error('seed failed');
  blockId = block.block.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const categories = () =>
  screen
    .queryAllByTestId(/^template-form-category-[A-Z_]+$/)
    .map((n) => String(n.props.testID).replace('template-form-category-', ''));

async function openNewTemplate(language: 'he' | 'en' = 'en') {
  await prepare(language);
  renderRouter(routes, { initialUrl: '/workouts' });
  fireEvent.press(await screen.findByTestId('workouts-new-template'));
  await screen.findByTestId('template-form-name');
}
async function openPicker() {
  press('template-form-add-category');
  await screen.findByTestId('taxonomy-picker');
}
async function go(key: string) {
  press(`taxonomy-node-${key}`);
  await screen.findByTestId('taxonomy-breadcrumb');
}
const pickerClosed = () => waitFor(() => expect(screen.queryByTestId('taxonomy-picker')).toBeNull());

describe('category search is bilingual (both directions)', () => {
  const results = () =>
    screen
      .queryAllByTestId(/^taxonomy-choose-[A-Z_]+$/)
      .map((n) => String(n.props.testID).replace('taxonomy-choose-', ''));

  it('English UI: a Hebrew query finds the category, shown in English; no duplicates; scoped search unchanged', async () => {
    await openNewTemplate('en');
    await openPicker();
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'פלואטר');
    expect(results()).toEqual(['BASKETBALL_FINISHING_FLOATER']);
    expect(text('taxonomy-choose-BASKETBALL_FINISHING_FLOATER-label')).toBe('Basketball › Finishing › Floater');
    // "Shooting" matches the category and each of its sub-categories once (the path contains it).
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'קליעה');
    const shooting = results();
    expect(new Set(shooting).size).toBe(shooting.length);
    expect(shooting).toContain('BASKETBALL_SHOOTING');
    expect(shooting.every((k) => k.startsWith('BASKETBALL_SHOOTING'))).toBe(true);
    // Inside Fitness, a Basketball term finds nothing until "search all".
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), '');
    press('taxonomy-node-FITNESS');
    await screen.findByTestId('taxonomy-search-all');
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'פלואטר');
    expect(results()).toEqual([]);
    press('taxonomy-search-all');
    expect(results()).toEqual(['BASKETBALL_FINISHING_FLOATER']);
  });

  it('Hebrew UI: an English query finds the category, shown in Hebrew', async () => {
    await openNewTemplate('he');
    await openPicker();
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'floater');
    expect(results()).toEqual(['BASKETBALL_FINISHING_FLOATER']);
    expect(text('taxonomy-choose-BASKETBALL_FINISHING_FLOATER-label')).toBe('כדורסל › סיומות ליד הסל › פלואטר');
  });
});

describe('template categories', () => {
  it('choose by browsing and by searching; full paths; duplicate refused; primary; saved', async () => {
    await openNewTemplate();
    fireEvent.changeText(screen.getByTestId('template-form-name'), 'Shooting day');
    expect(text('template-form-categories-none')).toBe('No category chosen yet.');

    await openPicker();
    expect(text('taxonomy-picker-title')).toBe('Choose a category');
    expect(screen.queryByTestId('taxonomy-choose')).toBeNull(); // the top level is not a category
    await go('BASKETBALL');
    expect(screen.queryByTestId('taxonomy-choose')).toBeNull(); // nor is a whole domain
    await go('BASKETBALL_SHOOTING');
    expect(text('taxonomy-choose-label')).toBe('Choose Basketball › Shooting');
    press('taxonomy-choose');
    await pickerClosed();
    expect(categories()).toEqual(['BASKETBALL_SHOOTING']);
    expect(text('template-form-category-BASKETBALL_SHOOTING-label')).toBe('Basketball › Shooting');

    // Search category names: both "Agility" nodes are offered, each with its path.
    await openPicker();
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'agility');
    expect(text('taxonomy-choose-BASKETBALL_ATHLETIC_AGILITY-label')).toBe('Basketball › Athletic Development › Agility');
    expect(text('taxonomy-choose-FITNESS_AGILITY-label')).toBe('Fitness › Agility');
    press('taxonomy-choose-BASKETBALL_ATHLETIC_AGILITY');
    await pickerClosed();
    expect(categories()).toEqual(['BASKETBALL_SHOOTING', 'BASKETBALL_ATHLETIC_AGILITY']);

    // Already chosen: offered, but disabled with the reason in text.
    await openPicker();
    await go('BASKETBALL');
    await go('BASKETBALL_SHOOTING');
    expect(screen.getByTestId('taxonomy-choose').props.accessibilityState.disabled).toBe(true);
    expect(text('taxonomy-choose-reason')).toBe('Already added');
    press('taxonomy-picker-close');
    await pickerClosed();
    expect(categories()).toHaveLength(2);

    expect(text('template-form-primary')).toBe('Primary category: none');
    press('template-form-category-BASKETBALL_SHOOTING-primary');
    expect(screen.getByTestId('template-form-category-BASKETBALL_SHOOTING-primary').props.accessibilityState.checked).toBe(true);
    expect(text('template-form-primary')).toBe('Primary category: Basketball › Shooting');

    press(`template-form-add-${blockId}`);
    press('template-form-save');
    await waitFor(async () => expect(await listTemplates(db!)).toHaveLength(1));
    const [saved] = await listTemplates(db!);
    expect(saved!.classification).toEqual({
      nodeKeys: ['BASKETBALL_SHOOTING', 'BASKETBALL_ATHLETIC_AGILITY'],
      primary: 'BASKETBALL_SHOOTING',
    });
  });

  it('at 3 categories a 4th cannot be added until one is removed', async () => {
    await openNewTemplate();
    for (const query of ['free throws', 'strength', 'mobility']) {
      await openPicker();
      fireEvent.changeText(screen.getByTestId('taxonomy-search'), query);
      const first = (await screen.findAllByTestId(/^taxonomy-choose-[A-Z_]+$/))[0]!;
      fireEvent.press(first);
      await pickerClosed();
    }
    expect(categories()).toHaveLength(3);
    expect(screen.getByTestId('template-form-add-category').props.accessibilityState.disabled).toBe(true);
    expect(text('template-form-categories-max')).toBe('Up to 3 categories. Remove one to add another.');
    press(`template-form-category-${categories()[1]}-remove`);
    expect(categories()).toHaveLength(2);
    expect(screen.getByTestId('template-form-add-category').props.accessibilityState.disabled).toBe(false);
  });

  it('editing: change primary, remove a non-primary; an inactive category stays, marked, and is not offered again', async () => {
    await prepare('en');
    const created = await createTemplate(
      db!,
      {
        name: 'Mixed',
        blockIds: [blockId],
        classification: {
          nodeKeys: ['BASKETBALL_SHOOTING', 'BASKETBALL_REBOUNDING', 'FITNESS_LEGS'],
          primary: 'BASKETBALL_SHOOTING',
        },
      },
      deps,
    );
    if (!created.ok) throw new Error('seed failed');
    await setTaxonomyNodeActive(db!, 'BASKETBALL_REBOUNDING', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/workouts' });
    fireEvent.press(await screen.findByTestId(`workout-template-${created.template.id}`));
    await screen.findByTestId('template-form-categories');
    expect(categories()).toEqual(['BASKETBALL_SHOOTING', 'BASKETBALL_REBOUNDING', 'FITNESS_LEGS']);
    expect(text('template-form-category-BASKETBALL_REBOUNDING-inactive')).toBe(
      'Not available for new selection — kept as it was',
    );
    expect(screen.queryByTestId('template-form-category-BASKETBALL_SHOOTING-inactive')).toBeNull();

    press('template-form-category-FITNESS_LEGS-primary'); // change primary
    press('template-form-category-BASKETBALL_SHOOTING-remove'); // was primary before: now just removed
    expect(text('template-form-primary')).toBe('Primary category: Fitness › Legs');

    await openPicker();
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'rebound');
    expect(screen.queryByTestId('taxonomy-choose-BASKETBALL_REBOUNDING')).toBeNull(); // inactive: not newly selectable
    press('taxonomy-picker-close');
    await pickerClosed();

    press('template-form-save');
    await waitFor(async () =>
      expect((await listTemplates(db!))[0]!.classification).toEqual({
        nodeKeys: ['BASKETBALL_REBOUNDING', 'FITNESS_LEGS'],
        primary: 'FITNESS_LEGS',
      }),
    );
  });

  it('Hebrew: categories and picker in Hebrew, full paths', async () => {
    await openNewTemplate('he');
    expect(text('template-form-categories-title')).toBe('קטגוריות אימון');
    await openPicker();
    expect(text('taxonomy-picker-title')).toBe('בחירת קטגוריה');
    await go('FITNESS');
    await go('FITNESS_LEGS');
    expect(text('taxonomy-choose-label')).toBe('בחירת אימון כושר › רגליים');
    press('taxonomy-choose');
    await pickerClosed();
    expect(text('template-form-category-FITNESS_LEGS-label')).toBe('אימון כושר › רגליים');
    press('template-form-category-FITNESS_LEGS-primary');
    expect(text('template-form-primary')).toBe('קטגוריה ראשית: אימון כושר › רגליים');

    // Like exercise search, category names are found in either language; shown in Hebrew.
    await openPicker();
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'floater');
    expect(text('taxonomy-choose-BASKETBALL_FINISHING_FLOATER-label')).toBe('כדורסל › סיומות ליד הסל › פלואטר');
    fireEvent.changeText(screen.getByTestId('taxonomy-search'), 'פלואטר');
    expect(text('taxonomy-choose-BASKETBALL_FINISHING_FLOATER-label')).toBe('כדורסל › סיומות ליד הסל › פלואטר');
  });
});
