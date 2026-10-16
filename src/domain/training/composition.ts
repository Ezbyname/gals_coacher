/**
 * QB-WORKOUT-BUILDER-001A — a PlannedWorkout's ordered composition (pure, no I/O).
 *
 * Persisted shape: ONE flat list of items with one deterministic `position` order. An item is either
 *   - a copied Block item: `sectionId` (one id per copied Block instance) + `blockName` (+ provenance), or
 *   - a standalone Exercise: no section, no block name.
 * A legacy (v16) row has a block name but NO section id: consecutive legacy rows with the same block name read as one
 * section (display grouping only; nothing is rewritten).
 *
 * The user composes in ENTRIES: a section (all items of one copied Block) or one standalone Exercise. Insert / move
 * / remove work on entry indexes, so an Exercise can sit between Blocks but never inside a Block copy. Functions
 * return null for an out-of-range index (the repository turns that into a rule error) — nothing is clamped silently.
 */

/** The persisted facts that identify which entry an item belongs to. */
export interface Groupable {
  readonly sectionId: string | null;
  readonly blockName: string | null;
}

export type CompositionEntry<T extends Groupable> =
  | {
      readonly kind: 'SECTION';
      /** null for a legacy section (no identity stored). */
      readonly sectionId: string | null;
      readonly blockName: string;
      readonly items: readonly T[];
    }
  | { readonly kind: 'EXERCISE'; readonly item: T };

/** Items (already in position order) → entries. */
export function groupEntries<T extends Groupable>(items: readonly T[]): CompositionEntry<T>[] {
  const out: (CompositionEntry<T> & { items?: T[] })[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.sectionId !== null) {
      if (last?.kind === 'SECTION' && last.sectionId === item.sectionId) (last.items as T[]).push(item);
      else out.push({ kind: 'SECTION', sectionId: item.sectionId, blockName: item.blockName ?? '', items: [item] });
    } else if (item.blockName !== null) {
      if (last?.kind === 'SECTION' && last.sectionId === null && last.blockName === item.blockName) {
        (last.items as T[]).push(item);
      } else out.push({ kind: 'SECTION', sectionId: null, blockName: item.blockName, items: [item] });
    } else {
      out.push({ kind: 'EXERCISE', item });
    }
  }
  return out;
}

/** Entries → the flat item list, in order. */
export function flattenEntries<T extends Groupable>(entries: readonly CompositionEntry<T>[]): T[] {
  return entries.flatMap((e) => (e.kind === 'SECTION' ? [...e.items] : [e.item]));
}

/** Insert at entry index `at` (0..length; default: the end). null when out of range. */
export function insertEntry<T extends Groupable>(
  entries: readonly CompositionEntry<T>[],
  entry: CompositionEntry<T>,
  at: number = entries.length,
): CompositionEntry<T>[] | null {
  if (!Number.isInteger(at) || at < 0 || at > entries.length) return null;
  return [...entries.slice(0, at), entry, ...entries.slice(at)];
}

/** Remove entry `index` (0..length-1). null when out of range. */
export function removeEntry<T extends Groupable>(
  entries: readonly CompositionEntry<T>[],
  index: number,
): CompositionEntry<T>[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return null;
  return [...entries.slice(0, index), ...entries.slice(index + 1)];
}

/** Move the entry at `from` so it ends at index `to` (both 0..length-1). null when out of range. */
export function moveEntry<T extends Groupable>(
  entries: readonly CompositionEntry<T>[],
  from: number,
  to: number,
): CompositionEntry<T>[] | null {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < entries.length;
  if (!ok(from) || !ok(to)) return null;
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * What a STORED composition must satisfy; a reader refuses data that breaks it (nothing is repaired):
 * positions are 0..n-1 in order; a section id appears in one contiguous run; a section id and a provenance block id
 * come together (also a CHECK in the schema).
 */
export function compositionProblem(
  items: readonly (Groupable & { readonly position: number; readonly sourceBlockId: string | null })[],
): string | null {
  const seen = new Set<string>();
  let previous: string | null = null;
  for (const [index, item] of items.entries()) {
    if (item.position !== index) return `position ${item.position} at index ${index}`;
    if ((item.sectionId === null) !== (item.sourceBlockId === null)) return 'section / provenance mismatch';
    if (item.sectionId !== null && item.sectionId !== previous && seen.has(item.sectionId)) {
      return `section ${item.sectionId} is not contiguous`;
    }
    if (item.sectionId !== null) seen.add(item.sectionId);
    previous = item.sectionId;
  }
  return null;
}
