import { useLocalSearchParams } from 'expo-router';

import { TrainingOverviewScreen } from '@/features/training/PlayerTraining';

export default function TrainingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrainingOverviewScreen playerId={String(id)} />;
}
