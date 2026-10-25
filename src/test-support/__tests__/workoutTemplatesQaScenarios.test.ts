import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { migrations } from '@/data/local/migrations';
import { runMigrations } from '@/data/local/migrations/runMigrations';
import { createPlayer } from '@/data/local/players/playerRepository';
import {
  archivePersonalTemplate,
  createPersonalTemplate,
  duplicatePersonalTemplate,
  renamePersonalTemplate,
  type PersonalTemplate,
} from '@/data/local/training/personalTemplateRepository';
import { savePlannedWorkout } from '@/data/local/training/plannedWorkoutCompositionRepository';
import { assignTrainingBlock } from '@/data/local/training/trainingBlockAssignment';
import { getPlannedWorkout, startSession } from '@/data/local/training/trainingRepository';
import { createBlock, listBlocks } from '@/data/local/training/workoutRepository';
import { groupEntries } from '@/domain/training/composition';
import { PROGRAM_BLOCK_DRAFTS, TRAINING_BLOCKS } from '@/domain/training/blocks';
import { GENERAL_ATHLETIC_WORKOUTS, PROFESSIONAL_WORKOUTS, professionalWorkout, PUBLISHED_WORKOUT_TEMPLATES, WORKOUT_TEMPLATE_DRAFTS } from '@/domain/training/professional';
import {
  blockEntryOf,
  draftToTemplateSections,
  entryRole,
  importTemplate,
  itemOf,
  moveItemToSection,
  personalTemplateSource,
  removeItem,
  reorderedItems,
  toSaveEntries,
  type DEntry,
  type ImportSource,
} from '@/features/training/builderDraft';
import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';

/**
 * WORKOUT-TEMPLATES-001 — Python QA scenario EXPORT. Not a product test: when WT_QA_OUT is set it drives the Builder's real draft model
 * and the app's REAL repositories on a REAL schema-v23 SQLite engine (import, edit, reorder, Move to section, Save as template,
 * re-import, rename / duplicate / archive, session start, Program Block assignment, the v22 -> v23 migration) and writes self-contained
 * database files, the serialized built-in registry before and after, and a manifest.json. The Python suite
 * (product_qa/tests/workout_templates) then reads those files with its own sqlite3 and checks the persisted data independently.
 * Without the variable the suite is skipped, so normal Jest runs are unaffected.
 */
const OUT = process.env.WT_QA_OUT;
const run = OUT ? describe : describe.skip;

type Db = ReturnType<typeof openNodeSqlite>;
type World = { db: Db; deps: { ids: ReturnType<typeof createSequentialIdService>; clock: { wallNow: () => number; monotonicNow: () => number } }; playerId: string };
const LANGUAGE = 'en' as const;
const clockOf = () => {
  let wall = new Date(2026, 9, 26, 12, 0, 0).getTime();
  return { wallNow: () => (wall += 1000), monotonicNow: () => 0 };
};
const manifest: Record<string, unknown> = {};
let keyN = 0;
const nextKey = () => `q${keyN++}`;

async function world(list = migrations): Promise<World> {
  const db: Db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, list);
  const deps = { ids: createSequentialIdService(), clock: clockOf() };
  const p = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 } }, basketball: null }, deps);
  if (!p.ok) throw new Error('seed');
  return { db, deps, playerId: p.profile.player.id };
}
const snapshot = (db: Db, file: string) => {
  mkdirSync(OUT!, { recursive: true });
  db.raw.exec(`VACUUM INTO '${join(OUT!, file).replace(/\\/g, '/').replace(/'/g, "''")}'`);
  return file;
};
const registryJson = () =>
  JSON.stringify({ published: PUBLISHED_WORKOUT_TEMPLATES, drafts: WORKOUT_TEMPLATE_DRAFTS, general: GENERAL_ATHLETIC_WORKOUTS, sport: PROFESSIONAL_WORKOUTS, blocks: TRAINING_BLOCKS, programBlocks: PROGRAM_BLOCK_DRAFTS });

async function savePlan(w: World, entries: readonly DEntry[], planId: string | null, name: string) {
  const r = await savePlannedWorkout(w.db, { planId, playerId: w.playerId, name, entries: toSaveEntries(entries) }, w.deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
}
/** The Builder's own loader: a stored plan as a draft (a copied Block section is locked). */
async function loadDraft(w: World, planId: string): Promise<DEntry[]> {
  const plan = (await getPlannedWorkout(w.db, planId))!;
  return groupEntries(plan.items).map(
    (e): DEntry =>
      e.kind === 'SECTION'
        ? {
            key: nextKey(),
            kind: 'SECTION',
            name: e.blockName,
            origin: { type: 'KEEP', positions: e.items.map((i) => i.position) },
            ...(e.items[0]!.sectionId !== null ? { locked: true } : {}),
            items: e.items.map((i) => itemOf(i.exercise, i.prescription)),
          }
        : { key: nextKey(), kind: 'EXERCISE', name: null, origin: { type: 'KEEP', positions: [e.item.position] }, items: [itemOf(e.item.exercise, e.item.prescription)] },
  );
}
const sectionKey = (entries: readonly DEntry[], role: string) => entries.find((e) => entryRole(e) === role)!.key;
const must = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`scenario: ${what}`);
  return value;
};

run('workout templates QA scenario export', () => {
  afterAll(() => {
    writeFileSync(join(OUT!, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  });

  it('main world: import, edit, reorder, Move to section, Save as, re-import, template operations, session, Program Block', async () => {
    const w = await world();
    const exercises = await listExercises(w.db);
    mkdirSync(OUT!, { recursive: true });
    writeFileSync(join(OUT!, 'registry_before.json'), registryJson(), 'utf8');
    const importOf = (templateId: string) => {
      const r = importTemplate([], must(professionalWorkout(templateId), templateId), exercises, LANGUAGE, nextKey);
      if (!r.ok) throw new Error(`import ${templateId}: ${r.reason}`);
      return r.entries;
    };

    // ---- 1) import a built-in Workout Template (a DRAFT with the three roles) and a grandfathered published one
    const planA = await savePlan(w, importOf('GYM-BEG-FULLBODY-A'), null, 'Imported Full Body A');
    const planG = await savePlan(w, importOf('ATH-STRENGTH-FULLBODY-A-01'), null, 'Imported grandfathered A');
    const planA2 = await savePlan(w, importOf('GYM-BEG-FULLBODY-A'), null, 'Imported Full Body A (again)');
    snapshot(w.db, 'after_import.db');
    manifest.imports = { player: w.playerId, planA: planA.id, planG: planG.id, planA2: planA2.id, templateA: 'GYM-BEG-FULLBODY-A', templateG: 'ATH-STRENGTH-FULLBODY-A-01' };

    // ---- 2) edit the imported copy of A: sets, remove, reorder, Move to section (all through the Builder's draft model)
    const ops: unknown[] = [];
    let draft = await loadDraft(w, planA.id);
    const mainKey = sectionKey(draft, 'MAIN');
    draft = draft.map((e) => (e.key === mainKey ? { ...e, items: e.items.map((i, n) => (n === 0 ? { ...i, sets: '5' } : i)) } : e));
    ops.push({ type: 'sets', section: 'MAIN', index: 0, value: 5 });
    draft = draft.map((e) => (e.key === sectionKey(draft, 'MAIN') ? reorderedItems(e, 0, 1) : e));
    ops.push({ type: 'reorder', section: 'MAIN', from: 0, to: 1 });
    const moved = moveItemToSection(draft, sectionKey(draft, 'WARM_UP'), 0, { key: sectionKey(draft, 'COOL_DOWN') }, LANGUAGE, nextKey);
    if (!moved.ok) throw new Error(`move: ${moved.reason}`);
    draft = moved.entries;
    ops.push({ type: 'move', fromSection: 'WARM_UP', index: 0, toSection: 'COOL_DOWN' });
    // remove the FIRST cool-down item (the moved one now sits at the end of that section)
    draft = removeItem(draft, sectionKey(draft, 'COOL_DOWN'), 0);
    ops.push({ type: 'remove', section: 'COOL_DOWN', index: 0 });
    await savePlan(w, draft, planA.id, 'Imported Full Body A');
    snapshot(w.db, 'after_edit.db');
    manifest.edit = { planId: planA.id, ops };

    // ---- 2b) a MOVE-ONLY edit on its own plan: the single intended change, proven against a snapshot taken just before
    const planB = await savePlan(w, importOf('GYM-BEG-FULLBODY-B'), null, 'Imported Full Body B');
    snapshot(w.db, 'before_move.db');
    let moveDraft = await loadDraft(w, planB.id);
    const moveFrom = sectionKey(moveDraft, 'MAIN');
    const movedExercise = must(moveDraft.find((e) => e.key === moveFrom), 'main').items[1]!.snapshot.exerciseId;
    const onlyMove = moveItemToSection(moveDraft, moveFrom, 1, { key: sectionKey(moveDraft, 'COOL_DOWN') }, LANGUAGE, nextKey);
    if (!onlyMove.ok) throw new Error(`move-only: ${onlyMove.reason}`);
    moveDraft = onlyMove.entries;
    await savePlan(w, moveDraft, planB.id, 'Imported Full Body B');
    snapshot(w.db, 'after_move.db');
    manifest.moveOnly = { plan: planB.id, template: 'GYM-BEG-FULLBODY-B', exerciseId: movedExercise, fromSection: 'MAIN', index: 1, toSection: 'COOL_DOWN' };

    // ---- 3) Save as template (a real personal template through the Builder pipeline), with a load and a time meaning
    const mixSource: ImportSource = {
      sections: [
        { role: 'WARM_UP', name: ['חימום', 'Warm-up'], items: [{ exerciseId: 'PLANK', dosage: { sets: 2, target: 20, restSec: 30 } }] },
        {
          role: 'MAIN',
          name: ['אימון מרכזי', 'Main workout'],
          items: [
            { exerciseId: 'BARBELL_BENCH_PRESS', dosage: { sets: 3, target: 5, restSec: 120 } },
            { exerciseId: 'SPRINT_10M', dosage: { sets: 4, target: 5, restSec: 90 }, timeSemantics: 'COMPLETION_TIME_CAP' },
          ],
        },
        { role: 'COOL_DOWN', name: ['שחרור', 'Cool-down'], items: [{ exerciseId: 'PLANK', dosage: { sets: 1, target: 30, restSec: 0 } }] },
      ],
    };
    const mixImported = importTemplate([], mixSource, exercises, LANGUAGE, nextKey);
    if (!mixImported.ok) throw new Error('mix import');
    const mixDraft = mixImported.entries.map((e) =>
      entryRole(e) === 'MAIN' ? { ...e, items: e.items.map((i, n) => (n === 0 ? { ...i, load: '20' } : i)) } : e,
    );
    const mixSections = draftToTemplateSections(mixDraft);
    if (!mixSections.ok) throw new Error('mix sections');
    const mix = await createPersonalTemplate(w.db, { name: 'Mixed set', sections: mixSections.sections }, w.deps);
    if (!mix.ok) throw new Error(JSON.stringify(mix.errors));
    const editedSections = draftToTemplateSections(draft);
    if (!editedSections.ok) throw new Error('edited sections');
    const savedEdited = await createPersonalTemplate(w.db, { name: 'My edited A', sections: editedSections.sections }, w.deps);
    if (!savedEdited.ok) throw new Error(JSON.stringify(savedEdited.errors));
    snapshot(w.db, 'after_save_as.db');
    manifest.saveAs = {
      mixed: mix.template.id,
      mixedExpected: [
        { role: 'WARM_UP', items: [{ exerciseId: 'PLANK', sets: 2, target: 20, load: null, rest: 30, timeSemantics: null }] },
        {
          role: 'MAIN',
          items: [
            { exerciseId: 'BARBELL_BENCH_PRESS', sets: 3, target: 5, load: 20, rest: 120, timeSemantics: null },
            { exerciseId: 'SPRINT_10M', sets: 4, target: 5, load: null, rest: 90, timeSemantics: 'COMPLETION_TIME_CAP' },
          ],
        },
        { role: 'COOL_DOWN', items: [{ exerciseId: 'PLANK', sets: 1, target: 30, load: null, rest: 0, timeSemantics: null }] },
      ],
      edited: savedEdited.template.id,
    };
    // a duplicate name is refused (nothing is overwritten and no name is invented)
    const refused = await createPersonalTemplate(w.db, { name: '  my EDITED a ', sections: editedSections.sections }, w.deps);
    manifest.duplicateNameRefusal = { ok: refused.ok, errors: refused.ok ? null : refused.errors, key: 'my edited a' };

    // ---- 4) re-import the personal template twice: independent copies; editing one leaves the other untouched
    const reimport = async (t: PersonalTemplate, name: string) => {
      const r = importTemplate([], personalTemplateSource(t), exercises, LANGUAGE, nextKey);
      if (!r.ok) throw new Error('reimport');
      return savePlan(w, r.entries, null, name);
    };
    const planM1 = await reimport(mix.template, 'Mixed copy 1');
    const planM2 = await reimport(mix.template, 'Mixed copy 2');
    snapshot(w.db, 'after_reimport.db');
    let m1 = await loadDraft(w, planM1.id);
    m1 = m1.map((e) => (e.key === sectionKey(m1, 'MAIN') ? { ...e, items: e.items.map((i, n) => (n === 0 ? { ...i, sets: '9' } : i)) } : e));
    await savePlan(w, m1, planM1.id, 'Mixed copy 1');
    snapshot(w.db, 'after_reimport_edit.db');
    manifest.reimport = { template: mix.template.id, plan1: planM1.id, plan2: planM2.id, editedSets: 9 };

    // ---- 5) later personal-template operations never touch an earlier plan
    snapshot(w.db, 'before_template_ops.db');
    const renamed = await renamePersonalTemplate(w.db, savedEdited.template.id, 'Renamed A', w.deps);
    const duplicated = await duplicatePersonalTemplate(w.db, savedEdited.template.id, { ...w.deps, copyLabel: 'copy' });
    if (!renamed.ok || !duplicated.ok) throw new Error('template ops');
    await archivePersonalTemplate(w.db, duplicated.template.id, w.deps);
    snapshot(w.db, 'after_template_ops.db');
    manifest.templateOps = { template: savedEdited.template.id, renamedTo: 'Renamed A', duplicate: duplicated.template.id, duplicateName: duplicated.template.name, archived: duplicated.template.id };

    // ---- 6) a session snapshots the plan as it is now
    const session = await startSession(w.db, planA.id, w.deps);
    snapshot(w.db, 'after_session.db');
    manifest.session = { id: session.id, plan: planA.id };

    // ---- 7) provenance: a copied Block section never gives its items to another section
    const blocks = await listBlocks(w.db);
    const created = await createBlock(w.db, { name: 'Shooting', items: [{ exerciseId: 'FREE_THROWS', prescription: { sets: 2, target: 10, loadKg: null, restSec: 60 } }, { exerciseId: 'PUSH_UP', prescription: { sets: 2, target: 10, loadKg: null, restSec: 60 } }] }, w.deps);
    if (!created.ok) throw new Error('block');
    const blockPlan = await savePlan(w, [blockEntryOf(nextKey(), created.block), ...importOf('GYM-BEG-FULLBODY-B')], null, 'Block plus template');
    const blockDraft = await loadDraft(w, blockPlan.id);
    const lockedSection = must(blockDraft.find((e) => e.locked === true), 'locked section');
    const refusedMove = moveItemToSection(blockDraft, lockedSection.key, 0, { key: must(blockDraft.find((e) => entryRole(e) === 'MAIN'), 'main').key }, LANGUAGE, nextKey);
    const refusedIntoLocked = moveItemToSection(blockDraft, must(blockDraft.find((e) => entryRole(e) === 'MAIN'), 'main').key, 0, { key: lockedSection.key }, LANGUAGE, nextKey);
    snapshot(w.db, 'after_block_provenance.db');
    manifest.provenance = { plan: blockPlan.id, blockId: created.block.id, blocksBefore: blocks.length, moveOutOfBlock: refusedMove.ok ? 'MOVED' : refusedMove.reason, moveIntoBlock: refusedIntoLocked.ok ? 'MOVED' : refusedIntoLocked.reason };

    // ---- 8) Program Block assignment (a DRAFT block, by id) creates independent PlannedWorkouts
    const assigned = await assignTrainingBlock(w.db, { blockId: 'GYM-BEGINNER-4W-01', playerId: w.playerId, language: LANGUAGE, startTimes: null }, w.deps);
    snapshot(w.db, 'after_block_assign.db');
    let b1 = await loadDraft(w, assigned.planIds[0]!);
    b1 = b1.map((e) => (e.key === sectionKey(b1, 'MAIN') ? { ...e, items: e.items.map((i, n) => (n === 0 ? { ...i, sets: '7' } : i)) } : e));
    await savePlan(w, b1, assigned.planIds[0]!, assigned.planNames[0]!);
    snapshot(w.db, 'after_block_edit.db');
    manifest.programBlock = { blockId: 'GYM-BEGINNER-4W-01', planIds: assigned.planIds, planNames: assigned.planNames, editedPlan: assigned.planIds[0], editedSets: 7 };

    writeFileSync(join(OUT!, 'registry_after.json'), registryJson(), 'utf8');
    snapshot(w.db, 'main.db');
    // idempotency of the migration framework on the finished database
    manifest.rerun = await runMigrations(w.db, migrations);
    snapshot(w.db, 'main_rerun.db');
    manifest.schema = 23;
    manifest.exercisesInCatalog = exercises.length;
    await w.db.closeAsync();
  });

  it('migration world: a realistic v22 database, then v22 -> v23', async () => {
    const v22 = migrations.slice(0, 22);
    const w = await world(v22);
    const exercises = await listExercises(w.db);
    const imported = importTemplate([], must(professionalWorkout('ATH-STRENGTH-FULLBODY-A-01'), 'workout'), exercises, LANGUAGE, nextKey);
    if (!imported.ok) throw new Error('import');
    const plan1 = await savePlan(w, imported.entries, null, 'Strength A');
    const plan2 = await savePlan(w, imported.entries, null, 'Strength A again');
    await startSession(w.db, plan1.id, w.deps);
    const created = await createBlock(w.db, { name: 'Legacy block', items: [{ exerciseId: 'PUSH_UP', prescription: { sets: 2, target: 10, loadKg: null, restSec: 60 } }] }, w.deps);
    if (!created.ok) throw new Error('block');
    snapshot(w.db, 'v22.db');
    const applied = await runMigrations(w.db, migrations);
    snapshot(w.db, 'v23.db');
    const again = await runMigrations(w.db, migrations);
    snapshot(w.db, 'v23_rerun.db');
    manifest.migration = { from: applied.from, to: applied.to, applied: applied.applied, rerun: again, plans: [plan1.id, plan2.id] };
    await w.db.closeAsync();
  });
});
