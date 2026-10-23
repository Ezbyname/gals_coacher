import type { Groupable } from './composition';

/**
 * TRAINING-STOPWATCH-001 (additional approved scope) — reordering the exercises of a workout, pure and I/O free.
 *
 * Only the ORDER changes: the same items, prescriptions and sections come back, nothing is added, removed or edited.
 * A section (a copied Block / a professional section) keeps its items together: an exercise reorders only WITHIN its own
 * section; it never leaves it and nothing is dropped into it from outside. Standalone exercises are their own entries
 * (see `composition.ts`) and reorder among entries, like a section does.
 */

/** Moves `list[from]` so it ends at index `to`. null when either index does not exist (nothing is clamped). */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] | null {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < list.length;
  if (!ok(from) || !ok(to)) return null;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The identity of the entry an item belongs to: its section, or itself when it is standalone. */
function entryKeys(items: readonly Groupable[]): string[] {
  const keys: string[] = [];
  let run = 0;
  items.forEach((item, i) => {
    const prev = items[i - 1];
    if (item.sectionId !== null) {
      keys.push(`S:${item.sectionId}`);
    } else if (item.blockName !== null) {
      // a legacy section: consecutive items with the same block name
      if (prev !== undefined && prev.sectionId === null && prev.blockName === item.blockName) keys.push(keys[i - 1]!);
      else keys.push(`L:${run++}`);
    } else {
      keys.push(`X:${i}`);
    }
  });
  return keys;
}

export type ReorderRefusal = 'OUT_OF_RANGE' | 'CROSS_SECTION';

/**
 * The new order of a plan's flat items when the item at `from` is moved to `to` (flat indexes = positions).
 * Returns the OLD indexes in their new order (a permutation), or a refusal:
 *  - both inside the same section: moved within it;
 *  - both standalone: the entry moves among the entries (a whole section it passes over stays together);
 *  - anything else (one in a section and the other not, or two different sections): CROSS_SECTION, nothing moves.
 */
export function reorderItems(items: readonly Groupable[], from: number, to: number): number[] | ReorderRefusal {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < items.length;
  if (!ok(from) || !ok(to)) return 'OUT_OF_RANGE';
  const order = items.map((_, i) => i);
  if (from === to) return order;
  const keys = entryKeys(items);
  const sameEntry = keys[from] === keys[to];
  const standalone = (i: number) => keys[i]!.startsWith('X:');
  if (sameEntry) return moveInList(order, from, to)!;
  if (standalone(from) && standalone(to)) {
    // entry-level move: group the flat indexes by entry, move one group
    const groups: number[][] = [];
    order.forEach((i) => {
      const last = groups[groups.length - 1];
      if (last !== undefined && keys[last[0]!] === keys[i]) last.push(i);
      else groups.push([i]);
    });
    const gFrom = groups.findIndex((g) => g.includes(from));
    const gTo = groups.findIndex((g) => g.includes(to));
    return moveInList(groups, gFrom, gTo)!.flat();
  }
  return 'CROSS_SECTION';
}

/**
 * Where a drag that ended `dy` pixels below (negative: above) its start lands: the row whose vertical span contains the
 * dragged row's centre, clamped to the list. `rows` are the measured top / height of every row in the same container.
 */
export function dropIndex(rows: readonly { readonly y: number; readonly height: number }[], from: number, dy: number): number {
  const row = rows[from];
  if (row === undefined) return from;
  const centre = row.y + row.height / 2 + dy;
  if (centre <= rows[0]!.y) return 0;
  const found = rows.findIndex((r) => centre >= r.y && centre < r.y + r.height);
  return found === -1 ? rows.length - 1 : found;
}
