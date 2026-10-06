import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  deleteCalendarEvent,
  getCalendarEvent,
  markCalendarEventCompleted,
  undoCalendarEventCompletion,
} from '@/data/local/calendar/calendarEventRepository';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing } from '@/ui/theme';

import { activityTypeLabel, calendarErrorMessage, eventSubtitle, sportLabel } from './calendarLabels';
import {
  FULL_CALENDAR_ROUTE,
  SCHEDULE_ROUTE,
  editEventPath,
  leaveTo,
  schedulePath,
} from './calendarNavigation';
import { formatDateTime } from './formatEventTime';
import { ErrorScreen, LoadingScreen } from './StatusScreen';

type DetailsState =
  | { status: 'loading' }
  | { status: 'ready'; event: CalendarEvent }
  | { status: 'error'; message: TranslationKey };

/**
 * One event as the user entered it — only the fields that are set, no
 * internal ids or timestamps; explicit Start / End rows, each time with its date. Edit opens the shared form; Delete asks for
 * confirmation, then removes the event for good and returns to the schedule.
 * Completion is an explicit user action only: Mark as completed / Undo
 * completion, no confirmation, never inferred from time. Reloads on focus, so
 * a saved edit shows on return.
 */
export function CalendarEventDetails({ playerId, eventId }: { playerId: string; eventId: string }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const navigation = useNavigation();
  const [loaded, setState] = useState<DetailsState>({ status: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<TranslationKey | null>(null);
  const deleteInProgress = useRef(false);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<TranslationKey | null>(null);
  const completionInProgress = useRef(false);
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
      // Back to where the event was opened from: its Player's schedule or the Full Calendar.
      leaveTo(navigation, { route: SCHEDULE_ROUTE, params: { id: playerId }, path: schedulePath(playerId) }, [
        FULL_CALENDAR_ROUTE,
      ]);
      return; // stays guarded: the screen is leaving
    } catch (e) {
      console.warn('[calendar] delete failed', e);
      setDeleteError(calendarErrorMessage(e, 'calendar.errors.deleteFailed'));
    }
    deleteInProgress.current = false;
    setDeleting(false);
  };

  /** Marks or undoes completion; the screen shows only what storage returned. */
  const changeCompletion = async (complete: boolean) => {
    if (completionInProgress.current) return;
    completionInProgress.current = true;
    setCompleting(true);
    setCompletionError(null);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const updated = complete
        ? await markCalendarEventCompleted(boot.db, playerId, eventId, { clock: services.clock })
        : await undoCalendarEventCompletion(boot.db, playerId, eventId);
      setState({ status: 'ready', event: updated });
    } catch (e) {
      console.warn('[calendar] completion failed', e);
      setCompletionError(calendarErrorMessage(e, 'calendar.errors.completionFailed'));
    }
    completionInProgress.current = false;
    setCompleting(false);
  };

  const confirmDelete = () =>
    Alert.alert(t('calendar.deleteConfirm.title'), t('calendar.deleteConfirm.body'), [
      { text: t('calendar.deleteConfirm.cancel'), style: 'cancel' },
      { text: t('calendar.deleteConfirm.confirm'), style: 'destructive', onPress: () => void remove() },
    ]);

  const { event } = state;
  // The type under a title, unless it is OTHER (then the title alone says what it is).
  const subtitle = eventSubtitle(t, event);
  return (
    <SafeAreaScrollView testID="event-details-scroll" contentContainerStyle={styles.container}>
      <View style={styles.card}>
        {event.title !== null ? (
          <Text style={styles.title} testID="event-details-title">
            {event.title}
          </Text>
        ) : (
          <Text style={styles.title} testID="event-details-type">
            {activityTypeLabel(t, event.activityType)}
          </Text>
        )}
        {subtitle !== null ? (
          <Text style={styles.type} testID="event-details-type">
            {subtitle}
          </Text>
        ) : null}
        <Text style={styles.line} testID="event-details-start">
          {t('calendar.startRow', { when: formatDateTime(event.startAt, language) })}
        </Text>
        {event.endAt !== null ? (
          <Text style={styles.line} testID="event-details-end">
            {t('calendar.endRow', { when: formatDateTime(event.endAt, language) })}
          </Text>
        ) : null}
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

      <View style={styles.card} testID="event-completion-section">
        {event.completion !== null ? (
          <>
            <Text style={styles.completed} testID="event-completion-status">
              {t('calendar.completion.badge')}
            </Text>
            <Text style={styles.muted} testID="event-completed-at">
              {t('calendar.completion.completedOn', {
                when: formatDateTime(event.completion.completedAt, language),
              })}
            </Text>
          </>
        ) : null}
        {completionError ? (
          <Text style={styles.error} testID="event-completion-error">
            {t(completionError)}
          </Text>
        ) : null}
        {event.completion === null ? (
          <BigButton
            testID="event-complete"
            label={completing ? t('calendar.completion.saving') : t('calendar.completion.mark')}
            onPress={() => void changeCompletion(true)}
            disabled={completing || deleting}
          />
        ) : (
          <BigButton
            testID="event-uncomplete"
            variant="secondary"
            label={completing ? t('calendar.completion.saving') : t('calendar.completion.undo')}
            onPress={() => void changeCompletion(false)}
            disabled={completing || deleting}
          />
        )}
      </View>

      {deleteError ? (
        <Text style={styles.error} testID="event-delete-error">
          {t(deleteError)}
        </Text>
      ) : null}

      <BigButton
        testID="event-edit"
        label={t('calendar.edit')}
        onPress={() => router.push(editEventPath(playerId, eventId))}
        disabled={deleting || completing}
      />
      <BigButton
        testID="event-delete"
        variant="secondary"
        label={deleting ? t('calendar.deleting') : t('calendar.delete')}
        onPress={confirmDelete}
        disabled={deleting || completing}
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
  completed: { fontSize: 17, fontWeight: '800', color: colors.success, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
