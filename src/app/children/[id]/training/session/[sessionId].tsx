import { useLocalSearchParams } from 'expo-router';

import { RoutePlayerScope } from '@/features/players/ActivePlayerContext';
import { SessionScreen } from '@/features/training/SessionScreen';

export default function SessionRoute() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  return (
    // History: an archived Player's session stays readable (read-only) — PLAYER-ARCHIVE-001.
    <RoutePlayerScope playerId={String(id)} history>
      <SessionScreen sessionId={String(sessionId)} />
    </RoutePlayerScope>
  );
}
