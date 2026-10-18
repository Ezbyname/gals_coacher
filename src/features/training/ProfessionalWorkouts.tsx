import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { DIFFICULTIES, type Difficulty } from '@/domain/exercise/taxonomy';
import type { SportKey } from '@/domain/sport';
import {
  professionalExerciseCount,
  professionalWorkoutsFor,
  type ProfessionalWorkout,
} from '@/domain/training/professional';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { useI18n } from '@/i18n/I18nProvider';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing } from '@/ui/theme';

import { professionalPath } from './trainingLabels';

type ProSport = ProfessionalWorkout['sport'];
const SPORTS: readonly ProSport[] = ['SURFING', 'FOOTBALL'];

/**
 * SPORT-CONTENT-001 — Workouts → Professional workouts: the six read-only starter workouts (Surfing and Football ×
 * Beginner / Intermediate / Advanced), filtered by sport and level. Opening one shows its content; adding it to a
 * Player copies it.
 */
export function ProfessionalWorkouts() {
  const { t, language } = useI18n();
  const [sport, setSport] = useState<ProSport | null>(null);
  const [level, setLevel] = useState<Difficulty | null>(null);
  const shown = professionalWorkoutsFor(sport, level);
  return (
    <KeyboardSafeScrollView testID="professional-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted} testID="professional-intro">
        {t('training.professional.intro')}
      </Text>
      <ChoiceChips<ProSport>
        testID="professional-filter-sport"
        label={t('training.professional.sportFilter')}
        choices={SPORTS.map((value) => ({ value, label: sportLabel(t, value as SportKey) }))}
        value={sport}
        onChange={setSport}
      />
      <ChoiceChips<Difficulty>
        testID="professional-filter-level"
        label={t('training.professional.levelFilter')}
        choices={DIFFICULTIES.map((value) => ({ value, label: t(`training.professional.level.${value}`) }))}
        value={level}
        onChange={setLevel}
      />
      <Text style={styles.muted}>{t('training.professional.levelNote')}</Text>
      {shown.map((w) => {
        const title = language === 'he' ? w.name[0] : w.name[1];
        return (
          <Pressable
            key={w.id}
            testID={`professional-workout-${w.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${t('training.professional.card', { sport: sportLabel(t, w.sport), level: t(`training.professional.level.${w.difficulty}`) })}`}
            onPress={() => router.push(professionalPath(w.id))}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
            <Text style={styles.name} testID={`professional-workout-${w.id}-name`}>
              {title}
            </Text>
            <Text style={styles.meta} testID={`professional-workout-${w.id}-level`}>
              {t('training.professional.card', { sport: sportLabel(t, w.sport), level: t(`training.professional.level.${w.difficulty}`) })}
            </Text>
            <Text style={styles.muted}>
              {t('training.professional.lengthLine', { min: w.minutes[0], max: w.minutes[1], count: professionalExerciseCount(w) })}
            </Text>
          </Pressable>
        );
      })}
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
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
