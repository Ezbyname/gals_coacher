import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { setExerciseActive } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { archivePlayer, createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { getPlannedWorkout, listTraining } from '@/data/local/training/trainingRepository';
import { createBlock, getBlock, setBlockActive } from '@/data/local/training/workoutRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** QB-WORKOUT-BUILDER-001B (WB-UI-01…15): Player → Create Workout, through the real route tree and real SQLite. */
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
const planCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts'))!.n;
const planOf = async (index = 0) => (await listTraining(db!, daniel)).planned[index]!;
const disabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;

async function playerPage() {
  const app = renderRouter(routes, { initialUrl: `/children/${daniel}` });
  await screen.findByTestId('training-create-workout');
  return app;
}
async function openBuilder() {
  await playerPage();
  press('training-create-workout');
  await screen.findByTestId('builder-name');
}
async function addBlock(id: string) {
  press('builder-add-block');
  press(await screen.findByTestId(`builder-block-option-${id}`).then(() => `builder-block-option-${id}`));
  await screen.findByTestId('builder-entry-0');
}
async function addExercise(query: string, exerciseId: string) {
  press('builder-add-exercise');
  type(await screen.findByTestId('builder-exercise-search').then(() => 'builder-exercise-search'), query);
  press(await screen.findByTestId(`builder-exercise-option-${exerciseId}`).then(() => `builder-exercise-option-${exerciseId}`));
}
const titles = () => screen.queryAllByTestId(/^builder-entry-\d+-title$/).map((n) => stripBidi(String(n.props.children)));
async function saveAndReturn() {
  press('builder-save');
  await screen.findByTestId('training-create-workout'); // back on the Player page
}

describe('draft: nothing is stored until Save (WB-UI-01…03)', () => {
  it('WB-UI-01: Player → Create Workout opens an empty LOCAL draft; no PlannedWorkout row exists', async () => {
    await prepare('en');
    await openBuilder();
    expect(text('builder-empty')).toBe('Nothing here yet. Add a block or an exercise to start.');
    expect(screen.getByTestId('builder-name').props.value).toBe('New workout'); // a suggested name, editable
    expect(await planCount()).toBe(0);
    expect(has('builder-entry-0')).toBe(false);
  });

  it('WB-UI-02: Cancel on the empty Builder leaves no PlannedWorkout, and nothing is asked', async () => {
    await prepare('en');
    await openBuilder();
    press('builder-cancel');
    await screen.findByTestId('training-create-workout');
    expect(await planCount()).toBe(0);
    expect(has('training-planned-title')).toBe(false); // no empty workout shown to the user
  });

  it('WB-UI-03: Save is impossible while empty (or nameless); pressing it creates nothing', async () => {
    await prepare('en');
    await block('Shooting', 'FREE_THROWS');
    await openBuilder();
    expect(disabled('builder-save')).toBe(true);
    expect(text('builder-needs-content')).toBe('Add at least one block or exercise to save.');
    press('builder-save');
    expect(await planCount()).toBe(0);
    // with content but a blank name: still not saveable
    const shooting = (await db!.getFirstAsync<{ id: string }>('SELECT id FROM workout_blocks'))!.id;
    await addBlock(shooting);
    await waitFor(() => expect(disabled('builder-save')).toBe(false));
    type('builder-name', '   ');
    await waitFor(() => expect(disabled('builder-save')).toBe(true));
    expect(await planCount()).toBe(0);
  });
});

describe('composition (WB-UI-04…10)', () => {
  it('WB-UI-04: add one Block and save: the copied composition persists and shows on the Player page (no invented date)', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS', 'PLANK');
    await openBuilder();
    await addBlock(shooting.id);
    expect(titles()).toEqual(['Block: Shooting']);
    expect(has('builder-entry-0-item-0')).toBe(true);
    expect(has('builder-entry-0-item-1')).toBe(true);
    type('builder-name', 'Daniel Tuesday');
    await saveAndReturn();
    const plan = await planOf();
    expect(plan.name).toBe('Daniel Tuesday');
    expect(plan.items.map((i) => [i.exercise.exerciseId, i.blockName, i.sourceBlockId])).toEqual([
      ['FREE_THROWS', 'Shooting', shooting.id],
      ['PLANK', 'Shooting', shooting.id],
    ]);
    await waitFor(() => expect(has(`training-planned-${plan.id}`)).toBe(true));
    expect(text(`training-planned-${plan.id}-name`)).toBe('Daniel Tuesday');
    expect(text(`training-planned-${plan.id}-summary`)).toBe('1 sections');
    expect(stripBidi(JSON.stringify(screen.toJSON()))).not.toMatch(/16\/10|2026/); // created_at is never shown as a workout date
  });

  it('WB-UI-05: Block A + standalone Exercise + Block B: the exact order persists and is the same after reopening', async () => {
    await prepare('en');
    const a = await block('Ball Handling', 'GOBLET_SQUAT');
    const b = await block('Shooting', 'FREE_THROWS', 'PUSH_UP');
    await openBuilder();
    await addBlock(a.id);
    await addExercise('plank', 'PLANK');
    press('builder-add-block');
    press(await screen.findByTestId(`builder-block-option-${b.id}`).then(() => `builder-block-option-${b.id}`));
    await waitFor(() => expect(titles()).toEqual(['Block: Ball Handling', 'Single exercise', 'Block: Shooting']));
    await saveAndReturn();
    const plan = await planOf();
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['GOBLET_SQUAT', 'PLANK', 'FREE_THROWS', 'PUSH_UP']);
    // reopen from the Player page: same order
    press(`training-planned-${plan.id}-edit`);
    await screen.findByTestId('builder-entry-2');
    expect(titles()).toEqual(['Block: Ball Handling', 'Single exercise', 'Block: Shooting']);
  });

  it('WB-UI-06: the same Block twice = two independent sections', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS');
    await openBuilder();
    await addBlock(shooting.id);
    press('builder-add-block');
    press(await screen.findByTestId(`builder-block-option-${shooting.id}`).then(() => `builder-block-option-${shooting.id}`));
    await screen.findByTestId('builder-entry-1');
    type('builder-entry-1-item-0-sets', '7'); // editing the second copy leaves the first alone
    expect(screen.getByTestId('builder-entry-0-item-0-sets').props.value).toBe('2');
    await saveAndReturn();
    const plan = await planOf();
    expect(plan.items.map((i) => i.prescription.sets)).toEqual([2, 7]);
    expect(new Set(plan.items.map((i) => i.sectionId)).size).toBe(2);
  });

  it('WB-UI-07: editing a copied prescription changes THIS workout only; the source Block is untouched', async () => {
    await prepare('en');
    const strength = await block('Strength', 'BARBELL_BENCH_PRESS', 'PUSH_UP');
    const before = await getBlock(db!, strength.id);
    await openBuilder();
    await addBlock(strength.id);
    type('builder-entry-0-item-0-sets', '5');
    type('builder-entry-0-item-0-target', '4');
    type('builder-entry-0-item-0-load', '72.5');
    type('builder-entry-0-item-0-rest', '120');
    await saveAndReturn();
    const plan = await planOf();
    expect(plan.items[0]!.prescription).toEqual({ sets: 5, target: 4, loadKg: 72.5, restSec: 120 });
    expect(plan.items[1]!.prescription).toEqual(rx(2, 10));
    expect(await getBlock(db!, strength.id)).toEqual(before);
    // a field the Exercise does not support is not offered (push-ups use no load)
    expect(has('builder-entry-0-item-1-load')).toBe(false);
  });

  it('WB-UI-08: removing one copied section removes only that section (the source Block stays)', async () => {
    await prepare('en');
    const a = await block('Alpha', 'FREE_THROWS');
    const b = await block('Bravo', 'PLANK');
    await openBuilder();
    await addBlock(a.id);
    press('builder-add-block');
    press(await screen.findByTestId(`builder-block-option-${b.id}`).then(() => `builder-block-option-${b.id}`));
    await screen.findByTestId('builder-entry-1');
    press('builder-entry-0-remove');
    await waitFor(() => expect(titles()).toEqual(['Block: Bravo']));
    await saveAndReturn();
    expect((await planOf()).items.map((i) => i.exercise.exerciseId)).toEqual(['PLANK']);
    expect((await getBlock(db!, a.id))!.active).toBe(true); // the Block itself is never deactivated or deleted
  });

  it('WB-UI-09: removing a standalone Exercise', async () => {
    await prepare('en');
    const a = await block('Alpha', 'FREE_THROWS');
    await openBuilder();
    await addExercise('plank', 'PLANK'); // entry 0: a standalone Exercise
    press('builder-add-block');
    press(await screen.findByTestId(`builder-block-option-${a.id}`).then(() => `builder-block-option-${a.id}`));
    await waitFor(() => expect(titles()).toEqual(['Single exercise', 'Block: Alpha']));
    press('builder-entry-0-remove');
    await waitFor(() => expect(titles()).toEqual(['Block: Alpha']));
    await saveAndReturn();
    expect((await planOf()).items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS']);
  });

  it('WB-UI-10: reorder with Move up / down; the order persists after Save and reload', async () => {
    await prepare('en');
    const a = await block('Alpha', 'FREE_THROWS');
    const b = await block('Bravo', 'PUSH_UP');
    await openBuilder();
    await addBlock(a.id);
    await addExercise('plank', 'PLANK');
    press('builder-add-block');
    press(await screen.findByTestId(`builder-block-option-${b.id}`).then(() => `builder-block-option-${b.id}`));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(has('builder-entry-0-up')).toBe(false); // first cannot go up
    expect(has('builder-entry-2-down')).toBe(false); // last cannot go down
    press('builder-entry-2-up'); // Alpha, Bravo, Plank
    press('builder-entry-0-down'); // Bravo, Alpha, Plank
    await waitFor(() => expect(titles()).toEqual(['Block: Bravo', 'Block: Alpha', 'Single exercise']));
    await saveAndReturn();
    const plan = await planOf();
    expect(plan.items.map((i) => i.exercise.exerciseId)).toEqual(['PUSH_UP', 'FREE_THROWS', 'PLANK']);
    expect((await getPlannedWorkout(db!, plan.id))!.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });
});

describe('editing a saved workout and freezing (WB-UI-11/12)', () => {
  async function seededPlan() {
    const shooting = await block('Shooting', 'FREE_THROWS');
    const r = await savePlannedWorkout(db!, { planId: null, playerId: daniel, name: 'Saved plan', entries: [{ kind: 'BLOCK', blockId: shooting.id, prescriptions: [rx(2, 10)] }] }, deps);
    if (!r.ok) throw new Error('seed');
    return r.plan;
  }

  it('WB-UI-11: edit a saved PlannedWorkout before any session exists: same plan, renamed, extended, re-prescribed', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await playerPage();
    press(`training-planned-${plan.id}-edit`);
    await screen.findByTestId('builder-entry-0');
    expect(screen.getByTestId('builder-name').props.value).toBe('Saved plan');
    type('builder-name', 'Saved plan v2');
    type('builder-entry-0-item-0-sets', '6');
    await addExercise('plank', 'PLANK');
    await saveAndReturn();
    expect(await planCount()).toBe(1); // updated in place, not duplicated
    const edited = await planOf();
    expect(edited.id).toBe(plan.id);
    expect(edited.name).toBe('Saved plan v2');
    expect(edited.items.map((i) => i.exercise.exerciseId)).toEqual(['FREE_THROWS', 'PLANK']);
    expect(edited.items[0]!.prescription.sets).toBe(6);
  });

  it('WB-UI-12: once a session exists the Builder is read-only (no edit controls); Start from the Player page works once and the plan leaves the planned list', async () => {
    await prepare('en');
    const plan = await seededPlan();
    await playerPage();
    press(`training-planned-${plan.id}-start`);
    await waitFor(() => expect(has('session-scroll')).toBe(true));
    expect((await listTraining(db!, daniel)).sessions).toHaveLength(1);
    expect((await listTraining(db!, daniel)).planned).toHaveLength(0); // started: no longer "planned"
    // opening the Builder for it now is read-only; the repository refuses edits regardless of the UI
    renderRouter(routes, { initialUrl: `/children/${daniel}/training/builder/${plan.id}` });
    await screen.findByTestId('builder-readonly');
    expect(text('builder-readonly')).toBe('This workout was already started, so it can no longer change.');
    for (const gone of ['builder-save', 'builder-add-block', 'builder-add-exercise', 'builder-entry-0-remove', 'builder-entry-0-item-0-sets', 'builder-name']) expect(has(gone)).toBe(false);
    expect(has('builder-entry-0-item-0-rx')).toBe(true);
    await expect(savePlannedWorkout(db!, { planId: plan.id, playerId: daniel, name: 'x', entries: [{ kind: 'KEEP', positions: [0], prescriptions: [rx(1, 1)] }] }, deps)).rejects.toMatchObject({ rule: 'PLAN_ALREADY_STARTED' });
  });

  it('a plan with nothing in it never offers Start (an empty plan cannot start)', async () => {
    await prepare('en');
    await db!.runAsync("INSERT INTO planned_workouts (id, player_id, template_id, name, created_at, updated_at) VALUES ('00000000-0000-4000-8000-0000000000aa', ?, NULL, 'Empty', ?, ?)", [daniel, NOW, NOW]);
    await playerPage();
    expect(has('training-planned-00000000-0000-4000-8000-0000000000aa-view')).toBe(true);
    expect(has('training-planned-00000000-0000-4000-8000-0000000000aa-start')).toBe(false);
  });
});

describe('guards (WB-UI-13/14)', () => {
  it('WB-UI-13: an inactive Block / Exercise is not offered as new content', async () => {
    await prepare('en');
    const visible = await block('Visible', 'FREE_THROWS');
    const hidden = await block('Hidden', 'PUSH_UP');
    await setBlockActive(db!, hidden.id, false, { clock: systemClock });
    await setExerciseActive(db!, 'PLANK', false, { clock: systemClock });
    await openBuilder();
    press('builder-add-block');
    await screen.findByTestId(`builder-block-option-${visible.id}`);
    expect(has(`builder-block-option-${hidden.id}`)).toBe(false);
    type('builder-block-search', 'hid');
    await waitFor(() => expect(has('builder-block-no-matches')).toBe(true));
    press('builder-block-picker-close');
    press('builder-add-exercise');
    type(await screen.findByTestId('builder-exercise-search').then(() => 'builder-exercise-search'), 'plank');
    await screen.findByTestId('builder-exercise-option-SIDE_PLANK'); // an ACTIVE match is offered ...
    expect(has('builder-exercise-option-PLANK')).toBe(false); // ... the inactive one never is
  });

  it('WB-UI-14: an archived Player cannot create or edit a PlannedWorkout', async () => {
    await prepare('en');
    const shooting = await block('Shooting', 'FREE_THROWS');
    const r = await savePlannedWorkout(db!, { planId: null, playerId: daniel, name: 'Old', entries: [{ kind: 'BLOCK', blockId: shooting.id, prescriptions: [rx(2, 10)] }] }, deps);
    if (!r.ok) throw new Error('seed');
    await archivePlayer(db!, daniel, { clock: systemClock });
    renderRouter(routes, { initialUrl: `/children/${daniel}/training/builder/new` });
    await screen.findByTestId('active-player-missing');
    expect(has('builder-name')).toBe(false);
    renderRouter(routes, { initialUrl: `/children/${daniel}/training/builder/${r.plan.id}` });
    await screen.findByTestId('active-player-missing');
    expect(await planCount()).toBe(1);
    expect(await getPlannedWorkout(db!, r.plan.id)).toEqual(r.plan);
  });
});

describe('Hebrew / RTL (WB-UI-15)', () => {
  it('WB-UI-15: Hebrew UI with mixed Hebrew / English names: labels, long names, order and the saved plan stay correct', async () => {
    await prepare('he');
    const longName = 'כדרור Dribbling מתקדם — קונוסים'.slice(0, 35);
    const mixed = await block(longName, 'FREE_THROWS', 'PLANK');
    await openBuilder();
    press('builder-add-block');
    await screen.findByTestId('builder-block-search');
    type('builder-block-search', 'כדרור');
    press(await screen.findByTestId(`builder-block-option-${mixed.id}`).then(() => `builder-block-option-${mixed.id}`));
    await screen.findByTestId('builder-entry-0');
    expect(titles()).toEqual([`בלוק: ${longName}`]);
    expect(stripBidi(String(screen.getByTestId('builder-entry-0-item-0-name').props.children))).toBe('זריקות עונשין'); // the Exercise's Hebrew name
    await addExercise('זריקות', 'FREE_THROWS'); // searching the exercise library in Hebrew
    await waitFor(() => expect(titles()).toEqual([`בלוק: ${longName}`, 'תרגיל בודד']));
    press('builder-save');
    await screen.findByTestId('training-create-workout');
    const plan = await planOf();
    expect(plan.items[0]!.blockName).toBe(longName);
    expect(text(`training-planned-${plan.id}-summary`)).toMatch(/חלקים/); // "N sections" in Hebrew
  });
});
