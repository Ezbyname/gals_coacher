import {
  flattenEntries,
  groupEntries,
  insertEntry,
  moveEntry,
  removeEntry,
  type CompositionEntry,
} from '@/domain/training/composition';
import {
  defaultPrescription,
  validatePrescription,
  WORKOUT_NAME_MAX_LENGTH,
  type Prescription,
  type PrescriptionErrors,
} from '@/domain/training/training';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { readExercisesUnserialized } from '../exercises/exerciseRepository';
import { PlayerArchivedError } from '../players/errors';
import type { PlayerDb } from '../players/playerDb';

import { TrainingNotFoundError, TrainingRuleError } from './errors';
import {
  insertPlanItem,
  readPlan,
  snapshotOf,
  type NewPlanItem,
  type PlannedItem,
  type PlannedWorkout,
} from './trainingRepository';
import { readBlock, writeTransaction } from './workoutRepository';

/**
 * QB-WORKOUT-BUILDER-001A — compose a Player's PlannedWorkout (the WHAT): copied Block sections and standalone
 * Exercises in ONE persisted order. Every operation is one write transaction; a refused or failed edit leaves the
 * database exactly as it was.
 *
 * Rules (owner decisions 2026-10-15/16):
 * - A Block is COPIED in (items + prescriptions); `source_block_id` is provenance only. Editing the plan never
 *   changes the Block, another plan or another Player's plan; editing the Block later never changes a plan.
 * - Editable until a TrainingSession exists for the plan (PLAN_ALREADY_STARTED afterwards) — not until COMPLETED.
 * - An archived Player's plan takes no edits (PlayerArchivedError); an inactive Block / Exercise cannot be newly
 *   added (BLOCK_INACTIVE / EXERCISE_INACTIVE); nothing is silently dropped or clamped (POSITION_OUT_OF_RANGE).
 * - The plan holds no date or time: CalendarEvent stays the only schedule (no link in this slice).
 * Entry indexes: a section (all items of one Block copy) or one standalone Exercise counts as ONE entry.
 */

export type PlanNameError = 'REQUIRED' | 'TOO_LONG';
export type CreatePlanResult =
  | { readonly ok: true; readonly plan: PlannedWorkout }
  | { readonly ok: false; readonly errors: { name: PlanNameError } };
export type SavePlanItemResult =
  | { readonly ok: true; readonly plan: PlannedWorkout }
  | { readonly ok: false; readonly errors: PrescriptionErrors };

type Deps = { clock: Clock };

/** A new, EMPTY planned workout for an active Player (add Blocks / Exercises next). */
export async function createPlannedWorkout(
  db: PlayerDb,
  input: { playerId: string; name: string },
  deps: { ids: IdService; clock: Clock },
): Promise<CreatePlanResult> {
  const now = deps.clock.wallNow();
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, errors: { name: 'REQUIRED' } };
  if (name.length > WORKOUT_NAME_MAX_LENGTH) return { ok: false, errors: { name: 'TOO_LONG' } };
  let result = null as CreatePlanResult | null;
  await writeTransaction(db, async () => {
    const player = await db.getFirstAsync<{ archived_at: unknown }>('SELECT archived_at FROM players WHERE id = ?', [input.playerId]);
    if (player === null) throw new TrainingNotFoundError('player', input.playerId);
    if (player.archived_at !== null) throw new PlayerArchivedError(input.playerId);
    const id = deps.ids.newUuid();
    await db.runAsync(
      'INSERT INTO planned_workouts (id, player_id, template_id, name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)',
      [id, input.playerId, name, now, now],
    );
    result = { ok: true, plan: await readPlan(db, id) };
  });
  return result!;
}

/**
 * Copies a reusable Block into the plan as one new section (at entry index `at`, default: the end). The Block must be
 * active and so must each of its Exercises. Later edits to either side never reach the other.
 */
export async function addBlockToPlannedWorkout(
  db: PlayerDb,
  planId: string,
  blockId: string,
  deps: { ids: IdService; clock: Clock },
  at?: number,
): Promise<PlannedWorkout> {
  return edit(db, planId, deps, async (plan) => {
    const exercises = await readExercisesUnserialized(db);
    const block = await readBlock(db, blockId, exercises);
    if (!block.active) throw new TrainingRuleError('BLOCK_INACTIVE');
    if (block.items.some((i) => !i.exercise.active)) throw new TrainingRuleError('EXERCISE_INACTIVE');
    const sectionId = deps.ids.newUuid();
    const section: CompositionEntry<NewPlanItem> = {
      kind: 'SECTION',
      sectionId,
      blockName: block.name,
      items: block.items.map((i) => ({
        blockName: block.name,
        sectionId,
        sourceBlockId: block.id,
        exercise: snapshotOf(i.exercise),
        prescription: { ...i.prescription },
      })),
    };
    return placed(plan, section, at);
  });
}

/**
 * Adds one standalone Exercise (no Block) at entry index `at` (default: the end) with its default prescription, or
 * the given one. The Exercise must be active. An invalid prescription is returned (nothing written).
 */
export async function addExerciseToPlannedWorkout(
  db: PlayerDb,
  planId: string,
  exerciseId: string,
  deps: Deps,
  options: { at?: number; prescription?: Prescription } = {},
): Promise<SavePlanItemResult> {
  let errors: PrescriptionErrors | null = null;
  const plan = await edit(db, planId, deps, async (current) => {
    const exercises = await readExercisesUnserialized(db);
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) throw new TrainingNotFoundError('exercise', exerciseId);
    if (!exercise.active) throw new TrainingRuleError('EXERCISE_INACTIVE');
    const prescription = options.prescription ?? defaultPrescription(exercise.measurement, exercise.defaults);
    const valid = validatePrescription(exercise.measurement, prescription);
    if (!valid.ok) {
      errors = valid.errors;
      return null; // nothing to write
    }
    const entry: CompositionEntry<NewPlanItem> = {
      kind: 'EXERCISE',
      item: { blockName: null, sectionId: null, sourceBlockId: null, exercise: snapshotOf(exercise), prescription },
    };
    return placed(current, entry, options.at);
  });
  return errors ? { ok: false, errors } : { ok: true, plan };
}

/** Removes entry `index`: a whole Block section or one standalone Exercise. */
export async function removePlannedEntry(db: PlayerDb, planId: string, index: number, deps: Deps): Promise<PlannedWorkout> {
  return edit(db, planId, deps, async (plan) => {
    const next = removeEntry(entriesOf(plan), index);
    if (next === null) throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
    return next;
  });
}

/** Moves entry `from` so it ends at entry index `to` (one deterministic order for Blocks and Exercises alike). */
export async function movePlannedEntry(db: PlayerDb, planId: string, from: number, to: number, deps: Deps): Promise<PlannedWorkout> {
  return edit(db, planId, deps, async (plan) => {
    const next = moveEntry(entriesOf(plan), from, to);
    if (next === null) throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
    return next;
  });
}

/**
 * Sets the workout-specific prescription of the item at `position` (sets / target / load / rest). Only this plan
 * changes — never the source Block or another plan. An invalid prescription is returned (nothing written).
 */
export async function updatePlannedItem(
  db: PlayerDb,
  planId: string,
  position: number,
  prescription: Prescription,
  deps: Deps,
): Promise<SavePlanItemResult> {
  const now = deps.clock.wallNow();
  let result = null as SavePlanItemResult | null;
  await writeTransaction(db, async () => {
    const plan = await editablePlan(db, planId);
    const item = plan.items.find((i) => i.position === position);
    if (!item) throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
    const valid = validatePrescription(item.exercise.measurement, prescription);
    if (!valid.ok) {
      result = { ok: false, errors: valid.errors };
      return;
    }
    await db.runAsync(
      'UPDATE planned_workout_items SET sets = ?, target = ?, load_kg = ?, rest_sec = ? WHERE planned_workout_id = ? AND position = ?',
      [prescription.sets, prescription.target, prescription.loadKg, prescription.restSec, planId, position],
    );
    await db.runAsync('UPDATE planned_workouts SET updated_at = ? WHERE id = ?', [now, planId]);
    result = { ok: true, plan: await readPlan(db, planId) };
  });
  return result!;
}

// ---------------------------------------------------------------- builder save (one atomic write)

/**
 * What the Workout Builder saves: an ordered list of entries, each a REFERENCE the repository resolves itself
 * (it never trusts exercise names / measurements sent from the screen):
 * - KEEP: items of the saved plan, by their stored positions, with the (possibly edited) prescriptions;
 * - BLOCK: a reusable Block to copy as a NEW section (active Block, active Exercises);
 * - EXERCISE: a standalone Exercise (active).
 */
export type SaveEntry =
  | { readonly kind: 'KEEP'; readonly positions: readonly number[]; readonly prescriptions: readonly Prescription[] }
  | { readonly kind: 'BLOCK'; readonly blockId: string; readonly prescriptions: readonly Prescription[] }
  | { readonly kind: 'EXERCISE'; readonly exerciseId: string; readonly prescription: Prescription };
export interface SavePlanInput {
  /** null = a NEW plan (created only now); otherwise the saved plan being edited. */
  readonly planId: string | null;
  readonly playerId: string;
  readonly name: string;
  readonly entries: readonly SaveEntry[];
}
export interface SavePlanErrors {
  name?: PlanNameError;
  /** Prescription errors by "entryIndex.itemIndex". */
  items?: Record<string, PrescriptionErrors>;
}
export type SavePlanResult =
  | { readonly ok: true; readonly plan: PlannedWorkout }
  | { readonly ok: false; readonly errors: SavePlanErrors };

/**
 * Saves the Builder's composition in ONE transaction: creates the plan (only now, never when the Builder opens) or
 * replaces an editable plan's name and items. Validation problems are returned and nothing is written; a rule
 * refusal throws and nothing is written: an empty composition (PLAN_EMPTY), an archived Player, a plan that already
 * has a session (PLAN_ALREADY_STARTED), an inactive Block / Exercise among the NEW content, a position that does
 * not exist. Items kept from the saved plan stay as they were (existing content), only their prescription changes.
 */
export async function savePlannedWorkout(
  db: PlayerDb,
  input: SavePlanInput,
  deps: { ids: IdService; clock: Clock },
): Promise<SavePlanResult> {
  const now = deps.clock.wallNow();
  const name = input.name.trim();
  const errors: SavePlanErrors = {};
  if (name.length === 0) errors.name = 'REQUIRED';
  else if (name.length > WORKOUT_NAME_MAX_LENGTH) errors.name = 'TOO_LONG';
  let result = null as SavePlanResult | null;
  await writeTransaction(db, async () => {
    let stored: PlannedWorkout | null = null;
    if (input.planId === null) {
      const player = await db.getFirstAsync<{ archived_at: unknown }>('SELECT archived_at FROM players WHERE id = ?', [input.playerId]);
      if (player === null) throw new TrainingNotFoundError('player', input.playerId);
      if (player.archived_at !== null) throw new PlayerArchivedError(input.playerId);
    } else {
      stored = await editablePlan(db, input.planId);
      if (stored.playerId !== input.playerId) throw new TrainingNotFoundError('plannedWorkout', input.planId);
    }
    const exercises = await readExercisesUnserialized(db);
    const items: NewPlanItem[] = [];
    const itemErrors: Record<string, PrescriptionErrors> = {};
    const used = new Set<number>();
    const check = (key: string, item: NewPlanItem) => {
      const valid = validatePrescription(item.exercise.measurement, item.prescription);
      if (!valid.ok) itemErrors[key] = valid.errors;
      items.push(item);
    };
    for (const [e, entry] of input.entries.entries()) {
      if (entry.kind === 'KEEP') {
        if (stored === null || entry.prescriptions.length !== entry.positions.length) {
          throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
        }
        for (const [i, position] of entry.positions.entries()) {
          const old = stored.items.find((x) => x.position === position);
          if (!old || used.has(position)) throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
          used.add(position);
          check(`${e}.${i}`, { ...asNew(old), prescription: entry.prescriptions[i]! });
        }
      } else if (entry.kind === 'BLOCK') {
        const block = await readBlock(db, entry.blockId, exercises);
        if (!block.active) throw new TrainingRuleError('BLOCK_INACTIVE');
        if (block.items.some((i) => !i.exercise.active)) throw new TrainingRuleError('EXERCISE_INACTIVE');
        if (entry.prescriptions.length !== block.items.length) throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
        const sectionId = deps.ids.newUuid(); // every copy is its own section (the same Block may be copied twice)
        for (const [i, item] of block.items.entries()) {
          check(`${e}.${i}`, {
            blockName: block.name,
            sectionId,
            sourceBlockId: block.id,
            exercise: snapshotOf(item.exercise),
            prescription: entry.prescriptions[i]!,
          });
        }
      } else {
        const exercise = exercises.find((x) => x.id === entry.exerciseId);
        if (!exercise) throw new TrainingNotFoundError('exercise', entry.exerciseId);
        if (!exercise.active) throw new TrainingRuleError('EXERCISE_INACTIVE');
        check(`${e}.0`, { blockName: null, sectionId: null, sourceBlockId: null, exercise: snapshotOf(exercise), prescription: entry.prescription });
      }
    }
    if (errors.name || Object.keys(itemErrors).length > 0) {
      result = { ok: false, errors: { ...errors, ...(Object.keys(itemErrors).length > 0 ? { items: itemErrors } : {}) } };
      return;
    }
    if (items.length === 0) throw new TrainingRuleError('PLAN_EMPTY');
    let planId = input.planId;
    if (planId === null) {
      planId = deps.ids.newUuid();
      await db.runAsync(
        'INSERT INTO planned_workouts (id, player_id, template_id, name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)',
        [planId, input.playerId, name, now, now],
      );
    } else {
      await db.runAsync('DELETE FROM planned_workout_items WHERE planned_workout_id = ?', [planId]);
      await db.runAsync('UPDATE planned_workouts SET name = ?, updated_at = ? WHERE id = ?', [name, now, planId]);
    }
    for (const [position, item] of items.entries()) await insertPlanItem(db, planId, position, item);
    result = { ok: true, plan: await readPlan(db, planId) };
  });
  return result!;
}

// ---------------------------------------------------------------- internals

/** The plan, only if it can be edited now: it exists, its Player is active, and NO session exists for it. */
async function editablePlan(db: PlayerDb, planId: string): Promise<PlannedWorkout> {
  const exists = await db.getFirstAsync('SELECT id FROM planned_workouts WHERE id = ?', [planId]);
  if (exists === null) throw new TrainingNotFoundError('plannedWorkout', planId);
  const plan = await readPlan(db, planId);
  const player = await db.getFirstAsync<{ archived_at: unknown }>('SELECT archived_at FROM players WHERE id = ?', [plan.playerId]);
  if (player !== null && player.archived_at !== null) throw new PlayerArchivedError(plan.playerId);
  if (plan.sessionId !== null) throw new TrainingRuleError('PLAN_ALREADY_STARTED'); // frozen once execution began
  return plan;
}

const asNew = (item: PlannedItem): NewPlanItem => ({
  blockName: item.blockName,
  sectionId: item.sectionId,
  sourceBlockId: item.sourceBlockId,
  exercise: item.exercise,
  prescription: item.prescription,
});
const entriesOf = (plan: PlannedWorkout): CompositionEntry<NewPlanItem>[] => groupEntries(plan.items.map(asNew));

function placed(plan: PlannedWorkout, entry: CompositionEntry<NewPlanItem>, at: number | undefined) {
  const next = insertEntry(entriesOf(plan), entry, at);
  if (next === null) throw new TrainingRuleError('POSITION_OUT_OF_RANGE');
  return next;
}

/**
 * One composition edit: check the plan is editable, compute the new ordered entries (null = nothing to write),
 * replace the items, touch the plan. Inside ONE write transaction, so a failure anywhere rolls everything back.
 */
async function edit(
  db: PlayerDb,
  planId: string,
  deps: Deps,
  change: (plan: PlannedWorkout) => Promise<CompositionEntry<NewPlanItem>[] | null>,
): Promise<PlannedWorkout> {
  const now = deps.clock.wallNow();
  let result = null as PlannedWorkout | null;
  await writeTransaction(db, async () => {
    const plan = await editablePlan(db, planId);
    const next = await change(plan);
    if (next === null) {
      result = plan;
      return;
    }
    await db.runAsync('DELETE FROM planned_workout_items WHERE planned_workout_id = ?', [planId]);
    for (const [position, item] of flattenEntries(next).entries()) await insertPlanItem(db, planId, position, item);
    await db.runAsync('UPDATE planned_workouts SET updated_at = ? WHERE id = ?', [now, planId]);
    result = await readPlan(db, planId);
  });
  return result!;
}
