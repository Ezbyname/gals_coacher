import { resolve } from 'node:path';

import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { createPlayer, getPlayer, setPlayerTeamName } from '@/data/local/players/playerRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { pickSpreadsheet } from '@/features/calendarImport/pickSpreadsheet';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { buildXlsx, FIXTURE_HEADER, FIXTURE_ROWS, HOF, MAAYAN } from '@/test-support/buildXlsx';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/**
 * CAL-SCHEDULE-IMPORT-002B — Excel fixture import through the real route tree and
 * real SQLite. Only the system file picker is replaced: it returns a deterministic
 * in-memory workbook (the owner's real league file never enters the repo).
 */
jest.mock('@/features/calendarImport/pickSpreadsheet', () => ({ pickSpreadsheet: jest.fn() }));
const picker = pickSpreadsheet as jest.MockedFunction<typeof pickSpreadsheet>;

const routes = appRoutes(resolve(__dirname, '..')) as never;
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const NOW = at(10, 11, 12); // Sunday 11 October 2026: the 01-10 fixture is in the past

let db: ReturnType<typeof openNodeSqlite> | null = null;
let daniel = '';
const ids = createSequentialIdService();
const deps = { ids, clock: { wallNow: () => NOW - 3_600_000, monotonicNow: () => 0 } };
const league = () => ({ name: 'ליגה 2026.xlsx', bytes: buildXlsx([{ name: '2026', rows: [FIXTURE_HEADER, ...FIXTURE_ROWS] }]) });

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
  picker.mockResolvedValue(league());
}
afterEach(async () => {
  jest.restoreAllMocks();
  picker.mockReset();
  await db?.closeAsync();
  db = null;
});

const text = (testID: string) => stripBidi(String(screen.getByTestId(testID).props.children));
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const isSelected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const count = async (table: string) => (await db!.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n;
const BOUNDARY = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'workout_templates', 'workout_blocks'];
const boundary = () => Promise.all(BOUNDARY.map((table) => count(table)));
type Row = { player_id: string; type: string; title: string | null; start_at: number; end_at: number | null; location: string | null; source: string; import_batch_id: string };
const xlsxRows = () => db!.getAllAsync<Row>("SELECT * FROM calendar_events WHERE source = 'XLSX_IMPORT' ORDER BY start_at, id");
/** The team chip whose label is exactly `name` (chips are indexed by the file's team order). */
const teamChip = (name: string) => {
  for (let i = 0; ; i++) {
    const label = screen.queryByTestId(`import-excel-team-${i}-label`);
    if (label === null) throw new Error(`no team chip ${name}`);
    if (stripBidi(String(label.props.children)) === name) return `import-excel-team-${i}`;
  }
};

async function openExcel() {
  renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/import` });
  await screen.findByTestId('import-source-excel');
  press('import-source-excel');
  press('import-type-GAME');
  press('import-excel-pick');
  await screen.findByTestId('import-excel-file');
}
async function analyze() {
  press('import-analyze');
  await screen.findByTestId('import-continue');
}

describe('CAL-SCHEDULE-IMPORT-002B Excel fixture import', () => {
  it("Team Name matches exactly → preselected; 4 of 6 games (never the prefix-sharing club); titles, sides, venues, past blocked", async () => {
    await prepare('he', `  ${HOF} `);
    await openExcel();
    expect(text('import-excel-file')).toBe('ליגה 2026.xlsx · 6 משחקים בקובץ');
    expect(isSelected(teamChip(HOF))).toBe(true);
    expect(isSelected(teamChip(MAAYAN))).toBe(false);
    expect(text('import-excel-team-hint')).toBe('נבחרה לפי שם הקבוצה של השחקן.');
    expect(screen.queryByTestId('import-excel-save-team')).toBeNull(); // nothing to save: it already matches
    await analyze();

    expect(text('import-review-header')).toBe(`משחק · 4 משחקים של ${HOF}`);
    expect(['x1', 'x2', 'x3', 'x4'].map((k) => text(`import-row-${k}-title`))).toEqual([
      `מכבי חדרה מרכז – ${HOF}`,
      `${HOF} – הפועל ג'סר אלזרקא`,
      `${HOF} – ${MAAYAN}`,
      `הפועל אור עקיבא דור העתיד – ${HOF}`,
    ]);
    expect(screen.queryByTestId('import-row-x5')).toBeNull();
    expect(['x1', 'x2', 'x3', 'x4'].map((k) => text(`import-row-${k}-side`))).toEqual(['משחק חוץ', 'משחק בית', 'משחק בית', 'משחק חוץ']);
    expect(text('import-row-x1-location')).toBe('📍 ביה"ס תחכמוני, חדרה');
    expect(text('import-row-x2-location')).toBe('📍 ביה"ס כרמל וים, קיבוץ עין כרמל');
    expect(text('import-row-x1-time')).toBe('17:30–?'); // no invented end
    // 01-10 is in the past: Edit Date / Remove only — no Keep Anyway.
    await screen.findByTestId('import-row-x4-past');
    expect(screen.getByTestId('import-row-x4-past-remove')).toBeTruthy();
    expect(screen.queryByTestId('import-row-x4-past-keep')).toBeNull();
    expect(screen.getByTestId('import-continue').props.accessibilityState?.disabled).toBe(true);
  });

  it('keep all without end time + remove the past game → Add 3: exactly 3 XLSX_IMPORT events, one batch, end NULL, nothing else; Undo removes only that batch', async () => {
    await prepare('en', HOF);
    const other = await createCalendarEvent(db!, daniel, { type: 'GYM', startAt: at(10, 23, 7), endAt: at(10, 23, 8) }, deps);
    if (!other.ok) throw new Error('seed failed');
    const before = await boundary();
    await openExcel();
    await analyze();
    press('import-row-x4-past-remove');
    expect(stripBidi(String(within(screen.getByTestId('import-keep-all-no-end')).getByText(/./).props.children))).toBe('Keep all 3 without an end time');
    press('import-keep-all-no-end');
    for (const k of ['x1', 'x2', 'x3']) expect(text(`import-row-${k}-status-label`)).toBe('✓ Ready');
    press('import-continue');
    await screen.findByTestId('import-add');
    expect(await count('calendar_events')).toBe(1); // review + confirm write nothing
    press('import-add');
    await screen.findByTestId('import-done-title');

    const rows = await xlsxRows();
    expect(rows.map((r) => [new Date(r.start_at).getMonth() + 1, new Date(r.start_at).getDate(), new Date(r.start_at).getHours(), new Date(r.start_at).getMinutes()])).toEqual([
      [10, 22, 17, 30],
      [10, 29, 19, 0],
      [11, 5, 19, 0],
    ]);
    expect(rows.map((r) => r.title)).toEqual([`מכבי חדרה מרכז – ${HOF}`, `${HOF} – הפועל ג'סר אלזרקא`, `${HOF} – ${MAAYAN}`]);
    expect(rows.map((r) => r.location)).toEqual(['ביה"ס תחכמוני, חדרה', 'ביה"ס כרמל וים, קיבוץ עין כרמל', 'קיבוץ מעיין צבי']);
    expect(rows.every((r) => r.end_at === null && r.type === 'GAME' && r.player_id === daniel)).toBe(true);
    expect(new Set(rows.map((r) => r.import_batch_id)).size).toBe(1);
    expect(await count('calendar_events')).toBe(4);
    expect(await count("calendar_events WHERE source = 'TEXT_IMPORT'")).toBe(0);
    expect(await boundary()).toEqual(before); // no PlannedWorkout, no TrainingSession
    expect((await getPlayer(db!, daniel))!.player.teamName).toBe(HOF); // ownership + profile unchanged

    press('import-undo');
    await screen.findByTestId('import-undone-title');
    expect(await count('calendar_events')).toBe(1);
    expect((await db!.getFirstAsync<{ id: string }>('SELECT id FROM calendar_events'))!.id).toBe(other.event.id);
  });

  it('all or nothing: a game refused at save time → ZERO events from the file', async () => {
    await prepare('en', HOF);
    await openExcel();
    await analyze();
    press('import-row-x4-past-remove');
    press('import-keep-all-no-end');
    press('import-continue');
    await screen.findByTestId('import-add');
    // Storage refuses the 3rd of 3 inserts (after two succeeded inside the transaction).
    await db!.execAsync("CREATE TRIGGER refuse_third BEFORE INSERT ON calendar_events WHEN NEW.location = 'קיבוץ מעיין צבי' BEGIN SELECT RAISE(ABORT, 'refused'); END");
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    press('import-add');
    expect(await screen.findByTestId('import-save-error')).toBeTruthy();
    expect(await count('calendar_events')).toBe(0);
    expect(screen.queryByTestId('import-done')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('no Team Name: nothing preselected, Analyze asks for the team; choosing one + "save" stores it on THIS Player only', async () => {
    await prepare('en', null);
    await openExcel();
    expect(screen.queryByTestId('import-excel-save-team')).toBeNull();
    expect(text('import-excel-team-hint')).toBe("Choose Daniel's team from the teams in the file.");
    press('import-analyze');
    expect(text('import-excel-team-error')).toBe("Choose Daniel's team first.");
    expect(screen.queryByTestId('import-continue')).toBeNull();
    press(teamChip(HOF));
    expect(screen.queryByTestId('import-excel-team-error')).toBeNull();
    press('import-excel-save-team-save');
    await analyze();
    expect(text('import-review-header')).toBe(`Game · 4 games of ${HOF}`);
    expect((await getPlayer(db!, daniel))!.player.teamName).toBe(HOF);
    expect(await count('calendar_events')).toBe(0);
  });

  it('a wrong Team Name (only a prefix of a team) is never "contains"-matched; without "save" the Player is untouched', async () => {
    await prepare('en', 'הפועל חוף');
    await openExcel();
    expect(screen.queryByTestId('import-excel-team-0')).not.toBeNull();
    for (let i = 0; screen.queryByTestId(`import-excel-team-${i}`) !== null; i++) expect(isSelected(`import-excel-team-${i}`)).toBe(false);
    press(teamChip(MAAYAN));
    await analyze();
    expect(text('import-review-header')).toBe(`Game · 2 games of ${MAAYAN}`);
    expect((await getPlayer(db!, daniel))!.player.teamName).toBe('הפועל חוף');
  });

  it('a picker that gives no real file name (Android document id) is shown as "Excel file", never the id', async () => {
    await prepare('en', HOF);
    picker.mockResolvedValue({ ...league(), name: null });
    await openExcel();
    expect(text('import-excel-file')).toBe('Excel file · 6 games in the file');
  });

  it('GAME is suggested, never applied; a file without the required columns says which', async () => {
    await prepare('en', HOF);
    renderRouter(routes, { initialUrl: `/children/${daniel}/schedule/import` });
    await screen.findByTestId('import-source-excel');
    press('import-source-excel');
    expect(text('import-type-suggestion')).toBe('Suggested type for a fixture list: Game');
    expect(isSelected('import-type-GAME')).toBe(false);
    picker.mockResolvedValue({ name: 'x.xlsx', bytes: buildXlsx([{ name: 'S', rows: [['Date', 'Home Team', 'Venue'], ['19-11-2026', HOF, 'אולם']] }]) });
    press('import-excel-pick');
    await screen.findByTestId('import-excel-error');
    expect(text('import-excel-error')).toBe('Required columns were not found in the file: Time, Away team.');
    picker.mockResolvedValue({ name: 'notes.txt', bytes: new TextEncoder().encode('hello') });
    press('import-excel-pick');
    await waitFor(() => expect(text('import-excel-error')).toBe('This file could not be read as an Excel workbook.'));
    expect(screen.queryByTestId('import-excel-file')).toBeNull();
  });

  it('a duplicate of an existing game goes through the usual review', async () => {
    await prepare('en', HOF);
    await setPlayerTeamName(db!, daniel, HOF, { clock: deps.clock });
    const existing = await createCalendarEvent(db!, daniel, { type: 'GAME', startAt: at(10, 29, 19), endAt: null }, deps);
    if (!existing.ok) throw new Error('seed failed');
    await openExcel();
    await analyze();
    expect(screen.getByTestId('import-row-x2-remove-duplicate')).toBeTruthy();
    expect(screen.queryByTestId('import-row-x1-remove-duplicate')).toBeNull();
  });
});
