import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionExercise, SessionSet, TrainingSession } from '@/data/local/training/trainingRepository';
import { formatClock, remainingSeconds, suggestedSeconds } from '@/domain/training/workoutTimer';
import { ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { colors, semantic, spacing } from '@/ui/theme';

import { useRemainingMs, useWorkoutTimer } from './WorkoutTimerProvider';

/** Finds a set (and its exercise) inside a session by id. */
export function findSet(session: TrainingSession, setId: string): { exercise: SessionExercise; set: SessionSet } | null {
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((s) => s.id === setId);
    if (set) return { exercise, set };
  }
  return null;
}

/**
 * TRAINING-TIMER-001: the timer of THIS session, pinned above the exercises. It shows the one active timer (work or
 * rest) with large left-to-right digits and the controls; it never records anything by itself. The record action only
 * calls the existing record path, after the user presses it.
 *
 * It also keeps the timer honest: when the session is no longer live, or the timer's set is no longer pending (the user
 * recorded or skipped it by hand), the timer ends — it can never stay attached to something that moved on.
 */
export function TimerBar({
  session,
  live,
  onRecord,
}: {
  session: TrainingSession;
  live: boolean;
  /** The existing record path (recordSet), called only from the user pressing Record. */
  onRecord: (setId: string, seconds: number) => Promise<void> | void;
}) {
  const { t, language } = useI18n();
  const timer = useWorkoutTimer();
  const remaining = useRemainingMs(timer);
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
  const isRest = mine.kind === 'REST';
  const finished = mine.phase === 'FINISHED';
  const stopped = mine.phase === 'STOPPED';
  const seconds = suggestedSeconds(mine);
  const digits = ltr(formatClock(mine.phase === 'RUNNING' || mine.phase === 'PAUSED' ? remainingSeconds(remaining) : 0));
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
  const announce = timer.announcement ? t(`training.timer.announce.${timer.announcement.kind}`) : null;

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
        accessibilityLabel={t('training.timer.a11yTimer', { label: caption, time: formatClock(mine.phase === 'RUNNING' || mine.phase === 'PAUSED' ? remainingSeconds(remaining) : 0) })}>
        {digits}
      </Text>
      <Text style={styles.caption} testID="timer-caption" accessibilityLiveRegion="polite">
        {announce !== null && (finished || mine.phase === 'PAUSED') ? announce : caption}
      </Text>

      <View style={styles.buttons}>
        {mine.kind === 'WORK' && mine.phase === 'RUNNING' ? (
          <>
            <BigButton testID="timer-pause" variant="secondary" label={t('training.timer.pause')} onPress={timer.pause} />
            <BigButton testID="timer-stop" variant="secondary" label={t('training.timer.stop')} onPress={timer.stop} />
          </>
        ) : null}
        {mine.kind === 'WORK' && mine.phase === 'PAUSED' ? (
          <>
            <BigButton testID="timer-resume" label={t('training.timer.resume')} onPress={timer.resume} />
            <BigButton testID="timer-stop" variant="secondary" label={t('training.timer.stop')} onPress={timer.stop} />
          </>
        ) : null}
        {mine.kind === 'WORK' && (finished || stopped) ? (
          <>
            {seconds !== null ? (
              <BigButton testID="timer-record" label={t('training.timer.record', { seconds })} onPress={() => void onRecord(mine.identity.setId, seconds)} />
            ) : null}
            <BigButton testID="timer-dismiss" variant="secondary" label={t('training.timer.dismiss')} onPress={timer.dismiss} />
          </>
        ) : null}
        {isRest && !finished ? <BigButton testID="timer-skip-rest" variant="secondary" label={t('training.timer.skipRest')} onPress={timer.skipRest} /> : null}
        {isRest && finished ? <BigButton testID="timer-dismiss" variant="secondary" label={t('training.timer.dismiss')} onPress={timer.dismiss} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { margin: spacing.md, marginBottom: 0, padding: spacing.md, gap: spacing.xs, borderRadius: 14, borderWidth: 2 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  sub: { fontSize: 15, color: colors.inkMuted, textAlign: 'auto' },
  digits: { fontSize: 64, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  caption: { fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  buttons: { gap: spacing.sm, marginTop: spacing.xs },
});
