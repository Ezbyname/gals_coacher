import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { setExerciseActive } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { listTraining } from '@/data/local/training/trainingRepository';
import {
  createBlock,
  createTemplate,
  getBlock,
  listBlocks,
  setBlockActive,
} from '@/data/local/training/workoutRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** QB-BLOCK-LIBRARY (BL-01…BL-09) and the S2 planning block, through the real route tree and real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 15, 17).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let playerId = '';

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const player = await createPlayer(opened, { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!player.ok) throw new Error('seed failed');
  playerId = player.profile.player.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const rx = (sets: number, target: number | null) => ({ sets, target, loadKg: null, restSec: 60 });
async function block(name: string, ...exerciseIds: string[]) {
  const r = await createBlock(db!, { name, items: exerciseIds.map((exerciseId) => ({ exerciseId, prescription: rx(2, 10) })) }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.block;
}
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
const has = (testID: string) => screen.queryByTestId(testID) !== null;
function captureAlerts() {
  const dialogs: { title: string; body?: string; buttons: AlertButton[] }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons = []) => void dialogs.push({ title: stripBidi(title), body: body === undefined ? undefined : stripBidi(body), buttons }));
  return dialogs;
}
const library = async () => {
  renderRouter(routes, { initialUrl: '/workouts' });
  await screen.findByTestId('workouts-search');
};

describe('library search (BL-01 / BL-02)', () => {
  it('BL-01 Hebrew: one box filters blocks and templates by name; clearing it shows everything again', async () => {
    await prepare('he');
    const dribble = await block('כדרור', 'FREE_THROWS');
    const shoot = await block('קליעה', 'FREE_THROWS');
    await block('Strength', 'BARBELL_BENCH_PRESS');
    const t = await createTemplate(db!, { name: 'תבנית כדרור', blockIds: [dribble.id] }, deps);
    if (!t.ok) throw new Error('seed');
    await library();
    expect(has(`workout-block-${dribble.id}`) && has(`workout-block-${shoot.id}`)).toBe(true);
    type('workouts-search', 'כדר');
    await waitFor(() => expect(has(`workout-block-${shoot.id}`)).toBe(false));
    expect(has(`workout-block-${dribble.id}`)).toBe(true);
    expect(has(`workout-template-${t.template.id}`)).toBe(true); // the template matches by name too
    type('workouts-search', '');
    await waitFor(() => expect(has(`workout-block-${shoot.id}`)).toBe(true));
  });

  it('BL-02 English: case-insensitive; no match says so; the buttons stay', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS');
    const strength = await block('Strength', 'BARBELL_BENCH_PRESS');
    await library();
    type('workouts-search', 'SHOOT');
    await waitFor(() => expect(has(`workout-block-${strength.id}`)).toBe(false));
    expect(has(`workout-block-${shooting.id}`)).toBe(true);
    type('workouts-search', 'zzz');
    await waitFor(() => expect(text('workouts-no-matches-blocks')).toBe('Nothing matches your search.'));
    expect(has('workouts-new-block')).toBe(true);
  });
});

describe('duplicate and edit (BL-03 / BL-04)', () => {
  it('BL-03: Duplicate opens an independent copy "<name> (copy)"; the original stays; unsaved edits disable it', async () => {
    await prepare('en');
    const original = await block('Shooting', 'FREE_THROWS', 'BARBELL_BENCH_PRESS');
    await library();
    press(`workout-block-${original.id}`);
    await screen.findByDisplayValue('Shooting');
    type('block-form-name', 'Shooting edited');
    await waitFor(() => expect(screen.getByTestId('block-form-duplicate').props.accessibilityState.disabled).toBe(true));
    expect(text('block-form-duplicate-hint')).toBe('Save your changes first, then duplicate.');
    type('block-form-name', 'Shooting');
    await waitFor(() => expect(has('block-form-duplicate-hint')).toBe(false));
    press('block-form-duplicate');
    await screen.findByDisplayValue('Shooting (copy)');
    const all = await listBlocks(db!);
    expect(all.map((b) => b.name)).toEqual(['Shooting', 'Shooting (copy)']);
    const copy = all[1]!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.items.map((i) => i.exercise.id)).toEqual(['FREE_THROWS', 'BARBELL_BENCH_PRESS']);
    expect(await getBlock(db!, original.id)).toEqual(original); // never touched
    // editing the copy leaves the original alone
    type('block-form-name', 'Copy renamed');
    press('block-form-save');
    await waitFor(async () => expect((await getBlock(db!, copy.id))!.name).toBe('Copy renamed'));
    expect((await getBlock(db!, original.id))!.name).toBe('Shooting');
  });

  it('BL-03 Hebrew: the copy label is Hebrew', async () => {
    await prepare('he');
    const original = await block('כדרור', 'FREE_THROWS');
    await library();
    press(`workout-block-${original.id}`);
    await screen.findByDisplayValue('כדרור');
    press('block-form-duplicate');
    await screen.findByDisplayValue('כדרור (עותק)');
  });

  it('BL-04: rename from the library row (the same block, same id); the library shows the new name', async () => {
    await prepare('en');
    const b = await block('Old name', 'FREE_THROWS');
    await library();
    press(`workout-block-${b.id}`);
    await screen.findByDisplayValue('Old name');
    type('block-form-name', 'New name');
    press('block-form-save');
    await waitFor(() => expect(text(`workout-block-${b.id}-name`)).toBe('New name'));
    const saved = await getBlock(db!, b.id);
    expect(saved!.name).toBe('New name');
    expect(saved!.items).toEqual(b.items);
  });
});

describe('Exercise Details → Add to block (BL-05 / BL-06)', () => {
  it('BL-05: pick an ACTIVE block: the exercise is appended with its default prescription and the block opens; hidden blocks are not offered', async () => {
    await prepare('en');
    const target = await block('Strength', 'BARBELL_BENCH_PRESS');
    const hidden = await block('Hidden one', 'BARBELL_BENCH_PRESS');
    await setBlockActive(db!, hidden.id, false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/exercises/FREE_THROWS' });
    await screen.findByTestId('exercise-details-name');
    press('exercise-details-add-to-block');
    await screen.findByTestId('add-to-block-new');
    expect(has(`add-to-block-${target.id}`)).toBe(true);
    expect(has(`add-to-block-${hidden.id}`)).toBe(false); // inactive blocks cannot be selected
    type('add-to-block-search', 'zzz');
    await waitFor(() => expect(has('add-to-block-no-matches')).toBe(true));
    type('add-to-block-search', 'stren');
    await waitFor(() => expect(has(`add-to-block-${target.id}`)).toBe(true));
    press(`add-to-block-${target.id}`);
    await screen.findByDisplayValue('Strength'); // the block opens so the user can adjust it
    const after = await getBlock(db!, target.id);
    expect(after!.items.map((i) => i.exercise.id)).toEqual(['BARBELL_BENCH_PRESS', 'FREE_THROWS']);
    expect(after!.items[0]).toEqual(target.items[0]);
    expect(after!.items[1]!.prescription.sets).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('block-item-1-sets').props.value).toBe(String(after!.items[1]!.prescription.sets));
  });

  it('BL-06: "New block with this exercise" starts a new block holding it; Save creates it', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/exercises/FREE_THROWS' });
    await screen.findByTestId('exercise-details-name');
    press('exercise-details-add-to-block');
    expect(await screen.findByTestId('add-to-block-none')).toBeTruthy(); // no active block yet
    press('add-to-block-new');
    await screen.findByTestId('block-form-name');
    expect(screen.getByTestId('block-item-0-sets')).toBeTruthy(); // the exercise is already in
    type('block-form-name', 'Free throws block');
    press('block-form-save');
    await waitFor(async () => expect((await listBlocks(db!)).map((b) => b.name)).toEqual(['Free throws block']));
    expect((await listBlocks(db!))[0]!.items.map((i) => i.exercise.id)).toEqual(['FREE_THROWS']);
  });

  it('an inactive Exercise offers no "Add to block", and the add screen refuses it', async () => {
    await prepare('en');
    await block('Strength', 'BARBELL_BENCH_PRESS');
    await setExerciseActive(db!, 'FREE_THROWS', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/exercises/FREE_THROWS' });
    await screen.findByTestId('exercise-details-name');
    expect(has('exercise-details-add-to-block')).toBe(false);
  });
});

describe('hide / hidden / restore (BL-07 / BL-08 / BL-09)', () => {
  it('BL-07..09: Hide removes the block from the normal list; "Hidden (1)" is collapsed; open it to see and Restore', async () => {
    await prepare('en');
    const keep = await block('Keep', 'FREE_THROWS');
    const gone = await block('Gone', 'BARBELL_BENCH_PRESS');
    await library();
    expect(has('workouts-hidden-blocks-toggle')).toBe(false); // nothing hidden yet: no extra control

    // BL-07 hide (asks first; Keep visible is the safe default)
    press(`workout-block-${gone.id}`);
    await screen.findByDisplayValue('Gone');
    const dialogs = captureAlerts();
    press('block-form-toggle');
    expect(dialogs[0]!.title).toBe('Hide "Gone" from the library?');
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([['Keep visible', 'cancel'], ['Hide', undefined]]);
    await act(async () => dialogs[0]!.buttons[1]!.onPress!());
    await waitFor(() => expect(text('block-form-status')).toBe('Hidden'));
    press('block-form-cancel');
    await screen.findByTestId('workouts-search');
    await waitFor(() => expect(has(`workout-block-${gone.id}`)).toBe(false)); // not in the normal library
    expect(has(`workout-block-${keep.id}`)).toBe(true);
    expect((await getBlock(db!, gone.id))!.active).toBe(false); // hidden, never deleted

    // BL-08 hidden view
    expect(text('workouts-hidden-blocks-toggle').length).toBeGreaterThan(0);
    expect(screen.getByTestId('workouts-hidden-blocks-toggle').props.accessibilityLabel).toBe('Hidden blocks (1)');
    expect(screen.getByTestId('workouts-hidden-blocks-toggle').props.accessibilityState.expanded).toBe(false);
    press('workouts-hidden-blocks-toggle');
    await screen.findByTestId(`workout-block-${gone.id}`);
    expect(has(`workout-block-${gone.id}-inactive`)).toBe(true);

    // BL-09 restore
    press(`workout-block-${gone.id}-restore`);
    await waitFor(() => expect(has('workouts-hidden-blocks-toggle')).toBe(false)); // nothing hidden any more
    expect(has(`workout-block-${gone.id}`)).toBe(true);
    expect(has(`workout-block-${gone.id}-inactive`)).toBe(false);
    expect((await getBlock(db!, gone.id))!.active).toBe(true);
  });
});

describe('S2 — a Template holding unavailable items cannot start a NEW workout', () => {
  async function templateWithHiddenBlock() {
    const strength = await block('Strength', 'BARBELL_BENCH_PRESS');
    const shooting = await block('Shooting', 'FREE_THROWS');
    const t = await createTemplate(db!, { name: 'Gym + Shots', blockIds: [strength.id, shooting.id] }, deps);
    if (!t.ok) throw new Error('seed');
    await setBlockActive(db!, shooting.id, false, { clock: systemClock });
    await setExerciseActive(db!, 'BARBELL_BENCH_PRESS', false, { clock: systemClock });
    return { template: t.template, shooting };
  }

  it('S2-03 (UI): Start / Plan show the explanation (affected items listed), create nothing; Restore items resolves it; then it plans', async () => {
    await prepare('en');
    const { template } = await templateWithHiddenBlock();
    renderRouter(routes, { initialUrl: `/children/${playerId}/training/new` });
    await screen.findByTestId(`choose-${template.id}`);
    expect(text(`choose-${template.id}-unavailable`)).toBe('Contains unavailable items');
    const dialogs = captureAlerts();
    press(`choose-${template.id}-start`);
    await waitFor(() => expect(dialogs).toHaveLength(1));
    expect(dialogs[0]!.title).toBe('This workout template contains items that are no longer available');
    expect(dialogs[0]!.body).toContain('Before creating a new workout, choose what to do.');
    expect(dialogs[0]!.body).toContain('• Shooting — block hidden');
    expect(dialogs[0]!.body).toContain('• Barbell Bench Press — exercise inactive');
    expect(dialogs[0]!.buttons.map((b) => b.text)).toEqual(['Cancel', 'Restore items', 'Edit template']);
    press(`choose-${template.id}-plan`);
    await waitFor(() => expect(dialogs).toHaveLength(2));
    const overview = await listTraining(db!, playerId);
    expect(overview.planned).toHaveLength(0); // nothing was created, nothing silently copied or left out
    expect(overview.sessions).toHaveLength(0);

    // the explicit resolution: Restore items
    await act(async () => dialogs[0]!.buttons[1]!.onPress!());
    await waitFor(() => expect(has(`choose-${template.id}-unavailable`)).toBe(false));
    press(`choose-${template.id}-plan`);
    await waitFor(async () => expect((await listTraining(db!, playerId)).planned).toHaveLength(1));
    const plan = (await listTraining(db!, playerId)).planned[0]!;
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['BARBELL_BENCH_PRESS', 'FREE_THROWS']);
  });

  it('Edit template goes to the template; Cancel does nothing', async () => {
    await prepare('en');
    const { template } = await templateWithHiddenBlock();
    const app = renderRouter(routes, { initialUrl: `/children/${playerId}/training/new` });
    await screen.findByTestId(`choose-${template.id}`);
    const dialogs = captureAlerts();
    press(`choose-${template.id}-start`);
    await waitFor(() => expect(dialogs).toHaveLength(1));
    await act(async () => dialogs[0]!.buttons[0]!.onPress?.()); // Cancel: no handler, nothing happens
    expect((await listTraining(db!, playerId)).planned).toHaveLength(0);
    await act(async () => dialogs[0]!.buttons[2]!.onPress!());
    await waitFor(() => expect(app.getPathname()).toBe(`/workouts/templates/${template.id}`));
  });
});
