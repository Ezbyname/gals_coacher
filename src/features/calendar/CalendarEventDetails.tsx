import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { deleteCalendarEvent, getCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing } from '@/ui/theme';

import { calendarErrorMessage, eventTypeLabel, sportLabel } from './calendarLabels';
import { SCHEDULE_ROUTE, editEventPath, leaveTo, schedulePath } from './calendarNavigation';
import { formatEventDate, formatEventTime } from './formatEventTime';
import { ErrorScreen, LoadingScreen } from './StatusScreen';

type DetailsState =
  | { status: 'loading' }
  | { status: 'ready'; event: CalendarEvent }
  | { status: 'error'; message: TranslationKey };

/**
 * One event as the user entered it — only the fields that are set, no
 * internal ids or timestamps. Edit opens the shared form; Delete asks for
 * confirmation, then removes the event for good and returns to the schedule.
 * Reloads on focus, so a saved edit shows on return.
 */
export function CalendarEventDetails({ playerId, eventId }: { playerId: string; eventId: string }) {
  const { boot } = useApp();
  const { t, language } = useI18n();
  const navigation = useNavigation();
  const [loaded, setState] = useState<DetailsState>({ status: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<TranslationKey | null>(null);
  const deleteInProgress = useRef(false);
  const state: DetailsState =
    boot.status === 'error' ? { status: 'error', message: 'calendar.errors.loadFailed' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      getCalendarEvent(boot.db, playerId, eventId)
        .then((event) => {
          if (!active) return;
          setState(
            event
              ? { status: 'ready', event }
              : { status: 'error', message: 'calendar.errors.eventNotFound' },
          );
        })
        .catch((e: unknown) => {
          console.warn('[calendar] details failed', e);
          if (active)
            setState({ status: 'error', message: calendarErrorMessage(e, 'calendar.errors.loadFailed') });
        });
      return () => {
        active = false;
      };
    }, [boot, playerId, eventId]),
  );

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') {
    return (
      <ErrorScreen testID="event-details-error" message={state.message} fallback={schedulePath(playerId)} />
    );
  }

  const remove = async () => {
    if (deleteInProgress.current) return;
    deleteInProgress.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      await deleteCalendarEvent(boot.db, playerId, eventId);
      leaveTo(navigation, { route: SCHEDULE_ROUTE, params: { id: playerId }, path: schedulePath(playerId) });
      return; // stays guarded: the screen is leaving
    } catch (e) {
      console.warn('[calendar] delete failed', e);
      setDeleteError(calendarErrorMessage(e, 'calendar.errors.deleteFailed'));
    }
    deleteInProgress.current = false;
    setDeleting(false);
  };

  const confirmDelete = () =>
    Alert.alert(t('calendar.deleteConfirm.title'), t('calendar.deleteConfirm.body'), [
      { text: t('calendar.deleteConfirm.cancel'), style: 'cancel' },
      { text: t('calendar.deleteConfirm.confirm'), style: 'destructive', onPress: () => void remove() },
    ]);

  const { event } = state;
  return (
    <SafeAreaScrollView testID="event-details-scroll" contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.type} testID="event-details-type">
          {eventTypeLabel(t, event.type)}
        </Text>
        {event.title !== null ? (
          <Text style={styles.title} testID="event-details-title">
            {event.title}
          </Text>
        ) : null}
        <Text style={styles.line} testID="event-details-date">
          {formatEventDate(event.startAt, language)}
        </Text>
        <Text style={styles.line} testID="event-details-time">
          {formatEventTime(t, event, language)}
        </Text>
        {event.sport !== null ? (
          <Text style={styles.muted} testID="event-details-sport">
            {sportLabel(t, event.sport)}
          </Text>
        ) : null}
      </View>

      {event.notes !== null ? (
        <View style={styles.card} testID="event-details-notes-section">
          <Text style={styles.label}>{t('calendar.field.notesHeading')}</Text>
          <Text style={styles.line} testID="event-details-notes">
            {event.notes}
          </Text>
        </View>
      ) : null}

      {deleteError ? (
        <Text style={styles.error} testID="event-delete-error">
          {t(deleteError)}
        </Text>
      ) : null}

      <BigButton
        testID="event-edit"
        label={t('calendar.edit')}
        onPress={() => router.push(editEventPath(playerId, eventId))}
        disabled={deleting}
      />
      <BigButton
        testID="event-delete"
        variant="secondary"
        label={deleting ? t('calendar.deleting') : t('calendar.delete')}
        onPress={confirmDelete}
        disabled={deleting}
      />
    </SafeAreaScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  type: { fontSize: 15, fontWeight: '700', color: colors.courtDark, textAlign: 'auto' },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  label: { fontSize: 14, fontWeight: '600', color: colors.inkMuted, textAlign: 'auto' },
  line: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 15, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
