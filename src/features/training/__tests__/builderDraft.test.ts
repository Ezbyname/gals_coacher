import { BUILTIN_EXERCISES } from '@/domain/exercise/catalog';
import type { Exercise } from '@/domain/exercise/exercise';
import { professionalWorkout } from '@/domain/training/professional';

import {
  asItems,
  canMoveToSection,
  canRemoveItem,
  entryRole,
  exerciseEntryOf,
  importTemplate,
  insertIndexForRole,
  itemOf,
  moveItemToSection,
  moveTargets,
  removeItem,
  reorderedItems,
  toSaveEntries,
  type DEntry,
} from '../builderDraft';

const EXERCISES: Exercise[] = BUILTIN_EXERCISES.map((e) => ({ ...e, builtin: true, active: true }));
const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;
let counter = 0;
const nextKey = () => `k${counter++}`;
const draftOf = (id: string, language: 'he' | 'en' = 'en') => {
  const r = importTemplate([], professionalWorkout(id)!, EXERCISES, language, nextKey);
  if (!r.ok) throw new Error('import');
  return r.entries;
};
const names = (entries: readonly DEntry[]) => entries.map((e) => e.items.map((i) => i.snapshot.exerciseId));
const sectionNames = (entries: readonly DEntry[]) => entries.map((e) => e.name);

describe('importTemplate: a template becomes draft sections; nothing is written and the registry is untouched', () => {
  it('GYM-BEG-FULLBODY-A -> Warm-up / Main workout / Cool-down with the template\'s own dosage and NO load', () => {
    const before = JSON.stringify(professionalWorkout('GYM-BEG-FULLBODY-A'));
    const entries = draftOf('GYM-BEG-FULLBODY-A');
    expect(sectionNames(entries)).toEqual(['Warm-up', 'Main workout', 'Cool-down']);
    expect(entries.map(entryRole)).toEqual(['WARM_UP', 'MAIN', 'COOL_DOWN']);
    expect(entries.map((e) => e.items.length)).toEqual([5, 5, 3]);
    const main = entries[1]!;
    expect(main.items.map((i) => [i.snapshot.exerciseId, i.sets, i.target, i.rest, i.load])).toEqual([
      ['GOBLET_SQUAT', '3', '10', '90', ''],
      ['DUMBBELL_BENCH_PRESS', '3', '10', '90', ''],
      ['ONE_ARM_DUMBBELL_ROW', '3', '10', '60', ''],
      ['ROMANIAN_DEADLIFT', '3', '10', '90', ''],
      ['PLANK', '3', '30', '45', ''],
    ]);
    expect(JSON.stringify(professionalWorkout('GYM-BEG-FULLBODY-A'))).toBe(before); // the source is only READ
  });
  it('the section names are the canonical ones in the chosen language (Hebrew)', () => {
    expect(sectionNames(draftOf('GYM-BEG-FULLBODY-A', 'he'))).toEqual(['חימום', 'אימון מרכזי', 'שחרור']);
  });
  it('a grandfathered workout keeps its own section names (CUSTOM) and its time semantics travel with the item', () => {
    const entries = draftOf('ATH-ACCELERATION-01');
    expect(sectionNames(entries)).toEqual(['Warm-up', 'Acceleration mechanics', 'Short sprints']);
    expect(entries.map(entryRole)).toEqual(['WARM_UP', 'CUSTOM', 'CUSTOM']); // Warm-up read from its canonical name only
    const sprint = entries[2]!.items.find((i) => i.snapshot.exerciseId === 'SPRINT_10M')!;
    expect(sprint.timeSemantics).toBe('COMPLETION_TIME_CAP');
  });
  it('saving writes explicit SECTION entries (exercise ids, never names)', () => {
    const save = toSaveEntries(draftOf('GYM-BEG-FULLBODY-A'));
    expect(save.map((s) => s.kind)).toEqual(['SECTION', 'SECTION', 'SECTION']);
    const main = save[1]!;
    if (main.kind !== 'SECTION') throw new Error('kind');
    expect(main.name).toBe('Main workout');
    expect(main.items.map((i) => ('exerciseId' in i ? i.exerciseId : null))).toEqual(['GOBLET_SQUAT', 'DUMBBELL_BENCH_PRESS', 'ONE_ARM_DUMBBELL_ROW', 'ROMANIAN_DEADLIFT', 'PLANK']);
    expect(main.items[0]!.prescription).toEqual({ sets: 3, target: 10, loadKg: null, restSec: 90 });
  });
  it('an inactive or unknown exercise refuses the import and returns the draft unchanged', () => {
    const off = EXERCISES.map((e) => (e.id === 'PLANK' ? { ...e, active: false } : e));
    const r = importTemplate([], professionalWorkout('GYM-BEG-FULLBODY-A')!, off, 'en', nextKey);
    expect(r).toEqual({ ok: false, reason: 'EXERCISE_UNAVAILABLE', exerciseId: 'PLANK' });
  });
  it('importing into a draft appends the sections after what is there; a repeated section name merges into ONE section', () => {
    const first = draftOf('GYM-BEG-FULLBODY-A');
    const again = importTemplate(first, professionalWorkout('GYM-BEG-FULLBODY-B')!, EXERCISES, 'en', nextKey);
    if (!again.ok) throw new Error('import');
    // A ends with Cool-down, B starts with Warm-up: no merge; six sections
    expect(sectionNames(again.entries)).toEqual(['Warm-up', 'Main workout', 'Cool-down', 'Warm-up', 'Main workout', 'Cool-down']);
    const alone = importTemplate(first.slice(0, 2), professionalWorkout('GYM-BEG-FULLBODY-B')!, EXERCISES, 'en', nextKey);
    if (!alone.ok) throw new Error('import');
    expect(sectionNames(alone.entries)).toEqual(['Warm-up', 'Main workout', 'Warm-up', 'Main workout', 'Cool-down']);
    const mergeable = importTemplate(first.slice(0, 1), professionalWorkout('GYM-BEG-FULLBODY-B')!, EXERCISES, 'en', nextKey);
    if (!mergeable.ok) throw new Error('import');
    expect(mergeable.entries.length).toBe(3); // the draft's last section was Warm-up and the template starts with Warm-up: merged
    expect(mergeable.entries[0]!.items.length).toBe(10);
  });
});

describe('Move to section', () => {
  it('a standalone exercise moves into Main; the standalone entry disappears; order inside Main is append', () => {
    const entries = [...draftOf('GYM-BEG-FULLBODY-A'), exerciseEntryOf('solo', ex('FACE_PULL'))];
    const r = moveItemToSection(entries, 'solo', 0, { role: 'MAIN' }, 'en', nextKey);
    if (!r.ok) throw new Error(r.reason);
    expect(r.entries.map((e) => e.key)).not.toContain('solo');
    expect(names(r.entries)[1]!.slice(-2)).toEqual(['PLANK', 'FACE_PULL']);
    expect(names(r.entries).flat().length).toBe(14); // 13 + the moved one, none lost, none duplicated
  });
  it('a missing standard section is created in its place: Warm-up before Main, Main between, Cool-down last', () => {
    const solo = (id: string) => exerciseEntryOf(`s-${id}`, ex(id));
    const base = [solo('PLANK'), solo('DEAD_BUG'), solo('BIRD_DOG')];
    const w = moveItemToSection(base, 's-PLANK', 0, { role: 'WARM_UP' }, 'en', nextKey);
    if (!w.ok) throw new Error(w.reason);
    expect(sectionNames(w.entries)).toEqual(['Warm-up', null, null]);
    const c = moveItemToSection(w.entries, 's-DEAD_BUG', 0, { role: 'COOL_DOWN' }, 'en', nextKey);
    if (!c.ok) throw new Error(c.reason);
    expect(sectionNames(c.entries)).toEqual(['Warm-up', null, 'Cool-down']);
    const m = moveItemToSection(c.entries, 's-BIRD_DOG', 0, { role: 'MAIN' }, 'en', nextKey);
    if (!m.ok) throw new Error(m.reason);
    expect(sectionNames(m.entries)).toEqual(['Warm-up', 'Main workout', 'Cool-down']);
  });
  it('insertIndexForRole follows the approved placement rules', () => {
    expect(insertIndexForRole([null, 'MAIN', 'COOL_DOWN'], 'WARM_UP')).toBe(1);
    expect(insertIndexForRole([null, null], 'WARM_UP')).toBe(0);
    expect(insertIndexForRole(['WARM_UP', null, 'COOL_DOWN'], 'MAIN')).toBe(1);
    expect(insertIndexForRole([null, 'COOL_DOWN'], 'MAIN')).toBe(1);
    expect(insertIndexForRole([null, null], 'MAIN')).toBe(2);
    expect(insertIndexForRole(['WARM_UP', 'MAIN'], 'COOL_DOWN')).toBe(2);
  });
  it('moving between two imported sections changes only the section and the order: exercise and prescription are untouched', () => {
    const entries = draftOf('GYM-BEG-FULLBODY-A');
    const moved = entries[1]!.items[4]!; // PLANK in Main
    const r = moveItemToSection(entries, entries[1]!.key, 4, { key: entries[2]!.key }, 'en', nextKey);
    if (!r.ok) throw new Error(r.reason);
    expect(names(r.entries).map((n) => n.length)).toEqual([5, 4, 4]);
    expect(r.entries[2]!.items.at(-1)).toEqual(moved);
    const save = toSaveEntries(r.entries);
    const cool = save[2]!;
    if (cool.kind !== 'SECTION') throw new Error('kind');
    expect(cool.items.at(-1)).toEqual({ exerciseId: 'PLANK', prescription: { sets: 3, target: 30, loadKg: null, restSec: 45 } });
  });
  it('the last item leaving a section removes the section', () => {
    const entries = [exerciseEntryOf('a', ex('PLANK')), ...draftOf('CORE-FOUNDATION-01').slice(0, 1)];
    const r = moveItemToSection(entries, 'a', 0, { key: entries[1]!.key }, 'en', nextKey);
    if (!r.ok) throw new Error(r.reason);
    expect(r.entries).toHaveLength(1);
  });
  it('a kept plan section converts to explicit refs by stored position; a moved kept item stays a `keep` reference', () => {
    const kept: DEntry = { key: 'kk', kind: 'SECTION', name: 'Throws', origin: { type: 'KEEP', positions: [4, 5] }, items: [itemOf(ex('PLANK') && { exerciseId: 'PLANK', name: ex('PLANK').name, measurement: ex('PLANK').measurement }, { sets: 2, target: 30, loadKg: null, restSec: 30 }), itemOf({ exerciseId: 'DEAD_BUG', name: ex('DEAD_BUG').name, measurement: ex('DEAD_BUG').measurement }, { sets: 2, target: 10, loadKg: null, restSec: 30 })] };
    const r = moveItemToSection([kept], 'kk', 0, { role: 'COOL_DOWN' }, 'en', nextKey);
    if (!r.ok) throw new Error(r.reason);
    const save = toSaveEntries(r.entries);
    expect(save.map((s) => (s.kind === 'SECTION' ? [s.name, s.items.map((i) => ('keep' in i ? `keep:${i.keep}` : i.exerciseId))] : s.kind))).toEqual([
      ['Throws', ['keep:5']],
      ['Cool-down', ['keep:4']],
    ]);
  });
  it('provenance is never rewritten: an item of a copied Block section cannot move, and no item can move INTO one', () => {
    const block: DEntry = { key: 'blk', kind: 'SECTION', name: 'My block', origin: { type: 'BLOCK', blockId: 'b1', order: [0] }, items: [itemOf({ exerciseId: 'PLANK', name: ex('PLANK').name, measurement: ex('PLANK').measurement }, { sets: 2, target: 30, loadKg: null, restSec: 30 })], locked: true };
    const entries = [block, ...draftOf('CORE-FOUNDATION-01')];
    expect(canMoveToSection(block)).toBe(false);
    expect(moveItemToSection(entries, 'blk', 0, { key: entries[1]!.key }, 'en', nextKey)).toEqual({ ok: false, reason: 'LOCKED' });
    const into = moveItemToSection(entries, entries[1]!.key, 0, { key: 'blk' }, 'en', nextKey);
    expect(into.ok).toBe(false);
    const kept: DEntry = { ...block, key: 'kept-block', origin: { type: 'KEEP', positions: [0] }, locked: true };
    expect(moveTargets([kept, ...draftOf('CORE-FOUNDATION-01')], 'x').some((t) => 'key' in t && t.key === 'kept-block')).toBe(false);
    // a locked section named like a standard role blocks creating a second one beside it
    const lockedWarm: DEntry = { ...block, key: 'lw', name: 'Warm-up' };
    const solo = exerciseEntryOf('s', ex('PLANK'));
    expect(moveItemToSection([lockedWarm, solo], 's', 0, { role: 'WARM_UP' }, 'en', nextKey)).toEqual({ ok: false, reason: 'TARGET_LOCKED' });
  });
  it('same-section, missing item: refused', () => {
    const entries = draftOf('CORE-FOUNDATION-01');
    expect(moveItemToSection(entries, entries[0]!.key, 0, { key: entries[0]!.key }, 'en', nextKey)).toEqual({ ok: false, reason: 'SAME_SECTION' });
    expect(moveItemToSection(entries, 'nope', 0, { role: 'MAIN' }, 'en', nextKey)).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(moveItemToSection(entries, entries[0]!.key, 99, { role: 'MAIN' }, 'en', nextKey)).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
  it('targets: every other editable section, then each standard role that does not exist yet', () => {
    const entries = [exerciseEntryOf('s', ex('PLANK')), ...draftOf('CORE-FOUNDATION-01').slice(0, 2)];
    const t = moveTargets(entries, 's');
    expect(t.map((x) => ('key' in x ? x.name : x.role))).toEqual(['Warm-up', 'Main workout', 'COOL_DOWN']);
  });
});

describe('reorder and remove inside imported sections', () => {
  it('dragging / Move up inside an imported section moves the refs WITH the items (identical result)', () => {
    const entry = draftOf('CORE-FOUNDATION-01')[1]!;
    const moved = reorderedItems(entry, 4, 0);
    expect(moved.items.map((i) => i.snapshot.exerciseId)).toEqual(['PALLOF_PRESS', 'PLANK', 'DEAD_BUG', 'BIRD_DOG', 'SIDE_PLANK']);
    const save = toSaveEntries([moved])[0]!;
    if (save.kind !== 'SECTION') throw new Error('kind');
    expect(save.items.map((i) => ('exerciseId' in i ? i.exerciseId : -1))).toEqual(['PALLOF_PRESS', 'PLANK', 'DEAD_BUG', 'BIRD_DOG', 'SIDE_PLANK']);
    // one Move up per step gives the same list as one drag
    let stepped = entry;
    for (let from = 4; from > 0; from--) stepped = reorderedItems(stepped, from, from - 1);
    expect(stepped.items.map((i) => i.snapshot.exerciseId)).toEqual(moved.items.map((i) => i.snapshot.exerciseId));
  });
  it('removing one item of an imported section keeps the others and the refs aligned; the last one removes the section', () => {
    const entries = draftOf('CORE-FOUNDATION-01');
    const after = removeItem(entries, entries[1]!.key, 1);
    expect(names(after)[1]).toEqual(['PLANK', 'BIRD_DOG', 'SIDE_PLANK', 'PALLOF_PRESS']);
    const save = toSaveEntries(after)[1]!;
    if (save.kind !== 'SECTION') throw new Error('kind');
    expect(save.items.map((i) => ('exerciseId' in i ? i.exerciseId : -1))).toEqual(['PLANK', 'BIRD_DOG', 'SIDE_PLANK', 'PALLOF_PRESS']);
    let one = entries;
    for (let n = 0; n < 3; n++) one = removeItem(one, entries[0]!.key, 0);
    expect(one.map((e) => e.key)).not.toContain(entries[0]!.key);
  });
  it('a freshly copied Block cannot lose a single item (its item list must match the Block)', () => {
    const block: DEntry = { key: 'blk', kind: 'SECTION', name: 'B', origin: { type: 'BLOCK', blockId: 'b', order: [0, 1] }, items: [], locked: true };
    expect(canRemoveItem(block)).toBe(false);
    expect(asItems(block)).toBe(block);
  });
});
