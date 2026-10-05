import { resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Alert, Platform, type AlertButton } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import type { Uuid } from '@/domain/ids';
import { isFormDirty } from '@/features/navigation/formDirty';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 6, 12).getTime();
const START = new Date(2026, 9, 10, 17).getTime();
const ids = createSequentialIdService();
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
const CATEGORIES = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid;
let eventId: Uuid;

async function prepare(language: 'he' | 'en' = 'he') {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const created = await players.createPlayer(
    opened,
    {
      player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
      basketball: { primaryPosition: 'PG' },
    },
    { ids, clock },
  );
  if (!created.ok) throw new Error('seed failed');
  gal = created.profile.player.id;
  const event = await createCalendarEvent(
    opened,
    gal,
    { type: 'GAME', startAt: START, title: 'Cup' },
    { ids, clock },
  );
  if (!event.ok) throw new Error('seed failed');
  eventId = event.event.id;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

type Dialog = {
  title: string;
  body?: string;
  buttons: AlertButton[];
  options?: { cancelable?: boolean; onDismiss?: () => void };
};
/** Records every dialog; the test answers it later (or never). */
function recordDialogs() {
  const dialogs: Dialog[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons = [], options) => {
    dialogs.push({ title, body, buttons, options: options as Dialog['options'] });
  });
  const answer = (choice: 'stay' | 'leave', index = dialogs.length - 1) =>
    act(() =>
      dialogs[index]!.buttons.find((b) =>
        choice === 'stay' ? b.style === 'cancel' : b.style === 'destructive',
      )!.onPress!(),
    );
  return { dialogs, answer };
}
const rows = () => db!.getAllAsync('SELECT * FROM calendar_events ORDER BY id');

/** Players → Gal → Schedule → New event: a real stack under the form. */
async function openNewEvent(language: 'he' | 'en' = 'he') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: '/' });
  fireEvent.press(await screen.findByTestId('main-nav-players'));
  fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
  fireEvent.press(await screen.findByTestId('schedule-open'));
  fireEvent.press(await screen.findByTestId('schedule-add'));
  await screen.findByTestId('event-save');
  await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`));
  return app;
}

describe('unsaved-changes guard (NAV-DIRTY-001) — Calendar event form', () => {
  it('a clean form (defaults only) leaves without asking', async () => {
    const { dialogs } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.press(screen.getByTestId('main-nav-players'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(dialogs).toHaveLength(0);
  });

  it('dirty + main navigation: asks (Hebrew; Stay is the safe default); Stay keeps the form and its values', async () => {
    const { dialogs, answer } = recordDialogs();
    const app = await openNewEvent('he');
    fireEvent.changeText(screen.getByTestId('event-title'), 'אימון כוח');
    fireEvent.press(screen.getByTestId('main-nav-settings'));
    await waitFor(() => expect(dialogs).toHaveLength(1));
    expect(dialogs[0]).toMatchObject({
      title: 'לצאת בלי לשמור?',
      body: 'יש שינויים שלא נשמרו. יציאה מהמסך תמחק אותם.',
      options: { cancelable: true },
    });
    expect(dialogs[0]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['להישאר', 'cancel'],
      ['לצאת בלי לשמור', 'destructive'],
    ]);
    answer('stay');
    await act(async () => {});
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    expect(screen.getByTestId('event-title').props.value).toBe('אימון כוח');
    expect(await rows()).toHaveLength(1); // nothing saved
  });

  it('dirty + main navigation: Leave discards (nothing saved) and goes, with no second dialog', async () => {
    const { dialogs, answer } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.changeText(screen.getByTestId('event-notes'), 'נעליים');
    fireEvent.press(screen.getByTestId('main-nav-settings'));
    await waitFor(() => expect(dialogs).toHaveLength(1));
    answer('leave');
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
    expect(dialogs).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });

  it('dirty + Android / header Back: asks; Stay keeps the form; Leave goes back to the schedule', async () => {
    const { dialogs, answer } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.press(screen.getByTestId('event-type-GYM'));
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(1));
    answer('stay');
    await act(async () => {});
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    expect(screen.getByTestId('event-type-GYM').props.accessibilityState.selected).toBe(true);
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(2));
    answer('leave');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
  });

  it('repeated attempts while the dialog is open never open a second dialog', async () => {
    const { dialogs, answer } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.changeText(screen.getByTestId('event-title'), 'x');
    fireEvent.press(screen.getByTestId('main-nav-settings'));
    await waitFor(() => expect(dialogs).toHaveLength(1));
    fireEvent.press(screen.getByTestId('main-nav-home'));
    act(() => router.back());
    fireEvent.press(screen.getByTestId('main-nav-exercises'));
    await act(async () => {});
    expect(dialogs).toHaveLength(1);
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    answer('stay');
    await act(async () => {});
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
  });

  it('dismissing the dialog (tap outside) is Stay', async () => {
    const { dialogs } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.changeText(screen.getByTestId('event-title'), 'x');
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(1));
    act(() => dialogs[0]!.options!.onDismiss!());
    await act(async () => {});
    expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
    // The guard is usable again afterwards.
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(2));
  });

  it('a change undone is clean again', async () => {
    const { dialogs } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.changeText(screen.getByTestId('event-title'), 'x');
    fireEvent.changeText(screen.getByTestId('event-title'), '');
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(dialogs).toHaveLength(0);
  });

  it('a successful Save leaves without asking (and never asks afterwards)', async () => {
    const { dialogs } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.press(screen.getByTestId('event-type-GAME'));
    fireEvent.press(screen.getByTestId('event-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(await rows()).toHaveLength(2);
    fireEvent.press(screen.getByTestId('main-nav-home'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(dialogs).toHaveLength(0);
  });

  it('a failed Save keeps the guard: leaving still asks', async () => {
    const { dialogs } = recordDialogs();
    await openNewEvent();
    fireEvent.changeText(screen.getByTestId('event-title'), 'x'); // no type: the domain rejects the Save
    fireEvent.press(screen.getByTestId('event-save'));
    expect(await screen.findByTestId('event-type-error')).toBeTruthy();
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(1));
  });

  it('explicit Cancel keeps its accepted behaviour: discards without asking', async () => {
    const { dialogs } = recordDialogs();
    const app = await openNewEvent();
    fireEvent.changeText(screen.getByTestId('event-title'), 'x');
    fireEvent.press(screen.getByTestId('event-cancel'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(dialogs).toHaveLength(0);
    expect(await rows()).toHaveLength(1);
  });

  it('Edit: the loaded event is clean; an edit is dirty (English dialog)', async () => {
    const { dialogs, answer } = recordDialogs();
    await prepare('en');
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/schedule/${eventId}` });
    fireEvent.press(await screen.findByTestId('event-edit'));
    await screen.findByTestId('event-save');
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${eventId}`));
    expect(dialogs).toHaveLength(0);
    fireEvent.press(await screen.findByTestId('event-edit'));
    await screen.findByTestId('event-save');
    fireEvent.changeText(screen.getByTestId('event-title'), 'Cup final');
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(1));
    expect(dialogs[0]).toMatchObject({
      title: 'Leave without saving?',
      body: 'You have unsaved changes. Leaving this screen will discard them.',
    });
    expect(dialogs[0]!.buttons.map((b) => b.text)).toEqual(['Stay', 'Leave without saving']);
    answer('leave');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${eventId}`));
    expect(((await rows())[0] as { title: string }).title).toBe('Cup'); // discarded, not saved
  });
});

describe('unsaved-changes guard — Player form and new self-assessment', () => {
  it('Player Edit: loaded values are clean; a change asks on Back; Save does not', async () => {
    const { dialogs, answer } = recordDialogs();
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: '/children' });
    fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
    await screen.findByDisplayValue('Gal');
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(dialogs).toHaveLength(0);
    fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
    await screen.findByDisplayValue('Gal');
    fireEvent.changeText(screen.getByTestId('player-name'), 'Gal C');
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(1));
    answer('stay');
    await act(async () => {});
    expect(screen.getByTestId('player-name').props.value).toBe('Gal C');
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(dialogs).toHaveLength(1);
    expect((await players.getPlayer(db!, gal))!.player.name).toBe('Gal C');
  });

  it('Add Player: an empty form leaves freely; a typed name asks on main navigation', async () => {
    const { dialogs } = recordDialogs();
    await prepare('en');
    const app = renderRouter(routes, { initialUrl: '/children' });
    fireEvent.press(await screen.findByTestId('players-add'));
    await screen.findByTestId('player-name');
    fireEvent.press(screen.getByTestId('main-nav-home'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(dialogs).toHaveLength(0);
    fireEvent.press(screen.getByTestId('main-nav-players'));
    fireEvent.press(await screen.findByTestId('players-add'));
    fireEvent.changeText(await screen.findByTestId('player-name'), 'Noa');
    fireEvent.press(screen.getByTestId('main-nav-home'));
    await waitFor(() => expect(dialogs).toHaveLength(1));
  });

  it('New self-assessment: no answer is clean; a chosen rating asks; Leave writes nothing', async () => {
    const { dialogs, answer } = recordDialogs();
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    fireEvent.press(await screen.findByTestId('self-assessment-new'));
    await screen.findByTestId('self-assessment-save');
    fireEvent.press(screen.getByTestId(`self-assessment-${CATEGORIES[0]}-3`));
    act(() => router.back());
    await waitFor(() => expect(dialogs).toHaveLength(1));
    answer('leave');
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(await db!.getFirstAsync('SELECT count(*) AS n FROM self_assessments')).toEqual({ n: 0 });
  });
});

describe('isFormDirty', () => {
  type Values = {
    name: string;
    start: { year: number; month: number; day: number; hour: number; minute: number };
    end: Values['start'] | null;
  };
  const initial: Values = {
    name: 'Gal',
    start: { year: 2026, month: 10, day: 6, hour: 18, minute: 15 },
    end: null,
  };
  it('equal values (incl. a fresh but equal date object) are clean', () => {
    expect(isFormDirty({ ...initial, start: { ...initial.start } }, initial)).toBe(false);
  });
  it('any changed field — top level or inside a date — is dirty', () => {
    expect(isFormDirty({ ...initial, name: 'Gal C' }, initial)).toBe(true);
    expect(isFormDirty({ ...initial, start: { ...initial.start, minute: 30 } }, initial)).toBe(true);
    expect(isFormDirty({ ...initial, end: { ...initial.start } }, initial)).toBe(true);
  });
});
