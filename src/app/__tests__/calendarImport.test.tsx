import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
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

/** CAL-TEXT-IMPORT-001C — wizard + preview through the real route tree and real SQLite. Nothing is written. */
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
    expect(text('import-complete-body')).toBe('עדיין לא נשמר דבר ביומן.');
    expect(await eventCount()).toBe(0); // 001C never writes
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
