import { useLocalSearchParams } from 'expo-router';

import { ProfessionalWorkoutDetails } from '@/features/training/ProfessionalWorkoutDetails';

/** SPORT-CONTENT-001: one professional workout (read-only). */
export default function ProfessionalWorkoutScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  return <ProfessionalWorkoutDetails workoutId={String(workoutId)} />;
}
