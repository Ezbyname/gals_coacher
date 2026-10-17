import { useLocalSearchParams } from 'expo-router';

import { ScheduleWorkoutScreen } from '@/features/training/ScheduleWorkout';

/** QB-WORKOUT-BUILDER-001D: schedule / reschedule a planned workout (the calendar event is the WHEN). */
export default function ScheduleWorkoutRoute() {
  const { id, planId } = useLocalSearchParams<{ id: string; planId: string }>();
  return <ScheduleWorkoutScreen playerId={String(id)} planId={String(planId)} />;
}
