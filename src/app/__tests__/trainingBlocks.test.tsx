import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { setExerciseActive } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { startSession } from '@/data/local/training/trainingRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** TRAINING-BLOCKS-001 — Training Blocks through the real route tree and real SQLite (Hebrew and English). */
jest.setTimeout(40_000);
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 18, 12).getTime(); // a Sunday
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
const count = async (table: string) => (await db!.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n;
const BLOCKS = ['ATHLETICISM-FOUNDATION-6W-01', 'EXPLOSIVE-POWER-8W-01', 'SPEED-ACCELERATION-6W-01', 'AGILITY-COD-6W-01', 'STRENGTH-FOUNDATION-6W-01', 'CONDITIONING-6W-01'];
const rows = () => screen.queryAllByTestId(/^block-preview-row-\d+$/);

describe('the list and the details', () => {
  it('English: Workouts → Training blocks lists the six blocks with level, duration and sessions', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts' });
    press((await screen.findByTestId('workouts-training-blocks')).props.testID);
    await screen.findByTestId('blocks-scroll');
    expect(screen.queryAllByTestId(/^block-card-[A-Z0-9-]+$/).map((n) => n.props.testID.replace('block-card-', ''))).toEqual(BLOCKS);
    expect(text('block-card-ATHLETICISM-FOUNDATION-6W-01-name')).toBe('Athleticism Foundation');
    expect(text('block-card-ATHLETICISM-FOUNDATION-6W-01-level')).toBe('General athletic · Beginner');
    expect(text('block-card-ATHLETICISM-FOUNDATION-6W-01-line')).toBe('6 weeks · 2 sessions a week · 12 sessions');
    expect(text('block-card-EXPLOSIVE-POWER-8W-01-line')).toBe('8 weeks · 2 sessions a week · 16 sessions');
    expect(text('block-card-EXPLOSIVE-POWER-8W-01-level')).toBe('General athletic · Intermediate');
  });

  it('Hebrew: the list reads in Hebrew', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks' });
    await screen.findByTestId('blocks-scroll');
    expect(text('block-card-SPEED-ACCELERATION-6W-01-name')).toBe('מהירות והאצה');
    expect(text('block-card-SPEED-ACCELERATION-6W-01-line')).toBe('6 שבועות · 2 אימונים בשבוע · 12 אימונים בסך הכול');
    expect(text('block-card-CONDITIONING-6W-01-level')).toBe('אתלטיות כללית · מתחילים');
  });

  it('a block shows goal, level, equipment, the week-by-week plan with its workouts, progression, recovery and safety — and no video', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/EXPLOSIVE-POWER-8W-01' });
    await screen.findByTestId('block-details-scroll');
    expect(text('block-details-name')).toBe('Explosive Power');
    expect(text('block-details-line')).toBe('8 weeks · 2 sessions a week · 16 sessions');
    for (const id of ['block-goal', 'block-athlete', 'block-prerequisite', 'block-equipment', 'block-progression', 'block-recovery', 'block-safety']) expect(has(id)).toBe(true);
    expect(screen.queryAllByTestId(/^block-week-\d+$/)).toHaveLength(8);
    expect(text('block-session-1-1-name')).toBe('1. Jump & Landing');
    expect(text('block-session-8-2-name')).toBe('2. Explosive Lower Body');
    expect(has('block-add-to-player')).toBe(true);
    expect(has('professional-videos')).toBe(false);
  });

  it('a session opens its workout (read-only); an unknown block shows the not-found screen', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/ATHLETICISM-FOUNDATION-6W-01' });
    await screen.findByTestId('block-details-scroll');
    press('block-session-1-1-name');
    expect(await screen.findByTestId('professional-details-name')).toBeTruthy();
    expect(text('professional-details-name')).toBe('Movement Foundation');
  });

  it('an unknown block id shows an error, not a crash', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/NO-SUCH-BLOCK' });
    expect(await screen.findByTestId('block-error')).toBeTruthy();
  });
});

describe('Add program to player', () => {
  it('review first: nothing is written before the confirmation; then ONE confirmation creates the whole programme', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=ATHLETICISM-FOUNDATION-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    expect(screen.getByTestId(`block-assign-player-${players.Daniel}`).props.accessibilityState.checked).toBe(true); // the one Player is preselected
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    expect(rows()).toHaveLength(12);
    expect(text('block-preview-summary')).toBe('12 workouts will be created for each selected player. Nothing has been created yet.');
    expect(text('block-preview-dates-note')).toMatch(/without dates/);
    expect(text('block-preview-row-0')).toBe('1. Athleticism 1.1 Movement — Movement Foundation');
    expect(await count('planned_workouts')).toBe(0); // the preview wrote nothing
    press('block-assign-back'); // back: still nothing, and the form is there again
    await screen.findByTestId('block-assign-review');
    expect(await count('planned_workouts')).toBe(0);
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    expect(await count('planned_workouts')).toBe(12);
    expect(await count('calendar_events')).toBe(0);
    expect(text(`block-assign-result-${players.Daniel}-text`)).toBe('Daniel: 12 workouts created.');
  });

  it('with the calendar: the preview shows dates, the weekday rules are enforced, and confirmation creates plans AND linked events', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=ATHLETICISM-FOUNDATION-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    press('block-assign-schedule');
    await screen.findByTestId('block-assign-schedule-fields');
    // three days: wrong count
    press('block-assign-day-WED');
    press('block-assign-review');
    expect(text('block-assign-failed')).toBe('Choose exactly 2 training days a week.');
    press('block-assign-day-WED'); // off again
    // Thursday off, Tuesday on: Monday + Tuesday are consecutive
    press('block-assign-day-THU');
    press('block-assign-day-TUE');
    press('block-assign-review');
    expect(text('block-assign-failed')).toMatch(/consecutive days/);
    expect(await count('planned_workouts')).toBe(0);
    // Monday + Thursday again
    press('block-assign-day-TUE');
    press('block-assign-day-THU');
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    expect(text('block-preview-dates-note')).toMatch(/added to the calendar/);
    expect(rows()).toHaveLength(12);
    expect(text('block-preview-row-0')).toMatch(/^1\. Athleticism 1\.1 Movement — Movement Foundation · /);
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    expect(await count('planned_workouts')).toBe(12);
    expect(await count('calendar_events')).toBe(12);
    expect(text(`block-assign-result-${players.Daniel}-text`)).toBe('Daniel: 12 workouts created and added to the calendar.');
    const linked = await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events WHERE planned_workout_id IS NOT NULL');
    expect(linked!.n).toBe(12);
  });

  it('two Players each get their own independent programme', async () => {
    await prepare('en', ['Daniel', 'Alice']);
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=STRENGTH-FOUNDATION-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    expect(has('block-assign-review')).toBe(true);
    expect(screen.getByTestId('block-assign-review').props.accessibilityState?.disabled).toBe(true); // nobody chosen yet
    press(`block-assign-player-${players.Daniel}`);
    press(`block-assign-player-${players.Alice}`);
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    expect(await count('planned_workouts')).toBe(24);
    for (const id of Object.values(players)) {
      expect((await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM planned_workouts WHERE player_id = ?', [id]))!.n).toBe(12);
    }
  });

  it('a failure creates NOTHING for that Player and says so', async () => {
    await prepare('en');
    await setExerciseActive(db!, 'LATERAL_BOUNDS', false, { clock: systemClock });
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=EXPLOSIVE-POWER-8W-01' });
    await screen.findByTestId('block-assign-scroll');
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    expect(rows()).toHaveLength(16);
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    expect(text(`block-assign-result-${players.Daniel}-text`)).toMatch(/^Daniel: nothing was created\. Session 10 failed, so the whole program for this player was cancelled\./);
    expect(await count('planned_workouts')).toBe(0);
    expect(await count('calendar_events')).toBe(0);
  });

  it('Hebrew: the form, the preview and the result read in Hebrew', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=CONDITIONING-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    expect(text('block-preview-summary')).toBe('ייווצרו 12 אימונים לכל שחקן שנבחר. עדיין לא נוצר דבר.');
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    await waitFor(() => expect(text(`block-assign-result-${players.Daniel}-text`)).toBe('Daniel: נוצרו 12 אימונים.'));
  });
});

describe('time caps are shown as recording caps, never as goals', () => {
  it('English: a sprint shows "time cap 5 s" and the hint to record the actual time — and never a "goal" or "target" in seconds', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/professional/ATH-ACCELERATION-01' });
    await screen.findByTestId('professional-details-name');
    const dosage = text('professional-item-2-0-dosage');
    expect(dosage).toMatch(/time cap 5 s/);
    expect(dosage).not.toMatch(/goal|target/i);
    expect(text('professional-item-2-0-time-cap-hint')).toBe('Record your actual time. The value shown is only a recording cap, not a performance goal.');
    expect(has('professional-item-1-0-time-cap-hint')).toBe(false); // the falling-start item is repetitions, not time
  });

  it('Hebrew: the same wording in Hebrew', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/professional/ATH-DECEL-COD-01' });
    await screen.findByTestId('professional-details-name');
    expect(text('professional-item-2-0-dosage')).toMatch(/תקרת זמן 16 שנ׳/);
    expect(text('professional-item-2-0-time-cap-hint')).toBe('מתעדים את הזמן בפועל. הערך המוצג הוא רק תקרה לתיעוד, לא יעד ביצוע.');
  });

  it('the copied plan shows the cap wording too', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=SPEED-ACCELERATION-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    const plan = await db!.getFirstAsync<{ id: string }>("SELECT id FROM planned_workouts WHERE name LIKE '%1.2%' LIMIT 1");
    renderRouter(routes, { initialUrl: `/children/${players.Daniel}/training/plan/${plan!.id}` });
    await screen.findByTestId('plan-item-0-name');
    const caps = screen.queryAllByTestId(/^plan-item-\d+-time-cap-hint$/);
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) expect(stripBidi(String(c.props.children))).toBe('Record your actual time. The value shown is only a recording cap, not a performance goal.');
  });
});

describe('time semantics through the real screens', () => {
  it('workout screens: a plank, run intervals and the partner mirror drill show plain durations with NO cap hint; a sprint shows the cap', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/professional/ATH-MOVEMENT-FOUNDATION-01' });
    await screen.findByTestId('professional-details-name');
    expect(screen.queryAllByTestId(/time-cap-hint$/)).toHaveLength(0);
    expect(text('professional-item-2-2-dosage')).toMatch(/2 × 20 s/); // the plank: 20 s of work, not a cap
    expect(text('professional-item-2-2-dosage')).not.toMatch(/cap/);
  });

  it.each([
    ['ATH-CONDITIONING-INTERVALS-01', 'professional-item-1-0-dosage', '6 × 45 s'],
    ['ATH-REACTIVE-AGILITY-01', 'professional-item-2-0-dosage', '4 × 15 s'],
  ])('%s shows a duration with no hint (including its alternatives)', async (workoutId, dosageTestId, expected) => {
    await prepare('en');
    renderRouter(routes, { initialUrl: `/workouts/professional/${workoutId}` });
    await screen.findByTestId('professional-details-name');
    expect(text(dosageTestId)).toContain(expected);
    expect(text(dosageTestId)).not.toMatch(/cap/);
    // the hint appears only for a genuine completion-time item: the intervals workout has ONE (its 500 m rowing alternative), reactive agility none
    expect(screen.queryAllByTestId(/-time-cap-hint$/)).toHaveLength(workoutId === 'ATH-CONDITIONING-INTERVALS-01' ? 1 : 0);
  });

  it('a copied plan keeps the right semantics per exercise: the Movement plan has no hint, the Acceleration plan has one on each time drill only', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=SPEED-ACCELERATION-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    const accel = await db!.getFirstAsync<{ id: string }>("SELECT id FROM planned_workouts WHERE name LIKE '%1.2%' LIMIT 1");
    renderRouter(routes, { initialUrl: `/children/${players.Daniel}/training/plan/${accel!.id}` });
    await screen.findByTestId('plan-item-0-name');
    const hinted = screen.queryAllByTestId(/^plan-item-\d+-time-cap-hint$/).map((n) => n.props.testID);
    const names = screen.queryAllByTestId(/^plan-item-\d+-name$/).map((n) => stripBidi(String(n.props.children)));
    expect(hinted).toHaveLength(2); // the 10 m and the 20 m sprint
    for (const id of hinted) expect(names[Number(/plan-item-(\d+)-/.exec(id)![1])]).toMatch(/Sprint/);
  });

  it('a TrainingSession keeps the semantics: sprint sets show the cap hint, a duration exercise does not', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/workouts/training-blocks/assign?blockId=SPEED-ACCELERATION-6W-01' });
    await screen.findByTestId('block-assign-scroll');
    press('block-assign-review');
    await screen.findByTestId('block-preview-title');
    press('block-assign-confirm');
    await screen.findByTestId('block-assign-done-title');
    const accel = await db!.getFirstAsync<{ id: string }>("SELECT id FROM planned_workouts WHERE name LIKE '%1.2%' LIMIT 1");
    await startSession(db!, accel!.id, deps);
    const session = await db!.getFirstAsync<{ id: string }>('SELECT id FROM training_sessions LIMIT 1');
    renderRouter(routes, { initialUrl: `/children/${players.Daniel}/training/session/${session!.id}` });
    await screen.findByTestId('session-ex-0-name');
    const hints = screen.queryAllByTestId(/^session-ex-\d+-time-cap-hint$/);
    expect(hints).toHaveLength(2);
    for (const h of hints) expect(stripBidi(String(h.props.children))).toBe('Record your actual time. The value shown is only a recording cap, not a performance goal.');
    expect(text('session-ex-4-planned')).toMatch(/time cap 5 s/);
  });

  it('LEGACY: an old plan and an old session with SPRINT_10M and no stored meaning still read as the historical goal time — never as a cap', async () => {
    await prepare('en');
    const saved = await savePlannedWorkout(
      db!,
      { planId: null, playerId: players.Daniel!, name: 'Old sprints', entries: [{ kind: 'EXERCISE', exerciseId: 'SPRINT_10M', prescription: { sets: 3, target: 5, loadKg: null, restSec: 90 } }] },
      deps,
    );
    if (!saved.ok) throw new Error('seed');
    renderRouter(routes, { initialUrl: `/children/${players.Daniel}/training/plan/${saved.plan.id}` });
    await screen.findByTestId('plan-item-0-name');
    expect(text('plan-item-0-rx')).toMatch(/3 × 5 s/);
    expect(text('plan-item-0-rx')).not.toMatch(/cap/);
    expect(has('plan-item-0-time-cap-hint')).toBe(false);
    await startSession(db!, saved.plan.id, deps);
    const session = await db!.getFirstAsync<{ id: string }>('SELECT id FROM training_sessions LIMIT 1');
    renderRouter(routes, { initialUrl: `/children/${players.Daniel}/training/session/${session!.id}` });
    await screen.findByTestId('session-ex-0-name');
    expect(text('session-ex-0-planned')).not.toMatch(/cap/);
    expect(has('session-ex-0-time-cap-hint')).toBe(false);
  });

  it('Hebrew: a duration reads as a duration; a sprint reads as a cap', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/workouts/professional/ATH-CONDITIONING-INTERVALS-01' });
    await screen.findByTestId('professional-details-name');
    expect(text('professional-item-1-0-dosage')).toMatch(/6 × 45 שנ׳/);
    expect(text('professional-item-1-0-dosage')).not.toMatch(/תקרה|תקרת/);
  });
});
