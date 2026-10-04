import { useLocalSearchParams } from 'expo-router';

import { SelfAssessmentHistory } from '@/features/selfAssessment/SelfAssessmentHistory';

export default function SelfAssessmentHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SelfAssessmentHistory playerId={String(id)} />;
}
