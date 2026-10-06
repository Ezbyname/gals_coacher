import { useLocalSearchParams } from 'expo-router';

import { PlannedWorkoutScreen } from '@/features/training/PlayerTraining';

export default function PlannedWorkoutRoute() {
  const { id, planId } = useLocalSearchParams<{ id: string; planId: string }>();
  return <PlannedWorkoutScreen playerId={String(id)} planId={String(planId)} />;
}
