import { useLocalSearchParams } from 'expo-router';

import { SessionScreen } from '@/features/training/SessionScreen';

export default function SessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <SessionScreen sessionId={String(sessionId)} />;
}
