import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import * as repository from '@/data/local/players/playerRepository';
import type { PlayerProfileInput } from '@/data/local/players/playerRepository';
import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { prepareApp } from '@/test-support/prepareApp';

import EditPlayerScreen from '../children/[id]';
import PlayersScreen from '../children/index';
import NewPlayerScreen from '../children/new';
import HomeScreen from '../index';
import RootLayout from '../_layout';

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  'children/index': PlayersScreen,
  'children/new': NewPlayerScreen,
  'children/[id]': EditPlayerScreen,
};

// "Today" is 3 October 2026 at local noon, whatever the machine timezone.
const NOW = new Date(2026, 9, 3, 12, 0, 0).getTime();
const clock = { wallNow: () => NOW, monotonicNow: () => 0 };
const TODAY = { year: 2026, month: 10, day: 3 };

let db: ReturnType<typeof openNodeSqlite> | null = null;

async function prepare(language: 'he' | 'en') {
  await prepareApp(language);
  const opened = openNodeSqlite(':memory:');
  db = opened;
  await opened.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(opened, migrations);
  (openDatabaseAsync as jest.Mock).mockImplementation(async () => opened);
  jest.spyOn(systemClock, 'wallNow').mockReturnValue(NOW);
}

const seedIds = createSequentialIdService();
async function seed(input: PlayerProfileInput) {
  const result = await repository.createPlayer(db!, input, { ids: seedIds, clock });
  if (!result.ok) throw new Error('seed failed');
  return result.profile;
}

const TRIGGER = 'player-dob-picker';
const NATIVE = 'player-dob-picker-native';

const valueOf = (testID: string) => screen.getByTestId(testID).props.value as string;
const dateFields = () => [valueOf('player-dob-day'), valueOf('player-dob-month'), valueOf('player-dob-year')];
const type = (testID: string, value: string) => fireEvent.changeText(screen.getByTestId(testID), value);
function fillDate(day: string, month: string, year: string) {
  type('player-dob-day', day);
  type('player-dob-month', month);
  type('player-dob-year', year);
}
/** A native Date as the civil date + hour it shows on this device. */
const civil = (date: Date) => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
  hour: date.getHours(),
});
const nativeProps = () => screen.getByTestId(NATIVE).props;
const openPicker = () => fireEvent.press(screen.getByTestId(TRIGGER));
/** What the native picker reports for a selection made at this local wall time. */
const nativeSelect = (date: Date) =>
  act(() => nativeProps().onValueChange({ nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } }, date));

async function openNewForm(language: 'he' | 'en' = 'he') {
  await prepare(language);
  const app = renderRouter(routes, { initialUrl: '/children/new' });
  await screen.findByTestId('player-name');
  return app;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await db?.closeAsync();
  db = null;
});

describe('Date of birth picker — Android (native dialog)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('has a calendar trigger next to the date fields; pressing it opens the native date dialog', async () => {
    await openNewForm();
    expect(screen.getByTestId(TRIGGER)).toBeTruthy();
    expect(screen.queryByTestId(NATIVE)).toBeNull();
    openPicker();
    expect(nativeProps().mode).toBe('date');
    // Android shows a system dialog: no app sheet is involved.
    expect(screen.queryByTestId('player-dob-picker-sheet')).toBeNull();
  });

  it('limits the picker to local today', async () => {
    await openNewForm();
    openPicker();
    expect(civil(nativeProps().maximumDate)).toEqual({ ...TODAY, hour: 12 });
  });

  it('opens on today when the fields are empty, partial or invalid — never on a guessed age', async () => {
    await openNewForm();
    const cases: [string, string, string][] = [
      ['', '', ''],
      ['', '', '2015'], // partial: no year-only guess
      ['9', '7', ''],
      ['31', '2', '2015'], // not a real date
      ['9', '13', '2015'],
      ['9a', '7', '2015'], // not digits
      ['4', '10', '2026'], // tomorrow
      ['0', '7', '2015'],
    ];
    for (const [day, month, year] of cases) {
      fillDate(day, month, year);
      openPicker();
      expect([day, month, year, civil(nativeProps().value)]).toEqual([
        day,
        month,
        year,
        { ...TODAY, hour: 12 },
      ]);
      act(() => nativeProps().onDismiss());
    }
  });

  it('opens on a valid typed date (including today)', async () => {
    await openNewForm();
    fillDate('9', '7', '2015');
    openPicker();
    expect(civil(nativeProps().value)).toEqual({ year: 2015, month: 7, day: 9, hour: 12 });
    act(() => nativeProps().onDismiss());
    fillDate(' 29 ', '02', '2024');
    openPicker();
    expect(civil(nativeProps().value)).toEqual({ year: 2024, month: 2, day: 29, hour: 12 });
    act(() => nativeProps().onDismiss());
    fillDate('3', '10', '2026');
    openPicker();
    expect(civil(nativeProps().value)).toEqual({ ...TODAY, hour: 12 });
  });

  it('a selection fills day, month and year and closes the dialog', async () => {
    await openNewForm();
    openPicker();
    // A late-evening local time must still give that local day.
    await nativeSelect(new Date(2016, 0, 31, 23, 59));
    expect(dateFields()).toEqual(['31', '1', '2016']);
    expect(screen.queryByTestId(NATIVE)).toBeNull();
  });

  it('cancel (dismiss) changes nothing', async () => {
    await openNewForm();
    fillDate('9', '7', '2015');
    openPicker();
    act(() => nativeProps().onDismiss());
    expect(dateFields()).toEqual(['9', '7', '2015']);
    expect(screen.queryByTestId(NATIVE)).toBeNull();

    fillDate('', '', '');
    openPicker();
    act(() => nativeProps().onDismiss());
    expect(dateFields()).toEqual(['', '', '']);
  });

  it('typing after a selection still works, and the typed value is what gets saved', async () => {
    const app = await openNewForm();
    type('player-name', 'גל');
    openPicker();
    await nativeSelect(new Date(2015, 6, 9, 12));
    type('player-dob-day', '10');
    expect(dateFields()).toEqual(['10', '7', '2015']);
    openPicker(); // reopens on the edited, valid date
    expect(civil(nativeProps().value)).toEqual({ year: 2015, month: 7, day: 10, hour: 12 });
    act(() => nativeProps().onDismiss());
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    const [stored] = await repository.listPlayers(db!);
    expect(stored!.player.dateOfBirth).toEqual({ year: 2015, month: 7, day: 10 });
  });

  it('a manually typed impossible date is still rejected after using the picker', async () => {
    const app = await openNewForm();
    type('player-name', 'גל');
    openPicker();
    await nativeSelect(new Date(2015, 1, 10, 12));
    type('player-dob-day', '30'); // 30 February
    fireEvent.press(screen.getByTestId('player-save'));
    expect(await screen.findByTestId('player-dob-error')).toBeTruthy();
    expect(String(screen.getByTestId('player-dob-error').props.children)).toBe(
      'התאריך לא קיים. כדאי לבדוק יום, חודש ושנה.',
    );
    expect(app.getPathname()).toBe('/children/new');
    expect(await repository.listPlayers(db!)).toHaveLength(0);
  });

  it('a manually typed future date of birth is still rejected after using the picker', async () => {
    const app = await openNewForm();
    type('player-name', 'גל');
    openPicker();
    await nativeSelect(new Date(2026, 9, 3, 12)); // today: allowed by the picker
    type('player-dob-day', '4'); // tomorrow
    fireEvent.press(screen.getByTestId('player-save'));
    expect(await screen.findByTestId('player-dob-error')).toBeTruthy();
    expect(String(screen.getByTestId('player-dob-error').props.children)).toBe(
      'תאריך הלידה לא יכול להיות בעתיד.',
    );
    expect(app.getPathname()).toBe('/children/new');
    expect(await repository.listPlayers(db!)).toHaveLength(0);
  });

  it('an existing player: loads the stored date, opens on it, and a new selection is saved', async () => {
    await prepare('he');
    const gal = await seed({
      player: { name: 'גל', dateOfBirth: { year: 2015, month: 7, day: 9 }, heightCm: 142 },
      basketball: { primaryPosition: 'PG' },
    });
    const app = renderRouter(routes, { initialUrl: `/children/${gal.player.id}` });
    expect(await screen.findByDisplayValue('גל')).toBeTruthy();
    expect(dateFields()).toEqual(['9', '7', '2015']);
    openPicker();
    expect(civil(nativeProps().value)).toEqual({ year: 2015, month: 7, day: 9, hour: 12 });
    await nativeSelect(new Date(2014, 11, 1, 12));
    expect(dateFields()).toEqual(['1', '12', '2014']);
    fireEvent.press(screen.getByTestId('player-save'));
    await waitFor(() => expect(app.getPathname()).toBe('/children'));
    const stored = await repository.getPlayer(db!, gal.player.id);
    expect(stored!.player.dateOfBirth).toEqual({ year: 2014, month: 12, day: 1 });
    expect(stored!.player.heightCm).toBe(142);
    expect(stored!.basketball?.primaryPosition).toBe('PG');
  });
});

describe('Date of birth picker — iOS (modal sheet)', () => {
  it('opens a sheet with the inline picker; Confirm fills the fields', async () => {
    await openNewForm('en');
    openPicker();
    expect(screen.getByTestId('player-dob-picker-sheet')).toBeTruthy();
    expect(nativeProps().display).toBe('inline');
    expect(civil(nativeProps().maximumDate)).toEqual({ ...TODAY, hour: 12 });
    expect(civil(nativeProps().value)).toEqual({ ...TODAY, hour: 12 });
    // iOS reports every change; nothing is written until Confirm.
    await nativeSelect(new Date(2015, 6, 9, 0, 5));
    expect(dateFields()).toEqual(['', '', '']);
    expect(within(screen.getByTestId('player-dob-picker-sheet')).getByText('OK')).toBeTruthy();
    fireEvent.press(screen.getByTestId('player-dob-picker-confirm'));
    expect(dateFields()).toEqual(['9', '7', '2015']);
    expect(screen.queryByTestId(NATIVE)).toBeNull();
  });

  it('Cancel discards a changed wheel value', async () => {
    await openNewForm('en');
    fillDate('9', '7', '2015');
    openPicker();
    expect(civil(nativeProps().value)).toEqual({ year: 2015, month: 7, day: 9, hour: 12 });
    await nativeSelect(new Date(2010, 0, 1, 12));
    expect(within(screen.getByTestId('player-dob-picker-sheet')).getByText('Cancel')).toBeTruthy();
    fireEvent.press(screen.getByTestId('player-dob-picker-cancel'));
    expect(dateFields()).toEqual(['9', '7', '2015']);
    expect(screen.queryByTestId(NATIVE)).toBeNull();
  });
});

describe('Date of birth picker — accessibility label', () => {
  it('Hebrew', async () => {
    await openNewForm('he');
    expect(screen.getByTestId(TRIGGER).props.accessibilityLabel).toBe('בחירת תאריך לידה');
    expect(screen.getByLabelText('בחירת תאריך לידה')).toBeTruthy();
  });

  it('English', async () => {
    await openNewForm('en');
    expect(screen.getByTestId(TRIGGER).props.accessibilityLabel).toBe('Choose date of birth');
    expect(screen.getByLabelText('Choose date of birth')).toBeTruthy();
  });
});

describe('Date of birth picker — no UTC / ISO conversion path', () => {
  // The behavioural proof runs in real timezones (localCalendarDate.timezone.test.ts);
  // this guards the picker path's source against UTC-based conversions.
  const files = [
    'src/ui/DateOfBirthPicker.tsx',
    'src/services/clock/localCalendarDate.ts',
    'src/features/players/PlayerForm.tsx',
    'src/features/players/playerFormValues.ts',
  ];
  it.each(files)('%s', (file) => {
    const code = readFileSync(resolve(__dirname, '../../..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/toISOString|toJSON|getUTC|setUTC|Date\.UTC|Date\.parse|new Date\(\s*['"`]/);
  });

  it('the picker wrapper is the only module importing the native package', () => {
    expect(
      readFileSync(resolve(__dirname, '../../..', 'src/features/players/PlayerForm.tsx'), 'utf8'),
    ).not.toMatch(/@react-native-community\/datetimepicker/);
  });
});
