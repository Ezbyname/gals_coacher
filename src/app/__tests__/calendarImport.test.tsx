import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  createCalendarEvent,
  markCalendarEventCompleted,
  updateCalendarEvent,
} from '@/data/local/calendar/calendarEventRepository';
import { createPlayer } from '@/data/local/players/playerRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { WHATSAPP_EXAMPLE_1, WHATSAPP_EXAMPLE_2 } from '@/domain/calendarImport/__tests__/whatsappFixtures';
import { stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { appRoutes } from '@/test-support/appRoutes';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

/**
 * CAL-TEXT-IMPORT-001C — wizard + preview, and 001D — confirm + batch write +
 * Undo Import, through the real route tree and real SQLite.
 */
const routes = appRoutes(resolve(__dirname, '..')) as never;
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const NOW = at(9, 12); // Friday 9 October 2026 → default week Sun 11 – Sat 17 Oct

let db: ReturnType<typeof openNodeSqlite> | null = null;
let daniel = '';
const ids = createSequentialIdService();
const deps = { ids, clock: { wallNow: () => NOW - 3_600_000, monotonicNow: () => 0 } };

async function prepare(language: 'he' | 'en') {
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
    { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: { primaryPosition: 'SG' } },
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
const cta = () => stripBidi(String(within(screen.getByTestId('import-continue')).getByText(/./).props.children));
const isDisabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;
const isSelected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const eventCount = async () => (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM calendar_events'))!.n;
const count = async (table: string) => (await db!.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))!.n;
type Row = {
  id: string;
  player_id: string;
  type: string;
  sport: string | null;
  start_at: number;
  end_at: number | null;
  location: string | null;
  notes: string | null;
  source: string | null;
  import_batch_id: string | null;
};
const imported = () =>
  db!.getAllAsync<Row>("SELECT * FROM calendar_events WHERE source = 'TEXT_IMPORT' ORDER BY start_at, id");
const importUrl = (qa?: string) => `/children/${daniel}/schedule/import${qa === undefined ? '' : `?qaText=${encodeURIComponent(qa)}`}`;

async function analyze(message: string) {
  await screen.findByTestId('import-text');
  press('import-type-TEAM_TRAINING');
  fireEvent.changeText(screen.getByTestId('import-text'), message);
  press('import-analyze');
  await screen.findByTestId('import-continue');
}

describe('CAL-TEXT-IMPORT-001C import wizard + preview', () => {
  it('Hebrew: Schedule → Import, for Daniel without asking; example 1 → 4 READY; remove / undo; Continue writes NOTHING', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: `/children/${daniel}/schedule` });
    press(await screen.findByTestId('schedule-import-text').then(() => 'schedule-import-text'));
    await screen.findByTestId('import-text');
    expect(text('active-player-target')).toBe('אימון עבור Daniel');
    expect(screen.queryByTestId('active-player-missing')).toBeNull();
    expect(text('import-week-label')).toBe('יום ראשון 11/10 – יום שבת 17/10');
    expect(isSelected('import-sport-BASKETBALL')).toBe(true); // exactly one active sport → preselected
    await analyze(WHATSAPP_EXAMPLE_1);

    for (const [key, when, time] of [
      ['s1', 'יום שני · 12/10', '18:40–20:10'],
      ['s2', 'יום רביעי · 14/10', '17:10–18:40'],
      ['s3', 'יום חמישי · 15/10', '18:40–20:10'],
      ['s4', 'יום שישי · 16/10', '14:30–16:00'],
    ] as const) {
      expect(text(`import-row-${key}-status-label`)).toBe('✓ מוכן');
      expect(text(`import-row-${key}-when`)).toBe(when);
      expect(text(`import-row-${key}-time`)).toBe(time);
      expect(text(`import-row-${key}-location`)).toBe('📍 עין כרמל');
    }
    expect(cta()).toBe('המשך עם 4 אימונים');
    expect(isDisabled('import-continue')).toBe(false);

    press('import-row-s3-remove');
    expect(text('import-row-s3-removed')).toBe('אימון יום חמישי הוסר מהייבוא');
    expect(screen.getByTestId('import-row-s3-undo').props.accessibilityLabel).toBe('ביטול ההסרה של יום חמישי 18:40');
    expect(cta()).toBe('המשך עם 3 אימונים');
    press('import-row-s3-undo');
    expect(text('import-row-s3-status-label')).toBe('✓ מוכן');
    expect(cta()).toBe('המשך עם 4 אימונים');

    press('import-continue');
    expect(text('import-confirm-title')).toBe('להוסיף ליומן של Daniel?');
    expect(await eventCount()).toBe(0); // reviewing and Continue never write
  });

  it('example 2 via the QA prefill: Tuesday NEEDS REVIEW (no invented end), blocks; edit an end → Continue with 3', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: importUrl(WHATSAPP_EXAMPLE_2) });
    await screen.findByTestId('import-text');
    expect(screen.getByTestId('import-text').props.value).toBe(WHATSAPP_EXAMPLE_2);
    press('import-type-TEAM_TRAINING');
    press('import-analyze');
    await screen.findByTestId('import-continue');

    expect(text('import-row-s2-status-label')).toBe('⚠ דורש בדיקה');
    expect(text('import-row-s2-time')).toBe('16:30–?');
    expect(text('import-row-s2-issue-END_TIME_MISSING-text')).toBe(
      'אין שעת סיום — אפשר להשאיר בלי, להזין שעת סיום או להסיר את האימון.',
    );
    expect(text('import-row-s2-keep-no-end-label')).toBe('השאר ללא שעת סיום');
    expect(text('import-row-s2-details')).toBe('משחק אימון נגד העומר');
    expect(text('import-row-s2-suggestion')).toMatch(/^סוג מוצע: /);
    expect(text('import-row-s1-details')).toBe('אחרי בית ספר');
    expect(cta()).toBe('המשך עם 3 אימונים'); // N counts every INCLUDED candidate
    expect(isDisabled('import-continue')).toBe(true);
    expect(text('import-blocked')).toBe('אימון אחד דורש בדיקה לפני שממשיכים.');

    press('import-row-s2-edit');
    await screen.findByTestId('import-row-s2-editor');
    press('import-row-s2-edit-end');
    const native = await screen.findByTestId('import-row-s2-edit-end-native');
    act(() => native.props.onValueChange({}, new Date(2026, 9, 13, 18, 0)));
    await waitFor(() => expect(text('import-row-s2-edit-end-value')).toBe('18:00'));
    press('import-row-s2-edit-type-GAME');
    press('import-row-s2-edit-done');
    expect(text('import-row-s2-status-label')).toBe('✓ מוכן');
    expect(text('import-row-s2-time')).toBe('16:30–18:00');
    expect(screen.queryByTestId('import-row-s2-suggestion')).toBeNull(); // GAME chosen by the user
    expect(isDisabled('import-continue')).toBe(false);
    expect(await eventCount()).toBe(0);
  });

  it('an unknown end is allowed: "keep without end time" → Continue with 3, Tuesday still 16:30–?', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_2);
    press('import-row-s2-keep-no-end');
    expect(text('import-row-s2-status-label')).toBe('✓ מוכן');
    expect(text('import-row-s2-time')).toBe('16:30–?');
    expect(text('import-row-s2-resolved-END_TIME_MISSING')).toBe('✓ לפי בחירתך');
    expect(isDisabled('import-continue')).toBe(false);
    expect(cta()).toBe('המשך עם 3 אימונים');
    // The editor can also clear an end the user had set.
    press('import-row-s1-edit');
    press('import-row-s1-edit-clear-end');
    expect(text('import-row-s1-edit-end-value')).toBe('לא הוגדר');
    press('import-row-s1-edit-done');
    expect(text('import-row-s1-time')).toBe('15:00–?');
    expect(text('import-row-s1-status-label')).toBe('⚠ דורש בדיקה');
  });

  it('removing the incomplete Tuesday unblocks: Continue with 2', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_2);
    press('import-row-s2-remove');
    expect(cta()).toBe('המשך עם 2 אימונים');
    expect(isDisabled('import-continue')).toBe(false);
    expect(screen.queryByTestId('import-blocked')).toBeNull();
  });

  it('English: duplicate shows both sides; weekday/date mismatch and outside-week have their own actions', async () => {
    await prepare('en');
    const existing = await createCalendarEvent(db!, daniel, { type: 'TEAM_TRAINING', startAt: at(12, 18, 30), endAt: at(12, 20) }, deps);
    if (!existing.ok) throw new Error('seed failed');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze('יום שני 18:40-20:10\nיום רביעי 13/10 17:00-18:00\n21/10 18:00-19:00');
    expect(text('active-player-target')).toBe('Training for Daniel');

    expect(text('import-row-s1-status-label')).toBe('⚠ Needs review');
    expect(text('import-row-s1-duplicate-imported')).toBe('From the import: 18:40–20:10 · Team training');
    expect(text('import-row-s1-duplicate-existing')).toBe('Already in the calendar: 18:30–20:00 · Team training');
    expect(screen.getByTestId('import-row-s1-keep').props.accessibilityLabel).toBe('Keep possible duplicate Monday 18:40');
    expect(screen.getByTestId('import-row-s1-remove-duplicate')).toBeTruthy();

    expect(text('import-row-s2-when')).toBe('Tuesday · 13/10'); // the explicit date wins, never moved
    expect(text('import-row-s2-mismatch-detail')).toBe('Message: Wednesday, 13/10. 13/10 is a Tuesday.');
    expect(text('import-row-s2-use-date-label')).toBe('Use 13/10');

    expect(text('import-row-s3-when')).toBe('Wednesday · 21/10');
    expect(text('import-row-s3-outside-week')).toBe('21/10 is outside the selected week.');
    expect(text('import-row-s3-use-date-anyway-label')).toBe('Use 21/10 anyway');

    expect(isDisabled('import-continue')).toBe(true);
    expect(text('import-blocked')).toBe('3 trainings need review first.');
    press('import-row-s1-keep');
    press('import-row-s2-use-date');
    press('import-row-s3-use-date-anyway');
    expect(text('import-row-s1-resolved-POSSIBLE_DUPLICATE')).toBe('✓ Your choice');
    expect(isDisabled('import-continue')).toBe(false);
    expect(cta()).toBe('Continue with 3 trainings');
    expect(await eventCount()).toBe(1); // only the seeded event
  });

  it('a past week can be chosen, with a warning (never forbidden)', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: importUrl() });
    await screen.findByTestId('import-text');
    expect(screen.queryByTestId('import-week-warning')).toBeNull();
    press('import-week-prev');
    expect(text('import-week-warning')).toBe('This week has already started. You can still continue.');
    press('import-week-prev');
    expect(text('import-week-warning')).toBe('This week is in the past. You can still continue.');
  });

  it('a release build ignores qaText (no text injection outside development)', async () => {
    await prepare('en');
    const globals = globalThis as { __DEV__?: boolean };
    const before = globals.__DEV__;
    globals.__DEV__ = false;
    try {
      renderRouter(routes, { initialUrl: importUrl(WHATSAPP_EXAMPLE_1) });
      await screen.findByTestId('import-text');
      expect(screen.getByTestId('import-text').props.value).toBe('');
    } finally {
      globals.__DEV__ = before;
    }
  });

  it('without a resolved Player the import refuses', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: '/children/no-such-player/schedule/import' });
    await screen.findByTestId('active-player-missing');
    expect(screen.queryByTestId('import-text')).toBeNull();
  });
});

describe('CAL-TEXT-IMPORT-001D confirm + batch write + Undo Import', () => {
  const BOUNDARY = ['planned_workouts', 'planned_workout_items', 'training_sessions', 'workout_templates', 'workout_blocks'];
  const boundary = async () => Promise.all(BOUNDARY.map((table) => count(table)));
  const toConfirm = async () => {
    press('import-continue');
    await screen.findByTestId('import-add');
  };
  const add = async () => {
    press('import-add');
    await screen.findByTestId('import-done-title');
  };
  const addLabel = () => stripBidi(String(within(screen.getByTestId('import-add')).getByText(/./).props.children));

  it('example 1 → Add 4 trainings: exactly the reviewed batch, one batch id, Daniel only, nothing else created', async () => {
    await prepare('he');
    const before = await boundary();
    renderRouter(routes, { initialUrl: `/children/${daniel}/schedule` });
    press(await screen.findByTestId('schedule-import-text').then(() => 'schedule-import-text'));
    await analyze(WHATSAPP_EXAMPLE_1);
    await toConfirm();
    expect(text('import-confirm-title')).toBe('להוסיף ליומן של Daniel?');
    expect(text('import-confirm-s1-line')).toBe('יום שני · 12/10 · 18:40–20:10 · אימון קבוצתי');
    expect(text('import-confirm-s1-location')).toBe('📍 עין כרמל');
    expect(addLabel()).toBe('הוסף 4 אימונים');
    expect(await eventCount()).toBe(0); // the confirmation itself writes nothing
    await add();

    expect(text('import-done-title')).toBe('4 אימונים נוספו ליומן של Daniel');
    const rows = await imported();
    expect(rows.map((r) => [new Date(r.start_at).getDate(), new Date(r.start_at).getHours(), new Date(r.start_at).getMinutes(),
      r.end_at === null ? null : `${new Date(r.end_at).getHours()}:${new Date(r.end_at).getMinutes()}`])).toEqual([
      [12, 18, 40, '20:10'],
      [14, 17, 10, '18:40'],
      [15, 18, 40, '20:10'],
      [16, 14, 30, '16:0'],
    ]);
    expect(new Set(rows.map((r) => r.player_id))).toEqual(new Set([daniel]));
    expect(new Set(rows.map((r) => r.import_batch_id)).size).toBe(1);
    expect(rows.every((r) => r.location === 'עין כרמל' && r.type === 'TEAM_TRAINING' && r.sport === 'BASKETBALL')).toBe(true);
    expect(await eventCount()).toBe(4);
    expect(await boundary()).toEqual(before); // CalendarEvent ≠ PlannedWorkout ≠ TrainingSession

    press('import-view-calendar');
    for (const r of rows) await screen.findByTestId(`schedule-event-${r.id}`);
  });

  it('example 2: Tuesday kept without an end is saved with end = NULL; per-candidate GAME and an edited location persist', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_2);
    press('import-row-s2-keep-no-end');
    press('import-row-s2-edit');
    await screen.findByTestId('import-row-s2-editor');
    press('import-row-s2-edit-type-GAME');
    press('import-row-s2-edit-done');
    press('import-row-s3-edit');
    await screen.findByTestId('import-row-s3-editor');
    fireEvent.changeText(screen.getByTestId('import-row-s3-edit-location'), 'אולם העירוני');
    press('import-row-s3-edit-done');
    await toConfirm();
    expect(text('import-confirm-s2-line')).toBe('יום שלישי · 13/10 · 16:30–? · משחק');
    await add();
    expect(text('import-done-title')).toBe('3 אימונים נוספו ליומן של Daniel');

    const [sun, tue, wed] = await imported();
    expect(new Date(tue!.start_at).getHours()).toBe(16);
    expect(new Date(tue!.start_at).getMinutes()).toBe(30);
    expect(tue!.end_at).toBeNull(); // never invented
    expect(tue!.type).toBe('GAME'); // the reviewed override, not the batch default
    expect(tue!.location).toBe('עין כרמל');
    expect(tue!.notes).toBe('משחק אימון נגד העומר');
    expect(sun!.type).toBe('TEAM_TRAINING');
    expect(wed!.location).toBe('אולם העירוני');
  });

  it('CTI-07: 4 detected → remove one → exactly 3 CalendarEvents; Back to review keeps every decision', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_1);
    press('import-row-s3-remove');
    await toConfirm();
    expect(addLabel()).toBe('Add 3 trainings');
    expect(screen.queryByTestId('import-confirm-s3')).toBeNull();
    press('import-back-to-review');
    expect(text('import-row-s3-removed')).toBe('Thursday training removed from the import');
    await toConfirm();
    await add();
    expect(text('import-done-title')).toBe("3 trainings added to Daniel's calendar");
    expect((await imported()).map((r) => new Date(r.start_at).getDate())).toEqual([12, 14, 16]);
  });

  it('duplicates and dates honour the review: Keep anyway → created; Remove from import → not; "Use 21/10 anyway" → 21/10', async () => {
    await prepare('en');
    const existing = await createCalendarEvent(db!, daniel, { type: 'TEAM_TRAINING', startAt: at(12, 18, 30), endAt: at(12, 20) }, deps);
    if (!existing.ok) throw new Error('seed failed');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze('יום שני 18:40-20:10\nיום שני 18:45-20:00\n21/10 18:00-19:00');
    press('import-row-s1-keep');
    press('import-row-s2-remove-duplicate');
    press('import-row-s3-use-date-anyway');
    await toConfirm();
    await add();
    const rows = await imported();
    expect(rows.map((r) => [new Date(r.start_at).getDate(), new Date(r.start_at).getHours(), new Date(r.start_at).getMinutes()])).toEqual([
      [12, 18, 40],
      [21, 18, 0],
    ]);
    expect(await eventCount()).toBe(3); // the seeded event is untouched
  });

  it('all or nothing: a candidate refused at save time → ZERO CalendarEvents and a clear message', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_1);
    press('import-row-s3-edit');
    await screen.findByTestId('import-row-s3-editor');
    press('import-row-s3-edit-type-GAME');
    press('import-row-s3-edit-done');
    await toConfirm();
    // GAME is deactivated after the review: the 3rd of 4 candidates can no longer be saved.
    await db!.runAsync("UPDATE activity_types SET active = 0 WHERE id = 'GAME'");
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    press('import-add');
    expect(await screen.findByTestId('import-save-error')).toBeTruthy();
    expect(text('import-save-error')).toBe('לא נשמר דבר. כדאי לנסות שוב.');
    expect(await eventCount()).toBe(0);
    expect(screen.queryByTestId('import-done')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[calendarImport] save failed', expect.objectContaining({ typeId: 'GAME' }));
  });

  it('Undo Import removes exactly this batch; an unrelated event stays', async () => {
    await prepare('en');
    const other = await createCalendarEvent(db!, daniel, { type: 'GYM', startAt: at(13, 7), endAt: at(13, 8) }, deps);
    if (!other.ok) throw new Error('seed failed');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_1);
    await toConfirm();
    await add();
    expect(await eventCount()).toBe(5);
    press('import-undo');
    await screen.findByTestId('import-undone-title');
    expect(text('import-undone-title')).toBe('Import undone');
    expect(text('import-undone-body')).toBe('The added trainings were removed from the calendar.');
    expect(await eventCount()).toBe(1);
    expect((await db!.getFirstAsync<{ id: string }>('SELECT id FROM calendar_events'))!.id).toBe(other.event.id);
    press('import-view-calendar');
    await screen.findByTestId(`schedule-event-${other.event.id}`);
  });

  it('Undo is never silently complete: an edited and a completed imported event are kept and counted', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: importUrl() });
    await analyze(WHATSAPP_EXAMPLE_1);
    await toConfirm();
    await add();
    const [mon, wed] = await imported();
    const later = { clock: { wallNow: () => NOW + 60_000, monotonicNow: () => 0 } };
    const edited = await updateCalendarEvent(db!, daniel, mon!.id, { type: 'TEAM_TRAINING', sport: 'BASKETBALL', startAt: mon!.start_at, endAt: mon!.end_at, notes: 'moved gym' }, later);
    if (!edited.ok) throw new Error('edit failed');
    await markCalendarEventCompleted(db!, daniel, wed!.id, later);
    press('import-undo');
    await screen.findByTestId('import-undone-title');
    expect(text('import-undone-title')).toBe('Import partly undone');
    expect(text('import-undone-body')).toBe('2 removed. 2 kept because they were changed or completed after the import.');
    expect((await imported()).map((r) => r.id).sort()).toEqual([mon!.id, wed!.id].sort());
  });
});
