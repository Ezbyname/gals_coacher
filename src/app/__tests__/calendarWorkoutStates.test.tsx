import { resolve } from 'node:path';

import { renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { scheduleWorkout } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { abandonSession, finishSession, recordSet, startSession } from '@/data/local/training/trainingRepository';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** CAL-TRAIN-001 slice B: the derived workout state in the Agenda and the Full Calendar, real routes + SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
const at = (h: number) => new Date(2026, 9, 20, h, 0).getTime();
let db: ReturnType<typeof openNodeSqlite> | null = null;
const ids = createSequentialIdService();
const deps = { ids, clock: systemClock };
let daniel = '';
const eventIds: Record<string, string> = {};

async function seedWorkout(key: string, startHour: number, sets: number, finish: 'NONE' | 'COMPLETED' | 'PARTIAL' | 'ABANDONED' | 'RUNNING') {
  const early = { ids, clock: { wallNow: () => at(7), monotonicNow: () => 0 } }; // scheduling is now / future only
  const plan = await savePlannedWorkout(db!, { planId: null, playerId: daniel, name: key, entries: [{ kind: 'EXERCISE', exerciseId: 'PLANK', prescription: { sets, target: 30, loadKg: null, restSec: 60 } }] }, deps);
  if (!plan.ok) throw new Error('seed');
  const ev = await scheduleWorkout(db!, { playerId: daniel, planId: plan.plan.id, startAt: at(startHour) }, early);
  if (!ev.ok) throw new Error('seed');
  eventIds[key] = ev.event.id;
  if (finish === 'NONE') return;
  const session = await startSession(db!, plan.plan.id, deps);
  if (finish === 'RUNNING') return;
  if (finish === 'ABANDONED') {
    await abandonSession(db!, session.id, deps);
    return;
  }
  await recordSet(db!, session.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
  await finishSession(db!, session.id, deps);
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
  const p = await createPlayer(opened, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  daniel = p.profile.player.id;
  await seedWorkout('overdue', 8, 1, 'NONE');
  await seedWorkout('done', 9, 1, 'COMPLETED');
  await seedWorkout('partial', 10, 2, 'PARTIAL');
  await seedWorkout('stopped', 11, 1, 'ABANDONED');
  await seedWorkout('upcoming', 18, 1, 'NONE');
  await seedWorkout('running', 19, 1, 'RUNNING');
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const stateText = (prefix: string, key: string) => {
  const el = screen.queryByTestId(`${prefix}-${eventIds[key]}-workout-state`);
  return el === null ? null : stripBidi(String(el.props.children));
};
const label = (prefix: string, key: string) => screen.getByTestId(`${prefix}-${eventIds[key]}`).props.accessibilityLabel as string;

async function agenda() {
  renderRouter(routes, { initialUrl: `/children/${daniel}/schedule` });
  await screen.findByTestId(`schedule-event-${eventIds.upcoming}`);
}

describe('Agenda: the derived workout state (English)', () => {
  it('each state has its own word and symbol; UPCOMING keeps the normal card', async () => {
    await prepare('en');
    await agenda();
    const p = 'schedule-event';
    expect(stateText(p, 'overdue')).toBe('⚠ Missed');
    expect(stateText(p, 'done')).toBe('✓ Completed');
    expect(stateText(p, 'partial')).toBe('◐ Partly done');
    expect(stateText(p, 'stopped')).toBe('■ Stopped');
    expect(stateText(p, 'running')).toBe('▶ Workout in progress');
    expect(stateText(p, 'upcoming')).toBeNull(); // no warning, no badge
    expect(label(p, 'overdue')).toMatch(/the scheduled time has passed and the workout was not done$/);
    expect(label(p, 'done')).toMatch(/, completed$/);
    expect(label(p, 'upcoming')).not.toMatch(/completed|partly|stopped|not done|in progress/);
  });

  it('showing the state writes nothing: no session is created for the overdue workout', async () => {
    await prepare('en');
    const count = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM training_sessions'))!.n;
    const before = await count();
    const events = JSON.stringify(await db!.getAllAsync('SELECT * FROM calendar_events'));
    await agenda();
    expect(await count()).toBe(before);
    expect(JSON.stringify(await db!.getAllAsync('SELECT * FROM calendar_events'))).toBe(events);
  });

  it('completing the overdue workout turns it into Completed on the next view', async () => {
    await prepare('en');
    const plan = (await db!.getFirstAsync<{ planned_workout_id: string }>('SELECT planned_workout_id FROM calendar_events WHERE id = ?', [eventIds.overdue!]))!;
    const running = (await db!.getFirstAsync<{ id: string }>("SELECT id FROM training_sessions WHERE status = 'IN_PROGRESS'"))!;
    await abandonSession(db!, running.id, deps); // one session in progress per Player
    const s = await startSession(db!, plan.planned_workout_id, deps);
    await recordSet(db!, s.exercises[0]!.sets[0]!.id, { DURATION_S: 30 }, deps);
    await finishSession(db!, s.id, deps);
    await agenda();
    expect(stateText('schedule-event', 'overdue')).toBe('✓ Completed');
  });
});

describe('Agenda: Hebrew', () => {
  it('uses the approved Hebrew words and the explicit accessibility sentence', async () => {
    await prepare('he');
    await agenda();
    const p = 'schedule-event';
    expect(stateText(p, 'overdue')).toBe('⚠ לא בוצע');
    expect(stateText(p, 'done')).toBe('✓ הושלם');
    expect(stateText(p, 'partial')).toBe('◐ בוצע חלקית');
    expect(stateText(p, 'stopped')).toBe('■ הופסק');
    expect(stateText(p, 'running')).toBe('▶ אימון בתהליך');
    expect(label(p, 'overdue')).toMatch(/עבר המועד ולא בוצע$/);
  });
});

describe('Full Calendar', () => {
  it('shows the same states on the selected day (English)', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/calendar' });
    await waitFor(() => expect(screen.getByTestId('calendar-day-list')).toBeTruthy());
    const day = within(screen.getByTestId('calendar-day-list'));
    const text = (key: string) => {
      const el = day.queryByTestId(`calendar-event-${eventIds[key]}-workout-state`);
      return el === null ? null : stripBidi(String(el.props.children));
    };
    expect(text('overdue')).toBe('⚠ Missed');
    expect(text('done')).toBe('✓ Completed');
    expect(text('partial')).toBe('◐ Partly done');
    expect(text('stopped')).toBe('■ Stopped');
    expect(text('running')).toBe('▶ Workout in progress');
    expect(text('upcoming')).toBeNull();
  });
});
