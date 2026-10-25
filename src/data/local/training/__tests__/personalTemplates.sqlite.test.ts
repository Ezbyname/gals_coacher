import { createSequentialIdService } from '@/services/ids/IdService';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import type { Prescription } from '@/domain/training/training';

import { setExerciseActive } from '../../exercises/exerciseRepository';
import { migrations } from '../../migrations';
import { runMigrations } from '../../migrations/runMigrations';
import { createPlayer } from '../../players/playerRepository';
import {
  archivePersonalTemplate,
  createPersonalTemplate,
  duplicatePersonalTemplate,
  getPersonalTemplate,
  listPersonalTemplates,
  renamePersonalTemplate,
  type PersonalTemplateInput,
  type PersonalTemplateSection,
} from '../personalTemplateRepository';
import { savePlannedWorkout } from '../plannedWorkoutCompositionRepository';
import { startSession } from '../trainingRepository';

/** WORKOUT-TEMPLATES-001 (S4): personal workout templates on real SQLite (schema v23) — snapshot, names, Rename / Duplicate / Archive, and the database's own guards. */
const clock = { wallNow: () => new Date(2026, 9, 25, 12).getTime(), monotonicNow: () => 0 };
const ids = createSequentialIdService();
const deps = { ids, clock };
type Db = ReturnType<typeof openNodeSqlite>;
let db: Db;
let player: string;
const rx = (sets: number, target: number | null, restSec: number | null = 60, extra: Partial<Prescription> = {}): Prescription => ({ sets, target, loadKg: null, restSec, ...extra });
const sec = (role: PersonalTemplateSection['role'], name: string | null, ...items: [string, Prescription][]): PersonalTemplateSection => ({ role, name, items: items.map(([exerciseId, prescription]) => ({ exerciseId, prescription })) });
const standard = (): PersonalTemplateInput => ({
  name: 'My push day',
  sections: [
    sec('WARM_UP', null, ['PLANK', rx(2, 20, 30)]),
    sec('MAIN', null, ['PUSH_UP', rx(3, 12, 90)], ['SPRINT_10M', rx(4, 2.5, 120, { timeSemantics: 'COMPLETION_TIME_CAP' })]),
    sec('COOL_DOWN', null, ['PLANK', rx(1, 30, 0)]),
  ],
});
async function make(input: PersonalTemplateInput = standard()) {
  const r = await createPersonalTemplate(db, input, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.template;
}
const dumpHistory = async () => JSON.stringify(await Promise.all(['planned_workouts', 'planned_workout_items', 'training_sessions', 'session_exercises'].map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`))));

beforeEach(async () => {
  db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, migrations);
  const r = await createPlayer(db, { player: { name: 'Daniel', dateOfBirth: { year: 2012, month: 7, day: 9 } }, basketball: null }, deps);
  if (!r.ok) throw new Error('seed');
  player = r.profile.player.id;
});
afterEach(async () => {
  await db.closeAsync();
});

describe('Save as template: a content snapshot (PT-01…)', () => {
  it('PT-01: sections, roles, exercise ids, order and every prescription field read back exactly', async () => {
    const t = await make();
    const back = (await getPersonalTemplate(db, t.id))!;
    expect(back.name).toBe('My push day');
    expect(back.active).toBe(true);
    expect(back.sections.map((s) => s.role)).toEqual(['WARM_UP', 'MAIN', 'COOL_DOWN']);
    expect(back.sections.map((s) => s.items.map((i) => i.exerciseId))).toEqual([['PLANK'], ['PUSH_UP', 'SPRINT_10M'], ['PLANK']]);
    expect(back.sections[0]!.items[0]!.prescription).toEqual(rx(2, 20, 30));
    expect(back.sections[1]!.items[1]!.prescription).toEqual(rx(4, 2.5, 120, { timeSemantics: 'COMPLETION_TIME_CAP' }));
  });

  it('PT-02: a load is part of the snapshot', async () => {
    const t = await make({ name: 'Heavy', sections: [sec('MAIN', null, ['BARBELL_BENCH_PRESS', { sets: 3, target: 5, loadKg: 20, restSec: 120 }])] });
    expect(t.sections[0]!.items[0]!.prescription.loadKg).toBe(20);
  });

  it('PT-03: a CUSTOM section keeps its own name; a standard one stores no name', async () => {
    const t = await make({ name: 'Mixed', sections: [sec('CUSTOM', 'Finisher', ['PUSH_UP', rx(2, 10)]), sec('MAIN', null, ['PLANK', rx(2, 30, 30)])] });
    expect(t.sections.map((s) => [s.role, s.name])).toEqual([['CUSTOM', 'Finisher'], ['MAIN', null]]);
  });

  it('PT-04: names are validated: blank, too long, and a duplicate among ACTIVE templates (case-insensitive) is refused, writing nothing', async () => {
    await make();
    const before = (await listPersonalTemplates(db, { includeArchived: true })).length;
    expect(await createPersonalTemplate(db, { ...standard(), name: '   ' }, deps)).toEqual({ ok: false, errors: { name: 'REQUIRED' } });
    expect(await createPersonalTemplate(db, { ...standard(), name: 'x'.repeat(200) }, deps)).toEqual({ ok: false, errors: { name: 'TOO_LONG' } });
    expect(await createPersonalTemplate(db, { ...standard(), name: '  MY PUSH DAY ' }, deps)).toEqual({ ok: false, errors: { name: 'DUPLICATE' } });
    expect((await listPersonalTemplates(db, { includeArchived: true })).length).toBe(before);
    expect((await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM user_workout_template_items'))!.n).toBe(4);
  });

  it('PT-05: a Hebrew name is unique too, and an archived name is free again', async () => {
    const he = await make({ ...standard(), name: 'יום דחיפה' });
    expect(await createPersonalTemplate(db, { ...standard(), name: 'יום דחיפה' }, deps)).toEqual({ ok: false, errors: { name: 'DUPLICATE' } });
    await archivePersonalTemplate(db, he.id, deps);
    const again = await createPersonalTemplate(db, { ...standard(), name: 'יום דחיפה' }, deps);
    expect(again.ok).toBe(true);
  });

  it('PT-06: content is refused, atomically, when it is empty / has an empty section / repeats a role / has an unnamed custom section', async () => {
    const bad = async (input: PersonalTemplateInput) => (await createPersonalTemplate(db, input, deps));
    expect(await bad({ name: 'A', sections: [] })).toEqual({ ok: false, errors: { content: 'EMPTY' } });
    expect(await bad({ name: 'A', sections: [sec('MAIN', null)] })).toEqual({ ok: false, errors: { content: 'EMPTY_SECTION' } });
    expect(await bad({ name: 'A', sections: [sec('MAIN', null, ['PUSH_UP', rx(3, 10)]), sec('MAIN', null, ['PLANK', rx(2, 30, 30)])] })).toEqual({ ok: false, errors: { content: 'DUPLICATE_ROLE' } });
    expect(await bad({ name: 'A', sections: [sec('CUSTOM', '  ', ['PUSH_UP', rx(3, 10)])] })).toEqual({ ok: false, errors: { content: 'CUSTOM_NAME_REQUIRED' } });
    expect(await bad({ name: 'A', sections: [sec('MAIN', null, ['NO_SUCH_EXERCISE', rx(3, 10)])] })).toEqual({ ok: false, errors: { content: 'EXERCISE_UNKNOWN' } });
    expect(await bad({ name: 'A', sections: [sec('MAIN', null, ['PUSH_UP', rx(0, 10)])] })).toEqual({ ok: false, errors: { content: 'INVALID_PRESCRIPTION' } });
    expect((await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM user_workout_templates'))!.n).toBe(0);
  });

  it('PT-07: an inactive exercise cannot enter new content', async () => {
    await setExerciseActive(db, 'PUSH_UP', false, deps);
    expect(await createPersonalTemplate(db, standard(), deps)).toEqual({ ok: false, errors: { content: 'EXERCISE_INACTIVE' } });
  });
});

describe('Rename / Duplicate / Archive (PT-08…)', () => {
  it('PT-08: Rename changes the name only; a taken name is refused; its own name is not a clash', async () => {
    const a = await make();
    const b = await make({ ...standard(), name: 'Other' });
    const sections = JSON.stringify(a.sections);
    const r = await renamePersonalTemplate(db, a.id, 'Renamed', deps);
    expect(r.ok && r.template.name).toBe('Renamed');
    expect(JSON.stringify((await getPersonalTemplate(db, a.id))!.sections)).toBe(sections);
    expect(await renamePersonalTemplate(db, a.id, 'other', deps)).toEqual({ ok: false, errors: { name: 'DUPLICATE' } });
    expect((await getPersonalTemplate(db, a.id))!.name).toBe('Renamed');
    expect((await renamePersonalTemplate(db, b.id, 'OTHER', deps)).ok).toBe(true); // a case-only change of its own name
  });

  it('PT-09: Duplicate creates an independent template named "<name> (copy)", then "(copy 2)"; the source is untouched', async () => {
    const a = await make();
    const c1 = await duplicatePersonalTemplate(db, a.id, { ...deps, copyLabel: 'copy' });
    const c2 = await duplicatePersonalTemplate(db, a.id, { ...deps, copyLabel: 'copy' });
    expect(c1.ok && c1.template.name).toBe('My push day (copy)');
    expect(c2.ok && c2.template.name).toBe('My push day (copy 2)');
    if (!c1.ok) throw new Error('dup');
    expect(c1.template.id).not.toBe(a.id);
    expect(c1.template.sections).toEqual(a.sections);
    expect(await getPersonalTemplate(db, a.id)).toEqual(a);
  });

  it('PT-10: Archive hides it from the list (still readable), frees its name, and is idempotent; an archived template cannot be duplicated', async () => {
    const a = await make();
    const archived = await archivePersonalTemplate(db, a.id, deps);
    expect(archived.active).toBe(false);
    expect((await listPersonalTemplates(db)).map((t) => t.id)).toEqual([]);
    expect((await listPersonalTemplates(db, { includeArchived: true })).map((t) => t.id)).toEqual([a.id]);
    expect((await archivePersonalTemplate(db, a.id, deps)).active).toBe(false);
    await expect(duplicatePersonalTemplate(db, a.id, { ...deps, copyLabel: 'copy' })).rejects.toMatchObject({ rule: 'TEMPLATE_INACTIVE' });
    await expect(archivePersonalTemplate(db, 'missing', deps)).rejects.toMatchObject({ entity: 'template' });
  });

  it('PT-11: Archive and Rename never touch a plan, a session or any history', async () => {
    const a = await make();
    const plan = await savePlannedWorkout(db, { planId: null, playerId: player, name: 'Imported copy', entries: [{ kind: 'SECTION', name: 'Main workout', items: [{ exerciseId: 'PUSH_UP', prescription: rx(3, 12, 90) }] }] }, deps);
    if (!plan.ok) throw new Error('plan');
    await startSession(db, plan.plan.id, deps);
    const before = await dumpHistory();
    await renamePersonalTemplate(db, a.id, 'New name', deps);
    await archivePersonalTemplate(db, a.id, deps);
    expect(await dumpHistory()).toBe(before);
  });
});

describe('the database itself guards a personal template (PT-12…)', () => {
  it('PT-12: sections and items can never be updated or deleted; a template is never deleted; a sealed template gains nothing', async () => {
    const a = await make();
    await expect(db.runAsync('UPDATE user_workout_template_items SET sets = 9 WHERE template_id = ?', [a.id])).rejects.toThrow(/never change/);
    await expect(db.runAsync('DELETE FROM user_workout_template_items WHERE template_id = ?', [a.id])).rejects.toThrow(/never deleted/);
    await expect(db.runAsync("UPDATE user_workout_template_sections SET role = 'CUSTOM', name = 'x' WHERE template_id = ?", [a.id])).rejects.toThrow(/never change/);
    await expect(db.runAsync('DELETE FROM user_workout_template_sections WHERE template_id = ?', [a.id])).rejects.toThrow(/never deleted/);
    await expect(db.runAsync('DELETE FROM user_workout_templates WHERE id = ?', [a.id])).rejects.toThrow(/never deleted/);
    await expect(db.runAsync("INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES (?, 3, 'CUSTOM', 'Late')", [a.id])).rejects.toThrow(/sealed/);
    await expect(
      db.runAsync('INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets) VALUES (?, 0, 5, ?, 1)', [a.id, 'PUSH_UP']),
    ).rejects.toThrow(/sealed/);
    expect(await getPersonalTemplate(db, a.id)).toEqual(a);
  });

  it('PT-13: identity and the seal cannot change; only name / archive can', async () => {
    const a = await make();
    await expect(db.runAsync("UPDATE user_workout_templates SET id = 'other' WHERE id = ?", [a.id])).rejects.toThrow(/identity/);
    await expect(db.runAsync("UPDATE user_workout_templates SET family_id = 'other' WHERE id = ?", [a.id])).rejects.toThrow();
    await expect(db.runAsync('UPDATE user_workout_templates SET sealed = 0 WHERE id = ?', [a.id])).rejects.toThrow(/identity/);
    await expect(db.runAsync('UPDATE user_workout_templates SET created_at = 1 WHERE id = ?', [a.id])).rejects.toThrow(/identity/);
    await db.runAsync("UPDATE user_workout_templates SET name = 'Allowed', name_key = 'allowed' WHERE id = ?", [a.id]);
  });

  it('PT-14: sealing needs contiguous sections, each with contiguous exercises; roles are unique per template; a custom section needs a name', async () => {
    const family = (await db.getFirstAsync<{ family_id: string }>('SELECT family_id FROM user_workout_templates LIMIT 1')) ?? null;
    await make({ ...standard(), name: 'Seed family' });
    const fid = (await db.getFirstAsync<{ family_id: string }>('SELECT family_id FROM user_workout_templates LIMIT 1'))!.family_id;
    void family;
    const open = async (id: string) => db.runAsync("INSERT INTO user_workout_templates (id, family_id, name, name_key, active, sealed, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, 1, 1)", [id, fid, id, id]);
    await open('t-empty');
    await expect(db.runAsync("UPDATE user_workout_templates SET sealed = 1 WHERE id = 't-empty'")).rejects.toThrow(/contiguous/);
    await open('t-gap');
    await db.runAsync("INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES ('t-gap', 1, 'MAIN', NULL)");
    await db.runAsync("INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets) VALUES ('t-gap', 1, 0, 'PUSH_UP', 1)");
    await expect(db.runAsync("UPDATE user_workout_templates SET sealed = 1 WHERE id = 't-gap'")).rejects.toThrow(/contiguous/); // no section 0
    await open('t-nosets');
    await db.runAsync("INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES ('t-nosets', 0, 'MAIN', NULL)");
    await expect(db.runAsync("UPDATE user_workout_templates SET sealed = 1 WHERE id = 't-nosets'")).rejects.toThrow(/contiguous/); // an empty section
    await expect(db.runAsync("INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES ('t-nosets', 1, 'MAIN', NULL)")).rejects.toThrow(/UNIQUE/i);
    await expect(db.runAsync("INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES ('t-nosets', 2, 'CUSTOM', NULL)")).rejects.toThrow(/CHECK/i);
    await expect(db.runAsync("UPDATE user_workout_templates SET name = 'edit' WHERE id = 't-nosets'")).rejects.toThrow(/written once/); // no edits before the seal
  });

  it('PT-15: constraints: a unique ACTIVE name per Family (the key), valid prescription ranges, an existing exercise', async () => {
    const a = await make();
    const fid = (await db.getFirstAsync<{ family_id: string }>('SELECT family_id FROM user_workout_templates WHERE id = ?', [a.id]))!.family_id;
    await expect(db.runAsync("INSERT INTO user_workout_templates (id, family_id, name, name_key, active, sealed, created_at, updated_at) VALUES ('dup', ?, 'X', 'my push day', 1, 0, 1, 1)", [fid])).rejects.toThrow(/UNIQUE/i);
    await db.runAsync("INSERT INTO user_workout_templates (id, family_id, name, name_key, active, sealed, created_at, updated_at) VALUES ('ok', ?, 'X', 'my push day', 0, 0, 1, 1)", [fid]); // an archived row may share the key
    await db.runAsync("INSERT INTO user_workout_template_sections (template_id, position, role, name) VALUES ('ok', 0, 'MAIN', NULL)");
    await expect(db.runAsync("INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets) VALUES ('ok', 0, 0, 'PUSH_UP', 0)")).rejects.toThrow(/CHECK/i);
    await expect(db.runAsync("INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets, time_semantics) VALUES ('ok', 0, 0, 'PUSH_UP', 1, 'BOGUS')")).rejects.toThrow(/CHECK/i);
    await expect(db.runAsync("INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets) VALUES ('ok', 0, 0, 'NOPE', 1)")).rejects.toThrow(/FOREIGN KEY/i);
    await expect(db.runAsync("INSERT INTO user_workout_template_items (template_id, section_position, position, exercise_id, sets) VALUES ('ok', 4, 0, 'PUSH_UP', 1)")).rejects.toThrow(/FOREIGN KEY/i);
  });
});
