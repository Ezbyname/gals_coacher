import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { BUILTIN_EXERCISES, builtinExercise } from '@/domain/exercise/catalog';
import type { CustomExerciseInput } from '@/domain/exercise/exercise';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService, type IdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { setActivityTypeActive } from '../../activityTypes/activityTypeRepository';
import { openLocalDatabase } from '../../database';
import {
  createCustomExercise,
  getExercise,
  listExercises,
  setExerciseActive,
  updateCustomExercise,
  type SaveExerciseResult,
} from '../exerciseRepository';
import { BuiltinExerciseReadOnlyError, ExerciseDataError, ExerciseNotFoundError } from '../errors';

const T0 = new Date(2026, 9, 7, 9).getTime();
const HOUR = 3_600_000;
const GHOST = '00000000-0000-4000-8000-000000000999';

function fakeClock(start = T0): Clock & { set(ms: number): void } {
  let now = start;
  return { wallNow: () => now, monotonicNow: () => 0, set: (ms) => void (now = ms) };
}
const ok = (result: SaveExerciseResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.exercise;
};

const SANDBAG: CustomExerciseInput = {
  name: ' Sandbag Carry ',
  categories: ['STRENGTH', 'CONDITIONING'],
  primaryMuscles: ['FOREARMS_GRIP', 'UPPER_BACK'],
  secondaryMuscles: ['ABDOMINALS'],
  difficulty: 'INTERMEDIATE',
  sports: [],
  equipment: [['SLAM_BALL'], ['MEDICINE_BALL', 'MAT']],
  measurementType: 'DURATION',
  comparison: 'HIGHER_IS_BETTER',
  usesLoad: true,
  instructions: 'Hug the bag and walk.',
  tutorialUrl: 'https://example.com/sandbag',
};

describe('exercise repository on real SQLite', () => {
  let dir: string;
  let db: SQLiteDatabase;
  let ids: IdService;
  let clock: ReturnType<typeof fakeClock>;
  const rows = () => db.getAllAsync('SELECT * FROM exercises ORDER BY rowid');
  const children = async () => ({
    categories: await db.getAllAsync('SELECT * FROM exercise_categories ORDER BY exercise_id, category'),
    muscles: await db.getAllAsync('SELECT * FROM exercise_muscles ORDER BY exercise_id, muscle'),
    equipment: await db.getAllAsync(
      'SELECT * FROM exercise_equipment ORDER BY exercise_id, option_index, equipment',
    ),
    sports: await db.getAllAsync('SELECT * FROM exercise_sports ORDER BY exercise_id, sport'),
  });
  const create = async (input: Partial<CustomExerciseInput> = {}) =>
    ok(await createCustomExercise(db, { ...SANDBAG, ...input }, { ids, clock }));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gals-ex-'));
    const file = join(dir, 'gals_coacher.db');
    (openDatabaseAsync as jest.Mock).mockImplementation(async () => openNodeSqlite(file));
    db = (await openLocalDatabase()).db;
    ids = createSequentialIdService();
    clock = fakeClock();
  });
  afterEach(async () => {
    await db.closeAsync().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists every built-in exercise with its curated definition, active, in catalog order', async () => {
    const list = await listExercises(db);
    expect(list.map((e) => e.id)).toEqual(BUILTIN_EXERCISES.map((e) => e.id));
    expect(list[0]).toEqual({ ...BUILTIN_EXERCISES[0], builtin: true, active: true });
    expect(await getExercise(db, 'ROMANIAN_DEADLIFT')).toEqual({
      ...builtinExercise('ROMANIAN_DEADLIFT'),
      builtin: true,
      active: true,
    });
    expect(await getExercise(db, GHOST)).toBeNull();
  });

  it('creates a custom exercise: a client UUID, trimmed name, child rows, active; listed after the built-ins', async () => {
    const sandbag = await create();
    expect(sandbag).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      builtin: false,
      active: true,
      name: { he: 'Sandbag Carry', en: 'Sandbag Carry' },
      categories: ['STRENGTH', 'CONDITIONING'],
      primaryMuscles: ['FOREARMS_GRIP', 'UPPER_BACK'],
      secondaryMuscles: ['ABDOMINALS'],
      equipment: [['SLAM_BALL'], ['MAT', 'MEDICINE_BALL']],
      measurement: { type: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: true, distanceM: null },
      instructions: { he: 'Hug the bag and walk.', en: 'Hug the bag and walk.' },
      tutorialUrl: 'https://example.com/sandbag',
    });
    expect((await listExercises(db)).at(-1)).toEqual(sandbag);
    expect((await children()).equipment).toEqual([
      { exercise_id: sandbag.id, option_index: 0, equipment: 'SLAM_BALL' },
      { exercise_id: sandbag.id, option_index: 1, equipment: 'MAT' },
      { exercise_id: sandbag.id, option_index: 1, equipment: 'MEDICINE_BALL' },
    ]);
  });

  it('a custom exercise survives a restart; built-in content never overwrites it', async () => {
    const sandbag = await create();
    await db.closeAsync();
    db = (await openLocalDatabase()).db;
    expect(await getExercise(db, sandbag.id)).toEqual(sandbag);
    expect(await listExercises(db)).toHaveLength(BUILTIN_EXERCISES.length + 1);
  });

  it('invalid input writes nothing (blank name, duplicate name)', async () => {
    await create();
    const before = { rows: await rows(), children: await children() };
    expect(await createCustomExercise(db, { ...SANDBAG, name: '  ' }, { ids, clock })).toEqual({
      ok: false,
      errors: { name: 'REQUIRED' },
    });
    expect(await createCustomExercise(db, { ...SANDBAG, name: 'SANDBAG carry' }, { ids, clock })).toEqual({
      ok: false,
      errors: { name: 'DUPLICATE' },
    });
    expect({ rows: await rows(), children: await children() }).toEqual(before);
  });

  it('edits a custom exercise: same id, active and createdAt kept, children replaced, updatedAt = clock', async () => {
    const sandbag = await create();
    clock.set(T0 + HOUR);
    const edited = ok(
      await updateCustomExercise(
        db,
        sandbag.id,
        {
          ...SANDBAG,
          name: 'Sandbag Shoulder Carry',
          equipment: [],
          categories: ['STRENGTH'],
          sports: ['BASKETBALL'],
        },
        { clock },
      ),
    );
    expect(edited).toMatchObject({
      id: sandbag.id,
      name: { en: 'Sandbag Shoulder Carry' },
      equipment: [],
      categories: ['STRENGTH'],
      sports: ['BASKETBALL'],
      active: true,
    });
    expect(
      await db.getFirstAsync('SELECT created_at, updated_at FROM exercises WHERE id = ?', [sandbag.id]),
    ).toEqual({
      created_at: T0,
      updated_at: T0 + HOUR,
    });
    expect((await children()).equipment).toEqual([]);
    // Its own unchanged name is not a duplicate of itself.
    expect(
      (await updateCustomExercise(db, sandbag.id, { ...SANDBAG, name: 'Sandbag Shoulder Carry' }, { clock }))
        .ok,
    ).toBe(true);
  });

  it('built-ins are read-only (only active state changes); unknown ids are not found', async () => {
    await expect(updateCustomExercise(db, 'PLANK', SANDBAG, { clock })).rejects.toBeInstanceOf(
      BuiltinExerciseReadOnlyError,
    );
    await expect(updateCustomExercise(db, GHOST, SANDBAG, { clock })).rejects.toBeInstanceOf(
      ExerciseNotFoundError,
    );
    await expect(setExerciseActive(db, GHOST, false, { clock })).rejects.toBeInstanceOf(
      ExerciseNotFoundError,
    );
  });

  it('inactive / active: same row and id, idempotent, built-in and custom; never deleted', async () => {
    const sandbag = await create();
    clock.set(T0 + HOUR);
    for (const id of ['PLANK', sandbag.id]) {
      expect((await setExerciseActive(db, id, false, { clock })).active).toBe(false);
      const row = await db.getFirstAsync('SELECT updated_at FROM exercises WHERE id = ?', [id]);
      clock.set(T0 + 2 * HOUR);
      expect((await setExerciseActive(db, id, false, { clock })).active).toBe(false);
      expect(await db.getFirstAsync('SELECT updated_at FROM exercises WHERE id = ?', [id])).toEqual(row); // no-op
      expect((await setExerciseActive(db, id, true, { clock })).active).toBe(true);
      expect((await setExerciseActive(db, id, true, { clock })).active).toBe(true);
      clock.set(T0 + HOUR);
    }
    expect(await rows()).toHaveLength(BUILTIN_EXERCISES.length + 1);
    // The plank's curated content is unchanged by its state.
    expect(await getExercise(db, 'PLANK')).toEqual({
      ...builtinExercise('PLANK'),
      builtin: true,
      active: true,
    });
    await expect(db.runAsync('DELETE FROM exercises WHERE id = ?', [sandbag.id])).rejects.toThrow(
      /never deleted/,
    );
  });

  it('library changes never touch Activity Types, Sports or the calendar', async () => {
    const other = async () => ({
      types: await db.getAllAsync('SELECT * FROM activity_types ORDER BY rowid'),
      events: await db.getAllAsync('SELECT * FROM calendar_events ORDER BY rowid'),
      sports: await db.getAllAsync('SELECT * FROM player_sports ORDER BY rowid'),
    });
    const before = await other();
    const sandbag = await create();
    await setExerciseActive(db, sandbag.id, false, { clock });
    await setExerciseActive(db, 'PLANK', false, { clock });
    expect(await other()).toEqual(before);
    // …and an Activity Type change never touches the library.
    const library = await rows();
    await setActivityTypeActive(db, 'GYM', false, { clock });
    expect(await rows()).toEqual(library);
  });

  describe('malformed stored data fails the whole read', () => {
    it('an unknown code in a custom exercise’s child rows', async () => {
      const sandbag = await create();
      await db.runAsync(
        "UPDATE exercise_categories SET category = 'YOGA' WHERE exercise_id = ? AND category = 'CONDITIONING'",
        [sandbag.id],
      );
      await expect(listExercises(db)).rejects.toBeInstanceOf(ExerciseDataError);
      await expect(listExercises(db)).rejects.toMatchObject({ field: 'categories', reason: 'UNKNOWN_CODE' });
    });

    it('a built-in row the catalog does not know', async () => {
      await db.runAsync(
        "INSERT INTO exercises (id, builtin, active, created_at, updated_at) VALUES ('FUTURE_DRILL', 1, 1, 0, 0)",
      );
      await expect(listExercises(db)).rejects.toMatchObject({ field: 'id', reason: 'UNKNOWN_CODE' });
    });

    it('a catalog exercise without its seeded row', async () => {
      await db.execAsync('DROP TRIGGER exercises_never_deleted'); // simulating corruption only
      await db.runAsync("DELETE FROM exercises WHERE id = 'PLANK'");
      await expect(listExercises(db)).rejects.toMatchObject({
        field: 'id',
        reason: 'MISSING_ROW',
        exerciseId: 'PLANK',
      });
    });
  });
});
