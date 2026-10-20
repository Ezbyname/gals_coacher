import { useLocalSearchParams } from 'expo-router';

import { TrainingBlockDetails } from '@/features/training/TrainingBlockDetails';

/** TRAINING-BLOCKS-001: one Training Block (read-only). */
export default function TrainingBlockScreen() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  return <TrainingBlockDetails blockId={String(blockId)} />;
}
