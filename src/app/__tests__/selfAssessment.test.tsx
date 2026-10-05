import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { ScrollView, StyleSheet } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as players from '@/data/local/players/playerRepository';
import type { PlayerProfileInput } from '@/data/local/players/playerRepository';
import * as selfAssessments from '@/data/local/selfAssessments/selfAssessmentRepository';
import type { Uuid } from '@/domain/ids';
import { LRI, PDI, stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { spacing } from '@/ui/theme';

import EditPlayerScreen from '../children/[id]';
import SelfAssessmentHistoryScreen from '../children/[id]/self-assessments/index';
import NewSelfAssessmentScreen from '../children/[id]/self-assessments/new';
import PlayersScreen from '../children/index';
import NewPlayerScreen from '../children/new';
import HomeScreen from '../index';
import RootLayout from '../_layout';

// The device's bottom inset; 0 unless a test sets it.
let mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  'children/index': PlayersScreen,
  'children/new': NewPlayerScreen,
  'children/[id]': EditPlayerScreen,
  'children/[id]/self-assessments/index': SelfAssessmentHistoryScreen,
  'children/[id]/self-assessments/new': NewSelfAssessmentScreen,
};

const CATEGORIES = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];
const HE_LABELS = ['קליעה', 'כדרור', 'מסירות', 'סיומת ליד הסל', 'הגנה', 'מהירות ותנועה'];
const EN_LABELS = ['Shooting', 'Ball Handling', 'Passing', 'Finishing', 'Defense', 'Speed & Movement'];

// Local wall-clock instants (timezone-independent): the same local day, two times.
const MORNING = new Date(2026, 9, 4, 9, 5).getTime();
const EVENING = new Date(2026, 9, 4, 18, 30).getTime();

let db: ReturnType<typeof openNodeSqlite> | null = null;
let gal: Uuid;
let noa: Uuid;
const seedIds = createSequentialIdService();
const seedClock = { wallNow: () => MORNING, monotonicNow: () => 0 };

async function prepare(language: 'he' | 'en', path = ':memory:') {
  mockInsets = { top: 0, left: 0, right: 0, bottom: 0 };
  await prepareApp(language);
  const opened = openNodeSqlite(path);
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(EVENING);
  const seed = async (input: PlayerProfileInput) => {
    const result = await players.createPlayer(opened, input, { ids: seedIds, clock: seedClock });
    if (!result.ok) throw new Error('seed failed');
    return result.profile.player.id;
  };
  gal = await seed({
    player: { name: 'Gal', dateOfBirth: { year: 2015, month: 7, day: 9 } },
    basketball: { primaryPosition: 'PG' },
  });
  noa = await seed({
    player: { name: 'Noa', dateOfBirth: { year: 2016, month: 1, day: 2 } },
    basketball: null,
  });
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

const assessmentCount = async () =>
  (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM self_assessments'))!.n;
const ratingCount = async () =>
  (await db!.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM self_assessment_ratings'))!.n;
/** Seeds a saved assessment through the real repository at `takenAt`. */
async function seedAssessment(values: number[], takenAt: number, playerId: Uuid = gal) {
  const result = await selfAssessments.createSelfAssessment(
    db!,
    playerId,
    'BASKETBALL',
    CATEGORIES.map((category, i) => ({ category, rating: values[i] })),
    { ids: seedIds, clock: { wallNow: () => takenAt, monotonicNow: () => 0 } },
  );
  if (!result.ok) throw new Error('seed failed');
  return result.assessment;
}

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const choose = (category: string, rating: number) =>
  fireEvent.press(screen.getByTestId(`self-assessment-${category}-${rating}`));
const chooseAll = (values: number[]) => CATEGORIES.forEach((c, i) => choose(c, values[i]!));
const isSelected = (category: string, rating: number) =>
  screen.getByTestId(`self-assessment-${category}-${rating}`).props.accessibilityState?.selected === true;
const selectedOf = (category: string) => [1, 2, 3, 4, 5].filter((r) => isSelected(category, r));

async function openNew(language: 'he' | 'en' = 'he') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments/new` });
  await screen.findByTestId('self-assessment-save');
  return app;
}

describe('entry from Edit Player', () => {
  it('a Basketball player has a separate Self-assessment section that opens the history', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: `/children/${gal}` });
    expect(await screen.findByDisplayValue('Gal')).toBeTruthy(); // Edit still works on the same URL
    expect(app.getPathname()).toBe(`/children/${gal}`);
    const section = await screen.findByTestId('self-assessment-section');
    expect(within(section).getByText('הערכה עצמית')).toBeTruthy();
    expect(await screen.findByTestId('self-assessment-none')).toBeTruthy();
    expect(text('self-assessment-none')).toBe('עדיין אין הערכה עצמית.');
    // Outside the profile form: after Save and Cancel, never inside a profile section.
    for (const id of ['player-section-personal', 'player-section-sport', 'player-section-basketball']) {
      expect(within(screen.getByTestId(id)).queryByTestId('self-assessment-section')).toBeNull();
    }
    const order = screen
      .getAllByTestId(/^(player-save|player-cancel|self-assessment-section)$/)
      .map((n) => n.props.testID);
    expect(order).toEqual(['player-save', 'player-cancel', 'self-assessment-section']);
    // No answers on the profile screen.
    expect(screen.queryByText(/\/5/)).toBeNull();

    fireEvent.press(screen.getByTestId('self-assessment-open'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
  });

  it('shows when the latest assessment was taken (local date and time), never its answers', async () => {
    await prepare('en');
    await seedAssessment([1, 2, 3, 4, 5, 1], MORNING);
    await seedAssessment([2, 2, 2, 2, 2, 2], EVENING);
    renderRouter(routes, { initialUrl: `/children/${gal}` });
    expect(await screen.findByTestId('self-assessment-latest')).toBeTruthy();
    expect(stripBidi(text('self-assessment-latest'))).toBe('Latest: 4 October 2026 at 18:30');
    expect(screen.queryByText(/\/5/)).toBeNull();
  });

  it('a player without Basketball has no Self-assessment at all (no teaser, no disabled entry)', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: `/children/${noa}` });
    expect(await screen.findByDisplayValue('Noa')).toBeTruthy();
    expect(screen.queryByTestId('self-assessment-section')).toBeNull();
    expect(screen.queryByText(/הערכה עצמית/)).toBeNull();
  });

  it('Edit Player save and cancel still work with the section present', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: `/children/${gal}` });
    expect(await screen.findByDisplayValue('Gal')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('player-name'), 'Gal C');
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect((await players.getPlayer(db!, gal))!.player.name).toBe('Gal C');
    expect(await assessmentCount()).toBe(0);
  });
});

describe('navigation through the real route stack (physical-gate defect)', () => {
  /** Players → Edit → History → New, exactly as a user taps through. */
  async function walkToNew(language: 'he' | 'en') {
    await prepare(language);
    const app = renderRouter(routes, { initialUrl: '/children' });
    fireEvent.press(await screen.findByTestId(`player-row-${gal}`));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
    fireEvent.press(await screen.findByTestId('self-assessment-open'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    fireEvent.press(await screen.findByTestId('self-assessment-new'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments/new`));
    await screen.findByTestId('self-assessment-save');
    return app;
  }

  it.each(['he', 'en'] as const)(
    '%s: Edit → History → New → Save lands on History (not Edit), showing the new assessment',
    async (language) => {
      const app = await walkToNew(language);
      const back = jest.spyOn(router, 'back');
      const dismissTo = jest.spyOn(router, 'dismissTo');
      const replace = jest.spyOn(router, 'replace');
      chooseAll([3, 4, 2, 5, 1, 3]);
      fireEvent.press(screen.getByTestId('self-assessment-save'));
      await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
      // One plain step back (the native stack pops exactly New) — no pop-to or replace.
      expect(back).toHaveBeenCalledTimes(1);
      expect(dismissTo).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      back.mockRestore();
      expect(await screen.findAllByTestId(/^self-assessment-entry-/)).toHaveLength(1);
      expect(screen.queryByTestId('player-name')).toBeNull();
      expect(await assessmentCount()).toBe(1);
      // One step back from History is Edit: New was replaced, not left on the stack.
      act(() => router.back());
      await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
    },
  );

  it('Edit → History → New → Cancel lands on History; nothing written', async () => {
    const app = await walkToNew('he');
    const back = jest.spyOn(router, 'back');
    fireEvent.press(screen.getByTestId('self-assessment-cancel'));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    back.mockRestore();
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(await assessmentCount()).toBe(0);
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
  });

  it('opened without History underneath (deep link): Save replaces New with History', async () => {
    const app = await openNew('he');
    const back = jest.spyOn(router, 'back');
    chooseAll([2, 2, 2, 2, 2, 2]);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(back).not.toHaveBeenCalled();
    expect(await screen.findAllByTestId(/^self-assessment-entry-/)).toHaveLength(1);
  });

  it('a second assessment from the same walk also lands on History, newest first', async () => {
    const app = await walkToNew('en');
    chooseAll([1, 1, 1, 1, 1, 1]);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    fireEvent.press(await screen.findByTestId('self-assessment-new'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments/new`));
    chooseAll([5, 5, 5, 5, 5, 5]);
    fireEvent.press(await screen.findByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    await waitFor(() => expect(screen.getAllByTestId(/^self-assessment-entry-/)).toHaveLength(2));
    act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}`));
  });
});

describe('history', () => {
  it('empty: a clean empty state and a way to take the first one', async () => {
    await prepare('he');
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    expect(await screen.findByTestId('self-assessment-empty')).toBeTruthy();
    expect(screen.getByText('עדיין אין הערכה עצמית.')).toBeTruthy();
    expect(screen.getByText('אפשר להתחיל בהערכה הראשונה.')).toBeTruthy();
    expect(screen.getByText('Gal')).toBeTruthy();
    expect(screen.queryAllByTestId(/^self-assessment-entry-/)).toHaveLength(0);
    fireEvent.press(screen.getByText('הערכה ראשונה'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments/new`));
  });

  it('Hebrew: newest first, local date + time, every category as an LTR n/5 in canonical order', async () => {
    await prepare('he');
    const morning = await seedAssessment([1, 2, 3, 4, 5, 1], MORNING);
    const evening = await seedAssessment([5, 4, 3, 2, 1, 5], EVENING);
    renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    await screen.findByTestId(`self-assessment-entry-${evening.id}`);

    const entries = screen.getAllByTestId(/^self-assessment-entry-/).map((n) => n.props.testID);
    expect(entries).toEqual([`self-assessment-entry-${evening.id}`, `self-assessment-entry-${morning.id}`]);
    // Same day, told apart by the local time.
    expect(text(`self-assessment-taken-at-${evening.id}`)).toBe('4 באוקטובר 2026 בשעה 18:30');
    expect(text(`self-assessment-taken-at-${morning.id}`)).toBe('4 באוקטובר 2026 בשעה 09:05');

    const entry = within(screen.getByTestId(`self-assessment-entry-${evening.id}`));
    expect(HE_LABELS.every((label) => entry.getByText(label))).toBe(true);
    const shown = entry.getAllByTestId(new RegExp(`^self-assessment-${evening.id}-`));
    expect(shown.map((n) => n.props.testID.split('-').pop())).toEqual(CATEGORIES);
    expect(shown.map((n) => String(n.props.children))).toEqual(
      [5, 4, 3, 2, 1, 5].map((r) => `${LRI}${r}/5${PDI}`),
    );
  });

  it('English labels and values', async () => {
    await prepare('en');
    const saved = await seedAssessment([3, 3, 4, 4, 2, 1], EVENING);
    renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    await screen.findByTestId(`self-assessment-entry-${saved.id}`);
    expect(EN_LABELS.every((label) => screen.getByText(label))).toBe(true);
    expect(text(`self-assessment-taken-at-${saved.id}`)).toBe('4 October 2026 at 18:30');
    expect(stripBidi(text(`self-assessment-${saved.id}-FINISHING`))).toBe('4/5');
    expect(screen.getByText('New self-assessment')).toBeTruthy();
  });

  it('shows no total, average, percentage, grade, trend, comparison, edit or delete', async () => {
    await prepare('he');
    const first = await seedAssessment([1, 1, 1, 1, 1, 1], MORNING);
    const second = await seedAssessment([5, 5, 5, 5, 5, 5], EVENING);
    renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    await screen.findByTestId(`self-assessment-entry-${second.id}`);
    // Exactly one n/5 per category per assessment; nothing else numeric about the answers.
    expect(screen.getAllByText(/\/5/)).toHaveLength(12);
    expect(screen.queryByText(/%|ממוצע|סה״כ|סך הכול|ציון|השוואה|↑|↓|עריכה|מחיקה/)).toBeNull();
    expect(screen.queryAllByTestId(/edit|delete|remove|average|total|score/i)).toHaveLength(0);
    expect(
      within(screen.getByTestId(`self-assessment-entry-${first.id}`)).queryAllByRole('button'),
    ).toHaveLength(0);
  });

  it('a corrupted history shows a safe message and no partial entries', async () => {
    await prepare('he');
    const saved = await seedAssessment([3, 3, 3, 3, 3, 3], MORNING);
    await seedAssessment([4, 4, 4, 4, 4, 4], EVENING);
    await db!.runAsync('DELETE FROM self_assessment_ratings WHERE assessment_id = ? AND category = ?', [
      saved.id,
      'SPEED',
    ]);
    renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    expect(await screen.findByTestId('self-assessment-history-error')).toBeTruthy();
    expect(text('self-assessment-history-error')).toBe(
      'חלק מנתוני ההערכה העצמית שמורים בצורה לא תקינה ולא ניתן להציג אותם.',
    );
    expect(screen.queryAllByTestId(/^self-assessment-entry-/)).toHaveLength(0);
    expect(screen.queryByText(/MISSING|SelfAssessmentDataError|SPEED/)).toBeNull();
  });

  it('a player without Basketball, opened directly, gets a safe message and no form', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: `/children/${noa}/self-assessments` });
    expect(await screen.findByText('Self-assessment is available for basketball players.')).toBeTruthy();
    expect(screen.queryByTestId('self-assessment-new')).toBeNull();
  });

  it('an unknown player gets a safe message', async () => {
    await prepare('he');
    renderRouter(routes, { initialUrl: '/children/00000000-0000-4000-8000-000000000999/self-assessments' });
    expect(await screen.findByText('השחקן לא נמצא.')).toBeTruthy();
  });
});

describe('new self-assessment', () => {
  it('Hebrew: six categories, each a 1→5 left-to-right scale with the two end anchors', async () => {
    await openNew('he');
    expect(screen.getByText('אין תשובות נכונות או לא נכונות. רק איך אני רואה את עצמי היום.')).toBeTruthy();
    for (const [i, category] of CATEGORIES.entries()) {
      const scale = screen.getByTestId(`self-assessment-${category}`);
      expect(within(scale).getByText(HE_LABELS[i]!)).toBeTruthy();
      const choices = within(scale).getAllByRole('radio');
      expect(choices.map((c) => c.props.testID)).toEqual(
        [1, 2, 3, 4, 5].map((r) => `self-assessment-${category}-${r}`),
      );
      const row = StyleSheet.flatten(screen.getByTestId(`self-assessment-${category}-scale`).props.style);
      expect(row).toMatchObject({ flexDirection: 'row', direction: 'ltr' });
      expect(text(`self-assessment-${category}-anchor-low`)).toBe('יש לי הרבה מקום להשתפר');
      expect(text(`self-assessment-${category}-anchor-high`)).toBe('זו אחת החוזקות שלי');
      expect(
        StyleSheet.flatten(screen.getByTestId(`self-assessment-${category}-anchors`).props.style),
      ).toMatchObject({
        flexDirection: 'row',
        direction: 'ltr',
      });
    }
    // Only the two ends carry anchors.
    expect(screen.getAllByText('יש לי הרבה מקום להשתפר')).toHaveLength(6);
    expect(screen.getAllByText('זו אחת החוזקות שלי')).toHaveLength(6);
    // Accessibility: category + rating + maximum, as radio choices.
    const three = screen.getByTestId('self-assessment-PASSING-3');
    expect(stripBidi(three.props.accessibilityLabel)).toBe('מסירות, 3 מתוך 5');
    expect(three.props.accessibilityRole).toBe('radio');
    expect(stripBidi(text('self-assessment-progress'))).toBe('נענו: 0/6');
  });

  it('English: labels, anchors, LTR scale and accessibility', async () => {
    await openNew('en');
    for (const [i, category] of CATEGORIES.entries()) {
      expect(within(screen.getByTestId(`self-assessment-${category}`)).getByText(EN_LABELS[i]!)).toBeTruthy();
      expect(
        StyleSheet.flatten(screen.getByTestId(`self-assessment-${category}-scale`).props.style),
      ).toMatchObject({
        direction: 'ltr',
      });
    }
    expect(screen.getAllByText('Lots of room to improve')).toHaveLength(6);
    expect(screen.getAllByText('One of my strengths')).toHaveLength(6);
    expect(stripBidi(screen.getByTestId('self-assessment-SPEED-5').props.accessibilityLabel)).toBe(
      'Speed & Movement, 5 of 5',
    );
    expect(stripBidi(text('self-assessment-progress'))).toBe('Answered: 0/6');
  });

  it('selecting, then changing, a choice replaces it; progress counts answered categories (LTR)', async () => {
    await openNew('he');
    choose('SHOOTING', 2);
    expect(selectedOf('SHOOTING')).toEqual([2]);
    expect(screen.getByTestId('self-assessment-SHOOTING-2').props.accessibilityState.checked).toBe(true);
    choose('SHOOTING', 4);
    expect(selectedOf('SHOOTING')).toEqual([4]);
    choose('DEFENSE', 1);
    expect(text('self-assessment-progress')).toContain(`${LRI}2/6${PDI}`);
    expect(stripBidi(text('self-assessment-progress'))).toBe('נענו: 2/6');
  });

  it('Save with unanswered categories writes nothing, keeps every choice and marks what is missing', async () => {
    const app = await openNew('he');
    choose('SHOOTING', 4);
    choose('PASSING', 2);
    choose('SPEED', 5);
    fireEvent.press(screen.getByTestId('self-assessment-save'));

    expect(await screen.findByTestId('self-assessment-unanswered')).toBeTruthy();
    expect(text('self-assessment-unanswered')).toBe(
      'כמה תחומים עדיין בלי תשובה. אפשר לבחור מספר בכל אחד מהם, והבחירות שכבר נעשו נשמרו.',
    );
    for (const category of ['BALL_HANDLING', 'FINISHING', 'DEFENSE']) {
      expect(text(`self-assessment-${category}-error`)).toBe('עוד לא נבחר מספר');
    }
    for (const category of ['SHOOTING', 'PASSING', 'SPEED']) {
      expect(screen.queryByTestId(`self-assessment-${category}-error`)).toBeNull();
    }
    expect([selectedOf('SHOOTING'), selectedOf('PASSING'), selectedOf('SPEED')]).toEqual([[4], [2], [5]]);
    expect(app.getPathname()).toBe(`/children/${gal}/self-assessments/new`);
    expect(await assessmentCount()).toBe(0);
    expect(await ratingCount()).toBe(0);

    // Answering a missing category clears its mark; completing it saves.
    choose('BALL_HANDLING', 3);
    expect(screen.queryByTestId('self-assessment-BALL_HANDLING-error')).toBeNull();
    choose('FINISHING', 1);
    choose('DEFENSE', 3);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(await assessmentCount()).toBe(1);
    const [saved] = await selfAssessments.listSelfAssessments(db!, gal, 'BASKETBALL');
    expect(saved!.ratings.map((r) => r.rating)).toEqual([4, 3, 2, 1, 3, 5]);
  });

  it('a complete Save creates one assessment, taken now, and the history shows it first', async () => {
    await prepare('en');
    const older = await seedAssessment([1, 1, 1, 1, 1, 1], MORNING);
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    fireEvent.press(await screen.findByText('New self-assessment'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments/new`));
    chooseAll([5, 4, 3, 2, 1, 2]);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));

    const history = await selfAssessments.listSelfAssessments(db!, gal, 'BASKETBALL');
    expect(history).toHaveLength(2);
    expect(history[0]!.takenAt).toBe(EVENING); // the repository's clock, not the UI
    expect(history[1]).toEqual(older);
    await waitFor(() =>
      expect(screen.getAllByTestId(/^self-assessment-entry-/).map((n) => n.props.testID)).toEqual([
        `self-assessment-entry-${history[0]!.id}`,
        `self-assessment-entry-${older.id}`,
      ]),
    );
  });

  it('Cancel writes nothing and goes back', async () => {
    const app = await openNew('he');
    chooseAll([3, 3, 3, 3, 3, 3]);
    fireEvent.press(screen.getByTestId('self-assessment-cancel'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(await assessmentCount()).toBe(0);
    expect(await ratingCount()).toBe(0);
    expect((await players.getPlayer(db!, gal))!.player.name).toBe('Gal');
  });

  it('a rapid double Save creates exactly one assessment', async () => {
    const create = jest.spyOn(selfAssessments, 'createSelfAssessment');
    const app = await openNew('he');
    chooseAll([2, 3, 4, 5, 1, 2]);
    const save = screen.getByTestId('self-assessment-save');
    act(() => {
      fireEvent.press(save);
      fireEvent.press(save);
    });
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await assessmentCount()).toBe(1);
    expect(await ratingCount()).toBe(6);
  });

  it('while a save is pending, Save and Cancel are both disabled; one save, one navigation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = selfAssessments.createSelfAssessment;
    const create = jest.spyOn(selfAssessments, 'createSelfAssessment').mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    const app = await openNew('he');
    const newPath = `/children/${gal}/self-assessments/new`;
    chooseAll([2, 2, 2, 2, 2, 2]);
    // Opened directly (no History underneath): leaving replaces this screen with History.
    const replace = jest.spyOn(router, 'replace');
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(screen.getByText('שומר...')).toBeTruthy());

    expect(screen.getByTestId('self-assessment-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('self-assessment-cancel').props.accessibilityState.disabled).toBe(true);
    expect(app.getPathname()).toBe(newPath);

    // Cancel cannot run while the save is in flight.
    fireEvent.press(screen.getByTestId('self-assessment-cancel'));
    await act(async () => {});
    expect(app.getPathname()).toBe(newPath);
    expect(replace).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => release());
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await assessmentCount()).toBe(1);
    expect(await ratingCount()).toBe(6);
  });

  it('a storage failure keeps the screen and the choices, with a safe message; retry works', async () => {
    const app = await openNew('he');
    const run = db!.runAsync;
    jest.spyOn(db!, 'runAsync').mockImplementation(async (sql, params) => {
      if (sql.includes('INSERT INTO self_assessment_ratings')) throw new Error('SQLITE_FULL: disk is full');
      return run(sql, params);
    });
    chooseAll([4, 4, 4, 4, 4, 4]);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    expect(await screen.findByTestId('self-assessment-save-error')).toBeTruthy();
    expect(text('self-assessment-save-error')).toBe('השמירה לא הצליחה. הבחירות נשארו, אפשר לנסות שוב.');
    expect(screen.queryByText(/SQLITE|disk/)).toBeNull();
    expect(app.getPathname()).toBe(`/children/${gal}/self-assessments/new`);
    expect(CATEGORIES.map(selectedOf)).toEqual(CATEGORIES.map(() => [4]));
    expect(await assessmentCount()).toBe(0);
    expect(screen.getByTestId('self-assessment-save').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('self-assessment-cancel').props.accessibilityState.disabled).toBe(false);
    expect(await ratingCount()).toBe(0);

    (db!.runAsync as jest.Mock).mockRestore();
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    expect(await assessmentCount()).toBe(1);
  });

  it('a player without Basketball cannot save (safe message, nothing written)', async () => {
    await prepare('en');
    renderRouter(routes, { initialUrl: `/children/${noa}/self-assessments/new` });
    await screen.findByTestId('self-assessment-save');
    chooseAll([3, 3, 3, 3, 3, 3]);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    expect(await screen.findByTestId('self-assessment-save-error')).toBeTruthy();
    expect(text('self-assessment-save-error')).toBe('Self-assessment is available for basketball players.');
    expect(await assessmentCount()).toBe(0);
  });

  it('scrolls in SafeAreaScrollView: the real bottom inset is added below Save / Cancel', async () => {
    await openNew('he');
    mockInsets = { top: 0, left: 0, right: 0, bottom: 48 };
    act(() => choose('SHOOTING', 1)); // re-render with the new inset
    const scroll = screen
      .UNSAFE_getAllByType(ScrollView)
      .find((n) => n.props.testID === 'self-assessment-scroll')!;
    expect(
      screen.UNSAFE_getAllByType(SafeAreaScrollView).some((n) => n.props.testID === 'self-assessment-scroll'),
    ).toBe(true);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
      padding: spacing.lg,
      paddingBottom: spacing.lg + 48,
    });
    const order = screen
      .getAllByTestId(/^self-assessment-(SHOOTING|SPEED|save|cancel)$/)
      .map((n) => n.props.testID);
    expect(order.slice(-2)).toEqual(['self-assessment-save', 'self-assessment-cancel']);
  });
});

describe('persistence across an app restart', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'gals-sa-ui-'))));
  // This describe's afterEach runs BEFORE the file-level one, so the reopened
  // database must be closed here: Windows cannot delete a directory that holds
  // an open SQLite file (EPERM); Linux / macOS allowed it, which hid the leak.
  afterEach(async () => {
    const open = db;
    await db?.closeAsync();
    db = null;
    expect(open?.raw.isOpen ?? false).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a saved assessment is still shown after closing and reopening the database', async () => {
    const file = join(dir, 'gals_coacher.db');
    await prepare('he', file);
    const app = renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments/new` });
    await screen.findByTestId('self-assessment-save');
    chooseAll([1, 2, 3, 4, 5, 3]);
    fireEvent.press(screen.getByTestId('self-assessment-save'));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal}/self-assessments`));
    app.unmount();
    await db!.closeAsync();

    const reopened = openNodeSqlite(file);
    db = reopened;
    await reopened.execAsync('PRAGMA foreign_keys = ON');
    expect((await runMigrations(reopened, migrations)).applied).toEqual([]);
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => reopened);
    const relaunched = renderRouter(routes, { initialUrl: `/children/${gal}/self-assessments` });
    const entries = await screen.findAllByTestId(/^self-assessment-entry-/);
    expect(entries).toHaveLength(1);
    expect(
      within(entries[0]!)
        .getAllByText(/\/5/)
        .map((n) => stripBidi(String(n.props.children))),
    ).toEqual(['1/5', '2/5', '3/5', '4/5', '5/5', '3/5']);
    relaunched.unmount(); // nothing may use the database once afterEach closes it
  });
});

describe('self-assessment UI stays subjective and goes through the repository', () => {
  const files = [
    'src/features/selfAssessment/NewSelfAssessment.tsx',
    'src/features/selfAssessment/SelfAssessmentHistory.tsx',
    'src/features/selfAssessment/SelfAssessmentSection.tsx',
    'src/features/selfAssessment/selfAssessmentLabels.ts',
    'src/features/selfAssessment/formatTakenAt.ts',
    'src/ui/RatingScale.tsx',
  ];
  it.each(files)('%s', (file) => {
    const code = readFileSync(resolve(__dirname, '../../..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/measurement|comparison|MeasurementType|['"]RATING['"]/i);
    expect(code).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b|runAsync|getAllAsync|execAsync/);
    expect(code).not.toMatch(/Date\.now|newUuid|randomUUID|toISOString|getUTC|timeZone/);
    expect(code).not.toMatch(/\.reduce\(|average|\bmean\b|\btotal\b|\bsum\b|score|grade|percent/i);
  });
});
