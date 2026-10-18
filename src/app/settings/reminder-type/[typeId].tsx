import { useLocalSearchParams } from 'expo-router';

import { ReminderTypeDefaults } from '@/features/reminders/ReminderTypeDefaults';

/** CAL-REMINDER-RULES-002: Settings → Training reminders → one activity type's default reminders. */
export default function ReminderTypeDefaultsScreen() {
  const { typeId } = useLocalSearchParams<{ typeId: string }>();
  return <ReminderTypeDefaults typeId={String(typeId)} />;
}
