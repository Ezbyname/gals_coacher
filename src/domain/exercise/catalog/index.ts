import type { ExerciseDefinition } from '../exercise';

import { BASKETBALL } from './basketball';
import { CORE } from './core';
import { LOWER_BODY } from './lowerBody';
import { POWER_SPEED_CONDITIONING } from './powerSpeed';
import { UPPER_BODY } from './upperBody';
import { WARMUP_MOBILITY } from './warmupMobility';

/**
 * The built-in exercise catalog (TRAIN-001): professionally curated content
 * with stable ids, shipped with the app. Its ids are seeded into the
 * `exercises` table by migrations (so every use can reference them and their
 * active state can be stored); its content is never written into user data,
 * and user-created exercises are separate rows that the catalog never touches.
 * A NEW built-in exercise needs a new migration seeding its id (a test
 * enforces it).
 */
export const BUILTIN_EXERCISES: readonly ExerciseDefinition[] = [
  ...WARMUP_MOBILITY,
  ...UPPER_BODY,
  ...LOWER_BODY,
  ...CORE,
  ...POWER_SPEED_CONDITIONING,
  ...BASKETBALL,
];

const BY_ID = new Map(BUILTIN_EXERCISES.map((exercise) => [exercise.id, exercise]));

export function builtinExercise(id: string): ExerciseDefinition | null {
  return BY_ID.get(id) ?? null;
}
