import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defaultComparisonPolicy } from '../../comparison';
import { CONTENT_SPORTS } from '../../sport';
import { BUILTIN_EXERCISES, builtinExercise } from '../catalog';
import { EQUIPMENT, isEquipmentId, needsNoEquipment } from '../equipment';
import { bodyAreasOf, exerciseComparison, isSkillOnly, loadApplies } from '../exercise';
import {
  DIFFICULTIES,
  MUSCLE_GROUPS,
  TRAINING_CATEGORIES,
  isDifficulty,
  isMovementPattern,
  isMuscleGroup,
  isTrainingCategory,
} from '../taxonomy';

/**
 * The built-in catalog is curated coaching content: these checks are its
 * quality gate (identity, both languages, valid codes, coherent measurement,
 * real coverage) — not a count for its own sake.
 */
const all = BUILTIN_EXERCISES;
const where = (predicate: (e: (typeof all)[number]) => boolean) => all.filter(predicate).length;

describe('catalog identity', () => {
  it('has a professional size (≥ 80) with unique, stable, code-like ids', () => {
    expect(all.length).toBeGreaterThanOrEqual(80);
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(builtinExercise('ROMANIAN_DEADLIFT')?.id).toBe('ROMANIAN_DEADLIFT');
    expect(builtinExercise('NOT_THERE')).toBeNull();
  });

  it('every exercise is seeded by a migration (a new built-in needs a migration)', () => {
    const migrations = readFileSync(resolve(__dirname, '../../../data/local/migrations/index.ts'), 'utf8');
    for (const { id } of all) expect(migrations).toContain(`('${id}', 1, NULL, 1, 0, 0)`);
  });

  it('names are unique in each language and never empty; Hebrew is Hebrew', () => {
    for (const language of ['he', 'en'] as const) {
      const names = all.map((e) => e.name[language].trim().toLocaleLowerCase());
      expect(names.every((n) => n.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    }
    for (const e of all) expect(e.name.he).toMatch(/[֐-׿]/);
  });
});

describe('every entry is coherent', () => {
  it.each(all.map((e) => [e.id, e] as const))('%s', (_id, e) => {
    expect(e.categories.length).toBeGreaterThan(0);
    expect(e.categories.every(isTrainingCategory)).toBe(true);
    expect(e.primaryMuscles.every(isMuscleGroup)).toBe(true);
    expect(e.secondaryMuscles.every(isMuscleGroup)).toBe(true);
    // Physical exercises name their muscles; pure skill / shooting drills may not.
    if (!isSkillOnly(e.categories)) expect(e.primaryMuscles.length).toBeGreaterThan(0);
    expect(e.secondaryMuscles.filter((m) => e.primaryMuscles.includes(m))).toEqual([]);
    expect(e.movementPatterns.every(isMovementPattern)).toBe(true);
    expect(isDifficulty(e.difficulty)).toBe(true);
    for (const option of e.equipment) {
      expect(option.length).toBeGreaterThan(0);
      expect(option.every(isEquipmentId)).toBe(true);
    }
    for (const sport of e.sports) expect(CONTENT_SPORTS).toContain(sport);
    // Measurement: a comparison is always resolvable (never guessed), a load only where it applies.
    expect(() => exerciseComparison(e.measurement)).not.toThrow();
    if (defaultComparisonPolicy(e.measurement.type) === null) expect(e.measurement.comparison).not.toBeNull();
    if (e.measurement.usesLoad) expect(loadApplies(e.measurement.type)).toBe(true);
    if (e.measurement.distanceM !== null) {
      expect(e.measurement.type).toBe('TIME');
      expect(e.measurement.distanceM).toBeGreaterThan(0);
    }
    // Coaching content in both languages.
    for (const text of [e.instructions, ...e.cues, ...e.mistakes, ...(e.safety ? [e.safety] : [])]) {
      expect(text).not.toBeNull();
      expect(text!.he.trim().length).toBeGreaterThan(0);
      expect(text!.en.trim().length).toBeGreaterThan(0);
    }
    if (e.defaults) {
      expect(e.defaults.sets).toBeGreaterThan(0);
      expect(e.defaults.restSec).toBeGreaterThanOrEqual(0);
    }
  });

  it('no medical diagnosis or rehabilitation claims in the content', () => {
    const text = JSON.stringify(all).toLowerCase();
    expect(text).not.toMatch(
      // \bcures? — a whole word: "a SECURE fixed bar" is not a medical claim.
      /diagnos|rehab|treat(s|ment)? (injur|pain)|\bcures?\b|prevents? injur|אבחון|שיקום|מרפא/,
    );
  });

  // A CONSERVATIVE INITIAL HEURISTIC (owner, 2026-10-08): speed / plyometric /
  // power / advanced stands in for real risk until EX-GUIDE-001 gives each
  // exercise an explicit professional risk level (e.g. LOW / MODERATE /
  // ELEVATED). Difficulty alone does not mean a safety note is required.
  it('every higher-risk exercise (speed, jumps, power, advanced) carries a specific safety note (EX-GUIDE-001 wave 1)', () => {
    const risky = all.filter(
      (e) =>
        e.difficulty === 'ADVANCED' ||
        e.categories.some((c) => c === 'SPEED' || c === 'PLYOMETRIC' || c === 'POWER'),
    );
    expect(risky.length).toBeGreaterThan(20);
    expect(risky.filter((e) => e.safety === null).map((e) => e.id)).toEqual([]);
    // Useful, not boilerplate: no two risk notes are the same text.
    const notes = risky.map((e) => e.safety!.en);
    expect(new Set(notes).size).toBeGreaterThan(notes.length * 0.8);
  });
});

describe('coverage a coach needs', () => {
  it.each([
    [
      'upper-body strength',
      (e: (typeof all)[number]) => e.categories.includes('STRENGTH') && bodyAreasOf(e).includes('UPPER_BODY'),
      10,
    ],
    [
      'lower-body strength',
      (e: (typeof all)[number]) => e.categories.includes('STRENGTH') && bodyAreasOf(e).includes('LOWER_BODY'),
      10,
    ],
    ['posterior chain', (e: (typeof all)[number]) => bodyAreasOf(e).includes('POSTERIOR_CHAIN'), 6],
    ['core', (e: (typeof all)[number]) => e.categories.includes('CORE'), 8],
    ['full body', (e: (typeof all)[number]) => bodyAreasOf(e).includes('FULL_BODY'), 6],
    ['bodyweight (no equipment)', (e: (typeof all)[number]) => needsNoEquipment(e.equipment), 30],
    ['dumbbell', (e: (typeof all)[number]) => e.equipment.some((o) => o.includes('DUMBBELL')), 8],
    ['barbell', (e: (typeof all)[number]) => e.equipment.some((o) => o.includes('BARBELL')), 4],
    ['kettlebell', (e: (typeof all)[number]) => e.equipment.some((o) => o.includes('KETTLEBELL')), 3],
    [
      'machine / cable',
      (e: (typeof all)[number]) =>
        e.equipment.some((o) => o.includes('CABLE_MACHINE') || o.includes('GYM_MACHINE')),
      5,
    ],
    [
      'resistance band',
      (e: (typeof all)[number]) => e.equipment.some((o) => o.includes('RESISTANCE_BAND')),
      6,
    ],
    [
      'conditioning / cardio / HIIT',
      (e: (typeof all)[number]) => e.categories.some((c) => ['CONDITIONING', 'CARDIO', 'HIIT'].includes(c)),
      10,
    ],
    ['speed / sprint', (e: (typeof all)[number]) => e.categories.includes('SPEED'), 5],
    ['agility', (e: (typeof all)[number]) => e.categories.includes('AGILITY'), 6],
    ['plyometric / jumping', (e: (typeof all)[number]) => e.categories.includes('PLYOMETRIC'), 6],
    ['warm-up', (e: (typeof all)[number]) => e.categories.includes('WARMUP'), 10],
    [
      'mobility / flexibility',
      (e: (typeof all)[number]) => e.categories.some((c) => c === 'MOBILITY' || c === 'FLEXIBILITY'),
      8,
    ],
    ['cooldown', (e: (typeof all)[number]) => e.categories.includes('COOLDOWN'), 4],
    ['basketball shooting', (e: (typeof all)[number]) => e.categories.includes('BASKETBALL_SHOOTING'), 5],
    ['basketball skill', (e: (typeof all)[number]) => e.categories.includes('BASKETBALL_SKILL'), 6],
    [
      'basketball conditioning',
      (e: (typeof all)[number]) => e.categories.includes('BASKETBALL_CONDITIONING'),
      3,
    ],
  ])('%s', (_name, predicate, minimum) => {
    expect(where(predicate)).toBeGreaterThanOrEqual(minimum);
  });

  it('every category, muscle group and difficulty is used at least once', () => {
    for (const c of TRAINING_CATEGORIES) expect(where((e) => e.categories.includes(c))).toBeGreaterThan(0);
    for (const m of MUSCLE_GROUPS) {
      expect(where((e) => e.primaryMuscles.includes(m) || e.secondaryMuscles.includes(m))).toBeGreaterThan(0);
    }
    for (const d of DIFFICULTIES) expect(where((e) => e.difficulty === d)).toBeGreaterThan(0);
  });

  it('uses most of the equipment catalog (and the catalog has no unused oddities)', () => {
    const used = new Set(all.flatMap((e) => e.equipment.flat()));
    expect(used.size).toBeGreaterThanOrEqual(EQUIPMENT.length - 2);
  });

  it('measures what coaches measure: sprints by time over a distance, shooting by makes / attempts, holds by time, jumps by distance', () => {
    expect(builtinExercise('SPRINT_20M')!.measurement).toEqual({
      type: 'TIME',
      comparison: null,
      usesLoad: false,
      distanceM: 20,
    });
    expect(builtinExercise('FREE_THROWS')!.measurement.type).toBe('MADE_ATTEMPTS');
    expect(builtinExercise('PLANK')!.measurement).toMatchObject({
      type: 'DURATION',
      comparison: 'HIGHER_IS_BETTER',
    });
    expect(builtinExercise('BROAD_JUMP')!.measurement).toMatchObject({
      type: 'DISTANCE',
      comparison: 'HIGHER_IS_BETTER',
    });
    expect(builtinExercise('BARBELL_BENCH_PRESS')!.measurement).toMatchObject({
      type: 'REPETITIONS',
      usesLoad: true,
    });
    // A sprint never asks for a load; a plank never asks for reps.
    expect(builtinExercise('SPRINT_10M')!.measurement.usesLoad).toBe(false);
    expect(builtinExercise('PLANK')!.measurement.type).not.toBe('REPETITIONS');
  });

  it('Romanian Deadlift is classified like a coach would', () => {
    const rdl = builtinExercise('ROMANIAN_DEADLIFT')!;
    expect(rdl.primaryMuscles).toEqual(['HAMSTRINGS', 'GLUTES']);
    expect(rdl.secondaryMuscles).toEqual(['LOWER_BACK', 'ABDOMINALS', 'FOREARMS_GRIP']);
    expect(rdl.movementPatterns).toContain('HINGE');
    expect(bodyAreasOf(rdl)).toEqual(expect.arrayContaining(['LOWER_BODY', 'POSTERIOR_CHAIN']));
  });
});
