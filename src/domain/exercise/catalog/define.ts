import type { ComparisonPolicy } from '../../comparison';
import type { SportKey } from '../../sport';
import type { EquipmentId } from '../equipment';
import type { ExerciseDefinition, ExerciseMeasurement, LocalizedText } from '../exercise';
import type { Difficulty, MovementPattern, MuscleGroup, TrainingCategory } from '../taxonomy';

/** [Hebrew, English] */
export type Pair = readonly [he: string, en: string];
const text = ([he, en]: Pair): LocalizedText => ({ he, en });

/** Compact source form of one built-in catalog entry. */
export interface Entry {
  readonly id: string;
  readonly name: Pair;
  readonly cat: readonly TrainingCategory[];
  readonly prim: readonly MuscleGroup[];
  readonly sec?: readonly MuscleGroup[];
  readonly areas?: readonly ('FULL_BODY' | 'POSTERIOR_CHAIN')[];
  readonly pat?: readonly MovementPattern[];
  readonly diff: Difficulty;
  readonly sports?: readonly SportKey[];
  /** Alternatives; omitted = bodyweight. */
  readonly eq?: readonly (readonly EquipmentId[])[];
  readonly m: ExerciseMeasurement;
  /** [sets, target (in the measurement's unit) | null, rest seconds] */
  readonly d?: readonly [number, number | null, number];
  readonly how: Pair;
  readonly cues?: readonly Pair[];
  readonly mistakes?: readonly Pair[];
  readonly safety?: Pair;
}

export function define(entry: Entry): ExerciseDefinition {
  return {
    id: entry.id,
    name: text(entry.name),
    categories: entry.cat,
    primaryMuscles: entry.prim,
    secondaryMuscles: entry.sec ?? [],
    extraAreas: entry.areas ?? [],
    movementPatterns: entry.pat ?? [],
    difficulty: entry.diff,
    sports: entry.sports ?? [],
    equipment: entry.eq ?? [],
    measurement: entry.m,
    defaults: entry.d ? { sets: entry.d[0], target: entry.d[1], restSec: entry.d[2] } : null,
    instructions: text(entry.how),
    cues: (entry.cues ?? []).map(text),
    mistakes: (entry.mistakes ?? []).map(text),
    safety: entry.safety ? text(entry.safety) : null,
    tutorialUrl: null,
  };
}

const measure = (
  type: ExerciseMeasurement['type'],
  comparison: ComparisonPolicy | null,
  usesLoad = false,
  distanceM: number | null = null,
): ExerciseMeasurement => ({ type, comparison, usesLoad, distanceM });

/** Repetitions (more is better), optionally at a load. */
export const reps = (load = false) => measure('REPETITIONS', null, load);
/** Repetitions that are prescribed but never ranked (warm-up, mobility, drills). */
export const drillReps = () => measure('REPETITIONS', 'NOT_RANKED');
/** A hold: seconds, longer is better (plank, wall sit). */
export const hold = (load = false) => measure('DURATION', 'HIGHER_IS_BETTER', load);
/** Work for a prescribed time, not ranked (jump rope, intervals, stretches). */
export const work = () => measure('DURATION', 'NOT_RANKED');
/** Time to complete (lower is better), over a fixed distance when given. */
export const timed = (distanceM: number | null = null, load = false) =>
  measure('TIME', null, load, distanceM);
/** Makes out of attempts (shooting). */
export const madeAttempts = () => measure('MADE_ATTEMPTS', null);
/** A distance or height achieved in metres, further / higher is better (jumps). */
export const farther = () => measure('DISTANCE', 'HIGHER_IS_BETTER');
