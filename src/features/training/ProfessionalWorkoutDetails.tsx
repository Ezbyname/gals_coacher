import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { builtinExercise } from '@/domain/exercise/catalog';
import { defaultPrescription } from '@/domain/training/training';
import { professionalWorkout, professionalExerciseCount } from '@/domain/training/professional';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate } from '@/i18n/bidi';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing } from '@/ui/theme';

import { addToWorkoutPath, prescriptionText, timeCapHint } from './trainingLabels';

/**
 * SPORT-CONTENT-001 — one professional workout, read-only: its level, the locked safety wording (surf), each section
 * with its exercises and dosage, the coach notes (not copied) and the honest source note. "Add to workout" opens the
 * Player / destination picker; it copies, it never edits this source.
 */
export function ProfessionalWorkoutDetails({ workoutId }: { workoutId: string }) {
  const { t, language } = useI18n();
  const workout = professionalWorkout(workoutId);
  if (workout === null) {
    return <ErrorScreen testID="professional-error" message="training.professional.notFound" fallback="/workouts/professional" />;
  }
  const pick = (pair: readonly [string, string]) => (language === 'he' ? pair[0] : pair[1]);
  const title = pick(workout.name);
  return (
    <KeyboardSafeScrollView testID="professional-details-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.title} accessibilityRole="header" testID="professional-details-name">
        {title}
      </Text>
      <Text style={styles.meta} testID="professional-details-level">
        {workout.sport === null
          ? t('training.professional.generalCard', { level: t(`training.professional.level.${workout.difficulty}`) })
          : t('training.professional.card', { sport: sportLabel(t, workout.sport), level: t(`training.professional.level.${workout.difficulty}`) })}
      </Text>
      <Text style={styles.muted} testID="professional-details-focus">
        {t(`training.professional.focus.${workout.focus}`)}
      </Text>
      <Text style={styles.muted}>{t('training.professional.levelNote')}</Text>
      {workout.difficulty === 'ADVANCED' ? (
        <Text style={styles.muted} testID="professional-advanced-note">
          {t('training.professional.advancedNote')}
        </Text>
      ) : null}
      <Text style={styles.body} testID="professional-details-summary">
        {pick(workout.summary)}
      </Text>
      <Text style={styles.muted}>
        {t('training.professional.lengthLine', { min: workout.minutes[0], max: workout.minutes[1], count: professionalExerciseCount(workout) })}
      </Text>

      {workout.safety !== null ? (
        <View style={styles.safety} testID="professional-safety">
          <Text style={styles.label}>{t('training.professional.safetyTitle')}</Text>
          <Text style={styles.body} testID="professional-safety-text">
            {pick(workout.safety)}
          </Text>
        </View>
      ) : null}

      <Text style={styles.heading}>{t('training.professional.sectionsTitle')}</Text>
      {workout.sections.map((section, s) => (
        <View key={s} style={styles.card} testID={`professional-section-${s}`}>
          <Text style={styles.label} testID={`professional-section-${s}-name`}>
            {pick(section.name)}
          </Text>
          {section.items.map((item, i) => {
            const exercise = builtinExercise(item.exerciseId)!;
            const prescription = {
              ...(item.dosage
                ? { sets: item.dosage.sets, target: item.dosage.target, loadKg: null, restSec: item.dosage.restSec }
                : defaultPrescription(exercise.measurement, exercise.defaults)),
              timeSemantics: item.timeSemantics ?? null,
            };
            return (
              <View key={i} style={styles.item} testID={`professional-item-${s}-${i}`}>
                <Text style={styles.body} testID={`professional-item-${s}-${i}-name`}>
                  {isolate(exercise.name[language])}
                </Text>
                <Text style={styles.muted} testID={`professional-item-${s}-${i}-dosage`}>
                  {prescriptionText(t, exercise.measurement, prescription)}
                </Text>
                {[item, ...(item.alternatives ?? []).map((a) => ({ exerciseId: a.exerciseId, dosage: a.dosage, timeSemantics: a.timeSemantics }))].some((it) => {
                  const ie = builtinExercise(it.exerciseId)!;
                  return timeCapHint(t, ie.measurement, it.dosage ? it.dosage.target : null, it.timeSemantics) !== null;
                }) ? (
                  <Text style={styles.muted} testID={`professional-item-${s}-${i}-time-cap-hint`}>
                    {t('training.timeCapHint')}
                  </Text>
                ) : null}
                {item.alternatives && item.alternatives.length > 0 ? (
                  <View testID={`professional-item-${s}-${i}-alternatives`}>
                    <Text style={styles.muted}>{t('training.professional.alternativesTitle')}</Text>
                    {item.alternatives.map((a, k) => {
                      const ae = builtinExercise(a.exerciseId)!;
                      return (
                        <Text key={k} style={styles.muted} testID={`professional-item-${s}-${i}-alt-${k}`}>
                          {t('training.professional.alternativeLine', {
                            name: isolate(ae.name[language]),
                            dosage: prescriptionText(t, ae.measurement, { sets: a.dosage.sets, target: a.dosage.target, loadKg: null, restSec: a.dosage.restSec, timeSemantics: a.timeSemantics ?? null }),
                          })}
                        </Text>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      {workout.coachNotes.length > 0 ? (
        <View style={styles.card} testID="professional-coach-notes">
          <Text style={styles.label}>{t('training.professional.coachNotes')}</Text>
          <Text style={styles.muted}>{t('training.professional.coachNotesHint')}</Text>
          {workout.coachNotes.map((note, i) => (
            <Text key={i} style={styles.body} testID={`professional-coach-note-${i}`}>
              {pick(note)}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.muted} testID="professional-source-note">
        {t('training.professional.sourceNote')}
      </Text>
      <BigButton
        testID="professional-add-to-workout"
        label={t('training.professional.addToWorkout')}
        onPress={() => router.push(addToWorkoutPath('PROFESSIONAL', workout.id))}
      />
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
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  safety: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  item: { gap: 2 },
});
