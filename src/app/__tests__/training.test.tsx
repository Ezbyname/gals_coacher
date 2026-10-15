import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { createPlayer } from '@/data/local/players/playerRepository';
import {
  getSession,
  listTraining,
  planAndStart,
  planWorkout,
  recordSet,
} from '@/data/local/training/trainingRepository';
import {
  createBlock,
  createTemplate,
  listBlocks,
  listTemplates,
  updateBlock,
} from '@/data/local/training/workoutRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { screenStack } from '@/features/navigation/mainDestinations';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAIN-002 through the real route tree and real SQLite, Hebrew and English. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 7, 17).getTime();

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
  const player = await createPlayer(
    opened,
    { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null },
    deps,
  );
  if (!player.ok) throw new Error('seed failed');
  playerId = player.profile.player.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

/** Template "Gym + Shots": Strength (bench 3 × 10 @ 50 kg, rest 90) + Shooting (free throws 2 × 10). */
async function seedTemplate() {
  const strength = await createBlock(
    db!,
    {
      name: 'Strength',
      items: [
        { exerciseId: 'BARBELL_BENCH_PRESS', prescription: { sets: 3, target: 10, loadKg: 50, restSec: 90 } },
      ],
    },
    deps,
  );
  const shooting = await createBlock(
    db!,
    {
      name: 'Shooting',
      items: [
        { exerciseId: 'FREE_THROWS', prescription: { sets: 2, target: 10, loadKg: null, restSec: null } },
      ],
    },
    deps,
  );
  if (!strength.ok || !shooting.ok) throw new Error('seed failed');
  const template = await createTemplate(
    db!,
    { name: 'Gym + Shots', blockIds: [strength.block.id, shooting.block.id] },
    deps,
  );
  if (!template.ok) throw new Error('seed failed');
  return { strength: strength.block, template: template.template };
}

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const plain = (testID: string) => stripBidi(text(testID));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
const value = (testID: string) => screen.getByTestId(testID).props.value;
function captureAlerts() {
  const dialogs: { title: string; buttons: AlertButton[] }[] = [];
  jest
    .spyOn(Alert, 'alert')
    .mockImplementation(
      (title, _body, buttons = []) => void dialogs.push({ title: stripBidi(title), buttons }),
    );
  return dialogs;
}

describe('workout builder (WB)', () => {
  it('English: Exercises → Workouts; a new block from the library with its prescription, reordered, saved', async () => {
    await prepare('en');
    const app = renderRouter(routes, { initialUrl: '/exercises' });
    fireEvent.press(await screen.findByTestId('exercises-workouts'));
    expect(await screen.findByTestId('workouts-no-blocks')).toBeTruthy();
    expect(app.getPathname()).toBe('/workouts');
    expect(screen.getByTestId('main-nav-exercises').props.accessibilityState.selected).toBe(true);

    press('workouts-new-block');
    await screen.findByTestId('block-form-name');
    press('block-form-save');
    expect(await screen.findByText('Please enter a name.')).toBeTruthy();
    expect(screen.getByTestId('block-form-items-error')).toBeTruthy();

    type('block-form-name', 'Push day');
    type('block-form-search', 'bench press');
    press(
      await screen
        .findByTestId('block-form-add-BARBELL_BENCH_PRESS')
        .then(() => 'block-form-add-BARBELL_BENCH_PRESS'),
    );
    // The exercise's own defaults start the prescription (bench: 4 × 6, rest 120); no load is invented.
    expect([value('block-item-0-sets'), value('block-item-0-target'), value('block-item-0-load')]).toEqual([
      '4',
      '6',
      '',
    ]);
    expect(value('block-item-0-rest')).toBe('120');
    type('block-item-0-sets', '3');
    type('block-item-0-target', '10');
    type('block-item-0-load', '50');
    type('block-form-search', 'plank');
    press(await screen.findByTestId('block-form-add-PLANK').then(() => 'block-form-add-PLANK'));
    expect(screen.queryByTestId('block-item-1-load')).toBeNull(); // the plank takes no load
    press('block-item-1-up');
    expect(text('block-item-0-name')).toBe('Plank');
    press('block-item-0-down');
    expect(text('block-item-0-name')).toBe('Barbell Bench Press');

    press('block-form-save');
    await waitFor(() => expect(app.getPathname()).toBe('/workouts'));
    const [block] = await listBlocks(db!);
    expect(block!.name).toBe('Push day');
    expect(block!.items.map((i) => [i.exercise.id, i.prescription])).toEqual([
      ['BARBELL_BENCH_PRESS', { sets: 3, target: 10, loadKg: 50, restSec: 120 }],
      ['PLANK', { sets: 3, target: 30, loadKg: null, restSec: 45 }],
    ]);
    expect(await screen.findByTestId(`workout-block-${block!.id}`)).toBeTruthy();
    expect(plain(`workout-block-${block!.id}-details`)).toBe('2 exercises');
  });

  it('a prescription that makes no sense is refused with a reason; nothing is saved', async () => {
    await prepare('en');
    const { strength } = await seedTemplate();
    renderRouter(routes, { initialUrl: `/workouts/blocks/${strength.id}` });
    await screen.findByTestId('block-item-0-sets');
    type('block-item-0-sets', '0');
    type('block-item-0-target', '9.5');
    type('block-item-0-load', 'heavy');
    press('block-form-save');
    expect(await screen.findByText('Enter a whole number of sets (1–99).')).toBeTruthy();
    expect(screen.getByText('Enter a valid target, or leave it empty.')).toBeTruthy();
    expect(screen.getByText('Enter a valid load in kg, or leave it empty.')).toBeTruthy();
    expect((await listBlocks(db!))[0]!.items[0]!.prescription).toEqual({
      sets: 3,
      target: 10,
      loadKg: 50,
      restSec: 90,
    });
  });

  it('a template from blocks; making it inactive asks first and removes it from Start a workout', async () => {
    await prepare('en');
    const { strength } = await seedTemplate();
    renderRouter(routes, { initialUrl: '/workouts' });
    fireEvent.press(await screen.findByTestId('workouts-new-template'));
    await screen.findByTestId('template-form-name');
    type('template-form-name', 'Upper body');
    press(`template-form-add-${strength.id}`);
    press(`template-form-add-${strength.id}`); // a block may repeat
    press('template-block-1-remove');
    press('template-form-save');
    await screen.findByTestId('workouts-new-template');
    const created = (await listTemplates(db!)).find((x) => x.name === 'Upper body')!;
    expect(created.blocks.map((b) => b.id)).toEqual([strength.id]);
    expect(plain(`workout-template-${created.id}-details`)).toBe('1 blocks · 1 exercises');

    press(`workout-template-${created.id}`);
    await screen.findByTestId('template-form-toggle');
    const dialogs = captureAlerts();
    press('template-form-toggle');
    expect(dialogs[0]!.title).toBe('Hide "Upper body" from the library?');
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Keep visible', 'cancel'],
      ['Hide', undefined],
    ]);
    await act(async () => dialogs[0]!.buttons[1]!.onPress!());
    await waitFor(() => expect(text('template-form-status')).toBe('Hidden'));

    renderRouter(routes, { initialUrl: `/children/${playerId}/training/new` });
    await screen.findByTestId('choose-scroll');
    expect(screen.queryByTestId(`choose-${created.id}`)).toBeNull();
  });

  it('unsaved changes in a block ask before leaving; Cancel discards on purpose', async () => {
    await prepare('en');
    const dialogs = captureAlerts();
    renderRouter(routes, { initialUrl: '/workouts' });
    fireEvent.press(await screen.findByTestId('workouts-new-block'));
    type(await screen.findByTestId('block-form-name').then(() => 'block-form-name'), 'Legs');
    press('main-nav-home');
    await waitFor(() => expect(dialogs.map((d) => d.title)).toEqual(['Leave without saving?']));
    press('block-form-cancel');
    await waitFor(() => expect(screen.queryByTestId('block-form-name')).toBeNull());
    expect(await listBlocks(db!)).toEqual([]);
  });

  it('Hebrew: the builder speaks Hebrew', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/blocks/new' });
    await screen.findByTestId('block-form-name');
    expect(screen.getByText('התרגילים בבלוק')).toBeTruthy();
    type('block-form-search', 'לחיצת חזה');
    fireEvent.press(await screen.findByTestId('block-form-add-BARBELL_BENCH_PRESS'));
    expect(text('block-item-0-name')).toBe('לחיצת חזה במוט');
    expect(screen.getByText('סטים')).toBeTruthy();
  });
});

describe('training session (TS)', () => {
  it('English: Player → Start a workout → planned vs actual per set → Partial; the plan stays as planned', async () => {
    await prepare('en');
    const { template } = await seedTemplate();
    const app = renderRouter(routes, { initialUrl: `/children/${playerId}` });
    fireEvent.press(await screen.findByTestId('training-start'));
    fireEvent.press(await screen.findByTestId(`choose-${template.id}-start`));
    await screen.findByTestId('session-ex-0');
    expect(screenStack(app.getRouterState()).current).toBe('children/[id]/training/session/[sessionId]');
    expect(text('session-status')).toBe('In progress');
    expect(plain('session-ex-0-planned')).toBe('Planned: 3 × 10 @ 50 kg · rest 90 s');
    expect(plain('session-ex-0-set-1-planned')).toBe('Planned 10 @ 50 kg');
    // Actual inputs are never pre-filled from the plan.
    expect([value('session-ex-0-set-1-REPETITIONS'), value('session-ex-0-set-1-LOAD_KG')]).toEqual(['', '']);

    type('session-ex-0-set-1-REPETITIONS', '10');
    type('session-ex-0-set-1-LOAD_KG', '50');
    press('session-ex-0-set-1-save');
    await waitFor(() => expect(plain('session-ex-0-set-1-actual')).toBe('Actual 10 @ 50 kg'));
    expect(value('session-ex-0-set-2-LOAD_KG')).toBe('50'); // carried from the last ACTUAL load
    type('session-ex-0-set-2-REPETITIONS', '10');
    press('session-ex-0-set-2-save');
    await waitFor(() => expect(plain('session-ex-0-set-2-actual')).toBe('Actual 10 @ 50 kg'));
    type('session-ex-0-set-3-REPETITIONS', '7');
    press('session-ex-0-set-3-save');
    await waitFor(() => expect(plain('session-ex-0-set-3-actual')).toBe('Actual 7 @ 50 kg'));
    expect(plain('session-ex-0-set-3-planned')).toBe('Planned 10 @ 50 kg');

    type('session-ex-1-set-1-MADE', '11');
    type('session-ex-1-set-1-ATTEMPTS', '10');
    press('session-ex-1-set-1-save');
    expect(await screen.findByText('Made cannot be more than attempts.')).toBeTruthy();
    type('session-ex-1-set-1-MADE', '7');
    press('session-ex-1-set-1-save');
    await waitFor(() => expect(plain('session-ex-1-set-1-actual')).toBe('Actual 7/10'));
    press('session-ex-1-set-2-skip');
    await waitFor(() => expect(text('session-ex-1-set-2-actual')).toBe('Skipped'));

    press('session-finish');
    await waitFor(() => expect(text('session-status')).toBe('Partial'));
    expect(plain('session-summary')).toBe('4 of 5 planned sets performed');
    expect(screen.queryByTestId('session-ex-0-set-1-REPETITIONS')).toBeNull(); // read-only
    expect(screen.queryByTestId('session-finish')).toBeNull();
    expect(screen.getByTestId('session-read-only')).toBeTruthy();

    const { sessions } = await listTraining(db!, playerId);
    expect(sessions.map((s) => s.status)).toEqual(['PARTIAL']);
    const session = (await getSession(db!, sessions[0]!.id))!;
    expect(
      session.exercises[0]!.sets.map((s) => s.measurements.find((m) => m.kind === 'REPETITIONS')!.finalValue),
    ).toEqual([10, 10, 7]);
  });

  it('a corrected set shows the correction; an extra set is marked as not planned', async () => {
    await prepare('en');
    const { template } = await seedTemplate();
    const session = await planAndStart(db!, { playerId, templateId: template.id }, deps);
    await recordSet(db!, session.exercises[0]!.sets[0]!.id, { REPETITIONS: 8, LOAD_KG: 50 }, deps);
    renderRouter(routes, { initialUrl: `/children/${playerId}/training/session/${session.id}` });
    await screen.findByTestId('session-ex-0-set-1-REPETITIONS');
    expect(value('session-ex-0-set-1-REPETITIONS')).toBe('8'); // its own actual value
    type('session-ex-0-set-1-REPETITIONS', '7');
    press('session-ex-0-set-1-save');
    await waitFor(() =>
      expect(plain('session-ex-0-set-1-actual')).toBe('Actual 7 @ 50 kg (corrected from 8 @ 50 kg)'),
    );
    press('session-ex-0-add-set');
    await waitFor(() => expect(text('session-ex-0-set-4-planned')).toBe('Extra set (not planned)'));
  });

  it('Plan for later: a frozen plan that later block edits do not change; Start runs it', async () => {
    await prepare('en');
    const { template, strength } = await seedTemplate();
    const first = renderRouter(routes, { initialUrl: `/children/${playerId}/training/new` });
    fireEvent.press(await screen.findByTestId(`choose-${template.id}-plan`));
    await screen.findByTestId('plan-start');
    expect(plain('plan-item-0-rx')).toBe('3 × 10 @ 50 kg · rest 90 s');
    expect(plain('plan-item-1-rx')).toBe('2 × 10 attempts');
    await updateBlock(
      db!,
      strength.id,
      {
        name: 'Changed',
        items: [
          { exerciseId: 'PUSH_UP', prescription: { sets: 5, target: 20, loadKg: null, restSec: null } },
        ],
      },
      { clock: systemClock },
    );
    const planId = (await listTraining(db!, playerId)).planned[0]!.id;
    first.unmount(); // reopen the plan after the change
    renderRouter(routes, { initialUrl: `/children/${playerId}/training/plan/${planId}` });
    await screen.findByTestId('plan-start');
    expect(text('plan-item-0-name')).toBe('Barbell Bench Press');
    expect(plain('plan-item-0-rx')).toBe('3 × 10 @ 50 kg · rest 90 s');
    press('plan-start');
    await screen.findByTestId('session-ex-0');
    expect(text('session-ex-0-name')).toBe('Barbell Bench Press');
  });

  it('nothing recorded cannot be finished; Stop asks (Keep training is the default) and keeps it as Stopped', async () => {
    await prepare('en');
    const { template } = await seedTemplate();
    const session = await planAndStart(db!, { playerId, templateId: template.id }, deps);
    renderRouter(routes, { initialUrl: `/children/${playerId}/training/session/${session.id}` });
    await screen.findByTestId('session-finish');
    press('session-finish');
    expect(await screen.findByTestId('session-failed')).toBeTruthy();
    expect(text('session-failed')).toBe(
      'Record at least one set before finishing, or stop the workout without finishing.',
    );
    const dialogs = captureAlerts();
    press('session-abandon');
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Keep training', 'cancel'],
      ['Stop workout', undefined],
    ]);
    // Asking changes nothing; Keep training (cancel) changes nothing.
    expect((await getSession(db!, session.id))!.status).toBe('IN_PROGRESS');
    expect(text('session-status')).toBe('In progress');
    await act(async () => dialogs[0]!.buttons[0]!.onPress?.());
    expect((await getSession(db!, session.id))!.status).toBe('IN_PROGRESS');
    await act(async () => dialogs[0]!.buttons[1]!.onPress!());
    await waitFor(() => expect(text('session-status')).toBe('Stopped'));
    expect((await getSession(db!, session.id))!.status).toBe('ABANDONED');
  });

  it('the player screen offers Continue while a workout is in progress; history lists plans and workouts', async () => {
    await prepare('en');
    const { template } = await seedTemplate();
    await planWorkout(db!, { playerId, templateId: template.id }, deps);
    const running = await planAndStart(db!, { playerId, templateId: template.id }, deps);
    renderRouter(routes, { initialUrl: `/children/${playerId}` });
    expect(plain(await screen.findByTestId('training-in-progress').then(() => 'training-in-progress'))).toBe(
      'In progress: Gym + Shots',
    );
    expect(screen.queryByTestId('training-start')).toBeNull();
    press('training-open');
    await screen.findByTestId(`training-session-${running.id}`);
    expect(plain(`training-session-${running.id}-line-1`)).toBe('0 of 5 planned sets performed');
    expect((await listTraining(db!, playerId)).planned).toHaveLength(1);
  });

  it('Hebrew: the session in Hebrew; numbers keep their order; survives a restart', async () => {
    await prepare('he');
    const { template } = await seedTemplate();
    const session = await planAndStart(db!, { playerId, templateId: template.id }, deps);
    const first = renderRouter(routes, {
      initialUrl: `/children/${playerId}/training/session/${session.id}`,
    });
    await screen.findByTestId('session-ex-0');
    expect(text('session-status')).toBe('בביצוע');
    expect(text('session-ex-0-name')).toBe('לחיצת חזה במוט');
    expect(plain('session-ex-0-planned')).toBe('מתוכנן: 3 × 10 @ 50 ק״ג · מנוחה 90 שנ׳');
    type('session-ex-1-set-1-MADE', '8');
    type('session-ex-1-set-1-ATTEMPTS', '10');
    press('session-ex-1-set-1-save');
    await waitFor(() => expect(plain('session-ex-1-set-1-actual')).toBe('בפועל 8/10'));
    expect(text('session-ex-1-set-1-actual')).toContain('\u20668/10\u2069'); // left-to-right: never 10/8
    first.unmount();
    renderRouter(routes, { initialUrl: `/children/${playerId}/training/session/${session.id}` });
    await screen.findByTestId('session-ex-1-set-1-actual');
    expect(plain('session-ex-1-set-1-actual')).toBe('בפועל 8/10');
  });
});
