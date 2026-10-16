import { useLocalSearchParams } from 'expo-router';

import { WorkoutBuilderScreen, type Seed } from '@/features/training/WorkoutBuilder';

/** QB-WORKOUT-BUILDER-001B: Player → Create Workout (a local draft; nothing is stored until Save). */
export default function NewWorkoutRoute() {
  const { id, seedKind, seedId } = useLocalSearchParams<{ id: string; seedKind?: string; seedId?: string }>();
  // Exercise / Block Details -> Add to workout -> Create new workout: the chosen item is the draft's first entry
  const seed: Seed | undefined = seedId && (seedKind === 'BLOCK' || seedKind === 'EXERCISE') ? { kind: seedKind, id: String(seedId) } : undefined;
  return <WorkoutBuilderScreen playerId={String(id)} seed={seed} />;
}
