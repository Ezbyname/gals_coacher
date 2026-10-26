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

/** TRAINING-PROGRESSION-001 P2 / P3: the compact "Last performance" panel of the Workout Builder, through the real route tree and real SQLite. */
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
const planCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts'))!.n;
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

describe('Last performance panel (PB-UI-01…)', () => {
  it('PB-UI-01: collapsed by default; expanding shows the date, the workout, the PREVIOUS PLAN and the ACTUAL sets apart; nothing is written', async () => {
    await prepare('en');
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(8, 40), { extra: rl(6, 40) }]]);
    const before = await dump();
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    expect(has(`${LAST}-panel`)).toBe(false); // collapsed
    press(`${LAST}-toggle`);
    expect(text(`${LAST}-when`)).toContain('Push day');
    expect(text(`${LAST}-plan`)).toBe('3 × 10 @ 40 kg · rest 90 s');
    expect(text(`${LAST}-set-1`)).toBe('Set 1: 10 @ 40 kg');
    expect(text(`${LAST}-set-3`)).toBe('Set 3: 8 @ 40 kg');
    expect(text(`${LAST}-set-4`)).toBe('Set 4 · Extra set (not planned): 6 @ 40 kg');
    expect(await dump()).toBe(before);
    expect(await planCount()).toBe(1);
  });

  it('PB-UI-02: Repeat last plan puts the previous PLAN into this draft only; the draft stays editable; the stored plan count is unchanged until Save', async () => {
    await prepare('en');
    await perform(daniel, [bench(3, 10, 40)], [[rl(9, 42.5), rl(9, 42.5), rl(7, 42.5)]]);
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    press(`${LAST}-toggle`);
    press(`${LAST}-repeat`);
    await waitFor(() => expect(text(`${LAST}-applied`)).toContain('Applied'));
    expect([value('builder-entry-0-item-0-sets'), value('builder-entry-0-item-0-target'), value('builder-entry-0-item-0-load'), value('builder-entry-0-item-0-rest')]).toEqual(['3', '10', '40', '90']); // the plan, not the actual 9 / 42.5
    type('builder-entry-0-item-0-sets', '4'); // still freely editable
    expect(value('builder-entry-0-item-0-sets')).toBe('4');
    expect(await planCount()).toBe(1);
  });

  it('PB-UI-03: Use last performance as baseline: 10 / 10 / 8 @ 40 becomes 3 x 8 @ 40; the extra set is not added', async () => {
    await prepare('en');
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(8, 40), { extra: rl(5, 40) }]]);
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    press(`${LAST}-toggle`);
    press(`${LAST}-baseline`);
    await waitFor(() => expect(value('builder-entry-0-item-0-target')).toBe('8'));
    expect([value('builder-entry-0-item-0-sets'), value('builder-entry-0-item-0-load'), value('builder-entry-0-item-0-rest')]).toEqual(['3', '40', '90']);
  });

  it('PB-UI-04: no eligible previous performance (none, or only another Player\'s): the action is simply omitted, no empty card', async () => {
    await prepare('en');
    await perform(noa, [bench(3, 10, 80)], [[rl(10, 80), rl(10, 80), rl(10, 80)]]); // someone else's
    await openBuilder(daniel);
    await addBench();
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve(); // let the (empty) lookup settle
    });
    expect(has(`${LAST}-toggle`)).toBe(false);
    expect(has(LAST)).toBe(false);
  });

  it('PB-UI-05: a Player never sees another Player\'s performance, even with the same exercise', async () => {
    await prepare('en');
    await perform(noa, [bench(3, 10, 80)], [[rl(10, 80), rl(10, 80), rl(10, 80)]], 'Noa day');
    await perform(daniel, [bench(1, 5, 20)], [[rl(5, 20)]], 'Daniel day');
    await openBuilder(daniel);
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    press(`${LAST}-toggle`);
    expect(text(`${LAST}-when`)).toContain('Daniel day');
    expect(text(`${LAST}-when`)).not.toContain('Noa');
    expect(text(`${LAST}-plan`)).toBe('1 × 5 @ 20 kg · rest 90 s');
  });

  it('PB-UI-06: a non-uniform previous plan disables Repeat with a clear reason; the history stays visible', async () => {
    await prepare('en');
    const saved = await savePlannedWorkout(db!, { planId: null, playerId: daniel, name: 'Odd', entries: [{ kind: 'EXERCISE', exerciseId: BENCH, prescription: rx(2, 10, 40) }] }, deps);
    if (!saved.ok) throw new Error('save');
    const session = await startSession(db!, saved.plan.id, deps);
    await recordSet(db!, session.exercises[0]!.sets[0]!.id, rl(10, 40), deps);
    await recordSet(db!, session.exercises[0]!.sets[1]!.id, rl(8, 40), deps);
    // make the plan non-uniform the only way the data can be: two planned sets with different planned targets (a legacy / imported shape)
    await db!.execAsync('DROP TRIGGER session_sets_closed_update');
    await db!.runAsync('UPDATE session_sets SET planned_target = 8 WHERE set_number = 2');
    await finishSession(db!, session.id, deps);
    await openBuilder();
    await addBench();
    await screen.findByTestId(`${LAST}-toggle`);
    press(`${LAST}-toggle`);
    expect(disabled(`${LAST}-repeat`)).toBe(true);
    expect(text(`${LAST}-repeat-reason`)).toBe('The previous plan used different prescriptions between sets.');
    expect(text(`${LAST}-set-1`)).toBe('Set 1: 10 @ 40 kg'); // history still visible
    expect(disabled(`${LAST}-baseline`)).toBe(false); // the actual baseline does not depend on the plan's target
  });

  it('PB-UI-07: a template import keeps its own dosage; Last performance is offered, and nothing changes until a button is pressed', async () => {
    await prepare('en');
    await perform(daniel, [{ kind: 'EXERCISE', exerciseId: 'DUMBBELL_BENCH_PRESS', prescription: rx(4, 12, 30) }], [[rl(12, 30), rl(12, 30), rl(11, 30), rl(10, 30)]]);
    await openBuilder();
    press('builder-add-template');
    press(await screen.findByTestId('tpl-option-GYM-BEG-FULLBODY-A').then(() => 'tpl-option-GYM-BEG-FULLBODY-A'));
    press(await screen.findByTestId('tpl-import').then(() => 'tpl-import'));
    await screen.findByTestId('builder-entry-1');
    // Full Body A, Main: the Dumbbell Bench Press is item 1 with the TEMPLATE's 3 x 10
    expect([value('builder-entry-1-item-1-sets'), value('builder-entry-1-item-1-target')]).toEqual(['3', '10']);
    await screen.findByTestId('builder-entry-1-item-1-last-toggle');
    press('builder-entry-1-item-1-last-toggle');
    expect([value('builder-entry-1-item-1-sets'), value('builder-entry-1-item-1-target')]).toEqual(['3', '10']); // opening changed nothing
    press('builder-entry-1-item-1-last-repeat');
    await waitFor(() => expect([value('builder-entry-1-item-1-sets'), value('builder-entry-1-item-1-target'), value('builder-entry-1-item-1-load')]).toEqual(['4', '12', '30']));
    expect(has('builder-entry-1-item-0-last-toggle')).toBe(false); // an exercise with no history shows nothing
  });
});

describe('Hebrew (PB-UI-08)', () => {
  it('PB-UI-08: the labels, the extra-set marker and the action names are Hebrew', async () => {
    await prepare('he');
    await perform(daniel, [bench(3, 10, 40)], [[rl(10, 40), rl(10, 40), rl(8, 40), { extra: rl(5, 40) }]]);
    await openBuilder();
    press('builder-add-exercise');
    type(await screen.findByTestId('builder-exercise-search').then(() => 'builder-exercise-search'), 'barbell bench');
    press(await screen.findByTestId(`builder-exercise-option-${BENCH}`).then(() => `builder-exercise-option-${BENCH}`));
    await screen.findByTestId(`${LAST}-toggle`);
    expect(screen.getByText('ביצוע קודם')).toBeTruthy();
    press(`${LAST}-toggle`);
    expect(screen.getByText('תכנון קודם')).toBeTruthy();
    expect(screen.getByText('בפועל')).toBeTruthy();
    expect(screen.getByText('חזור על התכנון הקודם')).toBeTruthy();
    expect(screen.getByText('השתמש בביצוע הקודם כבסיס')).toBeTruthy();
    expect(text(`${LAST}-set-4`)).toContain('סט נוסף (לא מתוכנן)');
  });
});
