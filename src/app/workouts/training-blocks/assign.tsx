import { useLocalSearchParams } from 'expo-router';

import { AssignTrainingBlock } from '@/features/training/AssignTrainingBlock';

/** TRAINING-BLOCKS-001: Add program to player (review before confirmation). */
export default function AssignTrainingBlockScreen() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  return <AssignTrainingBlock blockId={String(blockId)} />;
}
