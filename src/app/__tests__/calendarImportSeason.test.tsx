import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { createPlayer, getPlayer } from '@/data/local/players/playerRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { readFixtureText } from '@/domain/scheduleImport';
import { HOF_SEASON_TEXT } from '@/domain/scheduleImport/__tests__/seasonFixtures';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/**
 * CAL-SCHEDULE-IMPORT-002C — a pasted SEASON fixture list through the real route tree and real
 * SQLite, on the owner's real 22-game text. Same review / Confirm / batch write / Undo as 002B.
 */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const NOW = new Date(2026, 9, 13, 12).getTime(); // Tuesday 13 Oct 2026: every game of the list is ahead
const HOF = 'הפועל חוף הכרמל';
const MAAYAN = 'הפועל חוף הכרמל מעיין צבי';

let db: ReturnType<typeof openNodeSqlite> | null = null;
let daniel = '';
const ids = createSequentialIdService();
const deps = { ids, clock: { wallNow: () => NOW - 3_600_000, monotonicNow: () => 0 } };

async function prepare(language: 'he' | 'en', teamName: string | null) {
  await prepareApp(language);
  jest.replaceProperty(Platform, 'OS', 'android');
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
  const created = await createPlayer(
    opened,
    { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 }, teamName }, basketball: { primaryPosition: 'SG' } },
    deps,
  );
  if (!created.ok) throw new Error('seed failed');
  daniel = created.profile.player.id;
}
afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const isSelected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const label = (testID: string) => stripBidi(String(within(screen.getByTestId(testID)).getByText(/./).props.children));
const count = async (sql: string) => (await db!.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${sql}`))!.n;
const BOUNDARY = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'workout_templates', 'workout_blocks'];
const boundary = () => Promise.all(BOUNDARY.map((t) => count(t)));
type Row = { player_id: string; type: string; title: string; start_at: number; end_at: number | null; location: string; source: string; import_batch_id: string };
const rows = () => db!.getAllAsync<Row>("SELECT * FROM calendar_events WHERE source = 'TEXT_IMPORT' ORDER BY start_at, id");
const teamChip = (name: string) => {
  for (let i = 0; ; i++) {
    const node = screen.queryByTestId(`import-fixture-team-${i}-label`);
    if (node === null) throw new Error(`no team chip ${name}`);
    if (stripBidi(String(node.props.children)) === name) return `import-fixture-team-${i}`;
  }
};
const ORACLE = readFixtureText(HOF_SEASON_TEXT).fixtures; // the parser is proven in fixtureText.test.ts

async function paste(message: string, type = 'GAME') {
  renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/import` });
  await screen.findByTestId('import-text');
  press(`import-type-${type}`);
  fireEvent.changeText(screen.getByTestId('import-text'), message);
  press('import-analyze');
}

describe('CAL-SCHEDULE-IMPORT-002C season fixture text', () => {
  it("Team Name set: detected → the 22 games straight to review; titles, HOME/AWAY, own locations; keep all → Add 22 TEXT_IMPORT events; Undo removes only them", async () => {
    await prepare('he', HOF);
    const other = await createCalendarEvent(db!, daniel, { type: 'GYM', startAt: NOW + 86_400_000, endAt: null }, deps);
    if (!other.ok) throw new Error('seed');
    const before = await boundary();
    await paste(HOF_SEASON_TEXT);
    await screen.findByTestId('import-continue');
    expect(text('import-review-header')).toBe(`משחק · 22 משחקים של ${HOF}`);
    expect(text('import-row-x1-title')).toBe(`מכבי חדרה מרכז – ${HOF}`);
    expect(text('import-row-x1-side')).toBe('משחק חוץ');
    expect(text('import-row-x1-location')).toBe('📍 ביה"ס תחכמוני, רח\' יצחק כושי עפגין 15, חדרה');
    expect(text('import-row-x2-location')).toBe('📍 ביה"ס כרמל וים, קיבוץ עין כרמל');
    expect(text('import-row-x3-title')).toBe(`${HOF} – ${MAAYAN}`);
    expect(text('import-row-x3-side')).toBe('משחק בית');
    expect(text('import-row-x22-time')).toBe('19:30–?');
    expect(screen.queryByTestId('import-row-x23')).toBeNull();
    expect(screen.queryByTestId('import-row-x1-outside-week')).toBeNull(); // no week for a fixture list
    expect(label('import-keep-all-no-end')).toBe('השאר את כל 22 ללא שעת סיום');
    press('import-keep-all-no-end');
    expect(label('import-continue')).toContain('22');
    press('import-continue');
    await screen.findByTestId('import-add');
    press('import-add');
    await screen.findByTestId('import-done-title');

    const saved = await rows();
    expect(saved).toHaveLength(22);
    expect(saved.map((r) => r.title)).toEqual(ORACLE.map((f) => `${f.home.name} – ${f.away.name}`));
    expect(saved.map((r) => r.location)).toEqual(ORACLE.map((f) => f.venue));
    expect(saved.map((r) => { const d = new Date(r.start_at); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]; }))
      .toEqual(ORACLE.map((f) => [f.date.year, f.date.month, f.date.day, f.start.hour, f.start.minute]));
    expect(saved.every((r) => r.end_at === null && r.type === 'GAME' && r.player_id === daniel)).toBe(true);
    expect(new Set(saved.map((r) => r.import_batch_id)).size).toBe(1);
    expect(await boundary()).toEqual(before); // CalendarEvent only

    press('import-undo');
    await screen.findByTestId('import-undone-title');
    expect(await count('calendar_events')).toBe(1);
    expect((await db!.getFirstAsync<{ id: string }>('SELECT id FROM calendar_events'))!.id).toBe(other.event.id);
  });

  it('no Team Name: the list is detected, the teams are offered (exact, prefix club separate), GAME only suggested; choose + save → 22', async () => {
    await prepare('en', null);
    await paste(HOF_SEASON_TEXT, 'TEAM_TRAINING');
    await screen.findByTestId('import-season-detected');
    expect(text('import-season-detected')).toBe(
      '22 games found in a season fixture list. Dates are imported exactly as written; the selected week does not apply.');
    expect(teamChip(HOF)).not.toBe(teamChip(MAAYAN));
    expect(isSelected(teamChip(HOF))).toBe(false);
    expect(text('import-type-suggestion')).toBe('Suggested type for a fixture file: Game');
    expect(isSelected('import-type-TEAM_TRAINING')).toBe(true); // never overridden
    expect(screen.queryByTestId('import-continue')).toBeNull();
    press('import-analyze');
    expect(text('import-fixture-team-error')).toBe("Choose Daniel's team first.");
    press(teamChip(HOF));
    press('import-fixture-save-team-save');
    press('import-type-GAME');
    press('import-analyze');
    await screen.findByTestId('import-continue');
    expect(text('import-review-header')).toBe(`Game · 22 games of ${HOF}`);
    expect((await getPlayer(db!, daniel))!.player.teamName).toBe(HOF);
    expect(await count('calendar_events')).toBe(0);
  });

  it('unsure (one dated matchup) → asks; "as a weekly schedule" keeps the weekly reading; "as a fixture list" reads its dates', async () => {
    await prepare('en', HOF);
    await paste(`Friendly\n15-11-2026 18:00\nמכבי מי עמי – ${HOF}\nמיקום: אולם מי עמי`);
    await screen.findByTestId('import-season-ask');
    expect(screen.queryByTestId('import-continue')).toBeNull();
    press('import-season-as-fixture');
    await screen.findByTestId('import-continue');
    expect(text('import-row-x1-title')).toBe(`מכבי מי עמי – ${HOF}`);
    expect(text('import-row-x1-location')).toBe('📍 אולם מי עמי');
    expect(text('import-row-x1-when')).toContain('15/11');
  });

  it('a written weekday that disagrees keeps the explicit date and asks (names the written day); a past game is blocked', async () => {
    await prepare('en', HOF);
    await paste(`1. Tuesday 22-10-2026 | 17:30\nא – ${HOF}\n2. Thursday 01-10-2026 | 19:00\n${HOF} – ב`);
    await screen.findByTestId('import-row-x1-mismatch-detail');
    expect(text('import-row-x1-mismatch-detail')).toContain('Tuesday');
    expect(text('import-row-x1-when')).toContain('22/10'); // never moved
    expect(screen.getByTestId('import-row-x1-use-date')).toBeTruthy();
    expect(screen.getByTestId('import-row-x2-past-remove')).toBeTruthy();
    expect(screen.queryByTestId('import-row-x2-past-keep')).toBeNull();
  });

  it('importing the same list again: every game is the usual possible-duplicate review', async () => {
    await prepare('en', HOF);
    await paste(HOF_SEASON_TEXT);
    await screen.findByTestId('import-continue');
    press('import-keep-all-no-end');
    press('import-continue');
    await screen.findByTestId('import-add');
    press('import-add');
    await screen.findByTestId('import-done-title');
    await waitFor(async () => expect(await count('calendar_events')).toBe(22));
    // The same list again: every game is flagged against the stored one; nothing can be added blindly.
    press('import-view-calendar');
    await paste(HOF_SEASON_TEXT);
    await screen.findByTestId('import-continue');
    for (const key of ['x1', 'x11', 'x22']) expect(screen.getByTestId(`import-row-${key}-remove-duplicate`)).toBeTruthy();
    press('import-keep-all-no-end');
    expect(screen.getByTestId('import-continue').props.accessibilityState?.disabled).toBe(true);
    expect(await count('calendar_events')).toBe(22);
  });
});
