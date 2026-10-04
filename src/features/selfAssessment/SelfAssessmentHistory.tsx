import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getPlayer } from '@/data/local/players/playerRepository';
import { listSelfAssessments } from '@/data/local/selfAssessments/selfAssessmentRepository';
import type { SelfAssessment } from '@/domain/selfAssessment';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing } from '@/ui/theme';

import { formatTakenAt } from './formatTakenAt';
import {
  SELF_ASSESSMENT_SPORT,
  categoryLabel,
  ratingText,
  selfAssessmentErrorMessage,
} from './selfAssessmentLabels';

type HistoryState =
  | { status: 'loading' }
  | { status: 'ready'; playerName: string; assessments: SelfAssessment[] }
  | { status: 'error'; message: TranslationKey };

/**
 * One player's Basketball self-assessments, newest first, exactly as saved:
 * local date and time, then every category with its own n/5. Read-only
 * facts — no totals, averages, trends or comparison. Reloads on focus, so a
 * new assessment appears first on return. Corrupt history fails as a whole.
 */
export function SelfAssessmentHistory({ playerId }: { playerId: string }) {
  const { boot } = useApp();
  const { t, language } = useI18n();
  const [loaded, setState] = useState<HistoryState>({ status: 'loading' });
  const state: HistoryState =
    boot.status === 'error' ? { status: 'error', message: 'selfAssessment.errors.loadFailed' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      (async () => {
        const profile = await getPlayer(boot.db, playerId);
        if (profile === null)
          return { status: 'error', message: 'selfAssessment.errors.playerNotFound' } as const;
        if (profile.basketball === null) {
          return { status: 'error', message: 'selfAssessment.errors.noBasketball' } as const;
        }
        const assessments = await listSelfAssessments(boot.db, playerId, SELF_ASSESSMENT_SPORT);
        return { status: 'ready', playerName: profile.player.name, assessments } as const;
      })()
        .then((next) => {
          if (active) setState(next);
        })
        .catch((e: unknown) => {
          console.warn('[self-assessment] history failed', e);
          if (active) {
            setState({
              status: 'error',
              message: selfAssessmentErrorMessage(e, 'selfAssessment.errors.loadFailed'),
            });
          }
        });
      return () => {
        active = false;
      };
    }, [boot, playerId]),
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('selfAssessment.loading')}</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} testID="self-assessment-history-error">
          {t(state.message)}
        </Text>
        <BigButton
          testID="self-assessment-history-back"
          variant="secondary"
          label={t('selfAssessment.back')}
          onPress={() => router.back()}
        />
      </View>
    );
  }

  const takeNew = (
    <BigButton
      testID="self-assessment-new"
      label={state.assessments.length === 0 ? t('selfAssessment.start') : t('selfAssessment.takeAnother')}
      onPress={() => router.push(`/children/${playerId}/self-assessments/new`)}
    />
  );

  return (
    <SafeAreaScrollView testID="self-assessment-history" contentContainerStyle={styles.container}>
      <Text style={styles.name}>{state.playerName}</Text>
      <Text style={styles.muted}>{t('selfAssessment.about')}</Text>

      {state.assessments.length === 0 ? (
        <View style={styles.empty} testID="self-assessment-empty">
          <Text style={styles.title}>{t('selfAssessment.empty')}</Text>
          <Text style={styles.muted}>{t('selfAssessment.emptyHint')}</Text>
        </View>
      ) : null}

      {takeNew}

      {state.assessments.map((assessment) => (
        <View key={assessment.id} style={styles.entry} testID={`self-assessment-entry-${assessment.id}`}>
          <Text style={styles.takenAt} testID={`self-assessment-taken-at-${assessment.id}`}>
            {formatTakenAt(assessment.takenAt, language)}
          </Text>
          {assessment.ratings.map(({ category, rating }) => (
            <View key={category} style={styles.row}>
              <Text style={styles.category}>{categoryLabel(t, category)}</Text>
              <Text style={styles.rating} testID={`self-assessment-${assessment.id}-${category}`}>
                {ratingText(rating)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </SafeAreaScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  name: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 15, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
  empty: { gap: spacing.xs },
  entry: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  takenAt: { fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  category: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  rating: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
