import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import type { Clock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

import { setExerciseActive } from '../../exercises/exerciseRepository';
import { TaxonomyNodeNotFoundError } from '../../taxonomy/errors';
import { setTaxonomyNodeActive } from '../../taxonomy/taxonomyRepository';
import { createBlock, createTemplate, getTemplate, updateTemplate } from '../workoutRepository';

/** TRAIN-TAXONOMY-001E: template classification through the repository and the schema, real SQLite. */
type Db = ReturnType<typeof openNodeSqlite>;
const clock: Clock = { wallNow: () => 1_800_000_000_000, monotonicNow: () => 0 };
let db: Db;
let blockId = '';

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const ids = createSequentialIdService();
  const block = await createBlock(
    db,
    { name: 'Shots', items: [{ exerciseId: 'FREE_THROWS', prescription: { sets: 2, target: 10, loadKg: null, restSec: null } }] },
    { ids, clock },
  );
  if (!block.ok) throw new Error('seed failed');
  blockId = block.block.id;
  deps = { ids, clock };
});
afterEach(() => db.closeAsync());
let deps: { ids: ReturnType<typeof createSequentialIdService>; clock: Clock };

const create = (name: string, nodeKeys: string[], primary: string | null = null) =>
  createTemplate(db, { name, blockIds: [blockId], classification: { nodeKeys, primary } }, deps);

describe('saving a classification', () => {
  it('0, 1 and 3 categories save and read back in order; primary optional', async () => {
    const none = await createTemplate(db, { name: 'None', blockIds: [blockId] }, deps);
    expect(none.ok && none.template.classification).toEqual({ nodeKeys: [], primary: null });
    const one = await create('One', ['BASKETBALL_SHOOTING']);
    expect(one.ok && one.template.classification).toEqual({ nodeKeys: ['BASKETBALL_SHOOTING'], primary: null });
    const three = await create('Three', ['FITNESS_LEGS', 'BASKETBALL_SHOOTING', 'FITNESS_STRENGTH'], 'BASKETBALL_SHOOTING');
    if (!three.ok) throw new Error('save failed');
    expect((await getTemplate(db, three.template.id))!.classification).toEqual({
      nodeKeys: ['FITNESS_LEGS', 'BASKETBALL_SHOOTING', 'FITNESS_STRENGTH'],
      primary: 'BASKETBALL_SHOOTING',
    });
  });

  it('refuses a 4th category, a duplicate and a primary that is not selected — nothing is written', async () => {
    const four = await create('Four', ['FITNESS_LEGS', 'FITNESS_BACK', 'FITNESS_CORE', 'FITNESS_ARMS']);
    expect(four).toEqual({ ok: false, errors: { categories: 'TOO_MANY' } });
    expect(await create('Dup', ['FITNESS_LEGS', 'FITNESS_LEGS'])).toEqual({ ok: false, errors: { categories: 'DUPLICATE' } });
    expect(await create('Stray', ['FITNESS_LEGS'], 'FITNESS_BACK')).toEqual({
      ok: false,
      errors: { categories: 'PRIMARY_NOT_SELECTED' },
    });
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM workout_templates')).toEqual({ n: 0 });
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM workout_template_taxonomy')).toEqual({ n: 0 });
  });

  it('an unknown category fails closed', async () => {
    await expect(create('Ghost', ['NO_SUCH_NODE'])).rejects.toBeInstanceOf(TaxonomyNodeNotFoundError);
  });

  it('editing: change primary, remove a non-primary, clear primary; omitting it keeps what was there', async () => {
    const t = await create('Edit me', ['BASKETBALL_SHOOTING', 'BASKETBALL_ATHLETIC'], 'BASKETBALL_SHOOTING');
    if (!t.ok) throw new Error('save failed');
    const id = t.template.id;
    const save = (nodeKeys: string[], primary: string | null) =>
      updateTemplate(db, id, { name: 'Edit me', blockIds: [blockId], classification: { nodeKeys, primary } }, deps);
    await save(['BASKETBALL_SHOOTING', 'BASKETBALL_ATHLETIC'], 'BASKETBALL_ATHLETIC');
    expect((await getTemplate(db, id))!.classification.primary).toBe('BASKETBALL_ATHLETIC');
    await save(['BASKETBALL_ATHLETIC'], 'BASKETBALL_ATHLETIC');
    expect((await getTemplate(db, id))!.classification).toEqual({ nodeKeys: ['BASKETBALL_ATHLETIC'], primary: 'BASKETBALL_ATHLETIC' });
    await save(['BASKETBALL_ATHLETIC'], null);
    expect((await getTemplate(db, id))!.classification.primary).toBeNull();
    await updateTemplate(db, id, { name: 'Renamed', blockIds: [blockId] }, deps); // no classification given
    expect((await getTemplate(db, id))!.classification).toEqual({ nodeKeys: ['BASKETBALL_ATHLETIC'], primary: null });
  });
});

describe('inactive categories', () => {
  it('an inactive category cannot be newly chosen', async () => {
    await setTaxonomyNodeActive(db, 'BASKETBALL_REBOUNDING', false, { clock });
    expect(await create('Boards', ['BASKETBALL_REBOUNDING'])).toEqual({ ok: false, errors: { categories: 'NOT_SELECTABLE' } });
  });

  it('a category whose only exercise became inactive cannot be newly chosen either', async () => {
    await setExerciseActive(db, 'FLOATERS', false, { clock });
    expect(await create('Floaters', ['BASKETBALL_FINISHING_FLOATER'])).toEqual({
      ok: false,
      errors: { categories: 'NOT_SELECTABLE' },
    });
  });

  it('an existing classification survives its category becoming inactive, is kept on re-save and can be removed', async () => {
    const t = await create('Kept', ['BASKETBALL_REBOUNDING', 'BASKETBALL_SHOOTING'], 'BASKETBALL_REBOUNDING');
    if (!t.ok) throw new Error('save failed');
    await setTaxonomyNodeActive(db, 'BASKETBALL_REBOUNDING', false, { clock });
    const id = t.template.id;
    expect((await getTemplate(db, id))!.classification).toEqual({
      nodeKeys: ['BASKETBALL_REBOUNDING', 'BASKETBALL_SHOOTING'],
      primary: 'BASKETBALL_REBOUNDING',
    });
    const keep = await updateTemplate(
      db,
      id,
      { name: 'Kept', blockIds: [blockId], classification: { nodeKeys: ['BASKETBALL_REBOUNDING', 'BASKETBALL_SHOOTING'], primary: 'BASKETBALL_REBOUNDING' } },
      deps,
    );
    expect(keep.ok).toBe(true);
    const drop = await updateTemplate(
      db,
      id,
      { name: 'Kept', blockIds: [blockId], classification: { nodeKeys: ['BASKETBALL_SHOOTING'], primary: null } },
      deps,
    );
    expect(drop.ok && drop.template.classification).toEqual({ nodeKeys: ['BASKETBALL_SHOOTING'], primary: null });
    // Once removed, it is a NEW choice again — refused while inactive.
    const back = await updateTemplate(
      db,
      id,
      { name: 'Kept', blockIds: [blockId], classification: { nodeKeys: ['BASKETBALL_SHOOTING', 'BASKETBALL_REBOUNDING'], primary: null } },
      deps,
    );
    expect(back).toEqual({ ok: false, errors: { categories: 'NOT_SELECTABLE' } });
  });
});

describe('the schema enforces the shape on its own', () => {
  let n = 0;
  async function templateWith(nodeKeys: string[], primary: string | null = null) {
    const t = await create(`Raw ${++n}`, nodeKeys, primary);
    if (!t.ok) throw new Error('save failed');
    return t.template.id;
  }
  const insert = (id: string, node: string, position: number, primary: 0 | 1) =>
    db.runAsync(
      'INSERT INTO workout_template_taxonomy (template_id, node_id, position, is_primary, created_at) VALUES (?, ?, ?, ?, 1)',
      [id, node, position, primary],
    );

  it('never a 4th, never a duplicate, never two primaries, never an unknown node, never rewritten in place', async () => {
    const id = await templateWith(['FITNESS_LEGS', 'FITNESS_BACK', 'FITNESS_CORE'], 'FITNESS_LEGS');
    await expect(insert(id, 'FITNESS_ARMS', 3, 0)).rejects.toThrow(/CHECK/); // position 0..2 only
    await expect(insert(id, 'FITNESS_ARMS', 2, 0)).rejects.toThrow(/UNIQUE/); // position taken: still max 3
    const two = await templateWith(['FITNESS_LEGS'], 'FITNESS_LEGS');
    await expect(insert(two, 'FITNESS_LEGS', 1, 0)).rejects.toThrow(/UNIQUE|PRIMARY/); // duplicate node
    await expect(insert(two, 'FITNESS_BACK', 1, 1)).rejects.toThrow(/UNIQUE/); // second primary
    await expect(insert(two, 'NO_SUCH_NODE', 1, 0)).rejects.toThrow(/FOREIGN KEY/);
    await expect(db.runAsync('UPDATE workout_template_taxonomy SET is_primary = 0')).rejects.toThrow(/never rewritten/);
  });
});
