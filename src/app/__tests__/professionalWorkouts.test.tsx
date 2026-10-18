import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { getPlannedWorkout, listTraining, startSession } from '@/data/local/training/trainingRepository';
import { PROFESSIONAL_WORKOUTS, professionalWorkout } from '@/domain/training/professional';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** SPORT-CONTENT-001 — Professional workouts through the real route tree and real SQLite (Hebrew and English). */
jest.setTimeout(30_000);
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 18, 12).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
const players: Record<string, string> = {};

async function prepare(language: 'he' | 'en', names: string[] = ['Daniel']) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  for (const name of names) {
    const p = await createPlayer(opened, { player: { name, dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
    if (!p.ok) throw new Error('seed');
    players[name] = p.profile.player.id;
  }
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const has = (testID: string) => screen.queryByTestId(testID) !== null;
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const rx = (sets: number, target: number | null) => ({ sets, target, loadKg: null, restSec: 60 });
async function plan(player: string, name: string, ...exerciseIds: string[]) {
  const r = await savePlannedWorkout(
    db!,
    { planId: null, playerId: players[player]!, name, entries: exerciseIds.map((exerciseId) => ({ kind: 'EXERCISE', exerciseId, prescription: rx(3, 8) }) as const) },
    deps,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
const planCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts'))!.n;
const idsOf = (workoutId: string) => professionalWorkout(workoutId)!.sections.flatMap((s) => s.items.map((i) => i.exerciseId));
const cards = () => screen.queryAllByTestId(/^professional-workout-[A-Z]+-[A-Z]+-\d+$/).map((n) => n.props.testID.replace('professional-workout-', ''));
const enabled = () => expect(screen.getByTestId('assign-continue').props.accessibilityState?.disabled).not.toBe(true);

describe('listing', () => {
  it('English: Workouts → Professional workouts shows the six workouts with sport and level; the filters narrow them', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts' });
    press((await screen.findByTestId('workouts-professional')).props.testID);
    await screen.findByTestId('professional-scroll');
    expect(cards()).toHaveLength(6);
    expect(text('professional-workout-SURF-FOUNDATION-01-level')).toBe('Surfing · Beginner');
    expect(text('professional-workout-SURF-PERFORMANCE-01-level')).toBe('Surfing · Advanced');
    expect(text('professional-workout-FOOTBALL-PROGRESSION-01-level')).toBe('Football · Intermediate');
    press('professional-filter-sport-SURFING');
    await waitFor(() => expect(cards()).toEqual(['SURF-FOUNDATION-01', 'SURF-PROGRESSION-01', 'SURF-PERFORMANCE-01']));
    press('professional-filter-level-BEGINNER');
    await waitFor(() => expect(cards()).toEqual(['SURF-FOUNDATION-01']));
    press('professional-filter-sport-SURFING'); // off
    await waitFor(() => expect(cards()).toEqual(['SURF-FOUNDATION-01', 'FOOTBALL-FOUNDATION-01']));
    expect(text('professional-intro')).toMatch(/not official FIFA, ISA or Surfing Australia/);
  });

  it('Hebrew: titles and levels render in Hebrew', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/professional' });
    await screen.findByTestId('professional-scroll');
    expect(cards()).toHaveLength(6);
    expect(text('professional-workout-SURF-FOUNDATION-01-name')).toBe('גלישה — מתחילים');
    expect(text('professional-workout-SURF-FOUNDATION-01-level')).toBe('גלישה · מתחילים');
    expect(text('professional-workout-FOOTBALL-PERFORMANCE-01-name')).toBe('כדורגל — מתקדמים');
    expect(text('professional-workout-FOOTBALL-PERFORMANCE-01-level')).toBe('כדורגל · מתקדמים');
  });
});

describe('opening a workout (read-only content)', () => {
  it.each(PROFESSIONAL_WORKOUTS.map((w) => [w.id] as const))('%s opens with its sections and exercises in order', async (workoutId) => {
    await prepare('en');
    renderRouter(routes, { initialUrl: `/workouts/professional/${workoutId}` });
    await screen.findByTestId('professional-details-name');
    const pro = professionalWorkout(workoutId)!;
    expect(text('professional-details-name')).toBe(pro.name[1]);
    for (const [s, section] of pro.sections.entries()) expect(text(`professional-section-${s}-name`)).toBe(section.name[1]);
    expect(screen.queryAllByTestId(/^professional-item-\d+-\d+-name$/)).toHaveLength(idsOf(workoutId).length);
    expect(has('professional-add-to-workout')).toBe(true);
    expect(has('professional-edit')).toBe(false); // read-only: no edit / delete / rename offered
  });

  it('surf shows the locked safety wording (and the coach notes, not copied); football shows none', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/professional/SURF-FOUNDATION-01' });
    await screen.findByTestId('professional-safety');
    expect(text('professional-safety-text')).toBe(
      'Ocean conditions, currents, weather and suitable surf level require real-world judgement by the surfer, coach or responsible adult.',
    );
    expect(text('professional-coach-note-0')).toMatch(/rip/i);
    expect(text('professional-source-note')).toMatch(/Gals Coacher's own recommendation/);
    renderRouter(routes, { initialUrl: '/workouts/professional/FOOTBALL-FOUNDATION-01' });
    await screen.findByTestId('professional-details-name');
    expect(has('professional-safety')).toBe(false);
  });

  it('Hebrew: the safety wording and the level are in Hebrew', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/professional/SURF-PROGRESSION-01' });
    await screen.findByTestId('professional-safety');
    expect(text('professional-safety-text')).toBe('תנאי ים, זרמים, מזג אוויר ורמת הגלישה המתאימה דורשים שיקול דעת אמיתי של הגולש, המאמן או המבוגר האחראי.');
    expect(text('professional-details-level')).toBe('גלישה · בינוני');
  });

  it('an unknown workout shows an error, never an empty screen', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/professional/NOPE' });
    await screen.findByTestId('professional-error');
  });
});

describe('Add to workout', () => {
  async function openAssign(workoutId: string) {
    renderRouter(routes, { initialUrl: `/workouts/professional/${workoutId}` });
    press((await screen.findByTestId('professional-add-to-workout')).props.testID);
    await screen.findByTestId('assign-continue');
  }

  it('a Player with no workouts: the copy is created at once as a NEW workout named like the professional one (no Builder in between)', async () => {
    await prepare('en');
    await openAssign('FOOTBALL-FOUNDATION-01');
    await waitFor(enabled);
    press('assign-continue');
    await screen.findByTestId(`assign-result-${players.Daniel}`);
    expect(text(`assign-result-${players.Daniel}-text`)).toBe('New workout for Daniel: Football — Beginner');
    const [planned] = (await listTraining(db!, players.Daniel!)).planned;
    expect(planned!.name).toBe('Football — Beginner');
    expect((await getPlannedWorkout(db!, planned!.id))!.items.map((i) => i.exercise.exerciseId)).toEqual(idsOf('FOOTBALL-FOUNDATION-01'));
    expect(await planCount()).toBe(1);
  });

  it('into an EXISTING editable workout: the sections are appended, the existing items stay', async () => {
    await prepare('en');
    const existing = await plan('Daniel', 'Tuesday', 'PUSH_UP');
    await openAssign('SURF-FOUNDATION-01');
    press(`assign-dest-${players.Daniel}-${existing.id}`);
    await waitFor(enabled);
    press('assign-continue');
    await screen.findByTestId(`assign-result-${players.Daniel}`);
    expect(text(`assign-result-${players.Daniel}-text`)).toBe('Added to Daniel: Tuesday');
    expect((await getPlannedWorkout(db!, existing.id))!.items.map((i) => i.exercise.exerciseId)).toEqual(['PUSH_UP', ...idsOf('SURF-FOUNDATION-01')]);
    expect(await planCount()).toBe(1);
  });

  it('a FROZEN workout (a session already exists) is not offered as a destination', async () => {
    await prepare('en');
    const frozen = await plan('Daniel', 'Started', 'PUSH_UP');
    await startSession(db!, frozen.id, deps);
    const editable = await plan('Daniel', 'Still open', 'PLANK');
    await openAssign('SURF-PERFORMANCE-01');
    await screen.findByTestId(`assign-dest-${players.Daniel}-${editable.id}`);
    expect(has(`assign-dest-${players.Daniel}-${frozen.id}`)).toBe(false);
  });

  it('two Players: each gets their OWN workout', async () => {
    await prepare('en', ['Daniel', 'Alice']);
    await openAssign('FOOTBALL-PROGRESSION-01');
    press(`assign-player-${players.Daniel}`);
    press(`assign-player-${players.Alice}`);
    await waitFor(enabled);
    press('assign-continue');
    await screen.findByTestId(`assign-result-${players.Alice}`);
    expect(await planCount()).toBe(2);
    const a = (await listTraining(db!, players.Daniel!)).planned[0]!;
    const b = (await listTraining(db!, players.Alice!)).planned[0]!;
    expect(a.id).not.toBe(b.id);
  });

  it('Hebrew: the new workout is named in Hebrew with Hebrew section names', async () => {
    await prepare('he');
    await openAssign('SURF-FOUNDATION-01');
    await waitFor(enabled);
    press('assign-continue');
    await screen.findByTestId(`assign-result-${players.Daniel}`);
    const [planned] = (await listTraining(db!, players.Daniel!)).planned;
    expect(planned!.name).toBe('גלישה — מתחילים');
    const sections = new Set((await getPlannedWorkout(db!, planned!.id))!.items.map((i) => i.blockName));
    expect(sections).toEqual(new Set(professionalWorkout('SURF-FOUNDATION-01')!.sections.map((s) => s.name[0])));
  });
});

describe('the Exercise library and Basketball', () => {
  it('Football and Surfing are offered as sports; filtering shows exactly their Exercises; Basketball is still there', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/exercises' });
    await screen.findByTestId('exercises-count');
    if (!screen.queryByTestId('exercises-filters')) press('exercises-filters-toggle');
    expect(has('exercises-filter-sport-BASKETBALL')).toBe(true);
    press('exercises-filter-sport-FOOTBALL');
    await waitFor(() => expect(text('exercises-count')).toBe('11 exercises'));
    press('exercises-filter-sport-FOOTBALL');
    press('exercises-filter-sport-SURFING');
    await waitFor(() => expect(text('exercises-count')).toBe('10 exercises'));
    press('exercises-filter-sport-SURFING');
    press('exercises-filter-sport-BASKETBALL');
    await waitFor(() => expect(Number(text('exercises-count').split(' ')[0])).toBeGreaterThan(20));
  });

  it('a surf Exercise opens with its safety note and the sport label', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/exercises/SURF_POP_UP' });
    await screen.findByTestId('exercise-details-add-to-workout');
    expect(screen.getAllByText(/Ocean conditions, currents, weather/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Surfing/).length).toBeGreaterThan(0);
  });
});
