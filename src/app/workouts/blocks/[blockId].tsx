import { useLocalSearchParams } from 'expo-router';

import { BlockForm } from '@/features/training/BlockForm';

export default function EditBlockScreen() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  // key: opening another block (e.g. the copy after Duplicate) replaces the form state instead of reusing it
  return <BlockForm key={String(blockId)} blockId={String(blockId)} />;
}
