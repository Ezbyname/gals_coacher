import { router, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { createSelfAssessment } from '@/data/local/selfAssessments/selfAssessmentRepository';
import { SELF_RATINGS, type SelfRating } from '@/domain/selfAssessment';
import { useApp } from '@/features/AppProvider';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { RatingScale } from '@/ui/RatingScale';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing } from '@/ui/theme';

import {
  CATEGORIES,
  RATING_MAX,
  SELF_ASSESSMENT_SPORT,
  categoryLabel,
  selfAssessmentErrorMessage,
} from './selfAssessmentLabels';

type Answers = Readonly<Record<string, SelfRating | null>>;
const NO_ANSWERS: Answers = Object.fromEntries(CATEGORIES.map((category) => [category, null]));

export const historyPath = (playerId: string) => `/children/${playerId}/self-assessments` as const;
/** The History route's name in the root stack (src/app/children/[id]/self-assessments/index.tsx). */
const HISTORY_ROUTE = 'children/[id]/self-assessments/index';

type StackState = { index: number; routes: { name: string; params?: object }[] };

/**
 * One scrolling screen with all six categories. Every category needs an
 * answer; Save with missing answers writes nothing, keeps every choice and
 * marks what is missing. The repository owns the timestamp, id, validation
 * and transaction. Nothing here derives a total or any other score.
 */
export function NewSelfAssessment({ playerId }: { playerId: string }) {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [answers, setAnswers] = useState<Answers>(NO_ANSWERS);
  // Leaving with chosen answers asks first (NAV-DIRTY-001); clearing every answer is clean again.
  const guard = useUnsavedChangesGuard(CATEGORIES.some((category) => answers[category] !== null));
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second press in the same frame must see the guard immediately.
  const saveInProgress = useRef(false);

  const answered = CATEGORIES.filter((category) => answers[category] !== null).length;
  const navigation = useNavigation();
  // Leave for this player's History. In the normal flow (History → New) that is
  // one plain step back — the same action as the header back button, so the
  // native stack pops exactly this screen. Without History underneath (e.g. a
  // deep link), History replaces this screen instead.
  const back = () => {
    const state = navigation.getState() as StackState | undefined;
    const below = state?.routes[state.index - 1];
    const params = below?.params as { id?: string } | undefined;
    if (below?.name === HISTORY_ROUTE && params?.id === playerId) router.back();
    else router.replace(historyPath(playerId));
  };

  const choose = (category: string) => (rating: SelfRating) => {
    setAnswers((current) => ({ ...current, [category]: rating }));
    setMissing((current) => {
      if (!current.has(category)) return current;
      const next = new Set(current);
      next.delete(category);
      return next;
    });
  };

  const save = async () => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const result = await createSelfAssessment(
        boot.db,
        playerId,
        SELF_ASSESSMENT_SPORT,
        CATEGORIES.map((category) => ({ category, rating: answers[category] })),
        { ids: services.ids, clock: services.clock },
      );
      if (result.ok) {
        guard.release(); // saved: leaving is safe
        back(); // stays guarded: the screen is leaving
        return;
      }
      const problems = result.errors.categories ?? {};
      const unanswered = Object.keys(problems).filter((category) => problems[category] === 'MISSING');
      setMissing(new Set(unanswered));
      if (unanswered.length === 0) setSaveError('selfAssessment.errors.saveFailed');
    } catch (e) {
      console.warn('[self-assessment] save failed', e);
      setSaveError(selfAssessmentErrorMessage(e, 'selfAssessment.errors.saveFailed'));
    }
    saveInProgress.current = false;
    setSaving(false);
  };

  return (
    <SafeAreaScrollView
      testID="self-assessment-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>{t('selfAssessment.intro')}</Text>
      <Text style={styles.progress} testID="self-assessment-progress">
        {t('selfAssessment.progress', { count: ltr(`${answered}/${CATEGORIES.length}`) })}
      </Text>

      {CATEGORIES.map((category) => {
        const label = categoryLabel(t, category);
        return (
          <RatingScale
            key={category}
            testID={`self-assessment-${category}`}
            label={label}
            values={SELF_RATINGS}
            value={answers[category] ?? null}
            onChange={choose(category)}
            lowAnchor={t('selfAssessment.anchorLow')}
            highAnchor={t('selfAssessment.anchorHigh')}
            choiceLabel={(rating) =>
              t('selfAssessment.ratingA11y', { category: label, rating, max: RATING_MAX })
            }
            error={missing.has(category) ? t('selfAssessment.notChosen') : undefined}
          />
        );
      })}

      {missing.size > 0 ? (
        <Text style={styles.error} testID="self-assessment-unanswered">
          {t('selfAssessment.unanswered')}
        </Text>
      ) : null}
      {saveError ? (
        <Text style={styles.error} testID="self-assessment-save-error">
          {t(saveError)}
        </Text>
      ) : null}

      <BigButton
        testID="self-assessment-save"
        label={saving ? t('selfAssessment.saving') : t('selfAssessment.save')}
        onPress={save}
        disabled={saving}
      />
      <BigButton
        testID="self-assessment-cancel"
        variant="secondary"
        label={t('selfAssessment.cancel')}
        onPress={() => {
          guard.release(); // Cancel discards on purpose (unchanged behaviour)
          back();
        }}
        // A started save cannot be cancelled: no second navigation while it runs.
        disabled={saving}
      />
    </SafeAreaScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  intro: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  progress: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
