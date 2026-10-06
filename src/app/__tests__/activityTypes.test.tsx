import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import * as types from '@/data/local/activityTypes/activityTypeRepository';
import * as calendar from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import { BUILTIN_ACTIVITY_TYPES } from '@/domain/activityType';
import type { CalendarEventInput } from '@/domain/calendarEvent';
import type { Uuid } from '@/domain/ids';
import { customTypeColor } from '@/features/calendar/calendarColors';
import { screenStack } from '@/features/navigation/mainDestinations';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import { StyleSheet } from 'react-native';
import { touch } from '@/ui/theme';

/** ACTIVITY-001 through the real route tree, real SQLite, Hebrew and English. */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const HOUR = 3_600_000;
const at = (day: number, hour = 0) => new Date(2026, 9, day, hour).getTime();
const NOW = at(5, 18);

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid;
const ids = createSequentialIdService();
const clock = { wallNow: () => NOW - HOUR, monotonicNow: () => 0 };

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const result = await players.createPlayer(
    opened,
    {
      player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
      basketball: { primaryPosition: 'PG' },
    },
    { ids, clock },
  );
  if (!result.ok) throw new Error('seed failed');
  gal = result.profile.player.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const custom = async (name: string, active = true) => {
  const result = await types.createCustomActivityType(db!, name, { ids, clock });
  if (!result.ok) throw new Error(result.error);
  return active ? result.type : types.setActivityTypeActive(db!, result.type.id, false, { clock });
};
const deactivate = (id: string) => types.setActivityTypeActive(db!, id, false, { clock });
async function seedEvent(input: Partial<CalendarEventInput>) {
  const result = await calendar.createCalendarEvent(
    db!,
    gal,
    { type: 'GAME', startAt: at(6, 17), ...input },
    { ids, clock },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.event;
}
const catalog = () => db!.getAllAsync('SELECT * FROM activity_types ORDER BY rowid');
const eventRows = () => db!.getAllAsync('SELECT * FROM calendar_events ORDER BY id');

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const plain = (testID: string) => stripBidi(text(testID));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const label = (testID: string) => stripBidi(screen.getByTestId(testID).props.accessibilityLabel);
const sectionIds = (testID: string) =>
  within(screen.getByTestId(testID))
    .queryAllByTestId(/^activity-type-[^-]+(-[^-]+){0,4}$/)
    .map((n) => n.props.testID.replace('activity-type-', ''))
    .filter((id) => !/-(name|status|custom|toggle)$/.test(id));
const chips = () =>
  screen
    .queryAllByTestId(/^event-type-[A-Z_0-9a-f-]+$/)
    .map((n) => n.props.testID.replace('event-type-', ''))
    .filter((id) => id !== 'none' && !id.endsWith('-label'));
/** Records each dialog; answers with the given choice. */
function answer(choice: 'cancel' | 'confirm') {
  const dialogs: { title: string; body?: string; buttons: AlertButton[] }[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons = []) => {
    dialogs.push({ title, body, buttons });
    buttons.find((b) => (choice === 'cancel' ? b.style === 'cancel' : b.style !== 'cancel'))?.onPress?.();
  });
  return dialogs;
}

describe('Settings → Activity types', () => {
  it('Hebrew: reached from Settings (Settings tab stays selected); Active and Inactive with the state in words', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByTestId('settings-activity-types'));
    await screen.findByTestId('activity-types-active');
    expect(app.getPathname()).toBe('/settings/activity-types');
    expect(screenStack(app.getRouterState()).routes).toEqual(['settings', 'settings/activity-types/index']);
    expect(screen.getByTestId('main-nav-settings').props.accessibilityState.selected).toBe(true);
    expect(sectionIds('activity-types-active')).toEqual([...BUILTIN_ACTIVITY_TYPES]);
    expect(sectionIds('activity-types-inactive')).toEqual([]);
    expect(text('activity-types-none-inactive')).toBe('אין סוגים לא פעילים.');
    expect(text('activity-type-GAME-name')).toBe('משחק');
    expect(text('activity-type-GAME-status')).toBe('פעיל');
    expect(label('activity-type-GAME')).toBe('משחק, פעיל');
    const toggle = screen.getByTestId('activity-type-GAME-toggle');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(label('activity-type-GAME-toggle')).toBe('להפוך ללא פעיל: משחק');
    expect(StyleSheet.flatten(toggle.props.style).minHeight).toBeGreaterThanOrEqual(touch.buttonMinHeight);
    expect(screen.queryByText(/מחיקה|מחק/)).toBeNull(); // never "delete"
  });

  it('English: Make inactive asks (Keep active is the safe default); confirming moves it to Inactive; no event changes', async () => {
    await prepare('en');
    await seedEvent({ type: 'GAME', title: 'Cup' });
    const rows = await eventRows();
    renderRouter(routes, { initialUrl: '/settings/activity-types' });
    await screen.findByTestId('activity-types-active');
    const kept = answer('cancel');
    press('activity-type-GAME-toggle');
    expect(kept).toHaveLength(1);
    expect(stripBidi(kept[0]!.title)).toBe('Make "Game" inactive?');
    expect(kept[0]!.body).toBe(
      'It will not be offered for new events. Existing events do not change, and you can make it active again at any time.',
    );
    expect(kept[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Keep active', 'cancel'],
      ['Make inactive', undefined],
    ]);
    await act(async () => {});
    expect((await types.getActivityType(db!, 'GAME'))!.active).toBe(true);

    jest.restoreAllMocks();
    jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
    answer('confirm');
    press('activity-type-GAME-toggle');
    await waitFor(() => expect(sectionIds('activity-types-inactive')).toEqual(['GAME']));
    expect(text('activity-type-GAME-status')).toBe('Inactive');
    expect(label('activity-type-GAME')).toBe('Game, Inactive');
    expect(within(screen.getByTestId('activity-type-GAME-toggle')).getByText('Make active')).toBeTruthy();
    expect(await eventRows()).toEqual(rows);

    // Making it active again does not ask and reuses the same type.
    const alert = jest.spyOn(Alert, 'alert');
    const asked = alert.mock.calls.length; // the confirm above
    press('activity-type-GAME-toggle');
    await waitFor(() => expect(sectionIds('activity-types-inactive')).toEqual([]));
    expect(alert.mock.calls.length).toBe(asked);
    expect(await catalog()).toHaveLength(6);
  });

  it('a failed change keeps the state, with a safe message', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/settings/activity-types' });
    await screen.findByTestId('activity-types-active');
    jest.spyOn(types, 'setActivityTypeActive').mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    answer('confirm');
    press('activity-type-GYM-toggle');
    expect(await screen.findByTestId('activity-types-change-error')).toBeTruthy();
    expect(text('activity-types-change-error')).toBe('The change was not saved. You can try again.');
    expect(screen.queryByText(/SQLITE/)).toBeNull();
    expect(sectionIds('activity-types-inactive')).toEqual([]);
  });

  it('Hebrew: add a custom type — shown exactly as entered, active, marked as added; persists on reopen', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: '/settings/activity-types' });
    fireEvent.press(await screen.findByTestId('activity-types-add'));
    await screen.findByTestId('activity-type-name');
    expect(app.getPathname()).toBe('/settings/activity-types/new');
    fireEvent.changeText(screen.getByTestId('activity-type-name'), '  שחייה  ');
    press('activity-type-save');
    await waitFor(() => expect(app.getPathname()).toBe('/settings/activity-types'));
    const [saved] = (await types.listActivityTypes(db!)).filter((t) => t.builtin === null);
    expect(saved).toMatchObject({ name: 'שחייה', active: true });
    await waitFor(() =>
      expect(sectionIds('activity-types-active')).toEqual([...BUILTIN_ACTIVITY_TYPES, saved!.id]),
    );
    expect(text(`activity-type-${saved!.id}-name`)).toBe('שחייה');
    expect(text(`activity-type-${saved!.id}-custom`)).toBe('סוג שהוספת');
    app.unmount();
    renderRouter(routes, { initialUrl: '/settings/activity-types' });
    expect(await screen.findByTestId(`activity-type-${saved!.id}`)).toBeTruthy();
  });

  it('the add form: blank and duplicate names are refused with messages; nothing written', async () => {
    await prepare('en');
    await custom('Swim', false);
    renderRouter(routes, { initialUrl: '/settings/activity-types/new' });
    await screen.findByTestId('activity-type-name');
    const before = await catalog();
    press('activity-type-save');
    expect(await screen.findByText('Please enter a name.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('activity-type-name'), ' swim ');
    press('activity-type-save');
    expect(
      await screen.findByText('A type with this name already exists. You can make it active in the list.'),
    ).toBeTruthy();
    expect(await catalog()).toEqual(before);
  });

  it('unsaved changes: a typed name asks before leaving; untouched leaves freely; Save and Cancel do not ask', async () => {
    await prepare('en');
    const dialogs: string[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((title) => void dialogs.push(title));
    const app = renderRouter(routes, { initialUrl: '/settings/activity-types' });
    fireEvent.press(await screen.findByTestId('activity-types-add'));
    await screen.findByTestId('activity-type-name');
    fireEvent.changeText(screen.getByTestId('activity-type-name'), 'Yoga');
    press('main-nav-home');
    await waitFor(() => expect(dialogs).toEqual(['Leave without saving?']));
    expect(app.getPathname()).toBe('/settings/activity-types/new');
    // Cancel discards on purpose (accepted behaviour): no dialog, nothing written.
    press('activity-type-cancel');
    await waitFor(() => expect(app.getPathname()).toBe('/settings/activity-types'));
    expect(dialogs).toHaveLength(1);
    expect(await catalog()).toHaveLength(6);
    // Untouched (or only spaces): leaves freely.
    fireEvent.press(await screen.findByTestId('activity-types-add'));
    fireEvent.changeText(await screen.findByTestId('activity-type-name'), '   ');
    press('main-nav-settings');
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    expect(dialogs).toHaveLength(1);
    // Save releases the guard.
    fireEvent.press(await screen.findByTestId('settings-activity-types'));
    fireEvent.press(await screen.findByTestId('activity-types-add'));
    fireEvent.changeText(await screen.findByTestId('activity-type-name'), 'Yoga');
    press('activity-type-save');
    await waitFor(() => expect(app.getPathname()).toBe('/settings/activity-types'));
    expect(dialogs).toHaveLength(1);
  });
});

describe('new events offer ACTIVE types only', () => {
  it('inactive built-in and custom types are not offered; an active custom type is, and saves its id', async () => {
    await prepare('en');
    await deactivate('GAME');
    const swim = await custom('Swim');
    const yoga = await custom('Yoga', false);
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/new` });
    await screen.findByTestId('event-save');
    expect(chips()).toEqual(['TEAM_TRAINING', 'PERSONAL_TRAINING', 'GYM', 'RECOVERY', 'OTHER', swim.id]);
    expect(chips()).not.toContain(yoga.id);
    expect(text(`event-type-${swim.id}-label`)).toBe('Swim');
    press(`event-type-${swim.id}`);
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(await eventRows()).toEqual([expect.objectContaining({ type: swim.id, title: null })]);
  });

  it('zero active types: a clear message, nothing chosen or invented, Save writes nothing', async () => {
    await prepare('he');
    for (const id of BUILTIN_ACTIVITY_TYPES) await deactivate(id);
    const before = await catalog();
    renderRouter(routes, { initialUrl: `/children/${gal}/schedule/new` });
    await screen.findByTestId('event-save');
    expect(chips()).toEqual([]);
    expect(text('event-type-none')).toBe('אין סוגי פעילות פעילים. אפשר להפעיל סוג בהגדרות ← סוגי פעילות.');
    press('event-save');
    expect(await screen.findByText('יש לבחור סוג אירוע.')).toBeTruthy();
    expect(await eventRows()).toEqual([]);
    expect(await catalog()).toEqual(before); // nothing reactivated
  });
});

describe('editing history with an inactive type', () => {
  it('an inactive built-in stays the current value (marked inactive); an unrelated edit saves it; not reactivated', async () => {
    await prepare('en');
    const event = await seedEvent({ type: 'GAME', title: 'Cup' });
    await deactivate('GAME');
    await deactivate('GYM');
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/${event.id}/edit` });
    await screen.findByTestId('event-save');
    expect(chips()).toEqual(['TEAM_TRAINING', 'PERSONAL_TRAINING', 'GAME', 'RECOVERY', 'OTHER']); // no GYM
    expect(screen.getByTestId('event-type-GAME').props.accessibilityState.selected).toBe(true);
    expect(plain('event-type-GAME-label')).toBe('Game (inactive)');
    fireEvent.changeText(screen.getByTestId('event-notes'), 'Hall 2');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    expect(await eventRows()).toEqual([expect.objectContaining({ type: 'GAME', notes: 'Hall 2' })]);
    expect((await types.getActivityType(db!, 'GAME'))!.active).toBe(false);
  });

  it('an inactive custom type stays editable; changing it offers active replacements and saves one', async () => {
    await prepare('en');
    const swim = await custom('Swim');
    const event = await seedEvent({ type: swim.id });
    await deactivate(swim.id);
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/${event.id}/edit` });
    await screen.findByTestId('event-save');
    expect(screen.getByTestId(`event-type-${swim.id}`).props.accessibilityState.selected).toBe(true);
    expect(plain(`event-type-${swim.id}-label`)).toBe('Swim (inactive)');
    press('event-type-RECOVERY');
    press('event-save');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${event.id}`));
    expect(await eventRows()).toEqual([expect.objectContaining({ type: 'RECOVERY' })]);
    expect((await types.getActivityType(db!, swim.id))!.active).toBe(false);
  });
});

describe('history stays visible: Schedule, Details, Full Calendar (with completion)', () => {
  it('an inactive custom type and an inactive built-in show everywhere; completion kept', async () => {
    await prepare('en');
    const swim = await custom('Swim');
    const laps = await seedEvent({ type: swim.id, startAt: at(6, 9) });
    const game = await seedEvent({ type: 'GAME', sport: 'BASKETBALL', startAt: at(6, 17) });
    await calendar.markCalendarEventCompleted(db!, gal, laps.id, { clock });
    await deactivate(swim.id);
    await deactivate('GAME');

    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule` });
    await screen.findByTestId(`schedule-event-${laps.id}`);
    expect(text(`schedule-event-${laps.id}-heading`)).toBe('Swim');
    expect(text(`schedule-event-${game.id}-heading`)).toBe('Game');
    expect(text(`schedule-event-${laps.id}-completed`)).toBe('✓ Completed');
    app.unmount();

    renderRouter(routes, { initialUrl: `/children/${gal}/schedule/${laps.id}` });
    expect(await screen.findByTestId('event-details-type')).toBeTruthy();
    expect(text('event-details-type')).toBe('Swim');
    expect(text('event-completion-status')).toBe('✓ Completed');
  });

  it('Full Calendar: inactive and custom types are filterable; colours by id; text always present', async () => {
    await prepare('en');
    const swim = await custom('Swim');
    const yoga = await custom('Yoga');
    const laps = await seedEvent({ type: swim.id, startAt: at(6, 9) });
    const stretch = await seedEvent({ type: yoga.id, startAt: at(6, 10) });
    const game = await seedEvent({ type: 'GAME', startAt: at(6, 17) });
    await deactivate(swim.id);
    await deactivate('GAME');
    renderRouter(routes, { initialUrl: '/calendar' });
    await screen.findByTestId('calendar-day-list');
    fireEvent.press(screen.getByTestId('calendar-day-2026-10-06'));
    await waitFor(() => expect(screen.getByTestId(`calendar-event-${laps.id}`)).toBeTruthy());

    // One player in the family: colours show the activity type.
    expect(text('calendar-legend-title')).toBe('Colors show the activity type');
    const marker = StyleSheet.flatten(screen.getByTestId(`calendar-event-${laps.id}-marker`).props.style);
    expect(marker.backgroundColor).toBe(customTypeColor(swim.id));
    expect(within(screen.getByTestId(`calendar-event-${laps.id}-marker`)).getByText('S')).toBeTruthy();
    expect(text(`calendar-event-${laps.id}-heading`)).toBe('Swim');
    expect(label(`calendar-event-${laps.id}`)).toBe('Gal, Swim, 6 Oct 2026 · 09:00');
    // The legend names the inactive types still on the shown events.
    const legendText = within(screen.getByTestId(`calendar-legend-${swim.id}`)).getByText(/Swim/);
    expect(stripBidi(String(legendText.props.children))).toBe('Swim (inactive)');

    // Filters list every type, inactive ones marked; "All" is everything.
    fireEvent.press(screen.getByTestId('calendar-filters-toggle'));
    expect(plain(`calendar-filter-type-${swim.id}-label`)).toBe('Swim (inactive)');
    expect(text(`calendar-filter-type-${yoga.id}-label`)).toBe('Yoga');
    expect(plain('calendar-filter-type-GAME-label')).toBe('Game (inactive)');
    const listed = () =>
      within(screen.getByTestId('calendar-day-list'))
        .queryAllByTestId(/^calendar-event-[0-9a-f-]{36}$/)
        .map((n) => n.props.testID.replace('calendar-event-', ''));
    expect(listed()).toEqual([laps.id, stretch.id, game.id]);
    press(`calendar-filter-type-${swim.id}`);
    await waitFor(() => expect(listed()).toEqual([laps.id]));
    press('calendar-filter-type-GAME');
    await waitFor(() => expect(listed()).toEqual([laps.id, game.id]));
    expect(plain('calendar-filters-summary')).toBe('Showing only: Swim, Game');
    press('calendar-filters-clear');
    await waitFor(() => expect(listed()).toEqual([laps.id, stretch.id, game.id]));
  });
});
