import { useLocalSearchParams } from 'expo-router';

import { NewSelfAssessment } from '@/features/selfAssessment/NewSelfAssessment';

export default function NewSelfAssessmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NewSelfAssessment playerId={String(id)} />;
}
