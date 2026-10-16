import { useLocalSearchParams } from 'expo-router';

import { AddToWorkout } from '@/features/training/AddToWorkout';

/** QB-WORKOUT-BUILDER-001C: Exercise / Block Details -> Add to workout (?kind=EXERCISE|BLOCK&id=...). */
export default function AddToWorkoutRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  return <AddToWorkout kind={kind === 'BLOCK' ? 'BLOCK' : 'EXERCISE'} id={String(id)} />;
}
