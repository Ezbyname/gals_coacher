import { isComparisonPolicy } from '@/domain/comparison';
import { builtinExercise, BUILTIN_EXERCISES } from '@/domain/exercise/catalog';
import { isEquipmentId, type EquipmentId } from '@/domain/exercise/equipment';
import {
  isSkillOnly,
  loadApplies,
  validateCustomExercise,
  type CustomExerciseCore,
  type CustomExerciseErrors,
  type CustomExerciseInput,
  type Exercise,
} from '@/domain/exercise/exercise';
import {
  isDifficulty,
  isMuscleGroup,
  isTrainingCategory,
  type MuscleGroup,
} from '@/domain/exercise/taxonomy';
import { isUuid } from '@/domain/ids';
import { isMeasurementType } from '@/domain/measurement';
import { SPORTS, type SportKey } from '@/domain/sport';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import type { PlayerDb, SqlParam } from '../players/playerDb';

import {
  BuiltinExerciseReadOnlyError,
  ExerciseDataError,
  ExerciseNotFoundError,
  type ExerciseDataField,
} from './errors';

/**
 * The exercise library (TRAIN-001). Built-in exercises: curated definitions
 * from the code catalog + their stored active state. Custom exercises: the
 * user's rows (never touched by the catalog). Nothing is ever deleted: an
 * inactive exercise is hidden from NEW selection and every historical use
 * keeps referencing it. One operation at a time per connection; writes are
 * transactional; malformed stored data fails the whole read.
 */

export type SaveExerciseResult =
  | { readonly ok: true; readonly exercise: Exercise }
  | { readonly ok: false; readonly errors: CustomExerciseErrors };

/** Every exercise (built-in and custom, active and inactive). Order: built-ins in catalog order, then custom by creation. */
export function listExercises(db: PlayerDb): Promise<Exercise[]> {
  return runSerialized(db, () => readAll(db));
}

export function getExercise(db: PlayerDb, id: string): Promise<Exercise | null> {
  return runSerialized(db, async () => (await readAll(db)).find((exercise) => exercise.id === id) ?? null);
}

/** Adds a custom exercise (active). Invalid input → errors, nothing written. */
export async function createCustomExercise(
  db: PlayerDb,
  input: CustomExerciseInput,
  deps: { ids: IdService; clock: Clock },
): Promise<SaveExerciseResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveExerciseResult | null;
  await writeTransaction(db, async () => {
    const valid = validateCustomExercise(input, await customNames(db, null));
    if (!valid.ok) {
      result = valid;
      return;
    }
    const id = deps.ids.newUuid();
    await db.runAsync(
      `INSERT INTO exercises
         (id, builtin, active, name, difficulty, measurement_type, comparison_policy, uses_load,
          instructions, tutorial_url, created_at, updated_at)
       VALUES (?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ...customColumns(valid.value), now, now],
    );
    await writeChildren(db, id, valid.value);
    result = { ok: true, exercise: await readOne(db, id) };
  });
  return result!;
}

/**
 * Replaces a custom exercise's definition (id, active state and createdAt
 * kept; updatedAt = clock). Built-in exercises are read-only
 * (BuiltinExerciseReadOnlyError). Past uses keep their own snapshot — editing
 * never rewrites history.
 */
export async function updateCustomExercise(
  db: PlayerDb,
  id: string,
  input: CustomExerciseInput,
  deps: { clock: Clock },
): Promise<SaveExerciseResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveExerciseResult | null;
  await writeTransaction(db, async () => {
    const existing = await readRow(db, id);
    if (existing === null) throw new ExerciseNotFoundError(id);
    if (existing.builtin === 1) throw new BuiltinExerciseReadOnlyError(id);
    await readOne(db, id); // authoritative read first: fails closed when malformed
    const valid = validateCustomExercise(input, await customNames(db, id));
    if (!valid.ok) {
      result = valid;
      return;
    }
    await db.runAsync(
      `UPDATE exercises
          SET name = ?, difficulty = ?, measurement_type = ?, comparison_policy = ?, uses_load = ?,
              instructions = ?, tutorial_url = ?, updated_at = ?
        WHERE id = ?`,
      [...customColumns(valid.value), now, id],
    );
    for (const table of CHILD_TABLES) await db.runAsync(`DELETE FROM ${table} WHERE exercise_id = ?`, [id]);
    await writeChildren(db, id, valid.value);
    result = { ok: true, exercise: await readOne(db, id) };
  });
  return result!;
}

/** Makes an exercise (built-in or custom) active / inactive. Idempotent; same id. */
export async function setExerciseActive(
  db: PlayerDb,
  id: string,
  active: boolean,
  deps: { clock: Clock },
): Promise<Exercise> {
  const now = deps.clock.wallNow();
  let result = null as Exercise | null;
  await writeTransaction(db, async () => {
    const existing = await readOne(db, id);
    if (existing.active !== active) {
      await db.runAsync('UPDATE exercises SET active = ?, updated_at = ? WHERE id = ?', [
        active ? 1 : 0,
        now,
        id,
      ]);
    }
    result = await readOne(db, id);
  });
  return result!;
}

function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

const CHILD_TABLES = [
  'exercise_categories',
  'exercise_muscles',
  'exercise_equipment',
  'exercise_sports',
] as const;

function customColumns(value: CustomExerciseCore): SqlParam[] {
  return [
    value.name.en,
    value.difficulty,
    value.measurement.type,
    value.measurement.comparison,
    value.measurement.usesLoad ? 1 : 0,
    value.instructions?.en ?? null,
    value.tutorialUrl,
  ];
}

async function writeChildren(db: PlayerDb, id: string, value: CustomExerciseCore): Promise<void> {
  for (const category of value.categories) {
    await db.runAsync('INSERT INTO exercise_categories (exercise_id, category) VALUES (?, ?)', [
      id,
      category,
    ]);
  }
  for (const [role, muscles] of [
    ['PRIMARY', value.primaryMuscles],
    ['SECONDARY', value.secondaryMuscles],
  ] as const) {
    for (const muscle of muscles) {
      await db.runAsync('INSERT INTO exercise_muscles (exercise_id, muscle, role) VALUES (?, ?, ?)', [
        id,
        muscle,
        role,
      ]);
    }
  }
  for (const [index, option] of value.equipment.entries()) {
    for (const item of option) {
      await db.runAsync(
        'INSERT INTO exercise_equipment (exercise_id, option_index, equipment) VALUES (?, ?, ?)',
        [id, index, item],
      );
    }
  }
  for (const sport of value.sports) {
    await db.runAsync('INSERT INTO exercise_sports (exercise_id, sport) VALUES (?, ?)', [id, sport]);
  }
}

async function customNames(db: PlayerDb, except: string | null): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: unknown; name: unknown }>(
    'SELECT id, name FROM exercises WHERE builtin = 0',
    [],
  );
  return rows
    .filter((row) => row.id !== except && typeof row.name === 'string')
    .map((row) => row.name as string);
}

type ExerciseRow = {
  id: unknown;
  builtin: unknown;
  active: unknown;
  name: unknown;
  difficulty: unknown;
  measurement_type: unknown;
  comparison_policy: unknown;
  uses_load: unknown;
  instructions: unknown;
  tutorial_url: unknown;
  created_at: unknown;
  updated_at: unknown;
};
type ChildRow = { exercise_id: unknown; a: unknown; b: unknown };

const SELECT_EXERCISES = `SELECT id, builtin, active, name, difficulty, measurement_type, comparison_policy,
  uses_load, instructions, tutorial_url, created_at, updated_at FROM exercises`;

function readRow(db: PlayerDb, id: string): Promise<ExerciseRow | null> {
  return db.getFirstAsync<ExerciseRow>(`${SELECT_EXERCISES} WHERE id = ?`, [id]);
}

async function readOne(db: PlayerDb, id: string): Promise<Exercise> {
  const found = (await readAll(db)).find((exercise) => exercise.id === id);
  if (!found) throw new ExerciseNotFoundError(id);
  return found;
}

async function readAll(db: PlayerDb): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(`${SELECT_EXERCISES} ORDER BY created_at, id`, []);
  const children = async (sql: string) => {
    const map = new Map<string, ChildRow[]>();
    for (const row of await db.getAllAsync<ChildRow>(sql, [])) {
      const key = String(row.exercise_id);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };
  const categories = await children('SELECT exercise_id, category AS a, NULL AS b FROM exercise_categories');
  const muscles = await children('SELECT exercise_id, muscle AS a, role AS b FROM exercise_muscles');
  const equipment = await children(
    'SELECT exercise_id, equipment AS a, option_index AS b FROM exercise_equipment ORDER BY option_index, equipment',
  );
  const sports = await children('SELECT exercise_id, sport AS a, NULL AS b FROM exercise_sports');

  const byId = new Map<string, ExerciseRow>();
  for (const row of rows) byId.set(String(row.id), row);
  const parsed: Exercise[] = [];
  // Built-ins: catalog order; each must have its seeded row.
  for (const definition of BUILTIN_EXERCISES) {
    const row = byId.get(definition.id);
    if (!row) throw new ExerciseDataError('id', 'MISSING_ROW', definition.id);
    parsed.push({ ...definition, builtin: true, active: parseState(row) });
  }
  for (const row of rows) {
    if (row.builtin === 1) {
      if (typeof row.id !== 'string' || builtinExercise(row.id) === null) {
        throw new ExerciseDataError('id', 'UNKNOWN_CODE', typeof row.id === 'string' ? row.id : null);
      }
      continue;
    }
    const id = String(row.id);
    parsed.push(
      parseCustom(row, {
        categories: categories.get(id) ?? [],
        muscles: muscles.get(id) ?? [],
        equipment: equipment.get(id) ?? [],
        sports: sports.get(id) ?? [],
      }),
    );
  }
  return parsed;
}

function parseState(row: ExerciseRow): boolean {
  const fail = (field: ExerciseDataField) => new ExerciseDataError(field, 'INVALID_VALUE', String(row.id));
  if (row.active !== 0 && row.active !== 1) throw fail('active');
  if (row.builtin !== 0 && row.builtin !== 1) throw fail('builtin');
  if (typeof row.created_at !== 'number' || !Number.isSafeInteger(row.created_at)) throw fail('createdAt');
  if (typeof row.updated_at !== 'number' || !Number.isSafeInteger(row.updated_at)) throw fail('updatedAt');
  return row.active === 1;
}

/** A custom row and its child rows, checked in full (nothing repaired or defaulted). */
function parseCustom(
  row: ExerciseRow,
  rel: { categories: ChildRow[]; muscles: ChildRow[]; equipment: ChildRow[]; sports: ChildRow[] },
): Exercise {
  const id = typeof row.id === 'string' ? row.id : null;
  const fail = (field: ExerciseDataField, reason: 'INVALID_VALUE' | 'UNKNOWN_CODE' = 'INVALID_VALUE') =>
    new ExerciseDataError(field, reason, id);
  if (id === null || !isUuid(id)) throw fail('id');
  const active = parseState(row);
  const name = row.name;
  if (typeof name !== 'string' || name.trim() !== name || name.length === 0) throw fail('name');
  if (!isDifficulty(row.difficulty)) throw fail('difficulty', 'UNKNOWN_CODE');
  const type = row.measurement_type;
  if (!isMeasurementType(type)) throw fail('measurement', 'UNKNOWN_CODE');
  const comparison = row.comparison_policy;
  if (comparison !== null && !isComparisonPolicy(comparison)) throw fail('measurement', 'UNKNOWN_CODE');
  if (row.uses_load !== 0 && row.uses_load !== 1) throw fail('measurement');
  if (row.uses_load === 1 && !loadApplies(type)) throw fail('measurement');
  if (row.instructions !== null && typeof row.instructions !== 'string') throw fail('instructions');
  if (row.tutorial_url !== null && typeof row.tutorial_url !== 'string') throw fail('tutorialUrl');

  const categories = rel.categories.map((c) => c.a);
  if (categories.length === 0) throw fail('categories');
  if (!categories.every(isTrainingCategory)) throw fail('categories', 'UNKNOWN_CODE');
  const primary: MuscleGroup[] = [];
  const secondary: MuscleGroup[] = [];
  for (const muscle of rel.muscles) {
    if (!isMuscleGroup(muscle.a)) throw fail('muscles', 'UNKNOWN_CODE');
    if (muscle.b === 'PRIMARY') primary.push(muscle.a);
    else if (muscle.b === 'SECONDARY') secondary.push(muscle.a);
    else throw fail('muscles', 'UNKNOWN_CODE');
  }
  if (primary.length === 0 && !isSkillOnly(categories)) throw fail('muscles');
  const options = new Map<number, EquipmentId[]>();
  for (const item of rel.equipment) {
    if (!isEquipmentId(item.a)) throw fail('equipment', 'UNKNOWN_CODE');
    if (typeof item.b !== 'number') throw fail('equipment');
    options.set(item.b, [...(options.get(item.b) ?? []), item.a]);
  }
  const sports = rel.sports.map((s) => s.a);
  if (!sports.every((s) => (SPORTS as readonly unknown[]).includes(s))) throw fail('sports', 'UNKNOWN_CODE');

  return {
    id,
    builtin: false,
    active,
    name: { he: name, en: name },
    categories,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    extraAreas: [],
    movementPatterns: [],
    difficulty: row.difficulty,
    sports: sports as SportKey[],
    equipment: [...options.keys()].sort((a, b) => a - b).map((key) => options.get(key)!),
    measurement: { type, comparison, usesLoad: row.uses_load === 1, distanceM: null },
    defaults: null,
    instructions:
      typeof row.instructions === 'string' ? { he: row.instructions, en: row.instructions } : null,
    cues: [],
    mistakes: [],
    safety: null,
    tutorialUrl: typeof row.tutorial_url === 'string' ? row.tutorial_url : null,
  };
}
