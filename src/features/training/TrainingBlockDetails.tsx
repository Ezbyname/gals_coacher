import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { orderedSessions, totalSessions, trainingBlock } from '@/domain/training/blocks';
import { professionalWorkout } from '@/domain/training/professional';
import { ErrorScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing } from '@/ui/theme';

import { assignTrainingBlockPath, professionalPath } from './trainingLabels';

/**
 * TRAINING-BLOCKS-001 — one Training Block (read-only): goal, level, duration, sessions per week, equipment, the week-by-week
 * plan with the workouts it uses, progression, recovery and safety. The one action adds the whole programme to a Player.
 */
export function TrainingBlockDetails({ blockId }: { blockId: string }) {
  const { t, language } = useI18n();
  const block = trainingBlock(blockId);
  if (block === null) {
    return <ErrorScreen testID="block-error" message="training.trainingBlocks.details.notFound" fallback="/workouts/training-blocks" />;
  }
  const pick = (pair: readonly [string, string]) => (language === 'he' ? pair[0] : pair[1]);
  const sessions = orderedSessions(block);
  const weeks = Array.from({ length: block.weeks }, (_, i) => i + 1);
  const section = (testID: string, title: string, lines: readonly (readonly [string, string])[]) => (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>{title}</Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.body}>
          {pick(line)}
        </Text>
      ))}
    </View>
  );
  return (
    <KeyboardSafeScrollView testID="block-details-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.title} accessibilityRole="header" testID="block-details-name">
        {pick(block.name)}
      </Text>
      <Text style={styles.meta} testID="block-details-level">
        {t('training.trainingBlocks.cardLevel', { level: t(`training.professional.level.${block.difficulty}`) })}
      </Text>
      <Text style={styles.muted}>{t('training.professional.levelNote')}</Text>
      <Text style={styles.muted} testID="block-details-line">
        {t('training.trainingBlocks.card', { weeks: block.weeks, perWeek: block.sessionsPerWeek, total: totalSessions(block) })}
      </Text>
      <Text style={styles.body} testID="block-details-summary">
        {pick(block.summary)}
      </Text>
      {section('block-goal', t('training.trainingBlocks.details.goal'), [block.goal])}
      {section('block-athlete', t('training.trainingBlocks.details.athlete'), [block.athlete])}
      {section('block-prerequisite', t('training.trainingBlocks.details.prerequisite'), [block.prerequisite])}
      {section('block-equipment', t('training.trainingBlocks.details.equipment'), [block.equipment])}

      <Text style={styles.heading}>{t('training.trainingBlocks.details.weekByWeek')}</Text>
      {weeks.map((week) => (
        <View key={week} style={styles.card} testID={`block-week-${week}`}>
          <Text style={styles.label}>{t('training.trainingBlocks.details.week', { week })}</Text>
          {sessions
            .filter((s) => s.week === week)
            .map((s) => {
              const workout = professionalWorkout(s.workoutId);
              const name = workout === null ? s.workoutId : pick(workout.name);
              return (
                <View key={s.slot} testID={`block-session-${week}-${s.slot}`}>
                  <Text
                    style={styles.link}
                    accessibilityRole="link"
                    testID={`block-session-${week}-${s.slot}-name`}
                    onPress={() => router.push(professionalPath(s.workoutId))}>
                    {t('training.trainingBlocks.details.session', { slot: s.slot, name })}
                  </Text>
                  {s.note ? <Text style={styles.muted}>{pick(s.note)}</Text> : null}
                </View>
              );
            })}
        </View>
      ))}

      {section('block-progression', t('training.trainingBlocks.details.progression'), block.progression)}
      {section('block-recovery', t('training.trainingBlocks.details.recovery'), [block.recovery])}
      {block.substitutions.length > 0 ? section('block-substitutions', t('training.trainingBlocks.details.substitutions'), block.substitutions) : null}
      <View style={styles.safety} testID="block-safety">
        <Text style={styles.label}>{t('training.trainingBlocks.details.safety')}</Text>
        <Text style={styles.body}>{pick(block.safety)}</Text>
      </View>
      <Text style={styles.muted} testID="block-source-note">
        {t('training.trainingBlocks.details.sourceNote')}
      </Text>
      <BigButton testID="block-add-to-player" label={t('training.trainingBlocks.details.addToPlayer')} onPress={() => router.push(assignTrainingBlockPath(block.id))} />
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  meta: { fontSize: 15, fontWeight: '700', color: colors.court, textAlign: 'auto' },
  heading: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: spacing.sm, textAlign: 'auto' },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  body: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  link: { fontSize: 16, fontWeight: '700', color: colors.courtDark, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  safety: { gap: spacing.xs, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
});
