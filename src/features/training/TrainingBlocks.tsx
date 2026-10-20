import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { TRAINING_BLOCKS, totalSessions } from '@/domain/training/blocks';
import { useI18n } from '@/i18n/I18nProvider';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing } from '@/ui/theme';

import { trainingBlockPath } from './trainingLabels';

/**
 * TRAINING-BLOCKS-001 — Workouts → Training blocks: the six read-only multi-week programmes. Opening one shows the plan; adding
 * it to a Player creates independent copies (see AssignTrainingBlock).
 */
export function TrainingBlocks() {
  const { t, language } = useI18n();
  return (
    <KeyboardSafeScrollView testID="blocks-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted} testID="blocks-intro">
        {t('training.trainingBlocks.intro')}
      </Text>
      {TRAINING_BLOCKS.map((b) => {
        const title = language === 'he' ? b.name[0] : b.name[1];
        const level = t('training.trainingBlocks.cardLevel', { level: t(`training.professional.level.${b.difficulty}`) });
        const line = t('training.trainingBlocks.card', { weeks: b.weeks, perWeek: b.sessionsPerWeek, total: totalSessions(b) });
        return (
          <Pressable
            key={b.id}
            testID={`block-card-${b.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${level}, ${line}`}
            onPress={() => router.push(trainingBlockPath(b.id))}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
            <Text style={styles.name} testID={`block-card-${b.id}-name`}>
              {title}
            </Text>
            <Text style={styles.meta} testID={`block-card-${b.id}-level`}>
              {level}
            </Text>
            <Text style={styles.muted} testID={`block-card-${b.id}-line`}>
              {line}
            </Text>
            <Text style={styles.body} testID={`block-card-${b.id}-summary`}>
              {language === 'he' ? b.summary[0] : b.summary[1]}
            </Text>
          </Pressable>
        );
      })}
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.xs, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  meta: { fontSize: 15, fontWeight: '700', color: colors.court, textAlign: 'auto' },
  body: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
});
