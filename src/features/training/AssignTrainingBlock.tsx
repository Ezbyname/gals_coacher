import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listPlayers, type PlayerProfile } from '@/data/local/players/playerRepository';
import {
  assignTrainingBlockToPlayers,
  TrainingBlockAssignmentError,
  TrainingBlockSessionError,
  type BlockAssignmentOutcome,
} from '@/data/local/training/trainingBlockAssignment';
import { planSessionDates, previewBlock, totalSessions, trainingBlock, type BlockPreviewRow, type ScheduleErrorCode } from '@/domain/training/blocks';
import { useApp } from '@/features/AppProvider';
import { nextQuarterHour } from '@/features/calendar/calendarFormValues';
import { formatEventDate } from '@/features/calendar/formatEventTime';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { ltr, isolate, stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { calendarDateToLocalNoon, localDateTimeToEpoch, type LocalDateTime } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { DateTimeField } from '@/ui/DateTimeField';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing, touch } from '@/ui/theme';

import { trainingErrorMessage } from './trainingLabels';

/**
 * TRAINING-BLOCKS-001 — Add program to player: choose the Player(s), optionally the calendar dates, REVIEW the generated plan,
 * and only then confirm. Nothing is written before the confirmation. Each Player's programme is created all-or-nothing (the
 * assignment is one transaction per Player), so a failure never leaves a half-created programme; Players are independent.
 * No duplicate detection by name: the preview is the guard against adding the same programme twice.
 */

const DAYS = [
  { value: 0, key: 'SUN' },
  { value: 1, key: 'MON' },
  { value: 2, key: 'TUE' },
  { value: 3, key: 'WED' },
  { value: 4, key: 'THU' },
  { value: 5, key: 'FRI' },
  { value: 6, key: 'SAT' },
] as const;

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; players: PlayerProfile[] };
type Preview = { rows: BlockPreviewRow[]; startTimes: number[] | null };

const scheduleErrorKey: Record<ScheduleErrorCode, TranslationKey> = {
  WEEKDAY_COUNT: 'training.trainingBlocks.assign.errors.weekdayCount',
  WEEKDAY_INVALID: 'training.trainingBlocks.assign.errors.weekdayInvalid',
  WEEKDAYS_ADJACENT: 'training.trainingBlocks.assign.errors.weekdaysAdjacent',
  START_DATE_INVALID: 'training.trainingBlocks.assign.errors.startDateInvalid',
};

export function AssignTrainingBlock({ blockId }: { blockId: string }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const block = trainingBlock(blockId);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [selected, setSelected] = useState<string[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [start, setStart] = useState<LocalDateTime>(() => nextQuarterHour(services.clock.wallNow()));
  const [days, setDays] = useState<number[]>([1, 4]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  const [outcomes, setOutcomes] = useState<BlockAssignmentOutcome[] | null>(null);
  const busy = useRef(false);
  const preselected = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listPlayers(boot.db)
        .then((players) => {
          if (!active) return;
          setLoaded({ status: 'ready', players });
          const offered = new Set<string>(players.map((p) => p.player.id));
          setSelected((list) => list.filter((id) => offered.has(id)));
          if (!preselected.current && players.length === 1) {
            preselected.current = true;
            setSelected([players[0]!.player.id]);
          }
        })
        .catch((e: unknown) => {
          console.warn('[training] block assign load failed', e);
          if (active) setLoaded({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot]),
  );

  if (block === null || boot.status === 'error' || loaded.status === 'error') {
    return <ErrorScreen testID="block-assign-error" message="training.trainingBlocks.details.notFound" fallback="/workouts/training-blocks" />;
  }
  if (loaded.status === 'loading') return <LoadingScreen />;
  const { players } = loaded;
  const nameOf = (playerId: string) => players.find((p) => p.player.id === playerId)?.player.name ?? '';
  const pick = (pair: readonly [string, string]) => (language === 'he' ? pair[0] : pair[1]);
  const total = totalSessions(block);
  const dateText = (value: LocalDateTime) => formatEventDate(calendarDateToLocalNoon(value).getTime(), language);
  const timeText = (value: LocalDateTime) => ltr(`${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`);

  const toggleDay = (day: number) => {
    setError(null);
    setDays((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort((a, b) => a - b)));
  };

  /** Validates the form and builds the preview. Nothing is written. */
  const review = () => {
    if (selected.length === 0) return;
    if (!schedule) {
      setError(null);
      setPreview({ rows: previewBlock(block, language, null), startTimes: null });
      return;
    }
    const planned = planSessionDates(block, { year: start.year, month: start.month, day: start.day }, days);
    if (!planned.ok) {
      setError(t(scheduleErrorKey[planned.error], { count: block.sessionsPerWeek }));
      return;
    }
    const startTimes: number[] = [];
    for (const d of planned.dates) {
      const epoch = localDateTimeToEpoch({ ...d, hour: start.hour, minute: start.minute });
      if (epoch === null) {
        setError(t('training.trainingBlocks.assign.errors.timeDoesNotExist'));
        return;
      }
      startTimes.push(epoch);
    }
    if (startTimes[0]! < services.clock.wallNow()) {
      setError(t('training.trainingBlocks.assign.errors.startInPast'));
      return;
    }
    setError(null);
    setPreview({ rows: previewBlock(block, language, planned.dates), startTimes });
  };

  const confirm = async () => {
    if (busy.current || preview === null || boot.status !== 'ready') return;
    busy.current = true;
    setWorking(true);
    try {
      const result = await assignTrainingBlockToPlayers(
        boot.db,
        block.id,
        selected.map((playerId) => ({ playerId, startTimes: preview.startTimes })),
        language,
        { ids: services.ids, clock: services.clock },
      );
      setOutcomes(result);
    } catch (e) {
      console.warn('[training] block assign failed', e);
      setError(t('training.trainingBlocks.assign.errors.failedGeneric'));
    }
    busy.current = false;
    setWorking(false);
  };

  const reason = (e: unknown): string => {
    if (e instanceof TrainingBlockSessionError) {
      return `${t('training.trainingBlocks.assign.errors.sessionFailed', { index: e.sessionIndex + 1 })} ${t(trainingErrorMessage(e.causeError))}`;
    }
    if (e instanceof TrainingBlockAssignmentError && e.code === 'START_IN_PAST') return t('training.trainingBlocks.assign.errors.startInPast');
    return t('training.trainingBlocks.assign.errors.failedGeneric');
  };

  if (outcomes !== null) {
    return (
      <KeyboardSafeScrollView testID="block-assign-scroll" contentContainerStyle={styles.container}>
        <Text style={styles.title} accessibilityRole="header" testID="block-assign-done-title">
          {t('training.trainingBlocks.assign.doneTitle')}
        </Text>
        {outcomes.map((o) => {
          const playerId = o.ok ? o.assignment.playerId : o.playerId;
          const player = isolate(nameOf(playerId));
          const text = o.ok
            ? t(o.assignment.eventIds.length > 0 ? 'training.trainingBlocks.assign.resultOkScheduled' : 'training.trainingBlocks.assign.resultOk', {
                player,
                count: o.assignment.planIds.length,
              })
            : t('training.trainingBlocks.assign.resultFailed', { player, reason: reason(o.error) });
          return (
            <View key={playerId} style={styles.card} testID={`block-assign-result-${playerId}`}>
              <Text style={o.ok ? styles.name : styles.error} testID={`block-assign-result-${playerId}-text`}>
                {text}
              </Text>
            </View>
          );
        })}
        <BigButton testID="block-assign-done" label={t('training.trainingBlocks.assign.done')} onPress={() => router.back()} />
      </KeyboardSafeScrollView>
    );
  }

  if (preview !== null) {
    return (
      <KeyboardSafeScrollView testID="block-assign-scroll" contentContainerStyle={styles.container}>
        <Text style={styles.title} accessibilityRole="header" testID="block-preview-title">
          {t('training.trainingBlocks.assign.previewTitle')}
        </Text>
        <Text style={styles.name}>{isolate(pick(block.name))}</Text>
        <Text style={styles.body} testID="block-preview-players">
          {t('training.trainingBlocks.assign.previewPlayers', { players: selected.map((id) => isolate(nameOf(id))).join(', ') })}
        </Text>
        <Text style={styles.body} testID="block-preview-summary">
          {t('training.trainingBlocks.assign.previewSummary', { count: total })}
        </Text>
        <Text style={styles.muted} testID="block-preview-dates-note">
          {t(preview.startTimes === null ? 'training.trainingBlocks.assign.previewNoDates' : 'training.trainingBlocks.assign.previewWithDates')}
        </Text>
        <View style={styles.card} testID="block-preview-rows">
          {preview.rows.map((row) => (
            <Text key={row.index} style={styles.body} testID={`block-preview-row-${row.index}`}>
              {row.date === null
                ? t('training.trainingBlocks.assign.previewRow', { index: row.index + 1, name: isolate(row.planName), workout: isolate(row.workoutName) })
                : t('training.trainingBlocks.assign.previewRowDate', {
                    index: row.index + 1,
                    name: isolate(row.planName),
                    workout: isolate(row.workoutName),
                    date: formatEventDate(calendarDateToLocalNoon(row.date).getTime(), language),
                  })}
            </Text>
          ))}
        </View>
        {error ? (
          <Text style={styles.error} testID="block-assign-failed">
            {error}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <BigButton
            testID="block-assign-confirm"
            label={working ? t('training.trainingBlocks.assign.creating') : t('training.trainingBlocks.assign.confirm')}
            onPress={() => void confirm()}
            disabled={working}
          />
          <BigButton
            testID="block-assign-back"
            variant="secondary"
            label={t('training.trainingBlocks.assign.back')}
            onPress={() => {
              setPreview(null);
              setError(null);
            }}
            disabled={working}
          />
        </View>
      </KeyboardSafeScrollView>
    );
  }

  return (
    <KeyboardSafeScrollView testID="block-assign-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted} testID="block-assign-intro">
        {t('training.trainingBlocks.assign.intro', { name: isolate(pick(block.name)) })}
      </Text>
      <Text style={styles.heading} accessibilityRole="header">
        {t('training.trainingBlocks.assign.players')}
      </Text>
      {players.length === 0 ? (
        <Text style={styles.muted} testID="block-assign-no-players">
          {t('training.trainingBlocks.assign.noPlayers')}
        </Text>
      ) : null}
      {players.map((p) => {
        const on = selected.includes(p.player.id);
        return (
          <Pressable
            key={p.player.id}
            testID={`block-assign-player-${p.player.id}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={stripBidi(p.player.name)}
            onPress={() => setSelected((list) => (on ? list.filter((x) => x !== p.player.id) : [...list, p.player.id]))}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
            <Text style={styles.box}>{on ? '☑' : '☐'}</Text>
            <Text style={styles.name}>{p.player.name}</Text>
          </Pressable>
        );
      })}

      <Pressable
        testID="block-assign-schedule"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: schedule }}
        onPress={() => {
          setSchedule((v) => !v);
          setError(null);
        }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
        <Text style={styles.box}>{schedule ? '☑' : '☐'}</Text>
        <Text style={styles.name}>{t('training.trainingBlocks.assign.schedule')}</Text>
      </Pressable>
      <Text style={styles.muted}>{t('training.trainingBlocks.assign.scheduleHint')}</Text>

      {schedule ? (
        <View style={styles.group} testID="block-assign-schedule-fields">
          <DateTimeField
            testID="block-assign-start-date"
            label={t('training.trainingBlocks.assign.startDate')}
            mode="date"
            value={start}
            displayValue={dateText(start)}
            onSelect={(v) => {
              setStart(v);
              setError(null);
            }}
          />
          <DateTimeField
            testID="block-assign-start-time"
            label={t('training.trainingBlocks.assign.startTime')}
            mode="time"
            value={start}
            displayValue={timeText(start)}
            onSelect={(v) => {
              setStart(v);
              setError(null);
            }}
          />
          <Text style={styles.heading}>{t('training.trainingBlocks.assign.days')}</Text>
          <Text style={styles.muted}>{t('training.trainingBlocks.assign.daysHint', { count: block.sessionsPerWeek })}</Text>
          <View style={styles.dayRow}>
            {DAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <Pressable
                  key={d.key}
                  testID={`block-assign-day-${d.key}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t(`training.trainingBlocks.assign.day.${d.key}`)}
                  onPress={() => toggleDay(d.value)}
                  style={({ pressed }) => [styles.day, on && styles.dayOn, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.name}>{t(`training.trainingBlocks.assign.day.${d.key}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="block-assign-failed">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <BigButton testID="block-assign-review" label={t('training.trainingBlocks.assign.review')} onPress={review} disabled={selected.length === 0} />
        <BigButton testID="block-assign-cancel" variant="secondary" label={t('training.trainingBlocks.assign.cancel')} onPress={() => router.back()} />
      </View>
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  heading: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  body: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { minHeight: touch.buttonMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  group: { gap: spacing.md },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  day: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  dayOn: { borderColor: colors.courtDark },
  box: { fontSize: 20, color: colors.courtDark },
  name: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  buttons: { gap: spacing.sm },
});
