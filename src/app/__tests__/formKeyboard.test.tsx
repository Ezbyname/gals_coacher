import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { DeviceEventEmitter, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { createPlayer } from '@/data/local/players/playerRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { planAndStart } from '@/data/local/training/trainingRepository';
import { createBlock, createTemplate } from '@/data/local/training/workoutRepository';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import * as keyboardReveal from '@/ui/keyboardReveal';

/**
 * PRODUCT_SPEC §74 (locked): every form keeps the FOCUSED field above the
 * keyboard. Wiring only, as in CAL-KEY-001 — the real keyboard overlap is
 * proven on the device (Python Product QA) and physically.
 */
const routes = appRoutes(resolve(__dirname, '..')) as never;
let db: ReturnType<typeof openNodeSqlite> | null = null;
const deps = { ids: createSequentialIdService(), clock: systemClock };

async function prepare() {
  await prepareApp('en');
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

async function openSession(): Promise<string> {
  const player = await createPlayer(
    db!,
    { player: { name: 'Gal', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null },
    deps,
  );
  if (!player.ok) throw new Error('seed failed');
  const block = await createBlock(
    db!,
    { name: 'Legs', items: [{ exerciseId: 'GOBLET_SQUAT', prescription: { sets: 1, target: 10, loadKg: 20, restSec: null } }] },
    deps,
  );
  if (!block.ok) throw new Error('seed failed');
  const template = await createTemplate(db!, { name: 'Leg day', blockIds: [block.block.id] }, deps);
  if (!template.ok) throw new Error('seed failed');
  const playerId = player.profile.player.id;
  const session = await planAndStart(db!, { playerId, templateId: template.template.id }, deps);
  return `/children/${playerId}/training/session/${session.id}`;
}

/** [screen, how to reach it, scroll view testID, a field on it] */
const FORMS: [string, () => Promise<void>, string, string][] = [
  [
    'workout block (its exercise search)',
    async () => {
      renderRouter(routes, { initialUrl: '/workouts' });
      fireEvent.press(await screen.findByTestId('workouts-new-block'));
    },
    'block-form-scroll',
    'block-form-search',
  ],
  [
    'workout template',
    async () => {
      renderRouter(routes, { initialUrl: '/workouts' });
      fireEvent.press(await screen.findByTestId('workouts-new-template'));
    },
    'template-form-scroll',
    'template-form-name',
  ],
  ['custom exercise', async () => void renderRouter(routes, { initialUrl: '/exercises/new' }), 'exercise-form-scroll', 'exercise-form-tutorial'],
  ['player', async () => void renderRouter(routes, { initialUrl: '/children/new' }), 'player-form-scroll', 'player-height'],
  [
    'activity type',
    async () => void renderRouter(routes, { initialUrl: '/settings/activity-types/new' }),
    'activity-type-form-scroll',
    'activity-type-name',
  ],
  [
    'training session (actual results)',
    async () => void renderRouter(routes, { initialUrl: await openSession() }),
    'session-scroll',
    'session-ex-0-set-1-REPETITIONS',
  ],
];

describe('every form keeps the focused field above the keyboard (§74)', () => {
  it.each(FORMS)('%s', async (_name, open, scrollId, fieldId) => {
    await prepare();
    await open();
    await screen.findByTestId(fieldId);

    // Keyboard-safe: padding by the keyboard overlap, around the form's own scroll view.
    const wrapper = screen
      .UNSAFE_getAllByType(KeyboardAvoidingView)
      .find((w) => w.props.testID === `${scrollId}-keyboard`);
    expect(wrapper?.props.behavior).toBe('padding');
    const scroll = screen.UNSAFE_getAllByType(ScrollView).find((s) => s.props.testID === scrollId)!;
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');

    // Visible area 100–500 (above the keyboard); the field box at 520–600 is hidden.
    jest.spyOn(keyboardReveal, 'measureWindowRect').mockImplementation(async (node) => {
      const id = (node as { props?: { testID?: string } } | null)?.props?.testID;
      if (id === `${scrollId}-viewport`) return { top: 100, bottom: 500 };
      if (id === `${fieldId}-field`) return { top: 520, bottom: 600 };
      return null;
    });
    const scrollTo = jest.spyOn(scroll.instance as ScrollView, 'scrollTo');
    await act(async () => {});
    scrollTo.mockClear();

    // Focusing the field scrolls just enough to show it (its bottom, the typing position).
    fireEvent(screen.getByTestId(fieldId), 'focus');
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 600 - (500 - 16), animated: true }));

    // The keyboard opening while it is focused reveals it again; after blur nothing moves.
    scrollTo.mockClear();
    act(() => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
        duration: 0,
        easing: 'keyboard',
      });
    });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    fireEvent(screen.getByTestId(fieldId), 'blur');
    scrollTo.mockClear();
    act(() => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
        duration: 0,
        easing: 'keyboard',
      });
    });
    await act(async () => {});
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
