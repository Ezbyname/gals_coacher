import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform, StyleSheet, TextInput } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import type { Uuid } from '@/domain/ids';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 6, 12).getTime();
const START = new Date(2026, 9, 10, 17).getTime();
const EVENT_ID = '00000000-0000-4000-8000-0000000000c9';
const LEGACY_TITLE =
  'אימון כוח ארוך במיוחד שנשמר לפני שהייתה מגבלה על אורך הכותרת, עם הרבה פרטים נוספים על התרגילים והמטרות של השבוע'; // > 100
const EIGHT_LINES = ['שורה 1', 'שורה 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7', 'שורה 8'].join(
  '\n',
);

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid;

async function prepare(language: 'he' | 'en', { legacyTitle = 'Cup', notes = null as string | null } = {}) {
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
    { player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } }, basketball: null },
    { ids: createSequentialIdService(), clock: { wallNow: () => NOW, monotonicNow: () => 0 } },
  );
  if (!created.ok) throw new Error('seed failed');
  gal = created.profile.player.id;
  await opened.runAsync(
    `INSERT INTO calendar_events (id, player_id, type, start_at, title, notes, created_at, updated_at)
     VALUES (?, ?, 'OTHER', ?, ?, ?, ?, ?)`,
    [EVENT_ID, gal, START, legacyTitle, notes, NOW, NOW],
  );
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

async function openForm(kind: 'create' | 'edit', language: 'he' | 'en' = 'he', seed = {}) {
  await prepare(language, seed);
  const url =
    kind === 'create' ? `/children/${gal}/schedule/new` : `/children/${gal}/schedule/${EVENT_ID}/edit`;
  const app = renderRouter(routes, { initialUrl: url });
  await screen.findByTestId('event-save');
  return app;
}
const title = () => screen.getByTestId('event-title');
const notes = () => screen.getByTestId('event-notes');
const text = (id: string) => String(screen.getByTestId(id).props.children);
const event = () =>
  db!.getFirstAsync<{ title: string; notes: string | null }>(
    'SELECT title, notes FROM calendar_events WHERE id = ?',
    [EVENT_ID],
  );

describe('Calendar title: at most 100 characters', () => {
  it.each(['create', 'edit'] as const)('%s: the field stops new input at 100 characters', async (kind) => {
    await openForm(kind);
    expect(title().props.maxLength).toBe(100);
  });

  it.each([
    ['he', 'א'.repeat(100), 'א'.repeat(101), 'הכותרת יכולה להכיל עד 100 תווים.'],
    ['en', 'x'.repeat(100), 'x'.repeat(101), 'The title can have up to 100 characters.'],
  ] as const)(
    '%s create: 100 characters save; a 101st is refused by the domain with a message',
    async (language, ok, tooLong, message) => {
      const app = await openForm('create', language);
      fireEvent.press(screen.getByTestId('event-type-GAME'));
      // Typed input cannot exceed maxLength on a device; a pasted / programmatic 101 still never saves.
      fireEvent.changeText(title(), tooLong);
      fireEvent.press(screen.getByTestId('event-save'));
      expect(await screen.findByTestId('event-title-error')).toBeTruthy();
      expect(text('event-title-error')).toBe(message);
      expect(app.getPathname()).toBe(`/children/${gal}/schedule/new`);
      expect(await db!.getFirstAsync('SELECT count(*) AS n FROM calendar_events')).toEqual({ n: 1 });
      fireEvent.changeText(title(), ok);
      fireEvent.press(screen.getByTestId('event-save'));
      await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
      expect(await db!.getAllAsync('SELECT title FROM calendar_events WHERE id != ?', [EVENT_ID])).toEqual([
        { title: ok },
      ]);
    },
  );

  it('edit of a title saved before the limit: shown in full (never cut by the field) and kept unchanged on Save', async () => {
    const app = await openForm('edit', 'he', { legacyTitle: LEGACY_TITLE });
    expect(title().props.value).toBe(LEGACY_TITLE);
    expect(title().props.maxLength).toBe(LEGACY_TITLE.length);
    fireEvent.changeText(notes(), 'אוטובוס 16:00');
    fireEvent.press(screen.getByTestId('event-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule/${EVENT_ID}`));
    expect(await event()).toEqual({ title: LEGACY_TITLE, notes: 'אוטובוס 16:00' });
  });

  it('edit of a long legacy title: a changed title must meet the limit (nothing written otherwise)', async () => {
    await openForm('edit', 'en', { legacyTitle: LEGACY_TITLE });
    fireEvent.changeText(title(), LEGACY_TITLE.slice(0, 105));
    fireEvent.press(screen.getByTestId('event-save'));
    expect(await screen.findByTestId('event-title-error')).toBeTruthy();
    expect(text('event-title-error')).toBe('The title can have up to 100 characters.');
    expect((await event())!.title).toBe(LEGACY_TITLE);
  });
});

describe('Calendar notes: at most four lines visible, scrolling inside', () => {
  const notesStyle = () => StyleSheet.flatten(notes().props.style);

  it.each(['create', 'edit'] as const)(
    '%s: a bounded, internally scrollable multiline field',
    async (kind) => {
      await openForm(kind);
      expect(notes().props.multiline).toBe(true);
      expect(notes().props.scrollEnabled).toBe(true);
      expect(notes().props.numberOfLines).toBe(4);
      expect(notesStyle().lineHeight).toBe(22);
      // Height for four lines (+ vertical padding) — never grows with the text.
      expect(notesStyle().height).toBe(4 * 22 + 2 * 8);
      expect(notes().props.maxLength).toBeUndefined(); // the content itself is not limited
    },
  );

  it('more than four lines: the field keeps its height and every line is saved', async () => {
    const app = await openForm('create', 'he');
    fireEvent.press(screen.getByTestId('event-type-GYM'));
    fireEvent.changeText(notes(), EIGHT_LINES);
    expect(notesStyle().height).toBe(4 * 22 + 2 * 8);
    expect(notes().props.value).toBe(EIGHT_LINES);
    fireEvent.press(screen.getByTestId('event-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/schedule`));
    expect(await db!.getAllAsync("SELECT notes FROM calendar_events WHERE type = 'GYM'")).toEqual([
      { notes: EIGHT_LINES },
    ]);
  });

  it('four lines or fewer behave the same', async () => {
    await openForm('create', 'en');
    fireEvent.changeText(notes(), 'one\ntwo');
    expect(notesStyle().height).toBe(4 * 22 + 2 * 8);
    expect(notes().props.value).toBe('one\ntwo');
  });

  it('on blur the field is re-created at its first line; the text is untouched (edit)', async () => {
    await openForm('edit', 'en', { notes: EIGHT_LINES });
    const focused = screen.UNSAFE_getAllByType(TextInput).find((n) => n.props.testID === 'event-notes')!;
    fireEvent(notes(), 'focus');
    fireEvent(notes(), 'blur');
    await act(async () => {});
    const after = screen.UNSAFE_getAllByType(TextInput).find((n) => n.props.testID === 'event-notes')!;
    expect(after).not.toBe(focused); // a fresh native input starts at line 1
    expect(notes().props.value).toBe(EIGHT_LINES);
    // The title field is not re-created on blur (only the bounded multiline field is).
    const titleBefore = screen.UNSAFE_getAllByType(TextInput).find((n) => n.props.testID === 'event-title')!;
    fireEvent(title(), 'blur');
    await act(async () => {});
    expect(screen.UNSAFE_getAllByType(TextInput).find((n) => n.props.testID === 'event-title')).toBe(
      titleBefore,
    );
  });
});
