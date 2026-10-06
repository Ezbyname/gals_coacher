import { useLocalSearchParams } from 'expo-router';

import { ChooseWorkoutScreen } from '@/features/training/PlayerTraining';

export default function ChooseWorkoutRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChooseWorkoutScreen playerId={String(id)} />;
}
