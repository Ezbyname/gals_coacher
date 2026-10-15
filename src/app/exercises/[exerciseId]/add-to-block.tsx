import { useLocalSearchParams } from 'expo-router';

import { AddToBlock } from '@/features/training/AddToBlock';

export default function AddToBlockScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return <AddToBlock exerciseId={String(exerciseId)} />;
}
