import type { Exercise } from '@/domain/exercise/exercise';
import { isTimeSemantics, storableTimeSemantics, type TimeSemantics } from '@/domain/exercise/timeSemantics';
import { SECTION_ROLES, type SectionRole } from '@/domain/training/professional/types';
import { validatePrescription, WORKOUT_NAME_MAX_LENGTH, type Prescription } from '@/domain/training/training';
import type { Clock } from '@/services/clock/Clock';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';
import { readExercisesUnserialized } from '../exercises/exerciseRepository';
import { ensureLocalFamily } from '../players/localFamily';
import type { PlayerDb } from '../players/playerDb';

import { TrainingDataError, TrainingNotFoundError, TrainingRuleError } from './errors';
import { copyName, writeTransaction } from './workoutRepository';

/**
 * WORKOUT-TEMPLATES-001 — the Family's PERSONAL workout templates (schema v23). A personal template is a CONTENT SNAPSHOT taken from a
 * Builder draft ("Save as template"): sections (with their role), exercises by stable id, order and the prescription. It is written once and
 * sealed; afterwards only Rename, Duplicate and Archive exist (no in-place content editing, no Replace). The database enforces this: sections
 * and items can never change or be deleted, and the template row accepts only name / archive changes once sealed. Archive is `active = 0`
 * (a template is never deleted); it never touches a plan, a session or any history, because a plan copies its content and keeps no link here.
 * Names are unique, case-insensitively, among the ACTIVE templates of the Family; a duplicate is refused (never silently overwritten or renamed).
 */

export type TemplateNameError = 'REQUIRED' | 'TOO_LONG' | 'DUPLICATE';
/**
 * - EMPTY: no section at all. EMPTY_SECTION: a section without exercises.
 * - DUPLICATE_ROLE: a standard role (Warm-up / Main / Cool-down) used by two sections (a role identifies one section).
 * - CUSTOM_NAME_REQUIRED: a custom section without a name.
 * - EXERCISE_UNKNOWN / EXERCISE_INACTIVE: an exercise that is not available for NEW content.
 * - INVALID_PRESCRIPTION: a prescription its exercise's measurement does not allow.
 */
export type TemplateContentError = 'EMPTY' | 'EMPTY_SECTION' | 'DUPLICATE_ROLE' | 'CUSTOM_NAME_REQUIRED' | 'EXERCISE_UNKNOWN' | 'EXERCISE_INACTIVE' | 'INVALID_PRESCRIPTION';

export interface PersonalTemplateItem {
  readonly exerciseId: string;
  readonly prescription: Prescription;
}
export interface PersonalTemplateSection {
  readonly role: SectionRole;
  /** The author's name for a CUSTOM section; null for a standard one (its role names it). */
  readonly name: string | null;
  readonly items: readonly PersonalTemplateItem[];
}
export interface PersonalTemplateInput {
  readonly name: string;
  readonly sections: readonly PersonalTemplateSection[];
}
export interface PersonalTemplate {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly sections: readonly PersonalTemplateSection[];
}
export interface PersonalTemplateErrors {
  name?: TemplateNameError;
  content?: TemplateContentError;
}
export type SavePersonalTemplateResult = { ok: true; template: PersonalTemplate } | { ok: false; errors: PersonalTemplateErrors };

/** The comparison key of a name: trimmed, NFC, case-folded (SQLite's own lower() is ASCII only, so the key is computed here). */
export const templateNameKey = (name: string) => name.normalize('NFC').trim().toLocaleLowerCase();

interface Deps {
  ids: IdService;
  clock: Clock;
}

export async function createPersonalTemplate(db: PlayerDb, input: PersonalTemplateInput, deps: Deps): Promise<SavePersonalTemplateResult> {
  const now = deps.clock.wallNow();
  let result = null as SavePersonalTemplateResult | null;
  await writeTransaction(db, async () => {
    result = await insertTemplate(db, input, deps.ids, now);
  });
  return result!;
}

async function insertTemplate(db: PlayerDb, input: PersonalTemplateInput, ids: IdService, now: number): Promise<SavePersonalTemplateResult> {
  const exercises = await readExercisesUnserialized(db);
  const familyId = await ensureLocalFamily(db, ids);
  const errors: PersonalTemplateErrors = {};
  const name = await checkName(db, familyId, input.name, null);
  if (!name.ok) errors.name = name.error;
  const content = checkContent(input.sections, exercises);
  if (content !== null) errors.content = content;
  if (errors.name || errors.content || !name.ok) return { ok: false, errors };
  const id = ids.newUuid();
  await db.runAsync(
    'INSERT INTO user_workout_templates (id, family_id, name, name_key, active, sealed, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)',
    [id, familyId, name.name, templateNameKey(name.name), now, now],
  );
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const [s, section] of input.sections.entries()) {
    await db.runAsync('INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES (?, ?, ?, ?)', [
      id,
      s,
      section.role,
      section.role === 'CUSTOM' ? (section.name ?? '').trim() : null,
    ]);
    for (const [n, item] of section.items.entries()) {
      const type = byId.get(item.exerciseId)!.measurement.type;
      await db.runAsync(
        'INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets, target, load_kg, rest_sec, time_semantics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, s, n, item.exerciseId, item.prescription.sets, item.prescription.target, item.prescription.loadKg, item.prescription.restSec, storableTimeSemantics(type, item.prescription.timeSemantics)],
      );
    }
  }
  await db.runAsync('UPDATE user_workout_templates SET sealed = 1 WHERE id = ?', [id]);
  return { ok: true, template: await readTemplate(db, id) };
}

export function listPersonalTemplates(db: PlayerDb, options: { includeArchived?: boolean } = {}): Promise<PersonalTemplate[]> {
  return writeLess(db, async () => {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM user_workout_templates ${options.includeArchived ? '' : 'WHERE active = 1'} ORDER BY created_at DESC, id`,
      [],
    );
    const out: PersonalTemplate[] = [];
    for (const r of rows) out.push(await readTemplate(db, r.id));
    return out;
  });
}

export function getPersonalTemplate(db: PlayerDb, id: string): Promise<PersonalTemplate | null> {
  return writeLess(db, async () => {
    const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM user_workout_templates WHERE id = ?', [id]);
    return row === null ? null : readTemplate(db, id);
  });
}

/** Rename: the content is untouched; the new name must be free among the ACTIVE templates (the template's own current name is free). */
export async function renamePersonalTemplate(db: PlayerDb, id: string, name: string, deps: { ids: IdService; clock: Clock }): Promise<SavePersonalTemplateResult> {
  const now = deps.clock.wallNow();
  let result = null as SavePersonalTemplateResult | null;
  await writeTransaction(db, async () => {
    const row = await requireRow(db, id);
    const checked = await checkName(db, row.family_id, name, row.active === 1 ? id : null);
    if (!checked.ok) {
      result = { ok: false, errors: { name: checked.error } };
      return;
    }
    await db.runAsync('UPDATE user_workout_templates SET name = ?, name_key = ?, updated_at = ? WHERE id = ?', [checked.name, templateNameKey(checked.name), now, id]);
    result = { ok: true, template: await readTemplate(db, id) };
  });
  return result!;
}

/** Archive = active 0 (never a delete): plans, sessions and history are untouched. Archiving an archived template changes nothing. */
export async function archivePersonalTemplate(db: PlayerDb, id: string, deps: { clock: Clock }): Promise<PersonalTemplate> {
  const now = deps.clock.wallNow();
  let result = null as PersonalTemplate | null;
  await writeTransaction(db, async () => {
    const row = await requireRow(db, id);
    if (row.active === 1) await db.runAsync('UPDATE user_workout_templates SET active = 0, updated_at = ? WHERE id = ?', [now, id]);
    result = await readTemplate(db, id);
  });
  return result!;
}

/**
 * Duplicate: a NEW template with the same content under "<name> (<copyLabel>)" (made unique, as for blocks). An archived template cannot be
 * duplicated (TEMPLATE_INACTIVE). The copy is its own template: nothing links it to the source.
 */
export async function duplicatePersonalTemplate(db: PlayerDb, id: string, deps: Deps & { copyLabel: string }): Promise<SavePersonalTemplateResult> {
  const now = deps.clock.wallNow();
  let result = null as SavePersonalTemplateResult | null;
  await writeTransaction(db, async () => {
    const row = await requireRow(db, id);
    if (row.active !== 1) throw new TrainingRuleError('TEMPLATE_INACTIVE');
    const source = await readTemplate(db, id);
    const taken = new Set(
      (await db.getAllAsync<{ name_key: string }>('SELECT name_key FROM user_workout_templates WHERE family_id = ? AND active = 1', [row.family_id])).map((r) => r.name_key),
    );
    const name = copyName(source.name, deps.copyLabel, new Set([...taken]));
    result = await insertTemplate(db, { name, sections: source.sections }, deps.ids, now);
  });
  return result!;
}

// ---------------------------------------------------------------- internals

/** Reads share the connection's serialized queue with writes, so a reader never sees a half-written template. */
const writeLess = <T,>(db: PlayerDb, task: () => Promise<T>): Promise<T> => runSerialized(db, task);

async function requireRow(db: PlayerDb, id: string): Promise<{ family_id: string; active: number }> {
  const row = await db.getFirstAsync<{ family_id: string; active: number }>('SELECT family_id, active FROM user_workout_templates WHERE id = ?', [id]);
  if (row === null) throw new TrainingNotFoundError('template', id);
  return row;
}

async function checkName(
  db: PlayerDb,
  familyId: string,
  raw: string,
  exceptId: string | null,
): Promise<{ ok: true; name: string } | { ok: false; error: TemplateNameError }> {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: 'REQUIRED' };
  if (name.length > WORKOUT_NAME_MAX_LENGTH) return { ok: false, error: 'TOO_LONG' };
  const clash = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM user_workout_templates WHERE family_id = ? AND active = 1 AND name_key = ? AND id <> ?',
    [familyId, templateNameKey(name), exceptId ?? ''],
  );
  return clash === null ? { ok: true, name } : { ok: false, error: 'DUPLICATE' };
}

function checkContent(sections: readonly PersonalTemplateSection[], exercises: readonly Exercise[]): TemplateContentError | null {
  if (sections.length === 0) return 'EMPTY';
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const roles = new Set<SectionRole>();
  for (const section of sections) {
    if (!(SECTION_ROLES as readonly string[]).includes(section.role)) return 'INVALID_PRESCRIPTION';
    if (section.role === 'CUSTOM') {
      if ((section.name ?? '').trim().length === 0) return 'CUSTOM_NAME_REQUIRED';
    } else {
      if (roles.has(section.role)) return 'DUPLICATE_ROLE';
      roles.add(section.role);
    }
    if (section.items.length === 0) return 'EMPTY_SECTION';
    for (const item of section.items) {
      const exercise = byId.get(item.exerciseId);
      if (!exercise) return 'EXERCISE_UNKNOWN';
      if (!exercise.active) return 'EXERCISE_INACTIVE';
      if (!validatePrescription(exercise.measurement, item.prescription).ok) return 'INVALID_PRESCRIPTION';
      const semantics = item.prescription.timeSemantics;
      if (semantics != null && (!isTimeSemantics(semantics) || exercise.measurement.type !== 'TIME')) return 'INVALID_PRESCRIPTION';
    }
  }
  return null;
}

interface TemplateRow {
  id: string;
  name: string;
  active: number;
  created_at: number;
  updated_at: number;
}
interface SectionRow {
  position: number;
  role: string;
  name: string | null;
}
interface ItemRow {
  section_position: number;
  position: number;
  exercise_id: string;
  sets: number;
  target: number | null;
  load_kg: number | null;
  rest_sec: number | null;
  time_semantics: string | null;
}

async function readTemplate(db: PlayerDb, id: string): Promise<PersonalTemplate> {
  const row = await db.getFirstAsync<TemplateRow>('SELECT id, name, active, created_at, updated_at FROM user_workout_templates WHERE id = ?', [id]);
  if (row === null) throw new TrainingNotFoundError('template', id);
  const sections = await db.getAllAsync<SectionRow>('SELECT position, role, name FROM user_workout_template_sections WHERE template_id = ? ORDER BY position', [id]);
  const items = await db.getAllAsync<ItemRow>(
    'SELECT section_position, position, exercise_id, sets, target, load_kg, rest_sec, time_semantics FROM user_workout_template_items WHERE template_id = ? ORDER BY section_position, position',
    [id],
  );
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sections: sections.map((s) => {
      if (!(SECTION_ROLES as readonly string[]).includes(s.role)) throw new TrainingDataError('role', 'INVALID_VALUE', id);
      return {
        role: s.role as SectionRole,
        name: s.name,
        items: items
          .filter((i) => i.section_position === s.position)
          .map((i) => ({
            exerciseId: i.exercise_id,
            prescription: {
              sets: i.sets,
              target: i.target,
              loadKg: i.load_kg,
              restSec: i.rest_sec,
              ...(i.time_semantics !== null && isTimeSemantics(i.time_semantics) ? { timeSemantics: i.time_semantics as TimeSemantics } : {}),
            },
          })),
      };
    }),
  };
}
