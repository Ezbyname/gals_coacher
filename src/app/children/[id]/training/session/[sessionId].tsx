import { useLocalSearchParams } from 'expo-router';

import { RoutePlayerScope } from '@/features/players/ActivePlayerContext';
import { SessionScreen } from '@/features/training/SessionScreen';

export default function SessionRoute() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  return (
    <RoutePlayerScope playerId={String(id)}>
      <SessionScreen sessionId={String(sessionId)} />
    </RoutePlayerScope>
  );
}
