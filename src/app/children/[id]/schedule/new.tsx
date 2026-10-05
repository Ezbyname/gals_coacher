import { useLocalSearchParams } from 'expo-router';

import { NewCalendarEvent } from '@/features/calendar/NewCalendarEvent';

export default function NewCalendarEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NewCalendarEvent playerId={String(id)} />;
}
