import { useLocalSearchParams } from 'expo-router';

import { EditCalendarEvent } from '@/features/calendar/EditCalendarEvent';

export default function EditCalendarEventScreen() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  return <EditCalendarEvent playerId={String(id)} eventId={String(eventId)} />;
}
