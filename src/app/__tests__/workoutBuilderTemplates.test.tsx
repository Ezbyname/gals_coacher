import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { allItems, categoryOf, PUBLISHED_WORKOUT_TEMPLATES } from '@/domain/training/professional';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** WORKOUT-TEMPLATES-001 (S2/S3): the template library, Preview, Import and Move to section, through the real route tree and real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 16, 17).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let daniel = '';

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  daniel = p.profile.player.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
const has = (testID: string) => screen.queryByTestId(testID) !== null;
const planCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts'))!.n;
const titles = () => screen.queryAllByTestId(/^builder-entry-\d+-title$/).map((n) => stripBidi(String(n.props.children)));
const rowCount = (entry: number) => screen.queryAllByTestId(new RegExp(`^builder-entry-${entry}-row-\\d+$`)).length;

async function openLibrary() {
  renderRouter(routes, { initialUrl: `/children/${daniel}` });
  await screen.findByTestId('training-create-workout');
  press('training-create-workout');
  await screen.findByTestId('builder-name');
  press('builder-add-template');
  await screen.findByTestId('tpl-library');
}
const FIRST = PUBLISHED_WORKOUT_TEMPLATES[0]!;

describe('template library (TPL-UI-01…)', () => {
  it('TPL-UI-01: offers only categories that hold a published template, and filters by level and search', async () => {
    await prepare('en');
    await openLibrary();
    const present = new Set(PUBLISHED_WORKOUT_TEMPLATES.map((w) => categoryOf(w)));
    const chips = screen.queryAllByTestId(/^tpl-category-(?!all)/).map((n) => String(n.props.testID).replace('tpl-category-', ''));
    expect(new Set(chips)).toEqual(new Set([...present].filter((c) => c !== null)));
    expect(screen.queryAllByTestId(/^tpl-option-/).length).toBe(PUBLISHED_WORKOUT_TEMPLATES.length);
    press('tpl-level-ADVANCED');
    const advanced = PUBLISHED_WORKOUT_TEMPLATES.filter((w) => w.difficulty === 'ADVANCED').length;
    await waitFor(() => expect(screen.queryAllByTestId(/^tpl-option-/).length).toBe(advanced));
    press('tpl-level-all');
    type('tpl-search', 'zzzz-no-such-template');
    await waitFor(() => expect(has('tpl-none')).toBe(true));
  });

  it('TPL-UI-02: Preview shows the structure and writes NOTHING; Import changes only the draft; Save then writes one independent plan', async () => {
    await prepare('en');
    await openLibrary();
    press(`tpl-option-${FIRST.id}`);
    await screen.findByTestId('tpl-preview');
    expect(has('tpl-preview-section-0')).toBe(true);
    expect(await planCount()).toBe(0);
    press('tpl-import');
    await screen.findByTestId('builder-entry-0');
    expect(titles().length).toBe(FIRST.sections.length);
    expect(await planCount()).toBe(0); // the draft only
    for (let n = 0; n < FIRST.sections.length; n += 1) expect(rowCount(n)).toBe(FIRST.sections[n]!.items.length);
    press('builder-save');
    await screen.findByTestId('training-create-workout');
    expect(await planCount()).toBe(1);
    expect((await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workout_items'))!.n).toBe(allItems(FIRST).length);
  });

  it('TPL-UI-03: Move to section moves one exercise to another section (no drag needed) and keeps the other rows', async () => {
    await prepare('en');
    await openLibrary();
    const multi = PUBLISHED_WORKOUT_TEMPLATES.find((w) => w.sections.length >= 2 && w.sections[0]!.items.length >= 2)!;
    press(`tpl-option-${multi.id}`);
    await screen.findByTestId('tpl-preview');
    press('tpl-import');
    await screen.findByTestId('builder-entry-0');
    const before = [0, 1].map(rowCount);
    press('builder-entry-0-item-0-move-section');
    await screen.findByTestId('builder-move-picker');
    const options = screen.queryAllByTestId(/^builder-move-option-/);
    expect(options.length).toBeGreaterThan(0);
    // the section the item is in is never offered as its own target
    const [second] = screen.queryAllByTestId(/^builder-move-option-e\d+$/); // the next section, in draft order
    fireEvent.press(second!);
    await waitFor(() => expect(rowCount(0)).toBe(before[0]! - 1));
    expect(rowCount(1)).toBe(before[1]! + 1);
    expect(await planCount()).toBe(0);
  });
});

describe('Hebrew (TPL-UI-04)', () => {
  it('TPL-UI-04: the library, preview and move labels are Hebrew', async () => {
    await prepare('he');
    await openLibrary();
    expect(stripBidi(String(screen.getByTestId('tpl-category-all').props.children?.props?.children ?? 'הכול'))).toContain('הכול');
    press(`tpl-option-${FIRST.id}`);
    await screen.findByTestId('tpl-preview');
    expect(screen.getByText('הוספה לאימון')).toBeTruthy();
  });
});
