import { useLocalSearchParams } from 'expo-router';

import { BlockForm } from '@/features/training/BlockForm';

export default function EditBlockScreen() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  return <BlockForm blockId={String(blockId)} />;
}
