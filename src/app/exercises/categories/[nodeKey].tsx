import { useLocalSearchParams } from 'expo-router';

import { TaxonomyBrowser } from '@/features/exercises/TaxonomyBrowser';

export default function TrainingCategoryScreen() {
  const { nodeKey } = useLocalSearchParams<{ nodeKey: string }>();
  return <TaxonomyBrowser nodeKey={String(nodeKey)} />;
}
