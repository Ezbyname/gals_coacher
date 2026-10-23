import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionExercise, SessionSet, TrainingSession } from '@/data/local/training/trainingRepository';
import type { MeasurementKind } from '@/domain/training/training';
import { formatStopwatch, suggestedTimeSeconds } from '@/domain/training/workoutStopwatch';
import { formatClock, remainingSeconds, suggestedSeconds } from '@/domain/training/workoutTimer';
import { ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { colors, semantic, spacing } from '@/ui/theme';

import { plannedSetText } from '../trainingLabels';

import { isStopwatch, useElapsedMs, useRemainingMs, useWorkoutTimer } from './WorkoutTimerProvider';

/** Finds a set (and its exercise) inside a session by id. */
export function findSet(session: TrainingSession, setId: string): { exercise: SessionExercise; set: SessionSet } | null {
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((s) => s.id === setId);
    if (set) return { exercise, set };
  }
  return null;
}

/** Which result kind a Record from this execution clock writes: a countdown records seconds of work, a stopwatch a time. */
export type TimedKind = 'DURATION_S' | 'TIME_S';

/**
 * The execution clock of THIS session, pinned above the exercises: a work countdown / rest (TRAINING-TIMER-001) or a
 * stopwatch (TRAINING-STOPWATCH-001), with large left-to-right digits and the controls. It never records anything by
 * itself: Record only calls the existing record path, after the user presses it.
 *
 * It keeps the clock honest: when the session is no longer live, or the clock's set is no longer pending (the user
 * recorded or skipped it by hand), the clock ends — it can never stay attached to something that moved on.
 */
export function TimerBar({
  session,
  live,
  onRecord,
  missing,
}: {
  session: TrainingSession;
  live: boolean;
  /** The existing record path, called only from the user pressing Record. */
  onRecord: (setId: string, kind: TimedKind, seconds: number) => Promise<void> | void;
  /** Result kinds the last Record could not save because the user has not entered them yet (e.g. the load). */
  missing: { readonly setId: string; readonly kinds: readonly MeasurementKind[] } | null;
}) {
  const { t, language } = useI18n();
  const timer = useWorkoutTimer();
  const remaining = useRemainingMs(timer);
  const elapsed = useElapsedMs(timer);
  const state = timer.state;
  const mine = state !== null && state.identity.sessionId === session.id ? state : null;
  const target = mine === null ? null : findSet(session, mine.identity.setId);

  useEffect(() => {
    if (mine === null) return;
    if (!live || target === null || target.set.status !== 'PENDING') timer.clearForSession(session.id);
  }, [mine, live, target, timer, session.id]);

  if (mine === null || !live || target === null || target.set.status !== 'PENDING') return null;

  const name = target.exercise.exercise.name[language];
  const where = t('training.timer.workLabel', { exercise: name, n: target.set.setNumber });
  const announce = timer.announcement ? t(`training.timer.announce.${timer.announcement.kind}`) : null;
  const needs =
    missing !== null && missing.setId === mine.identity.setId && missing.kinds.length > 0
      ? t('training.timer.needsValue', { what: missing.kinds.map((k) => t(`training.kind.${k}`)).join(', ') })
      : null;

  // ------------------------------------------------------------------------------------------- stopwatch
  if (isStopwatch(mine)) {
    const running = mine.phase === 'RUNNING';
    const seconds = suggestedTimeSeconds(mine);
    const shown = formatStopwatch(running ? elapsed : mine.elapsedMs, running ? 'tenths' : 'hundredths');
    const planned = target.set.planned
      ? plannedSetText(t, target.exercise.exercise.measurement, target.set.plannedTarget, target.set.plannedLoadKg, target.exercise.timeSemantics)
      : null;
    const caption = running ? t('training.timer.elapsed') : t('training.timer.stopwatchStopped');
    const tone = { base: colors.court, strong: colors.courtDark, tint: '#FDEBDD' };
    return (
      <View style={[styles.bar, { borderColor: tone.base, backgroundColor: tone.tint }]} testID="timer-bar">
        <Text style={styles.title} testID="timer-title" numberOfLines={2}>
          {where}
        </Text>
        {planned !== null ? (
          <Text style={styles.sub} testID="timer-planned">
            {t('training.timer.stopwatchPlanned', { value: planned })}
          </Text>
        ) : null}
        <Text
          style={[styles.digits, { color: tone.strong }]}
          testID="timer-digits"
          accessibilityRole="timer"
          accessibilityLabel={t('training.timer.a11yTimer', { label: caption, time: shown })}>
          {ltr(shown)}
        </Text>
        <Text style={styles.caption} testID="timer-caption" accessibilityLiveRegion="polite">
          {announce !== null && !running ? announce : caption}
        </Text>
        {needs !== null ? (
          <Text style={styles.needs} testID="timer-needs">
            {needs}
          </Text>
        ) : null}
        <View style={styles.buttons} testID="timer-buttons">
          {running ? <TimerButton testID="timer-stop" variant="secondary" label={t('training.timer.stop')} onPress={timer.stop} /> : null}
          {!running && seconds !== null ? (
            <TimerButton testID="timer-record" label={t('training.timer.record', { seconds })} onPress={() => void onRecord(mine.identity.setId, 'TIME_S', seconds)} />
          ) : null}
          {!running ? <TimerButton testID="timer-dismiss" variant="secondary" label={t('training.timer.dismiss')} onPress={timer.dismiss} /> : null}
        </View>
      </View>
    );
  }

  // ----------------------------------------------------------------------------- countdown work / rest
  const isRest = mine.kind === 'REST';
  const finished = mine.phase === 'FINISHED';
  const stopped = mine.phase === 'STOPPED';
  const seconds = suggestedSeconds(mine);
  const clockText = formatClock(mine.phase === 'RUNNING' || mine.phase === 'PAUSED' ? remainingSeconds(remaining) : 0);
  const title = isRest ? t('training.timer.rest') : name;
  const caption = isRest
    ? finished
      ? t('training.timer.restOver')
      : t('training.timer.remaining')
    : finished
      ? t('training.timer.timesUp')
      : stopped
        ? t('training.timer.worked', { seconds: seconds ?? 0 })
        : t('training.timer.remaining');
  const tone = isRest ? semantic.neutral : finished ? semantic.success : { base: colors.court, strong: colors.courtDark, tint: '#FDEBDD' };

  return (
    <View style={[styles.bar, { borderColor: tone.base, backgroundColor: tone.tint }]} testID="timer-bar">
      <Text style={styles.title} testID="timer-title" numberOfLines={2}>
        {isRest ? `${title} · ${t('training.timer.nextSet')}` : where}
      </Text>
      {isRest ? (
        <Text style={styles.sub} testID="timer-next-set">
          {t('training.timer.nextSetLabel', { exercise: name, n: target.set.setNumber })}
        </Text>
      ) : null}
      <Text
        style={[styles.digits, { color: tone.strong }]}
        testID="timer-digits"
        accessibilityRole="timer"
        accessibilityLabel={t('training.timer.a11yTimer', { label: caption, time: clockText })}>
        {ltr(clockText)}
      </Text>
      <Text style={styles.caption} testID="timer-caption" accessibilityLiveRegion="polite">
        {announce !== null && (finished || mine.phase === 'PAUSED') ? announce : caption}
      </Text>
      {needs !== null ? (
        <Text style={styles.needs} testID="timer-needs">
          {needs}
        </Text>
      ) : null}

      <View style={styles.buttons} testID="timer-buttons">
        {mine.kind === 'WORK' && mine.phase === 'RUNNING' ? (
          <>
            <TimerButton testID="timer-pause" variant="secondary" label={t('training.timer.pause')} onPress={timer.pause} />
            <TimerButton testID="timer-stop" variant="secondary" label={t('training.timer.stop')} onPress={timer.stop} />
          </>
        ) : null}
        {mine.kind === 'WORK' && mine.phase === 'PAUSED' ? (
          <>
            <TimerButton testID="timer-resume" label={t('training.timer.resume')} onPress={timer.resume} />
            <TimerButton testID="timer-stop" variant="secondary" label={t('training.timer.stop')} onPress={timer.stop} />
          </>
        ) : null}
        {mine.kind === 'WORK' && (finished || stopped) ? (
          <>
            {seconds !== null ? (
              <TimerButton testID="timer-record" label={t('training.timer.record', { seconds })} onPress={() => void onRecord(mine.identity.setId, 'DURATION_S', seconds)} />
            ) : null}
            <TimerButton testID="timer-dismiss" variant="secondary" label={t('training.timer.dismiss')} onPress={timer.dismiss} />
          </>
        ) : null}
        {isRest && !finished ? <TimerButton testID="timer-skip-rest" variant="secondary" label={t('training.timer.skipRest')} onPress={timer.skipRest} /> : null}
        {isRest && finished ? <TimerButton testID="timer-dismiss" variant="secondary" label={t('training.timer.dismiss')} onPress={timer.dismiss} /> : null}
      </View>
    </View>
  );
}

/** One control of the bar: the controls share ONE row, so the bar stays short and leaves the workout visible. */
function TimerButton(props: ComponentProps<typeof BigButton>) {
  return (
    <View style={styles.cell}>
      <BigButton {...props} />
    </View>
  );
}

/**
 * Layout: the bar is an ordinary row ABOVE the scroll view (in the normal flow, never absolutely positioned), so it
 * reserves its own space and the workout starts below it; with no timer it renders nothing at all (no gap). It is kept
 * compact — the digits stay large, the controls sit side by side — so most of the screen remains for the sets.
 */
const styles = StyleSheet.create({
  bar: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.sm, gap: 2, borderRadius: 14, borderWidth: 2 },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  sub: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  digits: { fontSize: 46, lineHeight: 54, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  caption: { fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  needs: { fontSize: 14, fontWeight: '700', color: colors.danger, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  cell: { flex: 1, minWidth: 0 },
});
