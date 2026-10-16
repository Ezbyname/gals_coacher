import { useLocalSearchParams } from 'expo-router';

import { WorkoutBuilderScreen } from '@/features/training/WorkoutBuilder';

/** Edit a planned workout that has no session yet (a started one opens read-only). */
export default function EditWorkoutRoute() {
  const { id, planId } = useLocalSearchParams<{ id: string; planId: string }>();
  // key: opening another plan replaces the draft instead of reusing it
  return <WorkoutBuilderScreen key={String(planId)} playerId={String(id)} planId={String(planId)} />;
}
