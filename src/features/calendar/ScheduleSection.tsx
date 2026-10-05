import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { listCalendarEvents } from '@/data/local/calendar/calendarEventRepository';
import { splitAgenda, type CalendarEvent } from '@/domain/calendarEvent';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

import { calendarErrorMessage, eventHeading } from './calendarLabels';
import { schedulePath } from './calendarNavigation';
import { formatEventWhen, isInProgress } from './formatEventTime';

type Next =
  | { status: 'loading' }
  | { status: 'ready'; next: CalendarEvent | null; now: number }
  | { status: 'error'; message: TranslationKey };

/**
 * Entry to a Player's schedule on Edit Player, for every Player (with or
 * without a sport), outside the profile fields. Shows only the nearest
 * current or upcoming event — never the whole schedule. Reloads on focus.
 */
export function ScheduleSection({ playerId }: { playerId: string }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const [state, setState] = useState<Next>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listCalendarEvents(boot.db, playerId)
        .then((events) => {
          const now = services.clock.wallNow();
          if (active)
            setState({ status: 'ready', next: splitAgenda(events, now).currentOrUpcoming[0] ?? null, now });
        })
        .catch((e: unknown) => {
          console.warn('[calendar] next event failed', e);
          if (active)
            setState({ status: 'error', message: calendarErrorMessage(e, 'calendar.errors.loadFailed') });
        });
      return () => {
        active = false;
      };
    }, [boot, playerId, services]),
  );

  return (
    <View style={styles.section} testID="schedule-section">
      <Text style={styles.title}>{t('calendar.title')}</Text>
      <Text style={styles.muted}>{t('calendar.about')}</Text>
      {state.status === 'ready' && state.next !== null ? (
        <Text style={styles.status} testID="schedule-next">
          {t(isInProgress(state.next, state.now) ? 'calendar.happeningNow' : 'calendar.next', {
            event: eventHeading(t, state.next),
            when: formatEventWhen(t, state.next, language),
          })}
        </Text>
      ) : null}
      {state.status === 'ready' && state.next === null ? (
        <Text style={styles.status} testID="schedule-none">
          {t('calendar.none')}
        </Text>
      ) : null}
      {state.status === 'error' ? (
        <Text style={styles.error} testID="schedule-section-error">
          {t(state.message)}
        </Text>
      ) : null}
      <BigButton
        testID="schedule-open"
        variant="secondary"
        label={t('calendar.open')}
        onPress={() => router.push(schedulePath(playerId))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  status: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'auto' },
});
