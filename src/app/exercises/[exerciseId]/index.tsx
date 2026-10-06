import { useLocalSearchParams } from 'expo-router';

import { ExerciseDetails } from '@/features/exercises/ExerciseDetails';

export default function ExerciseDetailsScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return <ExerciseDetails exerciseId={String(exerciseId)} />;
}
