import { useLocalSearchParams } from 'expo-router';

import { CalendarAgenda } from '@/features/calendar/CalendarAgenda';

export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CalendarAgenda playerId={String(id)} />;
}
