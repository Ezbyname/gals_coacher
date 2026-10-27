import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout, type SaveEntry } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { addSet, finishSession, recordSet, startSession } from '@/data/local/training/trainingRepository';
import type { Prescription, SetValues } from '@/domain/training/training';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAINING-PROGRESSION-002 S2 / S3: the deterministic suggestion inside the Builder's Last performance panel, through the real route tree and real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
let now = new Date(2026, 9, 16, 17).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const clock = { wallNow: () => (now += 60_000), monotonicNow: () => 0 };
const deps = { ids, clock };
let daniel = '';
let noa = '';
const BENCH = 'BARBELL_BENCH_PRESS';

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(new Date(2026, 9, 30, 12).getTime());
  const mk = async (name: string) => {
    const r = await createPlayer(opened, { player: { name, dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
    if (!r.ok) throw new Error('seed');
    return r.profile.player.id;
  };
  daniel = await mk('Daniel');
  noa = await mk('Noa');
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const rx = (sets: number, target: number | null, loadKg: number | null = null, extra: Partial<Prescription> = {}): Prescription => ({ sets, target, loadKg, restSec: 90, ...extra });
async function perform(playerId: string, entries: SaveEntry[], sets: (SetValues | { extra: SetValues })[][], name = 'Push day') {
  const saved = await savePlannedWorkout(db!, { planId: null, playerId, name, entries }, deps);
  if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
  let session = await startSession(db!, saved.plan.id, deps);
  for (const [e, list] of sets.entries()) {
    for (const [s, v] of list.entries()) {
      if ('extra' in v) {
        session = await addSet(db!, session.exercises[e]!.id, deps);
        await recordSet(db!, session.exercises[e]!.sets.at(-1)!.id, v.extra, deps);
      } else await recordSet(db!, session.exercises[e]!.sets[s]!.id, v, deps);
    }
  }
  await finishSession(db!, session.id, deps);
}
const bench = (sets: number, target: number, load: number): SaveEntry => ({ kind: 'EXERCISE', exerciseId: BENCH, prescription: rx(sets, target, load) });
const rl = (r: number, l: number): SetValues => ({ REPETITIONS: r, LOAD_KG: l });

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
const has = (testID: string) => screen.queryByTestId(testID) !== null;
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const value = (testID: string) => screen.getByTestId(testID).props.value as string;
const dump = async () => JSON.stringify(await Promise.all(['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises', 'session_sets', 'set_measurements'].map((t) => db!.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`))));
const disabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;

async function openBuilder(player = daniel) {
  renderRouter(routes, { initialUrl: `/children/${player}` });
  await screen.findByTestId('training-create-workout');
  press('training-create-workout');
  await screen.findByTestId('builder-name');
}
async function addBench() {
  press('builder-add-exercise');
  type(await screen.findByTestId('builder-exercise-search').then(() => 'builder-exercise-search'), 'barbell bench');
  press(await screen.findByTestId(`builder-exercise-option-${BENCH}`).then(() => `builder-exercise-option-${BENCH}`));
  await screen.findByTestId('builder-entry-0');
}
const LAST = 'builder-entry-0-item-0-last';

describe('progression suggestion in the Builder (PB-SUG-01…)', () => {
  const twice = async () => {
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await perform(daniel, [bench(3, 10, 40)], [[rl(11, 40), rl(10, 40), rl(10, 40)]]);
  };

  it('PB-SUG-01: two qualifying workouts: a badge on the collapsed row; expanded, the suggestion and its reason; nothing is written until the user applies AND saves', async () => {
    await prepare('en');
    await twice();
    const before = await dump();
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    expect(text(`${LAST}-badge`)).toBe('Suggestion available');
    expect(has(`${LAST}-panel`)).toBe(false);
    press(`${LAST}-toggle`);
    expect(text(`${LAST}-suggestion-value`)).toBe('Consider 42.5 kg');
    expect(text(`${LAST}-suggestion-reason`)).toBe('All 3 sets reached the target at 40 kg in the last two workouts.');
    expect(await dump()).toBe(before);
    // the draft still holds the template default until Apply
    expect(value('builder-entry-0-item-0-load')).toBe('');
  });

  it('PB-SUG-02: Apply suggestion puts the previous plan with only the load raised into THIS draft; it stays editable; the stored plans are unchanged', async () => {
    await prepare('en');
    await twice();
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    press(`${LAST}-toggle`);
    const before = await dump();
    press(`${LAST}-suggest-apply`);
    await waitFor(() => expect(text(`${LAST}-suggest-applied`)).toBe('Suggestion applied — you can still edit.'));
    expect([value('builder-entry-0-item-0-sets'), value('builder-entry-0-item-0-target'), value('builder-entry-0-item-0-load'), value('builder-entry-0-item-0-rest')]).toEqual(['3', '10', '42.5', '90']);
    type('builder-entry-0-item-0-load', '41');
    expect(value('builder-entry-0-item-0-load')).toBe('41');
    expect(await dump()).toBe(before);
  });

  it('PB-SUG-03: ONE qualifying workout: no badge; expanded shows why there is no suggestion and offers no Apply', async () => {
    await prepare('en');
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    expect(has(`${LAST}-badge`)).toBe(false);
    press(`${LAST}-toggle`);
    expect(text(`${LAST}-no-suggestion`)).toBe('No suggestion: Two comparable workouts are required.');
    expect(has(`${LAST}-suggest-apply`)).toBe(false);
    expect(disabled(`${LAST}-repeat`)).toBe(false); // the 001 actions remain
  });

  it('PB-SUG-04: a missed target gives No suggestion with its reason', async () => {
    await prepare('en');
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(9, 40), rl(10, 40)]]);
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    press(`${LAST}-toggle`);
    expect(text(`${LAST}-no-suggestion`)).toBe('No suggestion: Target was not met.');
  });

  it("PB-SUG-05: another Player's workouts never produce a suggestion", async () => {
    await prepare('en');
    await perform(noa, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await perform(noa, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(10, 40)]]);
    await openBuilder();
    await addBench();
    await act(async () => {
      await Promise.resolve();
    });
    expect(has(`${LAST}-toggle`)).toBe(false);
  });

  it('PB-SUG-06: Hebrew (RTL): the badge, the suggestion, the reason and Apply are in Hebrew and Apply works', async () => {
    await prepare('he');
    await twice();
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    expect(text(`${LAST}-badge`)).toBe('יש הצעה');
    press(`${LAST}-toggle`);
    expect(text(`${LAST}-suggestion-value`)).toContain('כדאי לשקול');
    expect(text(`${LAST}-suggestion-value`)).toContain('42.5');
    expect(text(`${LAST}-suggestion-reason`)).toContain('שני האימונים האחרונים');
    press(`${LAST}-suggest-apply`);
    await waitFor(() => expect(text(`${LAST}-suggest-applied`)).toBe('ההצעה הוחלה — עדיין אפשר לערוך.'));
    expect(value('builder-entry-0-item-0-load')).toBe('42.5');
  });
});
