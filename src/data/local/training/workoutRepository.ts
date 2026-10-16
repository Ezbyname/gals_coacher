import type { Exercise } from '@/domain/exercise/exercise';
import { isUuid } from '@/domain/ids';
import { builtinTaxonomyNode } from '@/domain/taxonomy/nodes';
import { isVisible } from '@/domain/taxonomy/taxonomy';
import {
  classificationError,
  NO_CLASSIFICATION,
  type ClassificationError,
  type TemplateClassification,
} from '@/domain/taxonomy/templateClassification';
import {
  adaptPrescription,
  defaultPrescription,
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
import { TaxonomyNodeNotFoundError } from '../taxonomy/errors';
import { readTaxonomyUnserialized } from '../taxonomy/taxonomyRepository';

import { TrainingDataError, TrainingNotFoundError, TrainingRuleError, type UnavailableItems } from './errors';

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
  /** The coach's categories (TRAIN-TAXONOMY-001E): discovery metadata, never snapshotted into plans. */
  readonly classification: TemplateClassification;
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
  /** Item indexes whose Exercise is inactive and would be NEWLY added (QB safety gate S2). */
  inactiveItems?: number[];
  /** Prescription errors by item index. */
  itemErrors?: Record<number, PrescriptionErrors>;
}
export type SaveBlockResult =
  | { readonly ok: true; readonly block: WorkoutBlock }
  | { readonly ok: false; readonly errors: BlockErrors };

export interface TemplateInput {
  readonly name: string;
  readonly blockIds: readonly string[];
  /** Omitted: a new template has none and an edited one keeps what it had. */
  readonly classification?: TemplateClassification;
}
export interface TemplateErrors {
  name?: NameError;
  blocks?: 'REQUIRED';
  /** Block ids that are hidden (inactive) and would be NEWLY added (QB safety gate S2). */
  inactiveBlocks?: string[];
  categories?: Exclude<ClassificationError, 'UNKNOWN_NODE'>;
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
    result = await insertBlock(db, input, deps.ids, now);
  });
  return result!;
}

/** Validates and inserts a NEW block (every Exercise must be active), inside an open write transaction. */
async function insertBlock(db: PlayerDb, input: BlockInput, ids: IdService, now: number): Promise<SaveBlockResult> {
  const exercises = await readExercisesUnserialized(db);
  const checked = await validateBlock(db, input, exercises, null, []);
  if (!checked.ok) return checked;
  const familyId = await ensureLocalFamily(db, ids);
  const id = ids.newUuid();
  await db.runAsync(
    'INSERT INTO workout_blocks (id, family_id, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
    [id, familyId, checked.name, now, now],
  );
  await writeBlockItems(db, id, input);
  return { ok: true, block: await readBlock(db, id, exercises) };
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
    result = await applyBlockUpdate(db, id, input, now);
  });
  return result!;
}

/** The update itself, inside an open write transaction (shared by updateBlock and addExerciseToBlock). */
async function applyBlockUpdate(db: PlayerDb, id: string, input: BlockInput, now: number): Promise<SaveBlockResult> {
  const exercises = await readExercisesUnserialized(db);
  const before = await readBlock(db, id, exercises); // exists and is well-formed
  // Existing content stays as it was: only items NEWLY added must be active (QB safety gate S2).
  const checked = await validateBlock(
    db,
    input,
    exercises,
    id,
    before.items.map((i) => i.exercise.id),
  );
  if (!checked.ok) return checked;
  await db.runAsync('UPDATE workout_blocks SET name = ?, updated_at = ? WHERE id = ?', [checked.name, now, id]);
  await db.runAsync('DELETE FROM workout_block_items WHERE block_id = ?', [id]);
  await writeBlockItems(db, id, input);
  return { ok: true, block: await readBlock(db, id, exercises) };
}

/**
 * QB-BLOCK-LIBRARY — a NEW, independent block with the same exercises and prescriptions (new id, active,
 * own future edits; the original is never touched). The name is "<name> (<copyLabel>)", then
 * "(<copyLabel> 2)"…, kept unique and within the name limit. A hidden block cannot be duplicated
 * (BLOCK_INACTIVE) and a block holding an inactive Exercise is refused with `inactiveItems` (S2:
 * inactive content is not available for NEW compositions).
 */
export async function duplicateBlock(
  db: PlayerDb,
  id: string,
  deps: { ids: IdService; clock: Clock; copyLabel: string },
): Promise<SaveBlockResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveBlockResult | null;
  await writeTransaction(db, async () => {
    const exercises = await readExercisesUnserialized(db);
    const source = await readBlock(db, id, exercises);
    if (!source.active) throw new TrainingRuleError('BLOCK_INACTIVE');
    const taken = new Set((await otherNames(db, 'workout_blocks', null)).map((n) => n.trim().toLocaleLowerCase()));
    const name = copyName(source.name, deps.copyLabel, taken);
    result = await insertBlock(
      db,
      {
        name,
        items: source.items.map((i) => ({ exerciseId: i.exercise.id, prescription: i.prescription })),
      },
      deps.ids,
      now,
    );
  });
  return result!;
}

/** "<name> (copy)", "<name> (copy 2)"…: unique (case-insensitive) and at most WORKOUT_NAME_MAX_LENGTH. */
export function copyName(name: string, copyLabel: string, taken: ReadonlySet<string>): string {
  for (let n = 1; n < 1000; n += 1) {
    const suffix = ` (${n === 1 ? copyLabel : `${copyLabel} ${n}`})`;
    const base = name.trim().slice(0, Math.max(1, WORKOUT_NAME_MAX_LENGTH - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new Error('no free copy name');
}

/**
 * QB-BLOCK-LIBRARY — Exercise Details → Add to Block: appends the Exercise with its default prescription
 * (the caller then opens the block to adjust it). The block must be active (BLOCK_INACTIVE) and the
 * Exercise active (EXERCISE_INACTIVE); nothing is written otherwise.
 */
export async function addExerciseToBlock(
  db: PlayerDb,
  blockId: string,
  exerciseId: string,
  deps: { clock: Clock },
): Promise<SaveBlockResult> {
  const now = deps.clock.wallNow();
  let result = null as SaveBlockResult | null;
  await writeTransaction(db, async () => {
    const exercises = await readExercisesUnserialized(db);
    const block = await readBlock(db, blockId, exercises);
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) throw new TrainingNotFoundError('exercise', exerciseId);
    if (!block.active) throw new TrainingRuleError('BLOCK_INACTIVE');
    if (!exercise.active) throw new TrainingRuleError('EXERCISE_INACTIVE');
    result = await applyBlockUpdate(
      db,
      blockId,
      {
        name: block.name,
        items: [
          ...block.items.map((i) => ({ exerciseId: i.exercise.id, prescription: i.prescription })),
          { exerciseId, prescription: defaultPrescription(exercise.measurement, exercise.defaults) },
        ],
      },
      now,
    );
  });
  return result!;
}

/**
 * QB safety gate S2 — what a Template still contains that is not available for new use: hidden Blocks and
 * inactive Exercises (each listed once). A NEW plan from such a Template is refused until the user resolves it.
 */
export function unavailableItemsOf(template: WorkoutTemplate): UnavailableItems {
  const blocks = new Map<string, { id: string; name: string }>();
  const exercises = new Map<string, { id: string; name: Exercise['name'] }>();
  for (const block of template.blocks) {
    if (!block.active) blocks.set(block.id, { id: block.id, name: block.name });
    for (const item of block.items) {
      if (!item.exercise.active) exercises.set(item.exercise.id, { id: item.exercise.id, name: item.exercise.name });
    }
  }
  return { blocks: [...blocks.values()], exercises: [...exercises.values()] };
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
    if (input.classification) await writeClassification(db, id, input.classification, now);
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
    const before = await readTemplate(db, id, exercises);
    const checked = await validateTemplate(
      db,
      input,
      id,
      before.classification,
      before.blocks.map((b) => b.id),
    );
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
    if (input.classification) await writeClassification(db, id, input.classification, now);
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

/** One occurrence of `id` in `kept` is consumed when present: content the block already had stays allowed. */
function takeExisting(kept: string[], id: string): boolean {
  const at = kept.indexOf(id);
  if (at < 0) return false;
  kept.splice(at, 1);
  return true;
}

async function validateBlock(
  db: PlayerDb,
  input: BlockInput,
  exercises: Exercise[],
  except: string | null,
  /** Exercise ids the block already holds (an edit): inactive ones among them are kept, never newly added. */
  existingExerciseIds: readonly string[],
): Promise<{ ok: true; name: string } | { ok: false; errors: BlockErrors }> {
  const errors: BlockErrors = {};
  const name = checkName(input.name, await otherNames(db, 'workout_blocks', except));
  if (!name.ok) errors.name = name.error;
  if (input.items.length === 0) errors.items = 'REQUIRED';
  const itemErrors: Record<number, PrescriptionErrors> = {};
  const inactiveItems: number[] = [];
  const kept = [...existingExerciseIds];
  input.items.forEach((item, index) => {
    const exercise = exercises.find((e) => e.id === item.exerciseId);
    if (!exercise) throw new TrainingNotFoundError('exercise', item.exerciseId);
    const existing = takeExisting(kept, exercise.id);
    if (!exercise.active && !existing) inactiveItems.push(index);
    const valid = validatePrescription(exercise.measurement, item.prescription);
    if (!valid.ok) itemErrors[index] = valid.errors;
  });
  if (inactiveItems.length > 0) errors.inactiveItems = inactiveItems;
  if (Object.keys(itemErrors).length > 0) errors.itemErrors = itemErrors;
  return Object.keys(errors).length === 0 && name.ok ? { ok: true, name: name.name } : { ok: false, errors };
}

async function validateTemplate(
  db: PlayerDb,
  input: TemplateInput,
  except: string | null,
  previous: TemplateClassification = NO_CLASSIFICATION,
  /** Block ids the template already holds (an edit): hidden ones among them are kept, never newly added. */
  existingBlockIds: readonly string[] = [],
): Promise<{ ok: true; name: string } | { ok: false; errors: TemplateErrors }> {
  const errors: TemplateErrors = {};
  const name = checkName(input.name, await otherNames(db, 'workout_templates', except));
  if (!name.ok) errors.name = name.error;
  if (input.blockIds.length === 0) errors.blocks = 'REQUIRED';
  const inactiveBlocks: string[] = [];
  const kept = [...existingBlockIds];
  for (const blockId of input.blockIds) {
    const row = await db.getFirstAsync<{ active: unknown }>('SELECT active FROM workout_blocks WHERE id = ?', [blockId]);
    if (row === null) throw new TrainingNotFoundError('block', blockId);
    const existing = takeExisting(kept, blockId);
    if (row.active !== 1 && !existing) inactiveBlocks.push(blockId);
  }
  if (inactiveBlocks.length > 0) errors.inactiveBlocks = inactiveBlocks;
  if (input.classification) {
    // A NEW category must be selectable now (active, with an active exercise);
    // one the template already had stays, even if it has become inactive.
    const taxonomy = await readTaxonomyUnserialized(db);
    const exercises = await readExercisesUnserialized(db);
    const activeIds = new Set(exercises.filter((e) => e.active).map((e) => e.id));
    const problem = classificationError(
      input.classification,
      taxonomy,
      (key) => isVisible(taxonomy, key, activeIds),
      previous,
    );
    if (problem === 'UNKNOWN_NODE') {
      throw new TaxonomyNodeNotFoundError(input.classification.nodeKeys.find((k) => taxonomy.node(k) === null)!);
    }
    if (problem !== null) errors.categories = problem;
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

/** Replaces the template's classification as a set (rows are never rewritten in place). */
async function writeClassification(
  db: PlayerDb,
  templateId: string,
  classification: TemplateClassification,
  now: number,
): Promise<void> {
  await db.runAsync('DELETE FROM workout_template_taxonomy WHERE template_id = ?', [templateId]);
  for (const [position, nodeId] of classification.nodeKeys.entries()) {
    await db.runAsync(
      'INSERT INTO workout_template_taxonomy (template_id, node_id, position, is_primary, created_at) VALUES (?, ?, ?, ?, ?)',
      [templateId, nodeId, position, classification.primary === nodeId ? 1 : 0, now],
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

export async function readBlock(db: PlayerDb, id: string, exercises: Exercise[]): Promise<WorkoutBlock> {
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
  const categories = await db.getAllAsync<{ template_id: unknown; node_id: unknown; is_primary: unknown }>(
    'SELECT template_id, node_id, is_primary FROM workout_template_taxonomy ORDER BY template_id, position',
    [],
  );
  return rows.map((row) => {
    const base = header(row, 'template');
    const own = links.filter((l) => l.template_id === base.id);
    if (own.length === 0) throw new TrainingDataError('template.blocks', 'MISSING_ROW', base.id);
    const tags = categories.filter((c) => c.template_id === base.id);
    for (const tag of tags) {
      // Fail closed: only curated built-in nodes exist in V1.
      const known = typeof tag.node_id === 'string' && builtinTaxonomyNode(tag.node_id) !== null;
      if (!known || (tag.is_primary !== 0 && tag.is_primary !== 1)) {
        throw new TrainingDataError('template.category', 'INVALID_VALUE', base.id);
      }
    }
    const classification: TemplateClassification = {
      nodeKeys: tags.map((c) => c.node_id as string),
      primary: (tags.find((c) => c.is_primary === 1)?.node_id as string | undefined) ?? null,
    };
    return {
      ...base,
      classification,
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
