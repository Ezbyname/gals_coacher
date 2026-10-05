import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { listSelfAssessments } from '@/data/local/selfAssessments/selfAssessmentRepository';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

import { formatTakenAt } from './formatTakenAt';
import { SELF_ASSESSMENT_SPORT, selfAssessmentErrorMessage } from './selfAssessmentLabels';

type Latest =
  | { status: 'loading' }
  | { status: 'ready'; takenAt: number | null }
  | { status: 'error'; message: TranslationKey };

/**
 * Entry to a Basketball player's self-assessment, shown on Edit Player
 * outside the profile fields (the caller renders it only for players with
 * Basketball). Shows when the latest one was taken — never its answers.
 * While Basketball is inactive it opens the history only.
 */
export function SelfAssessmentSection({ playerId, active }: { playerId: string; active: boolean }) {
  const { boot } = useApp();
  const { t, language } = useI18n();
  const [latest, setLatest] = useState<Latest>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listSelfAssessments(boot.db, playerId, SELF_ASSESSMENT_SPORT)
        .then((history) => {
          if (active) setLatest({ status: 'ready', takenAt: history[0]?.takenAt ?? null });
        })
        .catch((e: unknown) => {
          console.warn('[self-assessment] latest failed', e);
          if (active) {
            setLatest({
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

  return (
    <View style={styles.section} testID="self-assessment-section">
      <Text style={styles.title}>{t('selfAssessment.title')}</Text>
      <Text style={styles.muted}>{t('selfAssessment.about')}</Text>
      {latest.status === 'ready' && latest.takenAt !== null ? (
        <Text style={styles.status} testID="self-assessment-latest">
          {t('selfAssessment.latest', { dateTime: formatTakenAt(latest.takenAt, language) })}
        </Text>
      ) : null}
      {latest.status === 'ready' && latest.takenAt === null ? (
        <Text style={styles.status} testID="self-assessment-none">
          {t('selfAssessment.none')}
        </Text>
      ) : null}
      {!active ? (
        <Text style={styles.muted} testID="self-assessment-inactive">
          {t('selfAssessment.inactive')}
        </Text>
      ) : null}
      {latest.status === 'error' ? (
        <Text style={styles.error} testID="self-assessment-section-error">
          {t(latest.message)}
        </Text>
      ) : null}
      <BigButton
        testID="self-assessment-open"
        variant="secondary"
        label={active ? t('selfAssessment.open') : t('selfAssessment.openHistory')}
        onPress={() => router.push(`/children/${playerId}/self-assessments`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  status: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'auto' },
});
