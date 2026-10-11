import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as repository from '@/data/local/players/playerRepository';
import type { PlayerProfileInput } from '@/data/local/players/playerRepository';
import { FSI, PDI, stripBidi } from '@/i18n/bidi';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

import EditPlayerScreen from '../children/[id]';
import PlayersScreen from '../children/index';
import NewPlayerScreen from '../children/new';
import DiagnosticsScreen from '../diagnostics';
import ExercisesScreen from '../exercises';
import HistoryScreen from '../history';
import HomeScreen from '../index';
import QuickTrainingScreen from '../quick-training';
import SettingsScreen from '../settings';
import RootLayout from '../_layout';

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  'quick-training': QuickTrainingScreen,
  exercises: ExercisesScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
  diagnostics: DiagnosticsScreen,
  'children/index': PlayersScreen,
  'children/new': NewPlayerScreen,
  'children/[id]': EditPlayerScreen,
};

// "Today" is 3 October 2026 at local noon, whatever the machine timezone.
const NOW = new Date(2026, 9, 3, 12, 0, 0).getTime();
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };

let db: ReturnType<typeof openNodeSqlite>;

/** The app opens this (in-memory) database; tests seed and inspect it directly. */
async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => db);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
}

const seedIds = createSequentialIdService();
async function seed(input: PlayerProfileInput) {
  const result = await repository.createPlayer(db, input, { ids: seedIds, clock });
  if (!result.ok) throw new Error('seed failed');
  return result.profile;
}

const text = (testID: string) => String(screen.getByTestId(testID).props.children);
const plain = (testID: string) => stripBidi(text(testID));
const valueOf = (testID: string) => screen.getByTestId(testID).props.value as string;
const selected = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.selected === true;
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
const playerCount = async () =>
  (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM players'))!.n;
const sportRowCounts = async () => ({
  player_sports: (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM player_sports'))!.n,
  profiles: (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM basketball_player_profiles'))!
    .n,
});
const selectBasketball = () => fireEvent.press(screen.getByTestId('player-sport-BASKETBALL'));

function fillDate(day: string, month: string, year: string) {
  type('player-dob-day', day);
  type('player-dob-month', month);
  type('player-dob-year', year);
}

const GAL: PlayerProfileInput = {
  player: { name: 'גל', dateOfBirth: { year: 2015, month: 7, day: 9 }, heightCm: 142 },
  basketball: {
    primaryPosition: 'PG',
    secondaryPosition: 'SG',
    dominantHand: 'RIGHT',
    experience: 'ONE_TO_TWO_YEARS',
    weeklyFrequency: 'TWO_TO_THREE',
  },
};
const NOA: PlayerProfileInput = {
  player: { name: 'נועה', dateOfBirth: { year: 2012, month: 10, day: 4 } },
  basketball: { primaryPosition: 'C' },
};

afterEach(async () => {
  jest.restoreAllMocks();
  await db.closeAsync();
});

describe('Players — Hebrew (RTL)', () => {
  beforeEach(() => prepare('he'));

  it('shows the Hebrew empty state and opens Add Player', async () => {
    const app = renderRouter(routes, { initialUrl: '/children' });
    expect(await screen.findByText('עדיין אין שחקנים')).toBeTruthy();
    expect(screen.getByText('מוסיפים שחקן ואפשר להתחיל להתאמן.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('players-add'));
    await waitFor(() => expect(app.getPathname()).toBe('/children/new'));
    for (const label of ['פרטים אישיים', 'שם', 'תאריך לידה', 'יום', 'חודש', 'שנה', 'גובה', 'ס״מ']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const label of ['ענף ספורט', 'כדורסל', 'שמירה', 'ביטול']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Basketball starts unselected: its details are hidden.
    expect(selected('player-sport-BASKETBALL')).toBe(false);
    expect(screen.queryByTestId('player-section-basketball')).toBeNull();
    selectBasketball();
    for (const label of ['פרטי כדורסל', 'אפשר לעדכן את הפרטים האלה בהמשך', 'עמדה ראשית', 'יד דומיננטית']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Removed from the Player UI.
    expect(screen.queryByText(/ניסיון|אימוני כדורסל בשבוע/)).toBeNull();
    expect(screen.queryByTestId(/^player-(experience|frequency)/)).toBeNull();
  });

  it('keeps day, month, year in that logical order (mirrored by RTL layout, never reordered)', async () => {
    renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');
    const ids = screen.getAllByTestId(/^player-dob-(day|month|year)$/).map((n) => n.props.testID);
    expect(ids).toEqual(['player-dob-day', 'player-dob-month', 'player-dob-year']);
  });

  it('creates a player with only name and date of birth; the list shows the trimmed name and derived age', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('home-players')); // Home's button (the nav bar has one too)
    fireEvent.press(await screen.findByTestId('players-add'));
    await screen.findByTestId('player-name');
    type('player-name', '  גל  ');
    fillDate('9', '7', '2015');
    fireEvent.press(screen.getByTestId('player-save'));

    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await screen.findByText('גל')).toBeTruthy();
    const [age] = screen.getAllByTestId(/^player-age-/);
    expect(stripBidi(String(age!.props.children))).toBe('גיל 11');
    expect(screen.queryAllByTestId(/^player-position-/)).toHaveLength(0);

    const [stored] = await repository.listPlayers(db);
    expect(stored!.player).toMatchObject({
      name: 'גל',
      dateOfBirth: { year: 2015, month: 7, day: 9 },
      heightCm: null,
    });
    // Basketball was never selected: a player without a sport.
    expect(stored!.basketball).toBeNull();
    expect(await sportRowCounts()).toEqual({ player_sports: 0, profiles: 0 });
  });

  it('creates a player with every field; the list shows the position with its abbreviation intact', async () => {
    const app = renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');
    type('player-name', 'נועה');
    fillDate('4', '10', '2012');
    type('player-height', '151');
    selectBasketball();
    expect(screen.getByTestId('player-section-basketball')).toBeTruthy();
    fireEvent.press(screen.getByTestId('player-primary-SF'));
    fireEvent.press(screen.getByTestId('player-secondary-PF'));
    fireEvent.press(screen.getByTestId('player-hand-LEFT'));
    fireEvent.press(screen.getByTestId('player-save'));

    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    const [stored] = await repository.listPlayers(db);
    expect(stored).toMatchObject({
      player: { name: 'נועה', heightCm: 151, dateOfBirth: { year: 2012, month: 10, day: 4 } },
      basketball: {
        primaryPosition: 'SF',
        secondaryPosition: 'PF',
        dominantHand: 'LEFT',
        experience: null,
        weeklyFrequency: null,
      },
    });
    expect(await sportRowCounts()).toEqual({ player_sports: 1, profiles: 1 });
    const id = stored!.player.id;
    // Birthday is tomorrow (4 Oct): still 13 today.
    expect(plain(`player-age-${id}`)).toBe('גיל 13');
    expect(plain(`player-position-${id}`)).toBe('SF · סמול פורוורד');
    expect(text(`player-position-${id}`)).toContain(`${FSI}SF${PDI}`);
  });

  it('lists several players independently, each with its own age and position', async () => {
    const gal = await seed(GAL);
    const noa = await seed(NOA);
    const plainPlayer = await seed({
      player: { name: 'עומר', dateOfBirth: { year: 2016, month: 10, day: 3 } },
      basketball: {}, // Basketball with every answer empty
    });
    const noSport = await seed({
      player: { name: 'ליה', dateOfBirth: { year: 2017, month: 1, day: 1 } },
      basketball: null,
    });
    renderRouter(routes, { initialUrl: '/children' });
    expect(await screen.findByText('גל')).toBeTruthy();
    expect(screen.getByText('נועה')).toBeTruthy();
    expect(screen.getByText('עומר')).toBeTruthy();
    expect(plain(`player-age-${gal.player.id}`)).toBe('גיל 11');
    expect(plain(`player-age-${noa.player.id}`)).toBe('גיל 13');
    expect(plain(`player-age-${plainPlayer.player.id}`)).toBe('גיל 10'); // birthday today
    expect(plain(`player-position-${gal.player.id}`)).toBe('PG · רכז');
    expect(plain(`player-position-${noa.player.id}`)).toBe('C · סנטר');
    expect(screen.queryByTestId(`player-position-${plainPlayer.player.id}`)).toBeNull();
    // Without a sport: name and age only.
    expect(screen.getByText('ליה')).toBeTruthy();
    expect(plain(`player-age-${noSport.player.id}`)).toBe('גיל 9');
    expect(screen.queryByTestId(`player-position-${noSport.player.id}`)).toBeNull();
  });

  it('opens Edit prefilled, saves changes, and the list refreshes on return', async () => {
    const gal = await seed(GAL);
    const app = renderRouter(routes, { initialUrl: '/children' });
    fireEvent.press(await screen.findByTestId(`player-row-${gal.player.id}`));
    await waitFor(() => expect(app.getPathname()).toBe(`/children/${gal.player.id}`));

    expect(await screen.findByDisplayValue('גל')).toBeTruthy();
    expect([valueOf('player-dob-day'), valueOf('player-dob-month'), valueOf('player-dob-year')]).toEqual([
      '9',
      '7',
      '2015',
    ]);
    expect(valueOf('player-height')).toBe('142');
    for (const chip of [
      'player-sport-BASKETBALL',
      'player-primary-PG',
      'player-secondary-SG',
      'player-hand-RIGHT',
    ]) {
      expect(selected(chip)).toBe(true);
    }

    type('player-name', 'גל כהן');
    fillDate('1', '1', '2014');
    type('player-height', '150');
    fireEvent.press(screen.getByTestId('player-primary-PG')); // clear primary (secondary cleared + hidden)
    fireEvent.press(screen.getByTestId('player-hand-BOTH')); // change
    fireEvent.press(screen.getByTestId('player-save'));

    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await screen.findByText('גל כהן')).toBeTruthy();
    expect(plain(`player-age-${gal.player.id}`)).toBe('גיל 12');
    expect(screen.queryByTestId(`player-position-${gal.player.id}`)).toBeNull();
    expect(await repository.getPlayer(db, gal.player.id)).toMatchObject({
      player: {
        id: gal.player.id,
        name: 'גל כהן',
        heightCm: 150,
        dateOfBirth: { year: 2014, month: 1, day: 1 },
      },
      basketball: {
        primaryPosition: null,
        secondaryPosition: null,
        dominantHand: 'BOTH',
        // Not shown any more and not sent: the stored values are kept.
        experience: 'ONE_TO_TWO_YEARS',
        weeklyFrequency: 'TWO_TO_THREE',
      },
    });
  });

  it('adds, changes and removes height through Edit', async () => {
    const noa = await seed(NOA);
    const app = renderRouter(routes, { initialUrl: '/children' });
    const editHeight = async (height: string) => {
      fireEvent.press(await screen.findByTestId(`player-row-${noa.player.id}`));
      await screen.findByDisplayValue('נועה');
      type('player-height', height);
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      return (await repository.getPlayer(db, noa.player.id))!.player.heightCm;
    };
    expect(await editHeight('148')).toBe(148);
    expect(await editHeight('149')).toBe(149);
    expect(await editHeight('')).toBeNull();
  });

  it('CAL-SCHEDULE-IMPORT-002A: Team name is optional — added, changed and cleared through Edit (Hebrew)', async () => {
    const noa = await seed(NOA);
    expect(noa.player.teamName).toBeNull(); // a Player without a team keeps working
    const app = renderRouter(routes, { initialUrl: '/children' });
    const editTeam = async (team: string) => {
      fireEvent.press(await screen.findByTestId(`player-row-${noa.player.id}`));
      await screen.findByDisplayValue('נועה');
      expect(screen.getByText('שם הקבוצה (לא חובה)')).toBeTruthy();
      type('player-team-name', team);
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      return (await repository.getPlayer(db, noa.player.id))!.player.teamName;
    };
    expect(await editTeam('  הפועל חוף הכרמל ')).toBe('הפועל חוף הכרמל'); // stored trimmed
    fireEvent.press(await screen.findByTestId(`player-row-${noa.player.id}`));
    expect(await screen.findByDisplayValue('הפועל חוף הכרמל')).toBeTruthy(); // Edit shows it
    fireEvent.press(screen.getByTestId('player-cancel'));
    expect(await editTeam('הפועל חוף הכרמל מעיין צבי')).toBe('הפועל חוף הכרמל מעיין צבי');
    expect(await editTeam('   ')).toBeNull(); // cleared
  });

  describe('validation (localized, nothing saved, values kept)', () => {
    async function submitNew(fill: () => void) {
      const app = renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      fill();
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(screen.getByText('שמירה')).toBeTruthy());
      expect(app.getPathname()).toBe('/children/new');
      expect(await playerCount()).toBe(0);
    }

    it('requires name and date of birth', async () => {
      await submitNew(() => type('player-name', '   '));
      expect(text('player-name-error')).toBe('צריך למלא שם.');
      expect(text('player-dob-error')).toBe('צריך למלא תאריך לידה.');
    });

    it('rejects an impossible date and keeps what was typed', async () => {
      await submitNew(() => {
        type('player-name', 'גל');
        fillDate('31', '2', '2015');
      });
      expect(text('player-dob-error')).toBe('התאריך לא קיים. כדאי לבדוק יום, חודש ושנה.');
      expect(valueOf('player-name')).toBe('גל');
      expect([valueOf('player-dob-day'), valueOf('player-dob-month'), valueOf('player-dob-year')]).toEqual([
        '31',
        '2',
        '2015',
      ]);
    });

    it('rejects a partly filled date as invalid', async () => {
      await submitNew(() => {
        type('player-name', 'גל');
        type('player-dob-year', '2015');
      });
      expect(text('player-dob-error')).toBe('התאריך לא קיים. כדאי לבדוק יום, חודש ושנה.');
    });

    it('rejects a future date of birth (tomorrow)', async () => {
      await submitNew(() => {
        type('player-name', 'גל');
        fillDate('4', '10', '2026');
      });
      expect(text('player-dob-error')).toBe('תאריך הלידה לא יכול להיות בעתיד.');
    });

    it.each(['0', '-5', '142.5', 'abc'])('rejects height %p', async (height) => {
      await submitNew(() => {
        type('player-name', 'גל');
        fillDate('9', '7', '2015');
        type('player-height', height);
      });
      expect(text('player-height-error')).toBe('גובה בס״מ, במספר שלם וגדול מ־0.');
      expect(valueOf('player-height')).toBe(height);
    });

    it('still lets the domain reject a secondary position equal to the primary', async () => {
      await submitNew(() => {
        type('player-name', 'גל');
        fillDate('9', '7', '2015');
        selectBasketball();
        fireEvent.press(screen.getByTestId('player-primary-PF'));
        fireEvent.press(screen.getByTestId('player-secondary-PF')); // the primary is not removed from the list
      });
      expect(text('player-secondary-error')).toBe('העמדה המשנית צריכה להיות שונה מהעמדה הראשית.');
      expect(selected('player-primary-PF')).toBe(true);
      expect(selected('player-secondary-PF')).toBe(true);
    });

    it('never shows internal codes', async () => {
      await submitNew(() => type('player-height', '0'));
      expect(screen.queryByText(/REQUIRED|INVALID_DATE|NOT_POSITIVE_INTEGER|IN_FUTURE/)).toBeNull();
    });
  });

  describe('save protection', () => {
    it('disables Save and shows the saving label while a save is pending', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const real = repository.createPlayer;
      jest.spyOn(repository, 'createPlayer').mockImplementation(async (...args) => {
        await gate;
        return real(...args);
      });
      const app = renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      type('player-name', 'גל');
      fillDate('9', '7', '2015');
      fireEvent.press(screen.getByTestId('player-save'));

      await waitFor(() => expect(screen.getByText('שומר...')).toBeTruthy());
      expect(screen.getByTestId('player-save').props.accessibilityState.disabled).toBe(true);
      fireEvent.press(screen.getByTestId('player-save'));

      await act(async () => release());
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect(repository.createPlayer).toHaveBeenCalledTimes(1);
      expect(await playerCount()).toBe(1);
    });

    it('a rapid double press creates exactly one player', async () => {
      const create = jest.spyOn(repository, 'createPlayer');
      const app = renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      type('player-name', 'גל');
      fillDate('9', '7', '2015');
      const save = screen.getByTestId('player-save');
      // Both presses land before React re-renders the disabled button.
      act(() => {
        fireEvent.press(save);
        fireEvent.press(save);
      });
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect(create).toHaveBeenCalledTimes(1);
      expect(await playerCount()).toBe(1);
    });
  });

  describe('errors', () => {
    it('a storage failure keeps the form and its values, with a localized message only', async () => {
      const realRun = db.runAsync;
      jest.spyOn(db, 'runAsync').mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO players')) throw new Error('SQLITE_FULL: database or disk is full');
        return realRun(sql, params);
      });
      const app = renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      type('player-name', 'גל');
      fillDate('9', '7', '2015');
      fireEvent.press(screen.getByTestId('player-save'));

      expect(await screen.findByTestId('player-save-error')).toBeTruthy();
      expect(text('player-save-error')).toBe('השמירה לא הצליחה. הפרטים נשארו בטופס, אפשר לנסות שוב.');
      expect(screen.queryByText(/SQLITE|disk is full/)).toBeNull();
      expect(app.getPathname()).toBe('/children/new');
      expect(valueOf('player-name')).toBe('גל');
      expect(screen.getByTestId('player-save').props.accessibilityState.disabled).toBe(false);
      expect(await playerCount()).toBe(0);

      // Retrying after the failure works.
      (db.runAsync as jest.Mock).mockRestore();
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect(await playerCount()).toBe(1);
    });

    it('an unknown player id shows a safe message and a way back', async () => {
      const app = renderRouter(routes, { initialUrl: '/children/00000000-0000-4000-8000-0000000000ff' });
      expect(await screen.findByText('השחקן לא נמצא.')).toBeTruthy();
      expect(screen.queryByTestId('player-name')).toBeNull();
      fireEvent.press(screen.getByTestId('player-back'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect(await playerCount()).toBe(0);
    });

    it('malformed stored data fails the list safely, without raw details', async () => {
      const gal = await seed(GAL);
      await seed(NOA);
      await db.runAsync(
        "UPDATE basketball_player_profiles SET primary_position = 'CENTER' WHERE player_id = ?",
        [gal.player.id],
      );
      renderRouter(routes, { initialUrl: '/children' });
      expect(
        await screen.findByText('חלק מנתוני השחקנים שמורים בצורה לא תקינה ולא ניתן להציג אותם.'),
      ).toBeTruthy();
      expect(screen.queryByText('נועה')).toBeNull(); // not silently omitted: the whole list fails
      expect(screen.queryByText(/CENTER|PlayerDataError|primaryPosition/)).toBeNull();
    });

    it('malformed stored data fails the edit screen safely', async () => {
      const gal = await seed(GAL);
      await db.runAsync("UPDATE players SET date_of_birth = '2025-02-29' WHERE id = ?", [gal.player.id]);
      renderRouter(routes, { initialUrl: `/children/${gal.player.id}` });
      expect(
        await screen.findByText('חלק מנתוני השחקנים שמורים בצורה לא תקינה ולא ניתן להציג אותם.'),
      ).toBeTruthy();
      expect(screen.queryByTestId('player-name')).toBeNull();
    });

    it.each(['2026-10-04', '2099-01-01'])(
      'a valid but future stored date of birth (%s) fails the list safely instead of crashing',
      async (futureDob) => {
        const gal = await seed(GAL);
        await seed(NOA);
        await db.runAsync('UPDATE players SET date_of_birth = ? WHERE id = ?', [futureDob, gal.player.id]);
        renderRouter(routes, { initialUrl: '/children' });
        expect(
          await screen.findByText('חלק מנתוני השחקנים שמורים בצורה לא תקינה ולא ניתן להציג אותם.'),
        ).toBeTruthy();
        expect(screen.queryByText('נועה')).toBeNull(); // no partial list
        expect(screen.queryAllByTestId(/^player-row-/)).toHaveLength(0);
        expect(screen.queryByText(/RangeError|ageOn|before the date of birth/)).toBeNull();
      },
    );

    it('PlayerDataError during an edit save shows the data message and keeps the form', async () => {
      const gal = await seed(GAL);
      const app = renderRouter(routes, { initialUrl: `/children/${gal.player.id}` });
      await screen.findByDisplayValue('גל');
      // The stored profile row disappears after the form loaded: the update's re-read fails.
      await db.runAsync('DELETE FROM basketball_player_profiles WHERE player_id = ?', [gal.player.id]);
      type('player-name', 'גל כהן');
      type('player-height', '150');
      fireEvent.press(screen.getByTestId('player-save'));

      expect(await screen.findByTestId('player-save-error')).toBeTruthy();
      expect(text('player-save-error')).toBe('חלק מנתוני השחקנים שמורים בצורה לא תקינה ולא ניתן להציג אותם.');
      expect(app.getPathname()).toBe(`/children/${gal.player.id}`);
      expect(valueOf('player-name')).toBe('גל כהן');
      expect(valueOf('player-height')).toBe('150');
      expect(screen.getByTestId('player-save').props.accessibilityState.disabled).toBe(false);
      expect(screen.queryByText(/PlayerDataError|MISSING_ROW|basketballProfile|Malformed/)).toBeNull();
      // The failed update was rolled back.
      expect(
        await db.getFirstAsync('SELECT name, height_cm FROM players WHERE id = ?', [gal.player.id]),
      ).toEqual({
        name: 'גל',
        height_cm: 142,
      });
    });
  });

  describe('sport selection', () => {
    it('select → fill → unselect before saving persists no Basketball data', async () => {
      const save = jest.spyOn(repository, 'createPlayer');
      const app = renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      type('player-name', 'גל');
      fillDate('9', '7', '2015');
      selectBasketball();
      fireEvent.press(screen.getByTestId('player-primary-PG'));
      fireEvent.press(screen.getByTestId('player-hand-LEFT'));
      selectBasketball(); // unselect
      expect(screen.queryByTestId('player-section-basketball')).toBeNull();
      expect(valueOf('player-name')).toBe('גל'); // personal fields untouched
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect(save.mock.calls[0]![1].basketball).toBeNull();
      expect((await repository.listPlayers(db))[0]!.basketball).toBeNull();
      expect(await sportRowCounts()).toEqual({ player_sports: 0, profiles: 0 });
    });

    it('keeps hidden Basketball answers locally: re-selecting before saving restores them', async () => {
      renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      selectBasketball();
      fireEvent.press(screen.getByTestId('player-primary-SG'));
      fireEvent.press(screen.getByTestId('player-secondary-SF'));
      fireEvent.press(screen.getByTestId('player-hand-BOTH'));
      selectBasketball(); // hide
      selectBasketball(); // show again
      expect(selected('player-primary-SG')).toBe(true);
      expect(selected('player-secondary-SF')).toBe(true);
      expect(selected('player-hand-BOTH')).toBe(true);
    });

    it('adds Basketball to a player without a sport through Edit', async () => {
      const omer = await seed({
        player: { name: 'עומר', dateOfBirth: { year: 2016, month: 4, day: 2 } },
        basketball: null,
      });
      const app = renderRouter(routes, { initialUrl: `/children/${omer.player.id}` });
      await screen.findByDisplayValue('עומר');
      expect(selected('player-sport-BASKETBALL')).toBe(false);
      expect(screen.getByTestId('player-sport-BASKETBALL').props.accessibilityState.disabled).toBe(false);
      expect(screen.queryByTestId('player-section-basketball')).toBeNull();
      selectBasketball();
      fireEvent.press(screen.getByTestId('player-primary-C'));
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect((await repository.getPlayer(db, omer.player.id))!.basketball).toMatchObject({
        primaryPosition: 'C',
      });
      expect(await sportRowCounts()).toEqual({ player_sports: 1, profiles: 1 });
      expect(plain(`player-position-${omer.player.id}`)).toBe('C · סנטר');
    });

    // SPORT-LIFE-001 superseded "a saved Basketball is locked": the chip can now be
    // unselected (after a confirmation; see sportLifecycle.test.tsx).
    it('shows a saved active Basketball selected (not locked); its details stay editable', async () => {
      const gal = await seed(GAL);
      const update = jest.spyOn(repository, 'updatePlayer');
      const app = renderRouter(routes, { initialUrl: `/children/${gal.player.id}` });
      await screen.findByDisplayValue('גל');
      const chip = screen.getByTestId('player-sport-BASKETBALL');
      expect(chip.props.accessibilityState).toMatchObject({ selected: true, disabled: false });
      expect(selected('player-sport-BASKETBALL')).toBe(true);
      expect(screen.getByTestId('player-section-basketball')).toBeTruthy();
      fireEvent.press(screen.getByTestId('player-hand-LEFT'));
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      expect(update.mock.calls[0]![2].basketball).not.toBeNull();
      expect((await repository.getPlayer(db, gal.player.id))!.basketball).toMatchObject({
        dominantHand: 'LEFT',
      });
    });

    it('editing through the new form keeps stored experience and weekly frequency unchanged', async () => {
      const gal = await seed(GAL); // stored ONE_TO_TWO_YEARS / TWO_TO_THREE (earlier app version)
      const stored = () =>
        db.getFirstAsync(
          'SELECT experience, weekly_frequency FROM basketball_player_profiles WHERE player_id = ?',
          [gal.player.id],
        );
      const before = await stored();
      expect(before).toEqual({ experience: 'ONE_TO_TWO_YEARS', weekly_frequency: 'TWO_TO_THREE' });
      const update = jest.spyOn(repository, 'updatePlayer');
      const app = renderRouter(routes, { initialUrl: `/children/${gal.player.id}` });
      await screen.findByDisplayValue('גל');
      type('player-name', 'גל לוי');
      fireEvent.press(screen.getByTestId('player-primary-SF')); // secondary stays SG
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(app.getPathname()).toBe('/children'));
      // The form sends only primary / secondary / dominant hand — never experience or frequency.
      const sent = update.mock.calls[0]![2].basketball!;
      expect(Object.keys(sent).sort()).toEqual(['dominantHand', 'primaryPosition', 'secondaryPosition']);
      expect(sent).not.toHaveProperty('experience');
      expect(sent).not.toHaveProperty('weeklyFrequency');
      expect(await stored()).toEqual(before);
    });
  });

  describe('secondary position', () => {
    async function openBasketballForm() {
      renderRouter(routes, { initialUrl: '/children/new' });
      await screen.findByTestId('player-name');
      selectBasketball();
    }

    it('is hidden until a concrete primary position is chosen', async () => {
      await openBasketballForm();
      expect(screen.queryByTestId('player-secondary')).toBeNull();
      for (const primary of ['PG', 'SG', 'SF', 'PF', 'C']) {
        fireEvent.press(screen.getByTestId(`player-primary-${primary}`));
        expect(screen.getByTestId('player-secondary')).toBeTruthy();
      }
      // The selected primary stays available in the secondary list.
      expect(screen.getByTestId('player-secondary-C')).toBeTruthy();
      expect(text('player-secondary-none-label')).toBe('ללא');
    });

    it.each([
      ['MULTIPLE', 'player-primary-MULTIPLE'],
      ['NOT_SURE', 'player-primary-NOT_SURE'],
      ['no primary', 'player-primary-PG'],
    ])('is cleared and hidden when the primary becomes %s', async (_label, press) => {
      const save = jest.spyOn(repository, 'createPlayer');
      await openBasketballForm();
      type('player-name', 'גל');
      fillDate('9', '7', '2015');
      fireEvent.press(screen.getByTestId('player-primary-PG'));
      fireEvent.press(screen.getByTestId('player-secondary-SG'));
      fireEvent.press(screen.getByTestId(press)); // MULTIPLE / NOT_SURE, or PG again = clear
      expect(screen.queryByTestId('player-secondary')).toBeNull();
      fireEvent.press(screen.getByTestId('player-primary-PG')); // shown again: the old choice is gone
      expect(selected('player-secondary-none')).toBe(true);
      expect(selected('player-secondary-SG')).toBe(false);
      fireEvent.press(screen.getByTestId(press));
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(save.mock.calls[0]![1].basketball!.secondaryPosition).toBeNull();
    });

    it('"None" saves no secondary position (null)', async () => {
      const save = jest.spyOn(repository, 'createPlayer');
      await openBasketballForm();
      type('player-name', 'גל');
      fillDate('9', '7', '2015');
      fireEvent.press(screen.getByTestId('player-primary-PG'));
      fireEvent.press(screen.getByTestId('player-secondary-SF'));
      fireEvent.press(screen.getByTestId('player-secondary-none'));
      expect(selected('player-secondary-none')).toBe(true);
      fireEvent.press(screen.getByTestId('player-save'));
      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(save.mock.calls[0]![1].basketball!.secondaryPosition).toBeNull();
      await waitFor(async () => expect(await playerCount()).toBe(1));
      expect((await repository.listPlayers(db))[0]!.basketball).toMatchObject({
        primaryPosition: 'PG',
        secondaryPosition: null,
      });
    });
  });

  it('shows the height unit as a suffix and stores only the number', async () => {
    const app = renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');
    expect(text('player-height-unit')).toBe('ס״מ');
    type('player-name', 'גל');
    fillDate('9', '7', '2015');
    type('player-height', '147');
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await db.getFirstAsync('SELECT height_cm, typeof(height_cm) AS t FROM players')).toEqual({
      height_cm: 147,
      t: 'integer',
    });
  });

  it('keeps position abbreviations readable: isolated left-to-right, with the · separator', async () => {
    renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');
    selectBasketball();
    const chipText = (testID: string) => text(`${testID}-label`);
    expect(chipText('player-primary-PG')).toBe(`${FSI}PG${PDI} · ${FSI}רכז${PDI}`);
    expect(chipText('player-primary-MULTIPLE')).toBe('כמה עמדות');
    expect(chipText('player-primary-NOT_SURE')).toBe('לא בטוח');
  });
});

describe('Players — English (LTR)', () => {
  beforeEach(() => prepare('en'));

  it('shows the English empty state and form labels', async () => {
    const app = renderRouter(routes, { initialUrl: '/children' });
    expect(await screen.findByText('No players yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('players-add'));
    await waitFor(() => expect(app.getPathname()).toBe('/children/new'));
    for (const label of ['Personal information', 'Name', 'Date of birth', 'Day', 'Month', 'Year', 'Height']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(text('player-height-unit')).toBe('cm');
    expect(screen.getByText('Sport')).toBeTruthy();
    expect(screen.queryByTestId('player-section-basketball')).toBeNull();
    selectBasketball();
    for (const label of ['Basketball details', 'You can update these details later.', 'Primary position']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('Dominant hand')).toBeTruthy();
    expect(plain('player-primary-PG-label')).toBe('PG · Point Guard');
    expect(plain('player-primary-SG-label')).toBe('SG · Shooting Guard');
    expect(plain('player-primary-C-label')).toBe('C · Center');
    fireEvent.press(screen.getByTestId('player-primary-SF'));
    expect(text('player-secondary-none-label')).toBe('None');
    expect(screen.queryByText(/experience|frequency/i)).toBeNull();
  });

  it('a future stored date of birth shows the English data message', async () => {
    const gal = await seed(GAL);
    await db.runAsync("UPDATE players SET date_of_birth = '2099-01-01' WHERE id = ?", [gal.player.id]);
    renderRouter(routes, { initialUrl: '/children' });
    expect(await screen.findByText('Some stored player data is not valid and cannot be shown.')).toBeTruthy();
    expect(screen.queryAllByTestId(/^player-row-/)).toHaveLength(0);
    expect(screen.queryByText(/RangeError/)).toBeNull();
  });

  it('shows English validation messages', async () => {
    renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');
    type('player-dob-day', '29');
    type('player-dob-month', '2');
    type('player-dob-year', '2025');
    type('player-height', '-1');
    selectBasketball();
    fireEvent.press(screen.getByTestId('player-primary-C'));
    fireEvent.press(screen.getByTestId('player-secondary-C'));
    fireEvent.press(screen.getByTestId('player-save'));
    expect(await screen.findByText('Please enter a name.')).toBeTruthy();
    expect(text('player-dob-error')).toBe('That date does not exist. Check the day, month and year.');
    expect(text('player-height-error')).toBe('Height is a whole number of centimetres above 0.');
    expect(text('player-secondary-error')).toBe(
      'The secondary position must differ from the primary position.',
    );
    expect(await playerCount()).toBe(0);
  });

  it('creates and edits a player in English; the list shows English age and position', async () => {
    const app = renderRouter(routes, { initialUrl: '/children/new' });
    await screen.findByTestId('player-name');
    type('player-name', 'Gal');
    fillDate('9', '7', '2015');
    selectBasketball();
    fireEvent.press(screen.getByTestId('player-primary-C'));
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    const [stored] = await repository.listPlayers(db);
    const id = stored!.player.id;
    expect(await screen.findByText('Gal')).toBeTruthy();
    expect(plain(`player-age-${id}`)).toBe('Age 11');
    expect(plain(`player-position-${id}`)).toBe('C · Center');

    fireEvent.press(screen.getByTestId(`player-row-${id}`));
    expect(await screen.findByDisplayValue('Gal')).toBeTruthy();
    type('player-name', 'Gal C');
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    expect(await screen.findByText('Gal C')).toBeTruthy();
  });
});
