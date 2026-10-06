import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { getExercise, setExerciseActive } from '@/data/local/exercises/exerciseRepository';
import { bodyAreasOf, type Exercise, type LocalizedText } from '@/domain/exercise/exercise';
import { useApp } from '@/features/AppProvider';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing } from '@/ui/theme';

import {
  areaLabel,
  categoryLabel,
  difficultyLabel,
  equipmentOptionText,
  exerciseName,
  measurementStyle,
  muscleLabel,
  patternLabel,
} from './exerciseLabels';

type State =
  | { status: 'loading' }
  | { status: 'ready'; exercise: Exercise }
  | { status: 'error'; message: TranslationKey };

export const editExercisePath = (id: string) => `/exercises/${id}/edit` as const;

/**
 * One exercise as a coach reads it: what it trains, how hard it is, what it
 * needs, how it is measured, and how to do it well. Custom exercises can be
 * edited; any exercise can be made inactive (asks first — history is kept)
 * or active again.
 */
export function ExerciseDetails({ exerciseId }: { exerciseId: string }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const [loaded, setLoaded] = useState<State>({ status: 'loading' });
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState(false);
  const inProgress = useRef(false);
  const state: State =
    boot.status === 'error' ? { status: 'error', message: 'exercises.loadFailed' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      getExercise(boot.db, exerciseId)
        .then((exercise) => {
          if (!active) return;
          setLoaded(
            exercise ? { status: 'ready', exercise } : { status: 'error', message: 'exercises.notFound' },
          );
        })
        .catch((e: unknown) => {
          console.warn('[exercises] details failed', e);
          if (active) setLoaded({ status: 'error', message: 'exercises.loadFailed' });
        });
      return () => {
        active = false;
      };
    }, [boot, exerciseId]),
  );

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') {
    return <ErrorScreen testID="exercise-details-error" message={state.message} fallback="/exercises" />;
  }
  const { exercise } = state;
  const name = exerciseName(exercise, language);
  const localized = (text: LocalizedText) => text[language];

  const setActive = async (active: boolean) => {
    if (inProgress.current) return;
    inProgress.current = true;
    setChanging(true);
    setChangeError(false);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      setLoaded({
        status: 'ready',
        exercise: await setExerciseActive(boot.db, exercise.id, active, { clock: services.clock }),
      });
    } catch (e) {
      console.warn('[exercises] change failed', e);
      setChangeError(true);
    }
    inProgress.current = false;
    setChanging(false);
  };
  const toggleActive = () => {
    if (!exercise.active) {
      void setActive(true);
      return;
    }
    // Not a deletion: the safe choice keeps it active.
    Alert.alert(t('exercises.deactivateTitle', { name }), t('exercises.deactivateBody'), [
      { text: t('exercises.keepActive'), style: 'cancel' },
      { text: t('exercises.confirmInactive'), onPress: () => void setActive(false) },
    ]);
  };

  const field = (testID: string, label: TranslationKey, value: string | null) =>
    value === null || value.length === 0 ? null : (
      <View style={styles.field} testID={testID}>
        <Text style={styles.label}>{t(label)}</Text>
        <Text style={styles.value} testID={`${testID}-value`}>
          {value}
        </Text>
      </View>
    );
  const list = (testID: string, label: TranslationKey, items: string[]) =>
    items.length === 0 ? null : (
      <View style={styles.field} testID={testID}>
        <Text style={styles.label}>{t(label)}</Text>
        {items.map((item, i) => (
          <Text key={i} style={styles.value} testID={`${testID}-${i}`}>
            {t('exercises.bullet', { item })}
          </Text>
        ))}
      </View>
    );
  const defaults = exercise.defaults
    ? exercise.defaults.target === null
      ? t('exercises.defaultsNoTarget', { sets: exercise.defaults.sets, rest: exercise.defaults.restSec })
      : t('exercises.defaultsValue', {
          sets: exercise.defaults.sets,
          target: exercise.defaults.target,
          rest: exercise.defaults.restSec,
        })
    : null;

  return (
    <SafeAreaScrollView testID="exercise-details-scroll" contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title} testID="exercise-details-name" accessibilityRole="header">
          {name}
        </Text>
        <Text style={styles.muted} testID="exercise-details-origin">
          {t(exercise.builtin ? 'exercises.builtin' : 'exercises.custom')}
        </Text>
        <Text
          style={[styles.status, !exercise.active && styles.statusInactive]}
          testID="exercise-details-status">
          {t(exercise.active ? 'exercises.active' : 'exercises.inactive')}
        </Text>
      </View>

      <View style={styles.card}>
        {field(
          'exercise-details-categories',
          'exercises.categories',
          exercise.categories.map((c) => categoryLabel(t, c)).join(' · '),
        )}
        {field(
          'exercise-details-difficulty',
          'exercises.difficulty',
          difficultyLabel(t, exercise.difficulty),
        )}
        {field(
          'exercise-details-primary',
          'exercises.primary',
          exercise.primaryMuscles.map((m) => muscleLabel(t, m)).join(' · '),
        )}
        {field(
          'exercise-details-secondary',
          'exercises.secondary',
          exercise.secondaryMuscles.map((m) => muscleLabel(t, m)).join(' · '),
        )}
        {field(
          'exercise-details-areas',
          'exercises.areas',
          bodyAreasOf(exercise)
            .map((a) => areaLabel(t, a))
            .join(' · '),
        )}
        {field(
          'exercise-details-patterns',
          'exercises.patterns',
          exercise.movementPatterns.map((p) => patternLabel(t, p)).join(' · '),
        )}
        {field(
          'exercise-details-sports',
          'exercises.sports',
          exercise.sports.length === 0
            ? t('exercises.general')
            : exercise.sports.map((s) => sportLabel(t, s)).join(' · '),
        )}
        {exercise.equipment.length === 0
          ? field('exercise-details-equipment', 'exercises.equipment', t('exercises.noEquipment'))
          : list(
              'exercise-details-equipment',
              'exercises.equipment',
              exercise.equipment.map((option, i) =>
                exercise.equipment.length === 1
                  ? equipmentOptionText(t, option)
                  : t('exercises.option', { index: i + 1, items: equipmentOptionText(t, option) }),
              ),
            )}
        {field(
          'exercise-details-measurement',
          'exercises.measurement',
          measurementStyle(t, exercise.measurement),
        )}
        {field('exercise-details-defaults', 'exercises.defaults', defaults)}
      </View>

      {exercise.instructions ||
      exercise.cues.length > 0 ||
      exercise.mistakes.length > 0 ||
      exercise.safety ? (
        <View style={styles.card}>
          {field(
            'exercise-details-instructions',
            'exercises.instructions',
            exercise.instructions ? localized(exercise.instructions) : null,
          )}
          {list('exercise-details-cues', 'exercises.cues', exercise.cues.map(localized))}
          {list('exercise-details-mistakes', 'exercises.mistakes', exercise.mistakes.map(localized))}
          {field(
            'exercise-details-safety',
            'exercises.safety',
            exercise.safety ? localized(exercise.safety) : null,
          )}
        </View>
      ) : null}

      {exercise.tutorialUrl ? (
        <BigButton
          testID="exercise-details-tutorial"
          variant="secondary"
          label={t('exercises.tutorial')}
          onPress={() => void Linking.openURL(exercise.tutorialUrl!)}
        />
      ) : null}
      {changeError ? (
        <Text style={styles.error} testID="exercise-details-change-error">
          {t('exercises.changeFailed')}
        </Text>
      ) : null}
      {!exercise.builtin ? (
        <BigButton
          testID="exercise-details-edit"
          label={t('exercises.edit')}
          onPress={() => router.push(editExercisePath(exercise.id))}
          disabled={changing}
        />
      ) : null}
      <BigButton
        testID="exercise-details-toggle"
        variant="secondary"
        label={t(exercise.active ? 'exercises.makeInactive' : 'exercises.makeActive')}
        onPress={toggleActive}
        disabled={changing}
      />
    </SafeAreaScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  field: { gap: 2 },
  label: { fontSize: 14, fontWeight: '600', color: colors.inkMuted, textAlign: 'auto' },
  value: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  status: { fontSize: 14, fontWeight: '800', color: colors.success, textAlign: 'auto' },
  statusInactive: { color: colors.inkMuted },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
