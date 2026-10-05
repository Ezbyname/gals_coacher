import { useLocalSearchParams } from 'expo-router';

import { CalendarEventDetails } from '@/features/calendar/CalendarEventDetails';

export default function CalendarEventDetailsScreen() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  return <CalendarEventDetails playerId={String(id)} eventId={String(eventId)} />;
}
