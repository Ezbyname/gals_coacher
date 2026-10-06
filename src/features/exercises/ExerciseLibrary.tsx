import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { EQUIPMENT, type EquipmentId } from '@/domain/exercise/equipment';
import {
  NO_EXERCISE_FILTER,
  filterExercises,
  type Exercise,
  type ExerciseFilter,
} from '@/domain/exercise/exercise';
import { BODY_AREAS, DIFFICULTIES, MUSCLE_GROUPS, TRAINING_CATEGORIES } from '@/domain/exercise/taxonomy';
import { V1_ENABLED_SPORTS, type SportKey } from '@/domain/sport';
import { useApp } from '@/features/AppProvider';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { MultiChoiceChips } from '@/ui/MultiChoiceChips';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import {
  areaLabel,
  categoryLabel,
  difficultyLabel,
  equipmentLabel,
  equipmentSummary,
  exerciseName,
  measurementStyle,
  muscleLabel,
} from './exerciseLabels';

type Loaded = { status: 'loading' } | { status: 'ready'; exercises: Exercise[] } | { status: 'error' };

export const exercisePath = (id: string) => `/exercises/${id}` as const;
export const NEW_EXERCISE_PATH = '/exercises/new';

const toggle = <T,>(values: readonly T[], value: T) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

/**
 * The Exercise Library (TRAIN-001): search in Hebrew or English and filter by
 * training type, body area / muscle, difficulty, sport and — most useful in
 * practice — the equipment you actually have (or none at all). Filters live in
 * screen state only. Inactive exercises are hidden unless asked for. Reloads
 * on focus (a new or changed exercise shows on return).
 */
export function ExerciseLibrary() {
  const { boot } = useApp();
  const { t, language } = useI18n();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [filter, setFilter] = useState<ExerciseFilter>(NO_EXERCISE_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listExercises(boot.db)
        .then((exercises) => active && setLoaded({ status: 'ready', exercises }))
        .catch((e: unknown) => {
          console.warn('[exercises] load failed', e);
          if (active) setLoaded({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot]),
  );

  const exercises = useMemo(() => (loaded.status === 'ready' ? loaded.exercises : []), [loaded]);
  const shown = useMemo(() => filterExercises(exercises, filter, language), [exercises, filter, language]);

  if (boot.status === 'error' || loaded.status === 'error') {
    return <ErrorScreen testID="exercises-error" message="exercises.loadFailed" fallback="/" />;
  }
  if (loaded.status === 'loading') return <LoadingScreen />;

  const narrowed = [
    filter.categories.length,
    filter.areas.length + filter.muscles.length,
    filter.difficulties.length,
    filter.sports.length,
    filter.available !== null || filter.bodyweightOnly ? 1 : 0,
    filter.includeInactive ? 1 : 0,
  ].filter((n) => n > 0).length;
  const selectedLabel = (label: string) => t('exercises.selectedChip', { label });
  const set = (change: Partial<ExerciseFilter>) => setFilter({ ...filter, ...change });

  return (
    <SafeAreaScrollView
      testID="exercises-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <TextField
        testID="exercises-search"
        label={t('exercises.search')}
        value={filter.query}
        onChangeText={(query) => set({ query })}
      />
      <View style={styles.bar}>
        <Pressable
          testID="exercises-filters-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen(!filtersOpen)}
          style={[styles.pill, narrowed > 0 && styles.pillActive]}>
          <Text style={styles.pillLabel} testID="exercises-filters-toggle-label">
            {narrowed > 0 ? t('exercises.filtersActive', { count: narrowed }) : t('exercises.filters')}
          </Text>
        </Pressable>
        {narrowed > 0 || filter.query.length > 0 ? (
          <Pressable
            testID="exercises-filters-clear"
            accessibilityRole="button"
            onPress={() => setFilter(NO_EXERCISE_FILTER)}
            style={styles.pill}>
            <Text style={styles.pillLabel}>{t('exercises.clearFilters')}</Text>
          </Pressable>
        ) : null}
      </View>

      {filtersOpen ? (
        <View style={styles.panel} testID="exercises-filters">
          <MultiChoiceChips<EquipmentId>
            testID="exercises-filter-equipment"
            label={t('exercises.filterEquipment')}
            choices={EQUIPMENT.map((value) => ({ value, label: equipmentLabel(t, value) }))}
            selected={filter.available ?? []}
            onToggle={(item) => {
              const next = toggle(filter.available ?? [], item);
              set({ available: next.length > 0 ? next : null });
            }}
            selectedLabel={selectedLabel}
          />
          {filter.available !== null ? <Text style={styles.hint}>{t('exercises.equipmentHint')}</Text> : null}
          <MultiChoiceChips<'BODYWEIGHT' | 'INACTIVE'>
            testID="exercises-filter-flags"
            label={t('exercises.equipment')}
            choices={[
              { value: 'BODYWEIGHT', label: t('exercises.bodyweightOnly') },
              { value: 'INACTIVE', label: t('exercises.showInactive') },
            ]}
            selected={[
              ...(filter.bodyweightOnly ? (['BODYWEIGHT'] as const) : []),
              ...(filter.includeInactive ? (['INACTIVE'] as const) : []),
            ]}
            onToggle={(flag) =>
              flag === 'BODYWEIGHT'
                ? set({ bodyweightOnly: !filter.bodyweightOnly })
                : set({ includeInactive: !filter.includeInactive })
            }
            selectedLabel={selectedLabel}
          />
          <MultiChoiceChips
            testID="exercises-filter-category"
            label={t('exercises.filterCategory')}
            choices={TRAINING_CATEGORIES.map((value) => ({ value, label: categoryLabel(t, value) }))}
            selected={filter.categories}
            onToggle={(value) => set({ categories: toggle(filter.categories, value) })}
            selectedLabel={selectedLabel}
          />
          <MultiChoiceChips
            testID="exercises-filter-area"
            label={t('exercises.filterArea')}
            choices={BODY_AREAS.map((value) => ({ value, label: areaLabel(t, value) }))}
            selected={filter.areas}
            onToggle={(value) => set({ areas: toggle(filter.areas, value) })}
            selectedLabel={selectedLabel}
          />
          <MultiChoiceChips
            testID="exercises-filter-muscle"
            label={t('exercises.filterMuscle')}
            choices={MUSCLE_GROUPS.map((value) => ({ value, label: muscleLabel(t, value) }))}
            selected={filter.muscles}
            onToggle={(value) => set({ muscles: toggle(filter.muscles, value) })}
            selectedLabel={selectedLabel}
          />
          <MultiChoiceChips
            testID="exercises-filter-difficulty"
            label={t('exercises.filterDifficulty')}
            choices={DIFFICULTIES.map((value) => ({ value, label: difficultyLabel(t, value) }))}
            selected={filter.difficulties}
            onToggle={(value) => set({ difficulties: toggle(filter.difficulties, value) })}
            selectedLabel={selectedLabel}
          />
          <MultiChoiceChips<SportKey>
            testID="exercises-filter-sport"
            label={t('exercises.filterSport')}
            choices={V1_ENABLED_SPORTS.map((value) => ({ value, label: sportLabel(t, value) }))}
            selected={filter.sports}
            onToggle={(value) => set({ sports: toggle(filter.sports, value) })}
            selectedLabel={selectedLabel}
          />
        </View>
      ) : null}

      <Text style={styles.count} testID="exercises-count">
        {t('exercises.count', { count: shown.length })}
      </Text>
      {shown.length === 0 ? (
        <Text style={styles.hint} testID="exercises-none">
          {t('exercises.none')}
        </Text>
      ) : (
        shown.map((exercise) => <Row key={exercise.id} exercise={exercise} />)
      )}

      <BigButton
        testID="exercises-add"
        label={t('exercises.add')}
        onPress={() => router.push(NEW_EXERCISE_PATH)}
      />
    </SafeAreaScrollView>
  );
}

function Row({ exercise }: { exercise: Exercise }) {
  const { t, language } = useI18n();
  const id = `exercise-${exercise.id}`;
  const name = exerciseName(exercise, language);
  const categories = exercise.categories.map((c) => categoryLabel(t, c)).join(' · ');
  const meta = [difficultyLabel(t, exercise.difficulty), equipmentSummary(t, exercise.equipment)].join(' · ');
  const style = measurementStyle(t, exercise.measurement);
  const details = [categories, meta, style, ...(exercise.active ? [] : [t('exercises.inactive')])].join(', ');
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={t('exercises.rowA11y', { name, details })}
      onPress={() => router.push(exercisePath(exercise.id))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <Text style={styles.name} testID={`${id}-name`}>
        {name}
      </Text>
      <Text style={styles.line} testID={`${id}-categories`}>
        {categories}
      </Text>
      <Text style={styles.muted} testID={`${id}-meta`}>
        {meta}
      </Text>
      <Text style={styles.muted} testID={`${id}-style`}>
        {style}
      </Text>
      {!exercise.active ? (
        <Text style={styles.inactive} testID={`${id}-inactive`}>
          {t('exercises.inactive')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { borderColor: colors.ink, borderWidth: 2 },
  pillLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  panel: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  count: { fontSize: 14, fontWeight: '700', color: colors.inkMuted, textAlign: 'auto' },
  row: {
    minHeight: touch.buttonMinHeight,
    gap: 2,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  line: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  inactive: { fontSize: 13, fontWeight: '800', color: colors.inkMuted, textAlign: 'auto' },
});
