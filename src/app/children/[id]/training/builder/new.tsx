import { useLocalSearchParams } from 'expo-router';

import { WorkoutBuilderScreen } from '@/features/training/WorkoutBuilder';

/** QB-WORKOUT-BUILDER-001B: Player → Create Workout (a local draft; nothing is stored until Save). */
export default function NewWorkoutRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutBuilderScreen playerId={String(id)} />;
}
