import { useLocalSearchParams } from 'expo-router';

import { BlockForm } from '@/features/training/BlockForm';

export default function NewBlockScreen() {
  // Optional: start the new block with this Exercise (Exercise Details → Add to block → New block).
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  return <BlockForm exerciseId={exerciseId ? String(exerciseId) : undefined} />;
}
