import type { ProfessionalSection, ProfessionalWorkout, WorkoutAdjustment } from './types';

/**
 * TRAINING-BLOCKS-001 — the sections of a workout AFTER a Training Block's per-session adjustment (progression in the block,
 * not a duplicate template). Pure and total: the source workout is never changed, and an adjustment that names an Exercise
 * the workout does not contain, or changes an item that has no explicit dosage, is a programming error and throws — so a
 * block can never silently drift away from its workouts.
 */
export function adjustedSections(workout: ProfessionalWorkout, adjust: WorkoutAdjustment | undefined): readonly ProfessionalSection[] {
  if (adjust === undefined) return workout.sections;
  const present = new Set(workout.sections.flatMap((s) => s.items.map((i) => i.exerciseId)));
  const named = [...Object.keys(adjust.sets ?? {}), ...Object.keys(adjust.target ?? {}), ...(adjust.omitExercises ?? [])];
  for (const id of named) {
    if (!present.has(id)) throw new Error(`adjustment names ${id}, which ${workout.id} does not contain`);
  }
  for (const index of adjust.omitSections ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= workout.sections.length) {
      throw new Error(`adjustment omits section ${index}, which ${workout.id} does not have`);
    }
  }
  const omittedSections = new Set(adjust.omitSections ?? []);
  const omittedExercises = new Set(adjust.omitExercises ?? []);
  return workout.sections
    .filter((_, index) => !omittedSections.has(index))
    .map((section) => ({
      name: section.name,
      items: section.items
        .filter((item) => !omittedExercises.has(item.exerciseId))
        .map((item) => {
          const sets = adjust.sets?.[item.exerciseId];
          const target = adjust.target?.[item.exerciseId];
          if (sets === undefined && target === undefined) return item;
          if (item.dosage === undefined) throw new Error(`${workout.id}: ${item.exerciseId} has no explicit dosage to adjust`);
          return { ...item, dosage: { ...item.dosage, sets: sets ?? item.dosage.sets, target: target ?? item.dosage.target } };
        }),
    }))
    .filter((section) => section.items.length > 0);
}
