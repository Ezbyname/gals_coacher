import { validatePrescription, defaultPrescription } from '../training';
import { builtinExercise } from '../../exercise/catalog';

import type { ProfessionalWorkout, ProfessionalItem, SectionRole, StandardSectionRole, TrainingFocus, Pair } from './types';
import { audienceOf } from './types';

/**
 * WORKOUT-TEMPLATES-001 (S0) — metadata and content rules for built-in Workout Templates. A built-in Workout Template IS a
 * Professional Workout (one registry, one import path); nothing here is a parallel model and nothing is a database row.
 */

/** The canonical section names of the three standard roles. A plan stores only the name, so the standard roles are written with
 *  exactly these strings; a name is never used to read a role when the role itself exists (registry, personal template). */
export const SECTION_ROLE_NAMES: Readonly<Record<StandardSectionRole, Pair>> = {
  WARM_UP: ['חימום', 'Warm-up'],
  MAIN: ['אימון מרכזי', 'Main workout'],
  COOL_DOWN: ['שחרור', 'Cool-down'],
};
export const STANDARD_ROLE_ORDER: readonly StandardSectionRole[] = ['WARM_UP', 'MAIN', 'COOL_DOWN'];

/**
 * The role of a section read back from a PLAN, which stores no role (planned_workout_items has no such column): only the exact
 * canonical standard name (either language) maps to a standard role; everything else is CUSTOM. Used only when no role metadata
 * exists for the section.
 */
export function roleFromPlanSectionName(name: string): SectionRole {
  const n = name.trim().toLocaleLowerCase();
  for (const role of STANDARD_ROLE_ORDER) {
    if (SECTION_ROLE_NAMES[role].some((p) => p.toLocaleLowerCase() === n)) return role;
  }
  return 'CUSTOM';
}

/** The name written to a plan for a section of this role (a CUSTOM section keeps its own name). */
export function planSectionName(role: SectionRole, own: string, language: 'he' | 'en'): string {
  return role === 'CUSTOM' ? own : SECTION_ROLE_NAMES[role][language === 'he' ? 0 : 1];
}

// ------------------------------------------------------------------------------------------------------------ categories
export const WORKOUT_CATEGORIES = [
  'STRENGTH',
  'HYPERTROPHY_GYM',
  'ATHLETICISM',
  'EXPLOSIVE_POWER',
  'SPEED',
  'AGILITY_COD',
  'CONDITIONING',
  'CORE',
  'MOBILITY',
  'RECOVERY',
  'BASKETBALL',
  'FOOTBALL',
  'SURFING',
] as const;
export type WorkoutCategory = (typeof WORKOUT_CATEGORIES)[number];

const FOCUS_CATEGORY: Partial<Record<TrainingFocus, WorkoutCategory>> = {
  STRENGTH_FOUNDATION: 'STRENGTH',
  GYM_FULL_BODY: 'HYPERTROPHY_GYM',
  GYM_UPPER_LOWER: 'HYPERTROPHY_GYM',
  GYM_PUSH_PULL_LEGS: 'HYPERTROPHY_GYM',
  ATHLETIC_FOUNDATION: 'ATHLETICISM',
  EXPLOSIVE_POWER: 'EXPLOSIVE_POWER',
  SPEED_ACCELERATION: 'SPEED',
  AGILITY_COD: 'AGILITY_COD',
  CONDITIONING: 'CONDITIONING',
  CORE: 'CORE',
  MOBILITY: 'MOBILITY',
  RECOVERY: 'RECOVERY',
};
const SPORT_CATEGORY = { BASKETBALL: 'BASKETBALL', FOOTBALL: 'FOOTBALL', SURFING: 'SURFING' } as const;

/** The category of a workout: its sport when it belongs to one, otherwise the category of its focus. null = not categorised. */
export function categoryOf(w: ProfessionalWorkout): WorkoutCategory | null {
  if (w.sport !== null) return SPORT_CATEGORY[w.sport];
  return FOCUS_CATEGORY[w.focus] ?? null;
}

// ------------------------------------------------------------------------------------------------------------ content rules
/** Every exercise of a workout, in order. */
export const allItems = (w: ProfessionalWorkout): ProfessionalItem[] => w.sections.flatMap((s) => [...s.items]);

/**
 * The quality rule for every NEW built-in Workout Template: exactly one WARM_UP, one MAIN and one COOL_DOWN (in that order),
 * every section non-empty, no exercise twice in a section, every exercise resolves to a catalog exercise, every dosage valid for
 * its measurement. Returns the first problem, or null. The grandfathered workouts are never checked against this.
 */
export function newTemplateProblem(w: ProfessionalWorkout): string | null {
  const roles = w.sections.map((s) => s.role);
  if (roles.length !== 3 || roles[0] !== 'WARM_UP' || roles[1] !== 'MAIN' || roles[2] !== 'COOL_DOWN') {
    return `sections must be WARM_UP, MAIN, COOL_DOWN (found ${roles.join(', ')})`;
  }
  for (const s of w.sections) {
    if (s.items.length === 0) return `section ${s.role} is empty`;
    const seen = new Set<string>();
    for (const item of s.items) {
      if (seen.has(item.exerciseId)) return `${item.exerciseId} appears twice in ${s.role}`;
      seen.add(item.exerciseId);
      const exercise = builtinExercise(item.exerciseId);
      if (!exercise) return `unknown exercise ${item.exerciseId}`;
      const p = item.dosage
        ? { sets: item.dosage.sets, target: item.dosage.target, loadKg: null, restSec: item.dosage.restSec, ...(item.timeSemantics ? { timeSemantics: item.timeSemantics } : {}) }
        : defaultPrescription(exercise.measurement, exercise.defaults);
      if (!validatePrescription(exercise.measurement, p).ok) return `invalid dosage for ${item.exerciseId}`;
    }
  }
  const main = w.sections[1]!;
  if (main.items.length < 3) return 'the main section needs at least 3 exercises';
  return null;
}

/** Heavy barbell work needs EXPERIENCED_OR_SUPERVISED; checked by test, not by the UI. */
export const BARBELL_IDS: readonly string[] = ['BARBELL_BACK_SQUAT', 'BARBELL_BENCH_PRESS', 'BARBELL_OVERHEAD_PRESS', 'DEADLIFT'];
export const usesBarbell = (w: ProfessionalWorkout): boolean => allItems(w).some((i) => BARBELL_IDS.includes(i.exerciseId));
export const audienceProblem = (w: ProfessionalWorkout): string | null =>
  usesBarbell(w) && audienceOf(w) !== 'EXPERIENCED_OR_SUPERVISED' ? 'barbell work requires audience EXPERIENCED_OR_SUPERVISED' : null;
