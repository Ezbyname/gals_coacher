import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  getWorkoutSchedule,
  rescheduleWorkout,
  scheduleWorkout,
  type ScheduleWorkoutErrors,
  type WorkoutSchedule,
} from '@/data/local/calendar/calendarEventRepository';
import { WorkoutScheduleError } from '@/data/local/calendar/errors';
import { PlayerArchivedError } from '@/data/local/players/errors';
import { getPlannedWorkout, type PlannedWorkout } from '@/data/local/training/trainingRepository';
import { useApp } from '@/features/AppProvider';
import { nextQuarterHour } from '@/features/calendar/calendarFormValues';
import { calendarErrorMessage } from '@/features/calendar/calendarLabels';
import { formatEventDate } from '@/features/calendar/formatEventTime';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { PlayerTargetLabel, RequireActivePlayer, RoutePlayerScope } from '@/features/players/ActivePlayerContext';
import { ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import {
  calendarDateToLocalNoon,
  epochToLocalDateTime,
  localDateTimeToEpoch,
  type LocalDateTime,
} from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { DateTimeField } from '@/ui/DateTimeField';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing } from '@/ui/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const timeText = (value: LocalDateTime) => ltr(`${pad(value.hour)}:${pad(value.minute)}`);

/**
 * QB-WORKOUT-BUILDER-001D — Schedule / Reschedule a planned workout: a date, a start time and an OPTIONAL end time
 * (never invented). Creates the ONE calendar event linked to the workout (or moves the existing one). Now / future only.
 * A workout that already has a session cannot be newly scheduled. Nothing is stored until Save.
 */
export function ScheduleWorkoutScreen({ playerId, planId }: { playerId: string; planId: string }) {
  return (
    <RoutePlayerScope playerId={playerId}>
      <RequireActivePlayer>
        <ScheduleLoader playerId={playerId} planId={planId} />
      </RequireActivePlayer>
    </RoutePlayerScope>
  );
}

type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; plan: PlannedWorkout; schedule: WorkoutSchedule | null };

function ScheduleLoader({ playerId, planId }: { playerId: string; planId: string }) {
  const { boot } = useApp();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready' || state.status === 'ready') return;
      let active = true;
      Promise.all([getPlannedWorkout(boot.db, planId), getWorkoutSchedule(boot.db, planId)])
        .then(([plan, schedule]) => {
          if (!active) return;
          setState(plan === null || plan.playerId !== playerId ? { status: 'error' } : { status: 'ready', plan, schedule });
        })
        .catch((e: unknown) => {
          console.warn('[training] schedule load failed', e);
          if (active) setState({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, playerId, planId, state.status]),
  );
  if (boot.status === 'error' || state.status === 'error') {
    return <ErrorScreen testID="schedule-error" message="training.errors.notFound" fallback="/children" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  return <ScheduleForm playerId={playerId} plan={state.plan} schedule={state.schedule} />;
}

function failureKey(e: unknown): TranslationKey {
  if (e instanceof WorkoutScheduleError) {
    if (e.reason === 'PLAN_ALREADY_STARTED') return 'training.schedule.errorStarted';
    if (e.reason === 'SCHEDULE_LOCKED') return 'calendar.errors.scheduleLocked';
    if (e.reason === 'ALREADY_SCHEDULED') return 'training.schedule.errorAlready';
    if (e.reason === 'PLAN_EMPTY') return 'training.errors.planEmpty';
    return 'training.schedule.failed';
  }
  if (e instanceof PlayerArchivedError) return 'training.errors.playerArchived';
  return calendarErrorMessage(e, 'training.schedule.failed');
}

function ScheduleForm({ playerId, plan, schedule }: { playerId: string; plan: PlannedWorkout; schedule: WorkoutSchedule | null }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const [start, setStart] = useState<LocalDateTime>(() => (schedule ? epochToLocalDateTime(schedule.startAt) : nextQuarterHour(services.clock.wallNow())));
  const [end, setEnd] = useState<LocalDateTime | null>(() => (schedule && schedule.endAt !== null ? epochToLocalDateTime(schedule.endAt) : null));
  const [errors, setErrors] = useState<{ start?: TranslationKey; end?: TranslationKey }>({});
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const blocked = schedule === null && plan.sessionId !== null; // already performed: it cannot be newly scheduled

  const dateText = (value: LocalDateTime) => formatEventDate(calendarDateToLocalNoon(value).getTime(), language);

  const fieldErrors = (e: ScheduleWorkoutErrors): { start?: TranslationKey; end?: TranslationKey } => ({
    ...(e.startAt && { start: e.startAt === 'BEFORE_NOW' ? 'training.schedule.startInPast' : ('calendar.errors.invalidValue' as TranslationKey) }),
    ...(e.endAt && { end: e.endAt === 'NOT_AFTER_START' ? 'calendar.errors.endAfterStart' : ('calendar.errors.invalidValue' as TranslationKey) }),
  });

  const save = async () => {
    if (busy.current || boot.status !== 'ready') return;
    const startAt = localDateTimeToEpoch(start);
    const endAt = end === null ? null : localDateTimeToEpoch(end);
    if (startAt === null || (end !== null && endAt === null)) {
      setErrors({ ...(startAt === null && { start: 'calendar.errors.timeDoesNotExist' as TranslationKey }), ...(end !== null && endAt === null && { end: 'calendar.errors.timeDoesNotExist' as TranslationKey }) });
      return;
    }
    busy.current = true;
    setSaving(true);
    setErrors({});
    setFailure(null);
    try {
      const result = schedule
        ? await rescheduleWorkout(boot.db, { playerId, planId: plan.id, startAt, endAt }, { clock: services.clock })
        : await scheduleWorkout(boot.db, { playerId, planId: plan.id, startAt, endAt }, { ids: services.ids, clock: services.clock });
      if (result.ok) {
        router.back();
        return;
      }
      setErrors(fieldErrors(result.errors as ScheduleWorkoutErrors));
    } catch (e) {
      console.warn('[training] schedule failed', e);
      setFailure(failureKey(e));
    }
    busy.current = false;
    setSaving(false);
  };

  return (
    <SafeAreaScrollView testID="schedule-scroll" contentContainerStyle={styles.container}>
      <PlayerTargetLabel />
      <Text style={styles.name} testID="schedule-plan-name" accessibilityRole="header">
        {plan.name}
      </Text>
      {blocked ? (
        <>
          <Text style={styles.error} testID="schedule-started">
            {t('training.schedule.startedNote')}
          </Text>
          <BigButton testID="schedule-cancel" variant="secondary" label={t('training.schedule.cancel')} onPress={() => router.back()} />
        </>
      ) : (
        <>
          <View style={styles.group} testID="schedule-start">
            <DateTimeField
              testID="schedule-start-date"
              label={t('calendar.field.date')}
              mode="date"
              value={start}
              displayValue={dateText(start)}
              onSelect={(v) => {
                setStart(v);
                setErrors({});
              }}
            />
            <DateTimeField
              testID="schedule-start-time"
              label={t('calendar.field.startTime')}
              mode="time"
              value={start}
              displayValue={timeText(start)}
              onSelect={(v) => {
                setStart(v);
                setErrors({});
              }}
              error={errors.start ? t(errors.start) : undefined}
            />
          </View>
          {end === null ? (
            <BigButton testID="schedule-add-end" variant="secondary" label={t('calendar.field.addEnd')} onPress={() => setEnd(start)} />
          ) : (
            <View style={styles.group} testID="schedule-end">
              <DateTimeField
                testID="schedule-end-date"
                label={t('calendar.field.endDate')}
                mode="date"
                value={end}
                displayValue={dateText(end)}
                onSelect={(v) => {
                  setEnd(v);
                  setErrors({});
                }}
              />
              <DateTimeField
                testID="schedule-end-time"
                label={t('calendar.field.endTime')}
                mode="time"
                value={end}
                displayValue={timeText(end)}
                onSelect={(v) => {
                  setEnd(v);
                  setErrors({});
                }}
                error={errors.end ? t(errors.end) : undefined}
              />
              <BigButton testID="schedule-remove-end" variant="secondary" label={t('calendar.field.removeEnd')} onPress={() => setEnd(null)} />
            </View>
          )}
          {end === null ? (
            <Text style={styles.muted} testID="schedule-end-hint">
              {t('training.schedule.endHint')}
            </Text>
          ) : null}
          {failure ? (
            <Text style={styles.error} testID="schedule-failed">
              {t(failure)}
            </Text>
          ) : null}
          <BigButton testID="schedule-save" label={saving ? t('training.schedule.saving') : t('training.schedule.save')} onPress={() => void save()} disabled={saving} />
          <BigButton testID="schedule-cancel" variant="secondary" label={t('training.schedule.cancel')} onPress={() => router.back()} disabled={saving} />
        </>
      )}
    </SafeAreaScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  group: { gap: spacing.md },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
