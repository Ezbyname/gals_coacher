import type { Exercise } from '@/domain/exercise/exercise';
import { isUuid } from '@/domain/ids';
import {
  adaptPrescription,
  WORKOUT_NAME_MAX_LENGTH,
  validatePrescription,
  type Prescription,
  type PrescriptionErrors,
} from '@/domain/training/training';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import { readExercisesUnserialized } from '../exercises/exerciseRepository';
import { ensureLocalFamily } from '../players/localFamily';
import type { PlayerDb } from '../players/playerDb';

import { TrainingDataError, TrainingNotFoundError } from './errors';

/**
 * Reusable Workout Blocks and Workout Templates (TRAIN-002). Owned by the
 * Family (ARCHITECTURE §13 / §15) — never global. Both are editable and can
 * be made inactive; neither is ever deleted. Editing them never reaches a
 * planned workout or a session: those keep their own frozen snapshot.
 */

export interface BlockItem {
  readonly exercise: Exercise;
  readonly prescription: Prescription;
}
export interface WorkoutBlock {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly items: readonly BlockItem[];
  readonly createdAt: number;
  readonly updatedAt: number;
}
export interface WorkoutTemplate {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly blocks: readonly WorkoutBlock[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type NameError = 'REQUIRED' | 'TOO_LONG' | 'DUPLICATE';

export interface BlockInput {
  readonly name: string;
  readonly items: readonly { exerciseId: string; prescription: Prescription }[];
}
export interface BlockErrors {
  name?: NameError;
  items?: 'REQUIRED';
  /** Prescription errors by item index. */
  itemErrors?: Record<number, PrescriptionErrors>;
}
export type SaveBlockResult =
  | { readonly ok: true; readonly block: WorkoutBlock }
  | { readonly ok: false; readonly errors: BlockErrors };

export interface TemplateInput {
  readonly name: string;
  readonly blockIds: readonly string[];
}
export interface TemplateErrors {
  name?: NameError;
  blocks?: 'REQUIRED';
}
export type SaveTemplateResult =
  | { readonly ok: true; readonly template: WorkoutTemplate }
  | { readonly ok: false; readonly errors: TemplateErrors };

// ---------------------------------------------------------------- blocks

/** Every block (active and inactive), oldest first. */
export function listBlocks(db: PlayerDb): Promise<WorkoutBlock[]> {
  return runSerialized(db, async () => readBlocks(db, await readExercisesUnserialized(db)));
}

export function getBlock(db: PlayerDb, id: string): Promise<WorkoutBlock | null> {
  return runSerialized(db, async () => {
    const all = await readBlocks(db, await readExercisesUnserialized(db));
    return all.find((b) => b.id === id) ?? null;
  });
}

export async function createBlock(
  db: PlayerDb,
  input: BlockInput,
  deps: { ids: IdService; clock: Clock },
): Promise<SaveBlockResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveBlockResult | null;
  await writeTransaction(db, async () => {
    const exercises = await readExercisesUnserialized(db);
    const checked = await validateBlock(db, input, exercises, null);
    if (!checked.ok) {
      result = checked;
      return;
    }
    const familyId = await ensureLocalFamily(db, deps.ids);
    const id = deps.ids.newUuid();
    await db.runAsync(
      'INSERT INTO workout_blocks (id, family_id, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
      [id, familyId, checked.name, now, now],
    );
    await writeBlockItems(db, id, input);
    result = { ok: true, block: await readBlock(db, id, exercises) };
  });
  return result!;
}

/** Replaces a block's name and items (same id, createdAt kept). Planned workouts are not affected. */
export async function updateBlock(
  db: PlayerDb,
  id: string,
  input: BlockInput,
  deps: { clock: Clock },
): Promise<SaveBlockResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveBlockResult | null;
  await writeTransaction(db, async () => {
    const exercises = await readExercisesUnserialized(db);
    await readBlock(db, id, exercises); // exists and is well-formed
    const checked = await validateBlock(db, input, exercises, id);
    if (!checked.ok) {
      result = checked;
      return;
    }
    await db.runAsync('UPDATE workout_blocks SET name = ?, updated_at = ? WHERE id = ?', [
      checked.name,
      now,
      id,
    ]);
    await db.runAsync('DELETE FROM workout_block_items WHERE block_id = ?', [id]);
    await writeBlockItems(db, id, input);
    result = { ok: true, block: await readBlock(db, id, exercises) };
  });
  return result!;
}

export async function setBlockActive(
  db: PlayerDb,
  id: string,
  active: boolean,
  deps: { clock: Clock },
): Promise<WorkoutBlock> {
  return setActive(db, 'workout_blocks', id, active, deps, async (exercises) => readBlock(db, id, exercises));
}

// ---------------------------------------------------------------- templates

export function listTemplates(db: PlayerDb): Promise<WorkoutTemplate[]> {
  return runSerialized(db, async () => readTemplates(db, await readExercisesUnserialized(db)));
}

export function getTemplate(db: PlayerDb, id: string): Promise<WorkoutTemplate | null> {
  return runSerialized(db, async () => {
    const all = await readTemplates(db, await readExercisesUnserialized(db));
    return all.find((t) => t.id === id) ?? null;
  });
}

export async function createTemplate(
  db: PlayerDb,
  input: TemplateInput,
  deps: { ids: IdService; clock: Clock },
): Promise<SaveTemplateResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveTemplateResult | null;
  await writeTransaction(db, async () => {
    const checked = await validateTemplate(db, input, null);
    if (!checked.ok) {
      result = checked;
      return;
    }
    const familyId = await ensureLocalFamily(db, deps.ids);
    const id = deps.ids.newUuid();
    await db.runAsync(
      'INSERT INTO workout_templates (id, family_id, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
      [id, familyId, checked.name, now, now],
    );
    await writeTemplateBlocks(db, id, input.blockIds);
    result = { ok: true, template: await readTemplate(db, id, await readExercisesUnserialized(db)) };
  });
  return result!;
}

export async function updateTemplate(
  db: PlayerDb,
  id: string,
  input: TemplateInput,
  deps: { clock: Clock },
): Promise<SaveTemplateResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveTemplateResult | null;
  await writeTransaction(db, async () => {
    const exercises = await readExercisesUnserialized(db);
    await readTemplate(db, id, exercises);
    const checked = await validateTemplate(db, input, id);
    if (!checked.ok) {
      result = checked;
      return;
    }
    await db.runAsync('UPDATE workout_templates SET name = ?, updated_at = ? WHERE id = ?', [
      checked.name,
      now,
      id,
    ]);
    await db.runAsync('DELETE FROM workout_template_blocks WHERE template_id = ?', [id]);
    await writeTemplateBlocks(db, id, input.blockIds);
    result = { ok: true, template: await readTemplate(db, id, exercises) };
  });
  return result!;
}

export async function setTemplateActive(
  db: PlayerDb,
  id: string,
  active: boolean,
  deps: { clock: Clock },
): Promise<WorkoutTemplate> {
  return setActive(db, 'workout_templates', id, active, deps, async (exercises) =>
    readTemplate(db, id, exercises),
  );
}

// ---------------------------------------------------------------- internals

export function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

async function setActive<T extends { active: boolean }>(
  db: PlayerDb,
  table: 'workout_blocks' | 'workout_templates',
  id: string,
  active: boolean,
  deps: { clock: Clock },
  read: (exercises: Exercise[]) => Promise<T>,
): Promise<T> {
  const now = deps.clock.wallNow();
  let result = null as T | null;
  await writeTransaction(db, async () => {
    const exercises = await readExercisesUnserialized(db);
    const existing = await read(exercises);
    if (existing.active !== active) {
      await db.runAsync(`UPDATE ${table} SET active = ?, updated_at = ? WHERE id = ?`, [
        active ? 1 : 0,
        now,
        id,
      ]);
    }
    result = await read(exercises);
  });
  return result!;
}

function checkName(
  name: string,
  others: string[],
): { ok: true; name: string } | { ok: false; error: NameError } {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: 'REQUIRED' };
  if (trimmed.length > WORKOUT_NAME_MAX_LENGTH) return { ok: false, error: 'TOO_LONG' };
  const key = trimmed.toLocaleLowerCase();
  if (others.some((o) => o.trim().toLocaleLowerCase() === key)) return { ok: false, error: 'DUPLICATE' };
  return { ok: true, name: trimmed };
}

async function otherNames(
  db: PlayerDb,
  table: 'workout_blocks' | 'workout_templates',
  except: string | null,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string; name: string }>(`SELECT id, name FROM ${table}`, []);
  return rows.filter((r) => r.id !== except).map((r) => String(r.name));
}

async function validateBlock(
  db: PlayerDb,
  input: BlockInput,
  exercises: Exercise[],
  except: string | null,
): Promise<{ ok: true; name: string } | { ok: false; errors: BlockErrors }> {
  const errors: BlockErrors = {};
  const name = checkName(input.name, await otherNames(db, 'workout_blocks', except));
  if (!name.ok) errors.name = name.error;
  if (input.items.length === 0) errors.items = 'REQUIRED';
  const itemErrors: Record<number, PrescriptionErrors> = {};
  input.items.forEach((item, index) => {
    const exercise = exercises.find((e) => e.id === item.exerciseId);
    if (!exercise) throw new TrainingNotFoundError('exercise', item.exerciseId);
    const valid = validatePrescription(exercise.measurement, item.prescription);
    if (!valid.ok) itemErrors[index] = valid.errors;
  });
  if (Object.keys(itemErrors).length > 0) errors.itemErrors = itemErrors;
  return Object.keys(errors).length === 0 && name.ok ? { ok: true, name: name.name } : { ok: false, errors };
}

async function validateTemplate(
  db: PlayerDb,
  input: TemplateInput,
  except: string | null,
): Promise<{ ok: true; name: string } | { ok: false; errors: TemplateErrors }> {
  const errors: TemplateErrors = {};
  const name = checkName(input.name, await otherNames(db, 'workout_templates', except));
  if (!name.ok) errors.name = name.error;
  if (input.blockIds.length === 0) errors.blocks = 'REQUIRED';
  for (const blockId of input.blockIds) {
    const row = await db.getFirstAsync('SELECT id FROM workout_blocks WHERE id = ?', [blockId]);
    if (row === null) throw new TrainingNotFoundError('block', blockId);
  }
  return Object.keys(errors).length === 0 && name.ok ? { ok: true, name: name.name } : { ok: false, errors };
}

async function writeBlockItems(db: PlayerDb, blockId: string, input: BlockInput): Promise<void> {
  for (const [position, item] of input.items.entries()) {
    const p = item.prescription;
    await db.runAsync(
      `INSERT INTO workout_block_items (block_id, position, exercise_id, sets, target, load_kg, rest_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [blockId, position, item.exerciseId, p.sets, p.target, p.loadKg, p.restSec],
    );
  }
}

async function writeTemplateBlocks(
  db: PlayerDb,
  templateId: string,
  blockIds: readonly string[],
): Promise<void> {
  for (const [position, blockId] of blockIds.entries()) {
    await db.runAsync(
      'INSERT INTO workout_template_blocks (template_id, position, block_id) VALUES (?, ?, ?)',
      [templateId, position, blockId],
    );
  }
}

type HeaderRow = { id: unknown; name: unknown; active: unknown; created_at: unknown; updated_at: unknown };
type ItemRow = {
  block_id: unknown;
  position: unknown;
  exercise_id: unknown;
  sets: unknown;
  target: unknown;
  load_kg: unknown;
  rest_sec: unknown;
};

function header(row: HeaderRow, entity: string) {
  const id = typeof row.id === 'string' ? row.id : null;
  if (id === null || !isUuid(id)) throw new TrainingDataError(`${entity}.id`, 'INVALID_VALUE', id);
  if (typeof row.name !== 'string' || row.name.trim().length === 0) {
    throw new TrainingDataError(`${entity}.name`, 'INVALID_VALUE', id);
  }
  if (row.active !== 0 && row.active !== 1)
    throw new TrainingDataError(`${entity}.active`, 'INVALID_VALUE', id);
  if (!Number.isSafeInteger(row.created_at) || !Number.isSafeInteger(row.updated_at)) {
    throw new TrainingDataError(`${entity}.timestamps`, 'INVALID_VALUE', id);
  }
  return {
    id,
    name: row.name,
    active: row.active === 1,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

const num = (v: unknown): number | null => (v === null ? null : typeof v === 'number' ? v : NaN);

async function readBlocks(db: PlayerDb, exercises: Exercise[]): Promise<WorkoutBlock[]> {
  const rows = await db.getAllAsync<HeaderRow>(
    'SELECT id, name, active, created_at, updated_at FROM workout_blocks ORDER BY created_at, id',
    [],
  );
  const items = await db.getAllAsync<ItemRow>(
    'SELECT * FROM workout_block_items ORDER BY block_id, position',
    [],
  );
  const byExercise = new Map(exercises.map((e) => [e.id, e]));
  return rows.map((row) => {
    const base = header(row, 'block');
    const own = items.filter((i) => i.block_id === base.id);
    if (own.length === 0) throw new TrainingDataError('block.items', 'MISSING_ROW', base.id);
    return {
      ...base,
      items: own.map((i) => {
        const exercise = byExercise.get(String(i.exercise_id));
        if (!exercise) throw new TrainingDataError('block.exercise', 'MISSING_ROW', base.id);
        const stored: Prescription = {
          sets: num(i.sets) as number,
          target: num(i.target),
          loadKg: num(i.load_kg),
          restSec: num(i.rest_sec),
        };
        // Stored numbers must be well-formed; fields the exercise no longer uses are dropped.
        const structural = [stored.target, stored.loadKg].every(
          (v) => v === null || (Number.isFinite(v) && v > 0),
        );
        const prescription = structural ? adaptPrescription(exercise.measurement, stored) : null;
        if (prescription === null) {
          throw new TrainingDataError('block.prescription', 'INVALID_VALUE', base.id);
        }
        return { exercise, prescription };
      }),
    };
  });
}

async function readBlock(db: PlayerDb, id: string, exercises: Exercise[]): Promise<WorkoutBlock> {
  const found = (await readBlocks(db, exercises)).find((b) => b.id === id);
  if (!found) throw new TrainingNotFoundError('block', id);
  return found;
}

async function readTemplates(db: PlayerDb, exercises: Exercise[]): Promise<WorkoutTemplate[]> {
  const blocks = new Map((await readBlocks(db, exercises)).map((b) => [b.id, b]));
  const rows = await db.getAllAsync<HeaderRow>(
    'SELECT id, name, active, created_at, updated_at FROM workout_templates ORDER BY created_at, id',
    [],
  );
  const links = await db.getAllAsync<{ template_id: unknown; block_id: unknown }>(
    'SELECT template_id, block_id FROM workout_template_blocks ORDER BY template_id, position',
    [],
  );
  return rows.map((row) => {
    const base = header(row, 'template');
    const own = links.filter((l) => l.template_id === base.id);
    if (own.length === 0) throw new TrainingDataError('template.blocks', 'MISSING_ROW', base.id);
    return {
      ...base,
      blocks: own.map((l) => {
        const block = blocks.get(String(l.block_id));
        if (!block) throw new TrainingDataError('template.block', 'MISSING_ROW', base.id);
        return block;
      }),
    };
  });
}

export async function readTemplate(
  db: PlayerDb,
  id: string,
  exercises: Exercise[],
): Promise<WorkoutTemplate> {
  const found = (await readTemplates(db, exercises)).find((t) => t.id === id);
  if (!found) throw new TrainingNotFoundError('template', id);
  return found;
}
