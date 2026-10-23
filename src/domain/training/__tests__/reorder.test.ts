import { dropIndex, moveInList, reorderItems } from '../reorder';

const solo = { sectionId: null, blockName: null };
const inSection = (id: string, name = 'Warm-up') => ({ sectionId: id, blockName: name });
const legacy = (name: string) => ({ sectionId: null, blockName: name });

describe('moveInList', () => {
  it('A,B,C -> C,A,B and never clamps', () => {
    expect(moveInList(['A', 'B', 'C'], 2, 0)).toEqual(['C', 'A', 'B']);
    expect(moveInList(['A', 'B', 'C'], 0, 2)).toEqual(['B', 'C', 'A']);
    expect(moveInList(['A', 'B', 'C'], 0, 3)).toBeNull();
    expect(moveInList(['A', 'B', 'C'], -1, 1)).toBeNull();
    expect(moveInList(['A', 'B', 'C'], 0.5, 1)).toBeNull();
  });
  it('is pure: the input is not changed', () => {
    const list = ['A', 'B', 'C'];
    moveInList(list, 2, 0);
    expect(list).toEqual(['A', 'B', 'C']);
  });
});

describe('reorderItems: the order is always a permutation of every item', () => {
  it('standalone exercises move among entries', () => {
    expect(reorderItems([solo, solo, solo, solo], 3, 0)).toEqual([3, 0, 1, 2]);
  });
  it('inside one section', () => {
    expect(reorderItems([inSection('s1'), inSection('s1'), inSection('s1'), solo], 0, 2)).toEqual([1, 2, 0, 3]);
  });
  it('the identity move changes nothing', () => {
    expect(reorderItems([solo, solo], 1, 1)).toEqual([0, 1]);
  });
  it('across sections: refused (out of a section, into one, between two)', () => {
    const items = [inSection('s1'), inSection('s1'), solo, inSection('s2'), inSection('s2')];
    expect(reorderItems(items, 0, 2)).toBe('CROSS_SECTION');
    expect(reorderItems(items, 2, 1)).toBe('CROSS_SECTION');
    expect(reorderItems(items, 1, 3)).toBe('CROSS_SECTION');
  });
  it('a standalone exercise passes a whole section without splitting it', () => {
    const items = [solo, inSection('s1'), inSection('s1'), solo];
    expect(reorderItems(items, 3, 0)).toEqual([3, 0, 1, 2]);
    expect(reorderItems(items, 0, 3)).toEqual([1, 2, 3, 0]);
  });
  it('a legacy section (block name, no id) is one section too; two legacy sections are different', () => {
    const items = [legacy('A'), legacy('A'), legacy('B'), legacy('B')];
    expect(reorderItems(items, 0, 1)).toEqual([1, 0, 2, 3]);
    expect(reorderItems(items, 1, 2)).toBe('CROSS_SECTION');
  });
  it('indexes that do not exist are refused', () => {
    expect(reorderItems([solo, solo], 0, 2)).toBe('OUT_OF_RANGE');
    expect(reorderItems([solo, solo], -1, 0)).toBe('OUT_OF_RANGE');
  });
  it('the result is a permutation: nothing missing, nothing duplicated', () => {
    const items = [solo, inSection('s1'), inSection('s1'), inSection('s1'), solo, solo];
    for (let from = 0; from < items.length; from++) {
      for (let to = 0; to < items.length; to++) {
        const order = reorderItems(items, from, to);
        if (typeof order === 'string') continue;
        expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
      }
    }
  });
});

describe('dropIndex: where a dragged row lands', () => {
  const rows = [{ y: 0, height: 100 }, { y: 100, height: 100 }, { y: 200, height: 100 }];
  it('a small drag stays; a drag by about one row moves one place', () => {
    expect(dropIndex(rows, 1, 10)).toBe(1);
    expect(dropIndex(rows, 1, 90)).toBe(2);
    expect(dropIndex(rows, 1, -90)).toBe(0);
  });
  it('bottom to top and top to bottom, clamped to the list', () => {
    expect(dropIndex(rows, 2, -500)).toBe(0);
    expect(dropIndex(rows, 0, 900)).toBe(2);
  });
  it('rows of different heights are measured, not assumed equal', () => {
    const uneven = [{ y: 0, height: 300 }, { y: 300, height: 100 }];
    expect(dropIndex(uneven, 1, -100)).toBe(0); // centre 250 is inside the tall first row
  });
});
