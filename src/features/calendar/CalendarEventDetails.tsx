import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  deleteCalendarEvent,
  getCalendarEvent,
  getEventWorkout,
  markCalendarEventCompleted,
  undoCalendarEventCompletion,
} from '@/data/local/calendar/calendarEventRepository';
import { getPlayer } from '@/data/local/players/playerRepository';
import { getPlannedWorkout, getSession, startOrOpenSession, type PlannedItem } from '@/data/local/training/trainingRepository';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { effectiveRules, type ReminderRule } from '@/domain/reminders';
import { groupEntries } from '@/domain/training/composition';
import type { SessionStatus } from '@/domain/training/training';
import { workoutEventState, type WorkoutEventState } from '@/domain/workoutEventState';
import { rulesSummary } from '@/features/reminders/ruleLabel';
import { readReminderPreferences } from '@/preferences/reminderPreference';
import { prescriptionText, sessionPath, trainingErrorMessage } from '@/features/training/trainingLabels';
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
import { WorkoutStateBadge } from './WorkoutStateBadge';

/** QB-WORKOUT-BUILDER-001D: the workout a scheduled event stands for (WHAT); the event itself stays the WHEN. */
type LinkedWorkout = {
  planId: string;
  name: string;
  sections: number;
  startable: boolean;
  sessionId: string | null;
  inProgress: boolean;
  /** CAL-TRAIN-001: the Player the workout is for, what is planned, and the state derived from its session. */
  playerName: string;
  items: readonly PlannedItem[];
  sessionStatus: SessionStatus | null;
  state: WorkoutEventState;
};

/** CAL-REMINDER-RULES-002: the reminders that apply to this event (read-only here), or null when they cannot be read. */
type EventReminders = { enabled: boolean; source: 'EVENT' | 'TYPE' | 'GENERAL'; rules: readonly ReminderRule[] };

async function loadEventReminders(event: CalendarEvent): Promise<EventReminders | null> {
  try {
    const prefs = await readReminderPreferences([]);
    const { rules, source } = effectiveRules(prefs, event);
    return { enabled: prefs.enabled, source, rules };
  } catch (e) {
    console.warn('[calendar] reminder summary failed', e);
    return null;
  }
}

type DetailsState =
  | { status: 'loading' }
  | { status: 'ready'; event: CalendarEvent; workout: LinkedWorkout | null; reminders: EventReminders | null }
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
  const [startFailure, setStartFailure] = useState<TranslationKey | null>(null);
  const startInProgress = useRef(false);
  const state: DetailsState =
    boot.status === 'error' ? { status: 'error', message: 'calendar.errors.loadFailed' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      (async () => {
        const event = await getCalendarEvent(boot.db, playerId, eventId);
        if (event === null) return null;
        const link = await getEventWorkout(boot.db, eventId);
        const reminders = await loadEventReminders(event);
        if (link === null) return { event, workout: null, reminders };
        const plan = await getPlannedWorkout(boot.db, link.planId);
        const session = plan?.sessionId ? await getSession(boot.db, plan.sessionId) : null;
        const profile = await getPlayer(boot.db, playerId);
        const workout: LinkedWorkout | null =
          plan === null
            ? null
            : {
                planId: plan.id,
                name: plan.name,
                sections: groupEntries(plan.items).length,
                startable: plan.items.length > 0,
                sessionId: plan.sessionId,
                inProgress: session?.status === 'IN_PROGRESS',
                playerName: profile?.player.name ?? '',
                items: plan.items,
                sessionStatus: session?.status ?? null,
                state: workoutEventState({ ...event, sessionStatus: session?.status ?? null }, services.clock.wallNow()),
              };
        return { event, workout, reminders };
      })()
        .then((loadedEvent) => {
          if (!active) return;
          setState(
            loadedEvent
              ? { status: 'ready', event: loadedEvent.event, workout: loadedEvent.workout, reminders: loadedEvent.reminders }
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
    }, [boot, playerId, eventId, services]),
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
      setState((s) => ({
        status: 'ready',
        event: updated,
        workout: s.status === 'ready' ? s.workout : null,
        reminders: s.status === 'ready' ? s.reminders : null,
      }));
    } catch (e) {
      console.warn('[calendar] completion failed', e);
      setCompletionError(calendarErrorMessage(e, 'calendar.errors.completionFailed'));
    }
    completionInProgress.current = false;
    setCompleting(false);
  };

  const startWorkout = async (planId: string) => {
    if (startInProgress.current || boot.status !== 'ready') return;
    startInProgress.current = true;
    setStartFailure(null);
    try {
      // Safe to repeat: a plan that already has a session opens it (never a second one, never an error).
      const { session } = await startOrOpenSession(boot.db, planId, { ids: services.ids, clock: services.clock });
      router.push(sessionPath(playerId, session.id));
    } catch (e) {
      console.warn('[calendar] start workout failed', e);
      setStartFailure(trainingErrorMessage(e));
    }
    startInProgress.current = false;
  };

  const confirmDelete = () =>
    Alert.alert(t('calendar.deleteConfirm.title'), t(state.workout ? 'calendar.deleteConfirm.workoutBody' : 'calendar.deleteConfirm.body'), [
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
        {event.location !== null ? (
          <Text
            style={styles.line}
            testID="event-details-location"
            accessibilityLabel={t('calendar.locationA11y', { place: event.location })}>
            {t('calendar.locationLine', { place: event.location })}
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

      {state.workout ? (
        <View style={styles.card} testID="event-workout-section">
          <Text style={styles.label}>{t('training.schedule.eventWorkout')}</Text>
          <Text style={styles.line} testID="event-workout-name">
            {state.workout.name}
          </Text>
          <Text style={styles.muted} testID="event-workout-player">
            {state.workout.playerName}
          </Text>
          <View style={styles.stateRow}>
            <WorkoutStateBadge state={state.workout.state} testID="event-workout-state" />
          </View>
          <Text style={styles.muted} testID="event-workout-summary">
            {t('training.schedule.eventSummary', { count: state.workout.sections })}
          </Text>
          <View style={styles.planned} testID="event-workout-items">
            {state.workout.items.map((item, i) => (
              <View key={item.position} style={styles.plannedItem}>
                {item.blockName !== null && item.blockName !== state.workout!.items[i - 1]?.blockName ? (
                  <Text style={styles.label} testID={`event-workout-block-${item.position}`}>
                    {item.blockName}
                  </Text>
                ) : null}
                <Text style={styles.line} testID={`event-workout-item-${item.position}`}>
                  {item.exercise.name[language]}
                </Text>
                <Text style={styles.muted} testID={`event-workout-item-${item.position}-prescription`}>
                  {prescriptionText(t, item.exercise.measurement, item.prescription)}
                </Text>
              </View>
            ))}
          </View>
          {startFailure ? (
            <Text style={styles.error} testID="event-workout-failed">
              {t(startFailure)}
            </Text>
          ) : null}
          {state.workout.sessionId === null ? (
            state.workout.startable ? (
              <BigButton testID="event-workout-start" label={t('training.schedule.startWorkout')} onPress={() => void startWorkout(state.workout!.planId)} disabled={deleting || completing} />
            ) : null
          ) : (
            <BigButton
              testID={state.workout.inProgress ? 'event-workout-continue' : 'event-workout-view'}
              label={t(state.workout.inProgress ? 'training.schedule.continueWorkout' : 'training.schedule.viewWorkout')}
              onPress={() => router.push(sessionPath(playerId, state.workout!.sessionId!))}
              disabled={deleting || completing}
            />
          )}
        </View>
      ) : null}

      {state.reminders !== null ? (
        <View style={styles.card} testID="event-reminders-section">
          <Text style={styles.label}>{t('reminders.event.detailsTitle')}</Text>
          {!state.reminders.enabled ? (
            <Text style={styles.muted} testID="event-reminders-off">
              {t('reminders.event.off')}
            </Text>
          ) : null}
          <Text style={styles.line} testID="event-reminders-effective">
            {t(
              state.reminders.source === 'EVENT'
                ? 'reminders.event.fromEvent'
                : state.reminders.source === 'TYPE'
                  ? 'reminders.event.fromType'
                  : 'reminders.event.fromGeneral',
              { rules: rulesSummary(t, state.reminders.rules) },
            )}
          </Text>
        </View>
      ) : null}

      {state.workout && event.completion === null ? null : (
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
        {state.workout ? null : event.completion === null ? (
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
      )}

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
  stateRow: { flexDirection: 'row', alignItems: 'flex-start' },
  planned: { gap: spacing.sm, marginTop: spacing.xs },
  plannedItem: { gap: 2 },
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
