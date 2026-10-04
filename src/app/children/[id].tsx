import { useLocalSearchParams } from 'expo-router';

import { EditPlayer } from '@/features/players/EditPlayer';

export default function EditPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditPlayer playerId={String(id)} />;
}
