import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DIFFICULTIES, type Difficulty } from '@/domain/exercise/taxonomy';
import type { SportKey } from '@/domain/sport';
import {
  GENERAL_ATHLETIC_WORKOUTS,
  PROFESSIONAL_SPORTS,
  PROFESSIONAL_WORKOUTS,
  generalWorkoutsFor,
  professionalExerciseCount,
  professionalWorkoutsFor,
  type ProfessionalSport,
  type TrainingFocus,
} from '@/domain/training/professional';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { useI18n } from '@/i18n/I18nProvider';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing } from '@/ui/theme';

import { professionalPath } from './trainingLabels';


/**
 * SPORT-CONTENT-001 — Workouts → Professional workouts: the six read-only starter workouts (Surfing and Football ×
 * Beginner / Intermediate / Advanced), filtered by sport and level. Opening one shows its content; adding it to a
 * Player copies it.
 */
export function ProfessionalWorkouts() {
  const { t, language } = useI18n();
  // 'GENERAL' = the general-athletic workouts (no sport). It is a FILTER value of this screen, never a sport.
  const [sport, setSport] = useState<ProfessionalSport | 'GENERAL' | null>(null);
  const [level, setLevel] = useState<Difficulty | null>(null);
  const [focus, setFocus] = useState<TrainingFocus | null>(null);
  const shown = sport === 'GENERAL' ? [] : professionalWorkoutsFor(sport, level, focus);
  const shownGeneral = sport === null || sport === 'GENERAL' ? generalWorkoutsFor(level, focus) : [];
  // the Focus chips offered: those of the chosen sport (or of every sport), in registry order
  const focuses = [
    ...new Set(
      [...PROFESSIONAL_WORKOUTS, ...GENERAL_ATHLETIC_WORKOUTS]
        .filter((w) => sport === null || (sport === 'GENERAL' ? w.sport === null : w.sport === sport))
        .map((w) => w.focus),
    ),
  ];
  // grouped by sport then focus, so Surf Technique and Surf Strength & Fitness are never one undifferentiated list
  const groups: { sport: ProfessionalSport | 'GENERAL'; focus: TrainingFocus; workouts: typeof shown }[] = [
    ...PROFESSIONAL_SPORTS.flatMap((s) =>
      [...new Set(shown.filter((w) => w.sport === s).map((w) => w.focus))].map((f) => ({ sport: s, focus: f, workouts: shown.filter((w) => w.sport === s && w.focus === f) })),
    ),
    ...[...new Set(shownGeneral.map((w) => w.focus))].map((f) => ({ sport: 'GENERAL' as const, focus: f, workouts: shownGeneral.filter((w) => w.focus === f) })),
  ];
  const scopeLabel = (value: ProfessionalSport | 'GENERAL') => (value === 'GENERAL' ? t('training.professional.generalScope') : sportLabel(t, value as SportKey));
  return (
    <KeyboardSafeScrollView testID="professional-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted} testID="professional-intro">
        {t('training.professional.intro')}
      </Text>
      <ChoiceChips<ProfessionalSport | 'GENERAL'>
        testID="professional-filter-sport"
        label={t('training.professional.sportFilter')}
        choices={[...PROFESSIONAL_SPORTS, 'GENERAL' as const].map((value) => ({ value, label: scopeLabel(value) }))}
        value={sport}
        onChange={(value) => {
          setSport(value);
          setFocus(null); // a focus of another sport would otherwise leave an empty list
        }}
      />
      <ChoiceChips<TrainingFocus>
        testID="professional-filter-focus"
        label={t('training.professional.focusFilter')}
        choices={focuses.map((value) => ({ value, label: t(`training.professional.focus.${value}`) }))}
        value={focus}
        onChange={setFocus}
      />
      <ChoiceChips<Difficulty>
        testID="professional-filter-level"
        label={t('training.professional.levelFilter')}
        choices={DIFFICULTIES.map((value) => ({ value, label: t(`training.professional.level.${value}`) }))}
        value={level}
        onChange={setLevel}
      />
      <Text style={styles.muted}>{t('training.professional.levelNote')}</Text>
      {groups.map((g) => (
        <View key={`${g.sport}-${g.focus}`} style={styles.group} testID={`professional-group-${g.sport}-${g.focus}`}>
          <Text style={styles.groupTitle} accessibilityRole="header" testID={`professional-group-${g.sport}-${g.focus}-title`}>
            {t('training.professional.groupHeading', { sport: scopeLabel(g.sport), focus: t(`training.professional.focus.${g.focus}`) })}
          </Text>
          {g.workouts.map((w) => {
            const title = language === 'he' ? w.name[0] : w.name[1];
            const card = t(
              w.sport === null ? 'training.professional.generalCard' : 'training.professional.card',
              { sport: w.sport === null ? '' : sportLabel(t, w.sport), level: t(`training.professional.level.${w.difficulty}`) },
            );
            return (
              <Pressable
                key={w.id}
                testID={`professional-workout-${w.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${card}`}
                onPress={() => router.push(professionalPath(w.id))}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                <Text style={styles.name} testID={`professional-workout-${w.id}-name`}>
                  {title}
                </Text>
                <Text style={styles.meta} testID={`professional-workout-${w.id}-level`}>
                  {card}
                </Text>
                <Text style={styles.muted}>
                  {t('training.professional.lengthLine', { min: w.minutes[0], max: w.minutes[1], count: professionalExerciseCount(w) })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: spacing.sm, textAlign: 'auto' },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  meta: { fontSize: 15, fontWeight: '700', color: colors.court, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
});
