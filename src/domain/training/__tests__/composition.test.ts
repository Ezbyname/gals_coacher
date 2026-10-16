import {
  compositionProblem,
  flattenEntries,
  groupEntries,
  insertEntry,
  moveEntry,
  removeEntry,
  type Groupable,
} from '../composition';

/** QB-WORKOUT-BUILDER-001A — the ordered composition (pure). */
type It = Groupable & { readonly id: string };
const block = (sectionId: string, blockName: string, ...ids: string[]): It[] => ids.map((id) => ({ id, sectionId, blockName }));
const solo = (id: string): It => ({ id, sectionId: null, blockName: null });
const ids = (items: readonly It[]) => items.map((i) => i.id);

describe('groupEntries', () => {
  it('a Block copy is one section; a standalone Exercise is one entry; mixed order is kept', () => {
    const items = [...block('s1', 'Ball Handling', 'a', 'b'), solo('sprint'), ...block('s2', 'Shooting', 'c', 'd'), solo('plank'), ...block('s3', 'Fitness', 'e')];
    const entries = groupEntries(items);
    expect(entries.map((e) => (e.kind === 'SECTION' ? `S:${e.blockName}:${ids(e.items)}` : `E:${e.item.id}`))).toEqual([
      'S:Ball Handling:a,b',
      'E:sprint',
      'S:Shooting:c,d',
      'E:plank',
      'S:Fitness:e',
    ]);
    expect(ids(flattenEntries(entries))).toEqual(ids(items)); // exact round trip
  });

  it('the SAME Block copied twice in a row stays two sections (distinct section ids)', () => {
    const entries = groupEntries([...block('s1', 'Shooting', 'a', 'b'), ...block('s2', 'Shooting', 'a', 'b')]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => (e.kind === 'SECTION' ? e.sectionId : null))).toEqual(['s1', 's2']);
  });

  it('legacy rows (block name, no section id) group by consecutive block name; they never merge with a section', () => {
    const legacy = (id: string, blockName: string): It => ({ id, sectionId: null, blockName });
    const entries = groupEntries([legacy('a', 'Strength'), legacy('b', 'Strength'), legacy('c', 'Shooting'), solo('x'), ...block('s9', 'Strength', 'y')]);
    expect(entries.map((e) => (e.kind === 'SECTION' ? `S:${e.sectionId}:${e.blockName}:${ids(e.items)}` : `E:${e.item.id}`))).toEqual([
      'S:null:Strength:a,b',
      'S:null:Shooting:c',
      'E:x',
      'S:s9:Strength:y',
    ]);
  });

  it('an empty composition has no entries', () => {
    expect(groupEntries([])).toEqual([]);
  });
});

describe('insert / remove / move on entry indexes', () => {
  const base = groupEntries([...block('s1', 'A', 'a1', 'a2'), solo('x'), ...block('s2', 'B', 'b1')]);
  const order = (entries: ReturnType<typeof groupEntries<It>> | null) => ids(flattenEntries(entries!));

  it('insert places an entry BETWEEN existing entries (never inside a Block copy); the default is the end', () => {
    expect(order(insertEntry(base, { kind: 'EXERCISE', item: solo('n') }, 1))).toEqual(['a1', 'a2', 'n', 'x', 'b1']);
    expect(order(insertEntry(base, { kind: 'EXERCISE', item: solo('n') }, 0))).toEqual(['n', 'a1', 'a2', 'x', 'b1']);
    expect(order(insertEntry(base, { kind: 'EXERCISE', item: solo('n') }))).toEqual(['a1', 'a2', 'x', 'b1', 'n']);
    expect(order(insertEntry(base, { kind: 'EXERCISE', item: solo('n') }, 3))).toEqual(['a1', 'a2', 'x', 'b1', 'n']);
  });

  it('remove drops a whole section or one standalone Exercise', () => {
    expect(order(removeEntry(base, 0))).toEqual(['x', 'b1']);
    expect(order(removeEntry(base, 1))).toEqual(['a1', 'a2', 'b1']);
    expect(order(removeEntry(base, 2))).toEqual(['a1', 'a2', 'x']);
  });

  it('move reorders sections and Exercises alike (one deterministic order)', () => {
    expect(order(moveEntry(base, 0, 2))).toEqual(['x', 'b1', 'a1', 'a2']);
    expect(order(moveEntry(base, 2, 0))).toEqual(['b1', 'a1', 'a2', 'x']);
    expect(order(moveEntry(base, 1, 1))).toEqual(['a1', 'a2', 'x', 'b1']);
  });

  it('an index that does not exist is refused (null), never clamped', () => {
    const entry = { kind: 'EXERCISE', item: solo('n') } as const;
    expect(insertEntry(base, entry, 4)).toBeNull();
    expect(insertEntry(base, entry, -1)).toBeNull();
    expect(insertEntry(base, entry, 1.5)).toBeNull();
    expect(removeEntry(base, 3)).toBeNull();
    expect(removeEntry(base, -1)).toBeNull();
    expect(moveEntry(base, 0, 3)).toBeNull();
    expect(moveEntry(base, 3, 0)).toBeNull();
    expect(removeEntry([], 0)).toBeNull();
  });

  it('edits never mutate their input', () => {
    const before = JSON.stringify(base);
    insertEntry(base, { kind: 'EXERCISE', item: solo('n') }, 1);
    removeEntry(base, 0);
    moveEntry(base, 0, 2);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('compositionProblem (what a stored composition must satisfy)', () => {
  const row = (position: number, sectionId: string | null, sourceBlockId: string | null) => ({ position, sectionId, sourceBlockId, blockName: sectionId ? 'B' : null });

  it('accepts contiguous sections, standalone rows and legacy rows; positions 0..n-1', () => {
    expect(compositionProblem([row(0, 's1', 'b1'), row(1, 's1', 'b1'), row(2, null, null), row(3, 's2', 'b1')])).toBeNull();
    expect(compositionProblem([])).toBeNull();
  });

  it('refuses gaps / reordered positions, a section split in two runs, and a section without provenance', () => {
    expect(compositionProblem([row(0, null, null), row(2, null, null)])).toMatch(/position/);
    expect(compositionProblem([row(0, 's1', 'b'), row(1, null, null), row(2, 's1', 'b')])).toMatch(/contiguous/);
    expect(compositionProblem([row(0, 's1', null)])).toMatch(/mismatch/);
    expect(compositionProblem([row(0, null, 'b')])).toMatch(/mismatch/);
  });
});
