import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createPlayer } from '@/data/local/players/playerRepository';
import { listTraining, planAndStart, planWorkout } from '@/data/local/training/trainingRepository';
import { createBlock, createTemplate } from '@/data/local/training/workoutRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { FSI, PDI, stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAIN-QUICKBUILD-001A — ActivePlayerContext through the real route tree and real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 9, 17).getTime();

let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };

async function addPlayer(name: string) {
  const created = await createPlayer(
    db!,
    { player: { name, dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null },
    deps,
  );
  if (!created.ok) throw new Error('seed failed');
  return created.profile.player.id;
}

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const daniel = await addPlayer('Daniel');
  const maya = await addPlayer('מאיה');
  return { daniel, maya };
}

async function seedTemplate() {
  const block = await createBlock(
    db!,
    {
      name: 'Shooting',
      items: [{ exerciseId: 'FREE_THROWS', prescription: { sets: 2, target: 10, loadKg: null, restSec: null } }],
    },
    deps,
  );
  if (!block.ok) throw new Error('seed failed');
  const template = await createTemplate(db!, { name: 'Shots', blockIds: [block.block.id] }, deps);
  if (!template.ok) throw new Error('seed failed');
  return template.template;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const target = () => String(screen.getByTestId('active-player-target').props.children);

describe('ActivePlayerContext (TRAIN-QUICKBUILD-001A)', () => {
  it('route source: Players → Daniel → Training is for Daniel on every training screen, never asked again', async () => {
    const { daniel } = await prepare('en');
    const template = await seedTemplate();
    renderRouter(routes, { initialUrl: `/children/${daniel}` });
    fireEvent.press(await screen.findByTestId('training-open'));
    await screen.findByTestId('training-scroll');
    expect(stripBidi(target())).toBe('Training for Daniel');

    fireEvent.press(screen.getByTestId('training-overview-start'));
    await screen.findByTestId('choose-scroll');
    expect(stripBidi(target())).toBe('Training for Daniel');
    expect(screen.queryByText(/choose a player/i)).toBeNull(); // no "which Player?" prompt

    fireEvent.press(screen.getByTestId(`choose-${template.id}-start`));
    await screen.findByTestId('session-ex-0');
    expect(stripBidi(target())).toBe('Training for Daniel');
    // The write went to Daniel — the route's Player.
    const overview = await listTraining(db!, daniel);
    expect(overview.sessions.map((s) => s.status)).toEqual(['IN_PROGRESS']);
  });

  it('refuses a Player-specific screen without a resolved Player (unknown id): no actions offered', async () => {
    await prepare('en');
    const template = await seedTemplate();
    renderRouter(routes, { initialUrl: '/children/no-such-player/training/new' });
    await screen.findByTestId('active-player-missing');
    expect(
      screen.getByText('Choose a player first. This training action needs to know which player it is for.'),
    ).toBeTruthy();
    expect(screen.queryByTestId(`choose-${template.id}-start`)).toBeNull();
    expect(screen.queryByTestId('active-player-target')).toBeNull();
  });

  it("Daniel → Maya: the target becomes Maya and Daniel does not leak; another Player's plan / session is not shown", async () => {
    const { daniel, maya } = await prepare('en');
    const template = await seedTemplate();
    const danielPlan = await planWorkout(db!, { playerId: daniel, templateId: template.id }, deps);
    const danielSession = await planAndStart(db!, { playerId: daniel, templateId: template.id }, deps);

    renderRouter(routes, { initialUrl: `/children/${daniel}/training` });
    await screen.findByTestId('training-scroll');
    expect(stripBidi(target())).toBe('Training for Daniel');

    await act(async () => router.push(`/children/${maya}/training`));
    await waitFor(() => expect(stripBidi(target())).toBe('Training for מאיה'));
    expect(screen.queryByText(/Daniel/)).toBeNull();

    // Daniel's plan and session under Maya's route: refused, not shown as Maya's.
    await act(async () => router.push(`/children/${maya}/training/plan/${danielPlan.id}`));
    await screen.findByTestId('plan-error');
    await act(async () => router.push(`/children/${maya}/training/session/${danielSession.id}`));
    await screen.findByTestId('session-error');
    expect(screen.queryByTestId('session-ex-0')).toBeNull();
  });

  it('global areas keep no Player target (no sticky "current Player")', async () => {
    const { daniel } = await prepare('en');
    renderRouter(routes, { initialUrl: `/children/${daniel}/training` });
    await screen.findByTestId('active-player-target');
    for (const path of ['/', '/workouts', '/quick-training', '/exercises']) {
      await act(async () => router.push(path));
      await waitFor(() => expect(screen.queryByTestId('training-scroll')).toBeNull());
      expect(screen.queryByTestId('active-player-target')).toBeNull();
    }
  });

  it('Hebrew: "אימון עבור …" with the name isolated, Latin and Hebrew names intact', async () => {
    const { daniel, maya } = await prepare('he');
    renderRouter(routes, { initialUrl: `/children/${daniel}/training` });
    await screen.findByTestId('training-scroll');
    expect(target()).toBe(`אימון עבור ${FSI}Daniel${PDI}`);
    expect(screen.getByTestId('active-player-target').props.accessibilityLabel).toBe('אימון עבור Daniel');
    await act(async () => router.push(`/children/${maya}/training`));
    await waitFor(() => expect(stripBidi(target())).toBe('אימון עבור מאיה'));
  });

  it('English: "Training for …" keeps a Hebrew name in an isolate', async () => {
    const { maya } = await prepare('en');
    renderRouter(routes, { initialUrl: `/children/${maya}/training` });
    await screen.findByTestId('training-scroll');
    expect(target()).toBe(`Training for ${FSI}מאיה${PDI}`);
  });
});
