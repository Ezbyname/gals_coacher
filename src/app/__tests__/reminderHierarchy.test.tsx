import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import { SUGGESTED_TYPE_DEFAULTS } from '@/domain/reminders';
import { stripBidi } from '@/i18n/bidi';
import * as reminderPreference from '@/preferences/reminderPreference';
import { readReminderPreferences, saveReminderPreferences } from '@/preferences/reminderPreference';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/** CAL-REMINDER-RULES-002 — type defaults, the event reminders field and the details summary (real routes, SQLite). */
jest.setTimeout(30_000); // the first render of the real route tree is slow under a parallel run
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 13, 12).getTime();
const ids = createSequentialIdService();
const deps = { ids, clock: { wallNow: () => NOW, monotonicNow: () => 0 } };
let db: ReturnType<typeof openNodeSqlite> | null = null;
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

const text = (id: string) => stripBidi(String(screen.getByTestId(id).props.children));
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const ruleTexts = (prefix: string) =>
  screen.queryAllByTestId(new RegExp(`^${prefix}-rule-\\d+-text$`)).map((n) => stripBidi(String(n.props.children)));
const stored = () => readReminderPreferences([daniel]);

describe('Settings → reminders by activity type', () => {
  it('a type without its own list says it uses the general reminders; the type screen applies the SUGGESTED defaults only on request', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/settings/reminders' });
    await screen.findByTestId('reminders-type-GAME');
    expect(text('reminders-type-GAME-summary')).toBe('Uses the general reminders: 08:00 on the event day · 2 hours before · 30 minutes before');
    await act(async () => press('reminders-type-GAME-edit'));
    await screen.findByTestId('reminder-type-name');
    expect(screen.getByTestId('reminder-type-inherits')).toBeTruthy();
    expect((await stored()).typeRules).toEqual({}); // opening / previewing writes nothing
    await act(async () => press('reminder-type-suggested-apply'));
    await waitFor(async () => expect((await stored()).typeRules).toEqual({ GAME: SUGGESTED_TYPE_DEFAULTS.GAME }));
    expect(ruleTexts('reminder-type')).toHaveLength(3);
  });

  it('a type can have its own list incl. "At the start", an EMPTY list, and go back to the general reminders', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/settings/reminder-type/PERSONAL_TRAINING' });
    await screen.findByTestId('reminder-type-customize');
    expect(screen.queryByTestId('reminder-type-suggested')).toBeNull(); // no suggestion for this type
    await act(async () => press('reminder-type-customize'));
    await waitFor(() => expect(ruleTexts('reminder-type')).toHaveLength(3));
    for (let i = 0; i < 3; i++) await act(async () => press('reminder-type-rule-0-remove'));
    await waitFor(async () => expect((await stored()).typeRules).toEqual({ PERSONAL_TRAINING: [] })); // empty ≠ inherit
    await act(async () => press('reminder-type-add'));
    await act(async () => press('reminder-type-editor-kind-AT_START'));
    expect(screen.queryByTestId('reminder-type-editor-value')).toBeNull(); // no input for "at the start"
    await act(async () => press('reminder-type-editor-save'));
    expect(ruleTexts('reminder-type')).toEqual(['At the start of the event']);
    await waitFor(async () => expect((await stored()).typeRules).toEqual({ PERSONAL_TRAINING: [{ kind: 'AT_START' }] }));
    await act(async () => press('reminder-type-use-general'));
    await waitFor(async () => expect((await stored()).typeRules).toEqual({}));
  });

  it('Hebrew: the type list and the at-start wording', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/settings/reminders' });
    await screen.findByTestId('reminders-type-GAME');
    expect(text('reminders-type-GAME-summary')).toMatch(/^משתמש בתזכורות הכלליות:/);
    await act(async () => press('reminders-add'));
    await act(async () => press('reminders-editor-kind-AT_START'));
    await act(async () => press('reminders-editor-save'));
    expect(ruleTexts('reminders')).toContain('בתחילת האירוע');
  });
});

describe('the event form and details', () => {
  it('a new event can have its own reminders (here: none), saved after the event and keyed by its id', async () => {
    await prepare('en');
    const app = renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/new` });
    await screen.findByTestId('event-save');
    press('event-type-GAME');
    expect(text('event-reminders-summary')).toMatch(/^From the general reminders:/);
    await act(async () => press('event-reminders-customize'));
    await waitFor(() => expect(ruleTexts('event-reminders')).toHaveLength(3));
    await act(async () => press('event-reminders-none'));
    expect(screen.getByTestId('event-reminders-rules-none')).toBeTruthy();
    await act(async () => press('event-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${daniel}/schedule`));
    const row = await db!.getFirstAsync<{ id: string }>('SELECT id FROM calendar_events');
    expect((await stored()).eventRules).toEqual({ [row!.id]: [] });
  });

  it('an event left on the defaults writes NO override', async () => {
    await prepare('en');
    const app = renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/new` });
    await screen.findByTestId('event-save');
    press('event-type-GAME');
    await act(async () => press('event-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${daniel}/schedule`));
    expect((await stored()).eventRules).toEqual({});
  });

  it('if the reminders cannot be saved the event IS saved and the message says so honestly, with a Done button', async () => {
    await prepare('en');
    jest.spyOn(reminderPreference, 'saveEventReminders').mockRejectedValue(new Error('disk full'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const app = renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/new` });
    await screen.findByTestId('event-save');
    press('event-type-GAME');
    await act(async () => press('event-reminders-customize'));
    await act(async () => press('event-reminders-none'));
    await act(async () => press('event-save'));
    await screen.findByTestId('event-reminders-save-error');
    expect(text('event-reminders-save-error')).toMatch(/^The event was saved, but its reminders were not\./);
    expect((await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events'))!.n).toBe(1);
    expect(app.getPathname()).toBe(`/children/${daniel}/schedule/new`); // not silently left
    await act(async () => press('event-reminders-done'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${daniel}/schedule`));
  });

  it('details: the effective reminders and where they come from (event / type / general), read-only; off is stated', async () => {
    await prepare('en');
    const made = await createCalendarEvent(db!, daniel, { type: 'GAME', startAt: new Date(2026, 9, 20, 19).getTime(), endAt: null }, deps);
    if (!made.ok) throw new Error('seed');
    const id = made.event.id;
    const url = `/children/${daniel}/schedule/${id}`;
    const view = renderRouter(routes, { initialUrl: url });
    await screen.findByTestId('event-reminders-effective');
    expect(text('event-reminders-effective')).toMatch(/^From the general reminders:/);
    expect(screen.getByTestId('event-reminders-off')).toBeTruthy(); // the master switch is OFF by default
    view.unmount();

    await saveReminderPreferences({ ...(await stored()), enabled: true, typeRules: { GAME: [{ kind: 'BEFORE_START', minutes: 30 }] } });
    const second = renderRouter(routes, { initialUrl: url });
    await waitFor(() => expect(text('event-reminders-effective')).toBe('From the activity type: 30 minutes before'));
    second.unmount();

    await saveReminderPreferences({ ...(await stored()), eventRules: { [id]: [] } });
    renderRouter(routes, { initialUrl: url });
    await waitFor(() => expect(text('event-reminders-effective')).toBe('This event has its own reminders: No reminders'));
    expect(screen.queryByTestId('event-reminders-off')).toBeNull();
  });
});
