import { useLocalSearchParams } from 'expo-router';

import { devPrefillText } from '@/features/calendarImport/devPrefill';
import { ImportScheduleScreen } from '@/features/calendarImport/ImportSchedule';
import { RoutePlayerScope } from '@/features/players/ActivePlayerContext';

/** CAL-TEXT-IMPORT-001C: Players → <Player> → Schedule → Import weekly trainings from text. */
export default function ImportScheduleRoute() {
  const { id, qaText } = useLocalSearchParams<{ id: string; qaText?: string }>();
  return (
    <RoutePlayerScope playerId={String(id)}>
      {/* `qaText` is honoured only in development builds (__DEV__); release builds ignore it. */}
      <ImportScheduleScreen prefill={devPrefillText(qaText, __DEV__)} />
    </RoutePlayerScope>
  );
}
