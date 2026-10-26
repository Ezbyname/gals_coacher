import type { TimeSemantics } from '@/domain/exercise/timeSemantics';
import { snapshotOf } from '@/data/local/training/trainingRepository';
import type { SaveEntry } from '@/data/local/training/plannedWorkoutCompositionRepository';
import type { PersonalTemplate, PersonalTemplateSection } from '@/data/local/training/personalTemplateRepository';
import type { WorkoutBlock } from '@/data/local/training/workoutRepository';
import type { Exercise } from '@/domain/exercise/exercise';
import { planSectionName, roleFromPlanSectionName, STANDARD_ROLE_ORDER } from '@/domain/training/professional/templateMeta';
import type { SectionRole, StandardSectionRole } from '@/domain/training/professional/types';
import { moveInList } from '@/domain/training/reorder';
import { defaultPrescription, parseEntry, type ExerciseSnapshot, type Prescription } from '@/domain/training/training';

import { formatNumber, type AssignKind } from './trainingLabels';

/**
 * The Workout Builder's LOCAL DRAFT model and its pure transformations (QB-WORKOUT-BUILDER-001B, extended by WORKOUT-TEMPLATES-001):
 * no React, no database. The screen holds a draft; a valid draft is persisted by ONE atomic Save.
 */

export type DItem = { snapshot: ExerciseSnapshot; sets: string; target: string; load: string; rest: string; timeSemantics: TimeSemantics | null };
export type Origin =
  | { type: 'KEEP'; positions: number[] }
  // `order`: which of the Block's own items sits at each place (identity until the user reorders inside the section)
  | { type: 'BLOCK'; blockId: string; order: number[] }
  | { type: 'EXERCISE'; exerciseId: string }
  // WORKOUT-TEMPLATES-001: a section of explicit items (an imported template, or a section the user rearranged); `refs[i]` says where
  // `items[i]` comes from: an EXISTING plan item (`keep`) or a NEW catalog exercise (`exerciseId`)
  | { type: 'ITEMS'; refs: ItemRef[] };
export type ItemRef = { keep: number } | { exerciseId: string };
export type Seed = { kind: AssignKind; id: string };
export type DEntry = {
  key: string;
  kind: 'SECTION' | 'EXERCISE';
  name: string | null;
  origin: Origin;
  items: DItem[];
  /** The section's role, when known (an imported template / a Move-to-section target); otherwise read from its canonical name. */
  role?: SectionRole;
  /** A copied Block section: its items carry that Block's provenance, so they never move to another section. */
  locked?: boolean;
};

export const text = (n: number | null) => (n === null ? '' : formatNumber(n));
export const itemOf = (snapshot: ExerciseSnapshot, p: Prescription): DItem => ({
  snapshot,
  sets: String(p.sets),
  target: text(p.target),
  load: text(p.loadKg),
  rest: text(p.restSec),
  timeSemantics: p.timeSemantics ?? null, // the stored meaning of the seconds value travels with the item (never re-derived)
});
/** The draft fields a Prescription writes into ONE exercise of the draft (TRAINING-PROGRESSION-001: Repeat last plan / Use last performance as baseline). */
export const prescriptionPatch = (p: Prescription): Partial<DItem> => ({
  sets: String(p.sets),
  target: text(p.target),
  load: text(p.loadKg),
  rest: text(p.restSec),
  timeSemantics: p.timeSemantics ?? null,
});
export function numberOf(value: string, time: boolean): number | null {
  if (value.trim() === '') return null;
  return parseEntry(value, time ? 'DURATION_S' : 'LOAD_KG') ?? NaN;
}
export function prescriptionOf(item: DItem): Prescription {
  const type = item.snapshot.measurement.type;
  return {
    sets: numberOf(item.sets, false) ?? NaN,
    target: numberOf(item.target, type === 'DURATION' || type === 'TIME'),
    loadKg: numberOf(item.load, false),
    restSec: numberOf(item.rest, false),
    ...(item.timeSemantics ? { timeSemantics: item.timeSemantics } : {}),
  };
}
export const blockEntryOf = (key: string, block: WorkoutBlock): DEntry => ({
  key,
  kind: 'SECTION',
  name: block.name,
  origin: { type: 'BLOCK', blockId: block.id, order: block.items.map((_, i) => i) },
  items: block.items.map((i) => itemOf(snapshotOf(i.exercise), i.prescription)),
  locked: true,
});
export const exerciseEntryOf = (key: string, exercise: Exercise): DEntry => ({
  key,
  kind: 'EXERCISE',
  name: null,
  origin: { type: 'EXERCISE', exerciseId: exercise.id },
  items: [itemOf(snapshotOf(exercise), defaultPrescription(exercise.measurement, exercise.defaults))],
});
/** QB-WORKOUT-BUILDER-001C: the first entry of a NEW workout opened from Exercise / Block Details (null = no longer available). */
export function seedEntry(seed: Seed, exercises: readonly Exercise[], blocks: readonly WorkoutBlock[]): DEntry | null {
  if (seed.kind === 'BLOCK') {
    const block = blocks.find((b) => b.id === seed.id);
    return block && block.active && block.items.every((i) => i.exercise.active) ? blockEntryOf('seed', block) : null;
  }
  const exercise = exercises.find((e) => e.id === seed.id);
  return exercise && exercise.active ? exerciseEntryOf('seed', exercise) : null;
}
export const signature = (name: string, entries: readonly DEntry[]) =>
  JSON.stringify([name, entries.map((e) => [e.origin, e.items.map((i) => [i.snapshot.exerciseId, i.sets, i.target, i.load, i.rest])])]);

/** The same entry with its items in a new order; the persisted references (kept positions / Block item order) move WITH them. */
export function reorderedItems(entry: DEntry, from: number, to: number): DEntry {
  const items = moveInList(entry.items, from, to);
  if (items === null || entry.kind !== 'SECTION') return entry; // a standalone exercise has no inner order
  if (entry.origin.type === 'KEEP') return { ...entry, items, origin: { type: 'KEEP', positions: moveInList(entry.origin.positions, from, to)! } };
  if (entry.origin.type === 'BLOCK') return { ...entry, items, origin: { ...entry.origin, order: moveInList(entry.origin.order, from, to)! } };
  if (entry.origin.type === 'ITEMS') return { ...entry, items, origin: { type: 'ITEMS', refs: moveInList(entry.origin.refs, from, to)! } };
  return entry;
}

export function toSaveEntries(entries: readonly DEntry[]): SaveEntry[] {
  return entries.map((e): SaveEntry => {
    const prescriptions = e.items.map(prescriptionOf);
    if (e.origin.type === 'KEEP') return { kind: 'KEEP', positions: e.origin.positions, prescriptions };
    if (e.origin.type === 'BLOCK') return { kind: 'BLOCK', blockId: e.origin.blockId, prescriptions, order: e.origin.order };
    if (e.origin.type === 'ITEMS') return { kind: 'SECTION', name: e.name ?? '', items: e.origin.refs.map((ref, i) => ({ ...ref, prescription: prescriptions[i]! })) };
    return { kind: 'EXERCISE', exerciseId: e.origin.exerciseId, prescription: prescriptions[0]! };
  });
}


// ---------------------------------------------------------------------------------------------------- WORKOUT-TEMPLATES-001
type Language = 'he' | 'en';

/** The role of an entry: its own, else (for a plan section that stores none) the exact canonical standard name; standalone = null. */
export const entryRole = (e: DEntry): SectionRole | null => (e.kind !== 'SECTION' ? null : (e.role ?? roleFromPlanSectionName(e.name ?? '')));

/** What each item of a template section will be written as: the template's own dosage, or the exercise's defaults; never a load. */
export function templatePrescription(item: ImportItem, exercise: Exercise): Prescription {
  return item.dosage
    ? { sets: item.dosage.sets, target: item.dosage.target, loadKg: item.loadKg ?? null, restSec: item.dosage.restSec, ...(item.timeSemantics ? { timeSemantics: item.timeSemantics } : {}) }
    : defaultPrescription(exercise.measurement, exercise.defaults);
}

/** What the Builder can import: a built-in Workout Template (a Professional Workout) or a personal template, both reduced to this shape. */
export interface ImportItem {
  readonly exerciseId: string;
  readonly dosage?: { readonly sets: number; readonly target: number | null; readonly restSec: number | null };
  /** Only a personal template carries a load (the built-in ones never do). */
  readonly loadKg?: number | null;
  readonly timeSemantics?: TimeSemantics;
}
export interface ImportSource {
  readonly sections: readonly { readonly role?: SectionRole; readonly name: readonly [he: string, en: string]; readonly items: readonly ImportItem[] }[];
}

/** A personal template as an import source (a section's role travels as data; a standard section is named by its role). */
export const personalTemplateSource = (t: PersonalTemplate): ImportSource => ({
  sections: t.sections.map((section) => ({
    role: section.role,
    name: [section.name ?? '', section.name ?? ''] as const,
    items: section.items.map((i) => ({
      exerciseId: i.exerciseId,
      dosage: { sets: i.prescription.sets, target: i.prescription.target, restSec: i.prescription.restSec },
      loadKg: i.prescription.loadKg,
      ...(i.prescription.timeSemantics ? { timeSemantics: i.prescription.timeSemantics } : {}),
    })),
  })),
});

export type ImportResult = { ok: true; entries: DEntry[] } | { ok: false; reason: 'EXERCISE_UNAVAILABLE'; exerciseId: string };

/**
 * Import a Workout Template (a Professional Workout) into the DRAFT: one section entry per template section, in order, written with
 * the canonical role name (or the section's own name when it has no role). Nothing is written to the database; the registry is only
 * read. When the first imported section has the very same name as the draft's last section they become ONE section (a plan names a
 * section only by its name, so two adjacent sections with one name could not stay apart).
 */
export function importTemplate(
  entries: readonly DEntry[],
  workout: ImportSource,
  exercises: readonly Exercise[],
  language: Language,
  nextKey: () => string,
): ImportResult {
  const added: DEntry[] = [];
  for (const section of workout.sections) {
    const items: DItem[] = [];
    const refs: ItemRef[] = [];
    for (const it of section.items) {
      const exercise = exercises.find((x) => x.id === it.exerciseId);
      if (!exercise || !exercise.active) return { ok: false, reason: 'EXERCISE_UNAVAILABLE', exerciseId: it.exerciseId };
      items.push(itemOf(snapshotOf(exercise), templatePrescription(it, exercise)));
      refs.push({ exerciseId: exercise.id });
    }
    // a grandfathered section has no role: it keeps its own name and its role is read from that name only if it is a canonical standard one
    added.push({
      key: nextKey(),
      kind: 'SECTION',
      name: planSectionName(section.role ?? 'CUSTOM', section.name[language === 'he' ? 0 : 1], language),
      origin: { type: 'ITEMS', refs },
      items,
      ...(section.role ? { role: section.role } : {}),
    });
  }
  const out = [...entries];
  for (const entry of added) {
    const last = out[out.length - 1];
    if (last && last.kind === 'SECTION' && !last.locked && last.name === entry.name) {
      const base = asItems(last);
      out[out.length - 1] = { ...base, items: [...base.items, ...entry.items], origin: { type: 'ITEMS', refs: [...(base.origin as { refs: ItemRef[] }).refs, ...(entry.origin as { refs: ItemRef[] }).refs] } };
    } else out.push(entry);
  }
  return { ok: true, entries: out };
}

/** The same section entry written as explicit items (a kept section's refs are its stored positions). Standalone and locked entries are unchanged. */
export function asItems(e: DEntry): DEntry {
  if (e.kind !== 'SECTION' || e.locked) return e;
  if (e.origin.type === 'ITEMS') return e;
  if (e.origin.type === 'KEEP') return { ...e, origin: { type: 'ITEMS', refs: e.origin.positions.map((keep) => ({ keep })) } };
  return e;
}

/** Can an item of this entry move to another section? Only standalone / template-imported / plain kept items: a copied Block's items keep that Block's provenance. */
export const canMoveToSection = (e: DEntry): boolean => e.kind === 'EXERCISE' || (e.kind === 'SECTION' && !e.locked && (e.origin.type === 'KEEP' || e.origin.type === 'ITEMS'));

/** Can an item be removed on its own? Not from a freshly added Block copy (its item list must match the Block). */
export const canRemoveItem = (e: DEntry): boolean => e.kind === 'SECTION' && !e.locked && e.origin.type !== 'BLOCK';

/** Where a missing standard section goes: Warm-up before Main (else first); Main between Warm-up and Cool-down; Cool-down last. */
export function insertIndexForRole(roles: readonly (SectionRole | null)[], role: StandardSectionRole): number {
  if (role === 'COOL_DOWN') return roles.length;
  if (role === 'WARM_UP') {
    const main = roles.indexOf('MAIN');
    return main === -1 ? 0 : main;
  }
  const warm = roles.lastIndexOf('WARM_UP');
  if (warm !== -1) return warm + 1;
  const cool = roles.indexOf('COOL_DOWN');
  return cool === -1 ? roles.length : cool;
}

/** The sections an item may be moved to from `fromKey`: every other editable section, then each standard role that does not exist yet. */
export function moveTargets(entries: readonly DEntry[], fromKey: string): ({ key: string; name: string } | { role: StandardSectionRole })[] {
  const out: ({ key: string; name: string } | { role: StandardSectionRole })[] = [];
  for (const e of entries) if (e.kind === 'SECTION' && !e.locked && e.key !== fromKey) out.push({ key: e.key, name: e.name ?? '' });
  const present = new Set(entries.map(entryRole));
  for (const role of STANDARD_ROLE_ORDER) if (!present.has(role)) out.push({ role });
  return out;
}

export type MoveResult =
  | { ok: true; entries: DEntry[] }
  | { ok: false; reason: 'NOT_FOUND' | 'LOCKED' | 'TARGET_LOCKED' | 'SAME_SECTION' };

/**
 * Move ONE item to another section (an explicit action, never a drag). The item keeps its exercise, prescription and provenance: it
 * only changes the section it is written under. Refused for an item of a copied Block section, and into one. A missing standard
 * section is created in its place; a section left empty disappears.
 */
export function moveItemToSection(
  entries: readonly DEntry[],
  fromKey: string,
  itemIndex: number,
  target: { key: string } | { role: StandardSectionRole },
  language: Language,
  nextKey: () => string,
): MoveResult {
  const from = entries.find((e) => e.key === fromKey);
  const item = from?.items[itemIndex];
  if (!from || !item) return { ok: false, reason: 'NOT_FOUND' };
  if (!canMoveToSection(from)) return { ok: false, reason: 'LOCKED' };
  if ('key' in target && target.key === fromKey) return { ok: false, reason: 'SAME_SECTION' };
  // the moved item as an explicit reference
  const src = asItems(from);
  const ref: ItemRef =
    from.kind === 'EXERCISE'
      ? { exerciseId: (from.origin as { exerciseId: string }).exerciseId }
      : (src.origin as { refs: ItemRef[] }).refs[itemIndex]!;
  // 1. take it out of its source (a standalone entry or a section left empty disappears)
  let list: DEntry[] = entries.map((e) => (e.key === fromKey ? src : e));
  if (from.kind === 'EXERCISE' || src.items.length === 1) list = list.filter((e) => e.key !== fromKey);
  else {
    list = list.map((e) =>
      e.key === fromKey ? { ...src, items: src.items.filter((_, i) => i !== itemIndex), origin: { type: 'ITEMS' as const, refs: (src.origin as { refs: ItemRef[] }).refs.filter((_, i) => i !== itemIndex) } } : e,
    );
  }
  // 2. find or create the target
  let targetKey: string;
  if ('key' in target) {
    const t = list.find((e) => e.key === target.key);
    if (!t || t.kind !== 'SECTION') return { ok: false, reason: 'NOT_FOUND' };
    if (t.locked) return { ok: false, reason: 'TARGET_LOCKED' };
    targetKey = t.key;
  } else {
    const existing = list.find((e) => entryRole(e) === target.role);
    if (existing && existing.locked) return { ok: false, reason: 'TARGET_LOCKED' };
    if (existing) targetKey = existing.key;
    else {
      const created: DEntry = { key: nextKey(), kind: 'SECTION', name: planSectionName(target.role, '', language), origin: { type: 'ITEMS', refs: [] }, items: [], role: target.role };
      list.splice(insertIndexForRole(list.map(entryRole), target.role), 0, created);
      targetKey = created.key;
    }
  }
  // 3. append it to the target
  list = list.map((e) => {
    if (e.key !== targetKey) return e;
    const t = asItems(e);
    return { ...t, items: [...t.items, item], origin: { type: 'ITEMS' as const, refs: [...(t.origin as { refs: ItemRef[] }).refs, ref] } };
  });
  return { ok: true, entries: list };
}

/** Remove one item of a section (the section disappears when it was the last). */
export function removeItem(entries: readonly DEntry[], key: string, itemIndex: number): DEntry[] {
  return entries.flatMap((e) => {
    if (e.key !== key || !canRemoveItem(e)) return [e];
    if (e.items.length <= 1) return [];
    if (e.origin.type === 'KEEP') return [{ ...e, items: e.items.filter((_, i) => i !== itemIndex), origin: { type: 'KEEP' as const, positions: e.origin.positions.filter((_, i) => i !== itemIndex) } }];
    if (e.origin.type === 'ITEMS') return [{ ...e, items: e.items.filter((_, i) => i !== itemIndex), origin: { type: 'ITEMS' as const, refs: e.origin.refs.filter((_, i) => i !== itemIndex) } }];
    return [e];
  });
}

export type DraftTemplateResult = { ok: true; sections: PersonalTemplateSection[] } | { ok: false; reason: 'STANDALONE_ITEMS' | 'EMPTY' };

/**
 * The draft as the sections of a PERSONAL template ("Save as template"): each section with its role (its own, else the exact canonical
 * name, else CUSTOM), its exercises by stable id and the prescription as typed. A standalone exercise belongs to no section, so it cannot be
 * snapshotted: the user first moves it into a section (Move to section).
 */
export function draftToTemplateSections(entries: readonly DEntry[]): DraftTemplateResult {
  if (entries.length === 0) return { ok: false, reason: 'EMPTY' };
  if (entries.some((e) => e.kind === 'EXERCISE')) return { ok: false, reason: 'STANDALONE_ITEMS' };
  return {
    ok: true,
    sections: entries.map((e) => {
      const role = entryRole(e) ?? 'CUSTOM';
      return {
        role,
        name: role === 'CUSTOM' ? (e.name ?? '') : null,
        items: e.items.map((item) => ({ exerciseId: item.snapshot.exerciseId, prescription: prescriptionOf(item) })),
      };
    }),
  };
}
