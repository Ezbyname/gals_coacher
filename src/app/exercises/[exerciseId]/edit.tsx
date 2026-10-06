import { useLocalSearchParams } from 'expo-router';

import { ExerciseForm } from '@/features/exercises/ExerciseForm';

export default function EditExerciseScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return <ExerciseForm exerciseId={String(exerciseId)} />;
}
