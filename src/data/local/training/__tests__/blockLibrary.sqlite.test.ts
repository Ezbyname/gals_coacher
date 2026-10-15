import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { TrainingNotFoundError, TrainingRuleError } from '../errors';
import {
  addExerciseToBlock,
  copyName,
  createBlock,
  createTemplate,
  duplicateBlock,
  getBlock,
  getTemplate,
  listBlocks,
  setBlockActive,
  updateBlock,
} from '../workoutRepository';

/** QB-BLOCK-LIBRARY on real SQLite: duplicate is independent; Exercise → Add to Block. */
const clock = { wallNow: () => new Date(2026, 9, 15, 17).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
const rx = (sets: number, target: number | null, loadKg: number | null = null) => ({ sets, target, loadKg, restSec: 45 });
let db: ReturnType<typeof openNodeSqlite>;

async function block(name: string, ...exerciseIds: string[]) {
  const r = await createBlock(db, { name, items: exerciseIds.map((exerciseId) => ({ exerciseId, prescription: rx(2, 10) })) }, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.block;
}

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
});
afterEach(() => db.closeAsync());

describe('duplicateBlock', () => {
  it('BL-03: a NEW independent block with the same exercises and prescriptions; the original is never touched', async () => {
    const original = await block('Shooting', 'FREE_THROWS', 'BARBELL_BENCH_PRESS');
    const copy = await duplicateBlock(db, original.id, { ...deps, copyLabel: 'copy' });
    if (!copy.ok) throw new Error('duplicate');
    expect(copy.block.id).not.toBe(original.id);
    expect(copy.block.name).toBe('Shooting (copy)');
    expect(copy.block.active).toBe(true);
    expect(copy.block.items.map((i) => [i.exercise.id, i.prescription])).toEqual(original.items.map((i) => [i.exercise.id, i.prescription]));
    // independent future edits, both ways
    const edited = await updateBlock(db, copy.block.id, { name: 'Shooting B', items: [{ exerciseId: 'FREE_THROWS', prescription: rx(5, 20) }] }, { clock });
    expect(edited.ok).toBe(true);
    expect(await getBlock(db, original.id)).toEqual(original);
    const afterOriginalEdit = await updateBlock(db, original.id, { name: 'Shooting A', items: [{ exerciseId: 'BARBELL_BENCH_PRESS', prescription: rx(1, 3, 40) }] }, { clock });
    expect(afterOriginalEdit.ok).toBe(true);
    expect((await getBlock(db, copy.block.id))!.name).toBe('Shooting B');
    expect((await getBlock(db, copy.block.id))!.items).toHaveLength(1);
    // the item rows are separate (not shared by reference)
    const rows = await db.getAllAsync<{ n: number }>('SELECT count(DISTINCT block_id) AS n FROM workout_block_items');
    expect(rows[0]!.n).toBe(2);
  });

  it('keeps the copy name unique and within the name limit (HE labels too), copy after copy', async () => {
    const original = await block('Shooting', 'FREE_THROWS');
    const names: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await duplicateBlock(db, original.id, { ...deps, copyLabel: 'עותק' });
      if (!r.ok) throw new Error('duplicate');
      names.push(r.block.name);
    }
    expect(names).toEqual(['Shooting (עותק)', 'Shooting (עותק 2)', 'Shooting (עותק 3)']);
    const long = await block('N'.repeat(35), 'FREE_THROWS');
    const copy = await duplicateBlock(db, long.id, { ...deps, copyLabel: 'copy' });
    if (!copy.ok) throw new Error('duplicate');
    expect(copy.block.name.length).toBeLessThanOrEqual(35);
    expect(copy.block.name.endsWith(' (copy)')).toBe(true);
    expect(copyName('A', 'copy', new Set(['a (copy)']))).toBe('A (copy 2)');
  });

  it('a hidden block cannot be duplicated; one holding an inactive Exercise is refused (no inactive content in NEW compositions)', async () => {
    const hidden = await block('Hidden', 'FREE_THROWS');
    await setBlockActive(db, hidden.id, false, { clock });
    await expect(duplicateBlock(db, hidden.id, { ...deps, copyLabel: 'copy' })).rejects.toMatchObject({ rule: 'BLOCK_INACTIVE' });
    const withInactive = await block('Has inactive', 'FREE_THROWS', 'BARBELL_BENCH_PRESS');
    await setExerciseActive(db, 'BARBELL_BENCH_PRESS', false, { clock });
    expect(await duplicateBlock(db, withInactive.id, { ...deps, copyLabel: 'copy' })).toEqual({ ok: false, errors: { inactiveItems: [1] } });
    expect((await listBlocks(db)).map((b) => b.name)).toEqual(['Hidden', 'Has inactive']);
    await expect(duplicateBlock(db, 'missing', { ...deps, copyLabel: 'copy' })).rejects.toBeInstanceOf(TrainingNotFoundError);
  });

  it('a template that uses the original does not change when the copy is made or edited', async () => {
    const original = await block('Shooting', 'FREE_THROWS');
    const t = await createTemplate(db, { name: 'Tpl', blockIds: [original.id] }, deps);
    if (!t.ok) throw new Error('template');
    const before = await getTemplate(db, t.template.id);
    const copy = await duplicateBlock(db, original.id, { ...deps, copyLabel: 'copy' });
    if (!copy.ok) throw new Error('duplicate');
    await updateBlock(db, copy.block.id, { name: 'Other', items: [{ exerciseId: 'BARBELL_BENCH_PRESS', prescription: rx(1, 5, 20) }] }, { clock });
    expect(await getTemplate(db, t.template.id)).toEqual(before);
  });
});

describe('addExerciseToBlock', () => {
  it('BL-05: appends the Exercise with its default prescription, keeping every existing item', async () => {
    const b = await block('Strength', 'BARBELL_BENCH_PRESS');
    const r = await addExerciseToBlock(db, b.id, 'FREE_THROWS', { clock });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.block.items.map((i) => i.exercise.id)).toEqual(['BARBELL_BENCH_PRESS', 'FREE_THROWS']);
    expect(r.block.items[0]!.prescription).toEqual(b.items[0]!.prescription);
    expect(r.block.items[1]!.prescription.sets).toBeGreaterThanOrEqual(1);
    expect(r.block.name).toBe('Strength');
    // the same exercise may be added again (a block can repeat an exercise)
    const again = await addExerciseToBlock(db, b.id, 'FREE_THROWS', { clock });
    expect(again.ok && again.block.items).toHaveLength(3);
  });

  it('refuses an inactive block and an inactive Exercise (nothing written); unknown ids are not found', async () => {
    const b = await block('Strength', 'BARBELL_BENCH_PRESS');
    await setExerciseActive(db, 'FREE_THROWS', false, { clock });
    await expect(addExerciseToBlock(db, b.id, 'FREE_THROWS', { clock })).rejects.toMatchObject({ rule: 'EXERCISE_INACTIVE' });
    expect((await getBlock(db, b.id))!.items).toHaveLength(1);
    await setExerciseActive(db, 'FREE_THROWS', true, { clock });
    await setBlockActive(db, b.id, false, { clock });
    await expect(addExerciseToBlock(db, b.id, 'FREE_THROWS', { clock })).rejects.toBeInstanceOf(TrainingRuleError);
    await expect(addExerciseToBlock(db, b.id, 'NOPE', { clock })).rejects.toBeInstanceOf(TrainingNotFoundError);
    await expect(addExerciseToBlock(db, 'missing', 'FREE_THROWS', { clock })).rejects.toBeInstanceOf(TrainingNotFoundError);
  });

  it('a block already holding an inactive Exercise can still receive a NEW active one (existing content stays)', async () => {
    const b = await block('Mixed', 'FREE_THROWS', 'BARBELL_BENCH_PRESS');
    await setExerciseActive(db, 'BARBELL_BENCH_PRESS', false, { clock });
    const r = await addExerciseToBlock(db, b.id, 'FREE_THROWS', { clock });
    expect(r.ok).toBe(true);
    expect(r.ok && r.block.items.map((i) => i.exercise.id)).toEqual(['FREE_THROWS', 'BARBELL_BENCH_PRESS', 'FREE_THROWS']);
  });
});
