import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { WorkoutEventLink } from '@/data/local/training/workoutEventLinks';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { workoutEventState, type WorkoutEventState } from '@/domain/workoutEventState';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, semantic, spacing } from '@/ui/theme';

/**
 * CAL-TRAIN-001: how a scheduled workout shows in the calendar lists. The state is derived (never stored) from the
 * workout's training session; a plain event has none. The state is always a symbol AND a word (never colour alone).
 */

/** The state of an event that schedules a workout; null for a plain event (no link). */
export function eventWorkoutState(
  event: Pick<CalendarEvent, 'startAt' | 'endAt' | 'completion'>,
  link: WorkoutEventLink | undefined,
  now: number,
): WorkoutEventState | null {
  if (link === undefined) return null;
  return workoutEventState({ ...event, sessionStatus: link.sessionStatus }, now);
}

type Tone = { base: string; strong: string; tint: string };
const TONES: Record<Exclude<WorkoutEventState, 'UPCOMING'>, Tone> = {
  IN_PROGRESS: { base: colors.court, strong: '#FFFFFF', tint: '#FDEBDD' },
  COMPLETED: semantic.success,
  OVERDUE: semantic.error,
  PARTIAL: semantic.warning,
  ABANDONED: semantic.neutral,
};

/** The card treatment per state. UPCOMING keeps the normal card; COMPLETED is quieter; OVERDUE is the strongest. */
export function workoutCardStyle(state: WorkoutEventState | null): StyleProp<ViewStyle> {
  switch (state) {
    case 'OVERDUE':
      return { borderWidth: 2, borderColor: TONES.OVERDUE.base, backgroundColor: TONES.OVERDUE.tint };
    case 'IN_PROGRESS':
      return { borderWidth: 2, borderColor: TONES.IN_PROGRESS.base };
    case 'COMPLETED':
      return { borderColor: TONES.COMPLETED.base, opacity: 0.8 };
    case 'PARTIAL':
      return { borderColor: TONES.PARTIAL.base, backgroundColor: TONES.PARTIAL.tint };
    case 'ABANDONED':
      return { borderColor: TONES.ABANDONED.base, backgroundColor: TONES.ABANDONED.tint };
    default:
      return undefined;
  }
}

/** The spoken label of a row, with the state's meaning (null state / UPCOMING: unchanged). */
export function useWorkoutA11y() {
  const { t } = useI18n();
  return (label: string, state: WorkoutEventState | null): string =>
    state === null || state === 'UPCOMING' ? label : t(`calendar.workoutState.a11y.${state}`, { label });
}

export function WorkoutStateBadge({ state, testID }: { state: WorkoutEventState | null; testID: string }) {
  const { t } = useI18n();
  if (state === null || state === 'UPCOMING') return null;
  const tone = TONES[state];
  const filled = state === 'OVERDUE' || state === 'IN_PROGRESS';
  return (
    <Text
      testID={testID}
      style={[
        styles.badge,
        filled
          ? { color: '#FFFFFF', backgroundColor: state === 'OVERDUE' ? colors.danger : colors.court }
          : { color: tone.strong, backgroundColor: tone.tint, borderColor: tone.base },
      ]}>
      {t(`calendar.workoutState.${state}`)}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 13,
    fontWeight: '800',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
    textAlign: 'auto',
  },
});
