import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { archivePlayer, createPlayer, getPlayer, type PlayerProfileInput } from '@/data/local/players/playerRepository';
import { abandonSession, findInProgressSessionId, planAndStart } from '@/data/local/training/trainingRepository';
import { createBlock, createTemplate } from '@/data/local/training/workoutRepository';
import type { Uuid } from '@/domain/ids';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** PLAYER-ARCHIVE-001 — Archive Player through the real route tree and real SQLite. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 12, 12).getTime();
const clock = { wallNow: () => NOW - 60_000, monotonicNow: () => 0 };
const ids = createSequentialIdService();
const DANIEL: PlayerProfileInput = { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: { primaryPosition: 'SG' } };
const MAYA: PlayerProfileInput = { player: { name: 'Maya', dateOfBirth: { year: 2014, month: 6, day: 1 } }, basketball: null };

let db: ReturnType<typeof openNodeSqlite> | null = null;
let daniel: Uuid;
let maya: Uuid;
let danielEvent: Uuid;
let mayaEvent: Uuid;

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const a = await createPlayer(opened, DANIEL, { ids, clock });
  const b = await createPlayer(opened, MAYA, { ids, clock });
  if (!a.ok || !b.ok) throw new Error('seed failed');
  daniel = a.profile.player.id;
  maya = b.profile.player.id;
  const start = new Date(2026, 9, 14, 17).getTime();
  const e1 = await createCalendarEvent(opened, daniel, { type: 'GYM', startAt: start, endAt: start + 3_600_000 }, { ids, clock });
  const e2 = await createCalendarEvent(opened, maya, { type: 'GYM', startAt: start + 7_200_000, endAt: null }, { ids, clock });
  if (!e1.ok || !e2.ok) throw new Error('seed failed');
  danielEvent = e1.event.id;
  mayaEvent = e2.event.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
/** Alert.alert spy: records each dialog and answers Cancel (safe) or Archive. */
function answerAlerts(answer: 'cancel' | 'archive') {
  const dialogs: { title: string; body?: string; buttons: AlertButton[] }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons = []) => {
    dialogs.push({ title: stripBidi(title), body: body === undefined ? undefined : stripBidi(body), buttons });
    buttons.find((b) => (answer === 'cancel' ? b.style === 'cancel' : b.style === 'destructive'))?.onPress?.();
  });
  return dialogs;
}
const historyRows = async () => ({
  events: await db!.getAllAsync('SELECT * FROM calendar_events ORDER BY id'),
  sports: await db!.getAllAsync('SELECT * FROM player_sports ORDER BY player_id'),
  profiles: await db!.getAllAsync('SELECT * FROM basketball_player_profiles'),
});
async function openEdit(language: 'he' | 'en') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: '/children' });
  fireEvent.press(await screen.findByTestId(`player-row-${daniel}`));
  await waitFor(() => expect(app.getPathname()).toBe(`/children/${daniel}`));
  await screen.findByDisplayValue('Daniel');
  return app;
}

describe('Archive Player (PLAYER-ARCHIVE-001)', () => {
  it('Hebrew: asks first, says history is kept (no counts, no "delete"); Cancel changes nothing', async () => {
    await openEdit('he');
    const before = await historyRows();
    const dialogs = answerAlerts('cancel');
    press('player-archive');
    await waitFor(() => expect(dialogs).toHaveLength(1));
    expect(dialogs[0]).toEqual({
      title: 'להעביר את Daniel לארכיון?',
      body: 'השחקן יוסר מהרשימות הפעילות, אך היסטוריית האימונים והנתונים שלו תישמר. לא יהיה אפשר להוסיף לו אימונים, אירועים או ייבוא חדשים. שום דבר לא נמחק.',
      buttons: [
        expect.objectContaining({ text: 'ביטול', style: 'cancel' }),
        expect.objectContaining({ text: 'העברה לארכיון', style: 'destructive' }),
      ],
    });
    expect(dialogs[0]!.body).not.toMatch(/\d/); // no row counts presented as if they were going away
    expect((await getPlayer(db!, daniel))!.player.archivedAt).toBeNull();
    expect(await historyRows()).toEqual(before);
    expect(screen.getByDisplayValue('Daniel')).toBeTruthy(); // still on Edit
  });

  it('English: Archive → back to the roster without Daniel (even with unsaved edits); every row kept; Maya unchanged', async () => {
    const app = await openEdit('en');
    const before = await historyRows();
    const mayaBefore = await getPlayer(db!, maya);
    fireEvent.changeText(screen.getByDisplayValue('Daniel'), 'Daniel B'); // unsaved: no "discard?" after archiving
    const dialogs = answerAlerts('archive');
    press('player-archive');
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(dialogs.map((d) => d.title)).toEqual(['Archive Daniel?']);
    expect(dialogs[0]!.body).toBe(
      'The player will be removed from the active player lists, and their training history and data will be kept. They cannot get new trainings, events or imports. Nothing is deleted.',
    );
    await screen.findByTestId(`player-row-${maya}`);
    expect(screen.queryByTestId(`player-row-${daniel}`)).toBeNull();
    const archived = (await getPlayer(db!, daniel))!.player;
    expect(archived.archivedAt).toBe(NOW);
    expect(archived.name).toBe('Daniel'); // the unsaved edit was not saved
    expect(await historyRows()).toEqual(before);
    expect(await getPlayer(db!, maya)).toEqual(mayaBefore);
  });

  it('an archived Player: Edit shows the archive notice; Import, a new event and training are refused', async () => {
    await prepare('en');
    await archivePlayer(db!, daniel, { clock });
    const edit = renderRouter(routes, { initialUrl: `/children/${daniel}` });
    await screen.findByTestId('player-archived');
    expect(text('player-archived')).toBe('This player is archived. Their training history and data are kept.');
    expect(screen.queryByTestId('player-archive')).toBeNull();
    expect(screen.queryByDisplayValue('Daniel')).toBeNull();
    edit.unmount();

    for (const url of [`/children/${daniel}/schedule/import`, `/children/${daniel}/training/new`]) {
      const opened = renderRouter(routes, { initialUrl: url });
      await screen.findByTestId('active-player-missing');
      expect(screen.getByText('This player is archived. Their training history and data are kept.')).toBeTruthy();
      expect(screen.queryByTestId('import-analyze')).toBeNull();
      opened.unmount();
    }
    renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/new` });
    await screen.findByText('This player is archived. Their training history and data are kept.');
    expect(screen.queryByTestId('event-save')).toBeNull();
    expect((await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events'))!.n).toBe(2);
  });

  /** An in-progress session for `playerId` (plan + session + planned sets), through the repositories. */
  async function startedSession(playerId: Uuid) {
    const block = await createBlock(db!, { name: 'Strength', items: [{ exerciseId: 'BARBELL_BENCH_PRESS', prescription: { sets: 2, target: 10, loadKg: 50, restSec: 60 } }] }, { ids, clock });
    if (!block.ok) throw new Error('block');
    const template = await createTemplate(db!, { name: 'Gym', blockIds: [block.block.id] }, { ids, clock });
    if (!template.ok) throw new Error('template');
    return planAndStart(db!, { playerId, templateId: template.template.id }, { ids, clock });
  }
  const sessionRows = async () => ({
    sessions: await db!.getAllAsync('SELECT * FROM training_sessions ORDER BY id'),
    sets: await db!.getAllAsync('SELECT * FROM session_sets ORDER BY id'),
    measurements: await db!.getAllAsync('SELECT * FROM set_measurements ORDER BY id'),
  });

  it("an archived Player's TrainingSession stays READABLE, read-only: no record / skip / add / finish / stop (AR-05)", async () => {
    await prepare('en');
    const session = await startedSession(daniel);
    // QB safety gate S1: archiving during a workout is refused, so this LEGACY state (archived while the session was
    // still IN_PROGRESS, from before the rule) is created out of band — the screen must keep it read-only.
    await db!.runAsync('UPDATE players SET archived_at = ? WHERE id = ?', [NOW - 60_000, daniel]);
    const before = await sessionRows();
    renderRouter(routes, { initialUrl: `/children/${daniel}/training/session/${session.id}` });
    await screen.findByTestId('session-name');
    expect(text('session-name')).toBe(session.name);
    expect(text('active-player-target')).toBe('Training for Daniel');
    expect(screen.getByTestId('session-read-only')).toBeTruthy();
    expect(text('session-archived')).toBe('This player is archived. Their training history and data are kept.');
    for (const action of ['session-finish', 'session-abandon']) expect(screen.queryByTestId(action)).toBeNull();
    expect(screen.queryAllByTestId(/-(save|skip|add-set)$/)).toHaveLength(0);
    expect(screen.queryByTestId('active-player-missing')).toBeNull();
    expect(await sessionRows()).toEqual(before); // reading writes nothing
  });

  it('S1 (UI): Archive with a workout in progress explains why, offers the way back, and changes nothing; once stopped, archiving works', async () => {
    const app = await openEdit('en');
    const session = await startedSession(daniel);
    const before = await sessionRows();
    const dialogs = answerAlerts('cancel');
    press('player-archive');
    await waitFor(() => expect(dialogs).toHaveLength(1));
    expect(dialogs[0]!.title).toBe('Cannot archive this player');
    expect(dialogs[0]!.body).toBe('Cannot archive this player while a workout is in progress. Finish or stop the workout first.');
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Back to the workout', undefined],
    ]);
    expect((await getPlayer(db!, daniel))!.player.archivedAt).toBeNull();
    expect(await findInProgressSessionId(db!, daniel)).toBe(session.id); // never turned into ABANDONED
    expect(await sessionRows()).toEqual(before);
    expect(screen.getByDisplayValue('Daniel')).toBeTruthy(); // still on Edit
    // "Back to the workout" opens it
    dialogs[0]!.buttons[1]!.onPress!();
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${daniel}/training/session/${session.id}`));
    // the user stops the workout themselves -> archiving is allowed again
    await abandonSession(db!, session.id, { clock });
    expect(await archivePlayer(db!, daniel, { clock })).toBeGreaterThan(0);
  });

  it("the history scope does not weaken anything else: an ACTIVE Player's session is live; archived create paths still refuse", async () => {
    await prepare('en');
    const live = await startedSession(maya);
    const app = renderRouter(routes, { initialUrl: `/children/${maya}/training/session/${live.id}` });
    await screen.findByTestId('session-finish');
    expect(screen.queryByTestId('session-archived')).toBeNull();
    app.unmount();
    await archivePlayer(db!, daniel, { clock });
    renderRouter(routes, { initialUrl: `/children/${daniel}/training/new` });
    await screen.findByTestId('active-player-missing');
  });

  it("the calendar shows the active roster's events only; the archived Player's events stay stored", async () => {
    await prepare('en');
    await archivePlayer(db!, daniel, { clock });
    renderRouter(routes, { initialUrl: '/calendar' });
    await screen.findByTestId('calendar-day-list');
    press('calendar-day-2026-10-14'); // both events are on Wednesday 14/10
    await waitFor(() => expect(screen.queryByTestId(`calendar-event-${mayaEvent}`)).not.toBeNull());
    expect(screen.queryByTestId(`calendar-event-${danielEvent}`)).toBeNull();
    expect(await db!.getFirstAsync('SELECT id FROM calendar_events WHERE id = ?', [danielEvent])).toEqual({ id: danielEvent });
  });
});
