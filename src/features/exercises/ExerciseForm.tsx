import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  createCustomExercise,
  getExercise,
  updateCustomExercise,
} from '@/data/local/exercises/exerciseRepository';
import { COMPARISON_POLICIES, defaultComparisonPolicy, type ComparisonPolicy } from '@/domain/comparison';
import { EQUIPMENT, type EquipmentId } from '@/domain/exercise/equipment';
import {
  EXERCISE_INSTRUCTIONS_MAX_LENGTH,
  EXERCISE_NAME_MAX_LENGTH,
  loadApplies,
  type CustomExerciseErrors,
  type CustomExerciseInput,
  type Exercise,
} from '@/domain/exercise/exercise';
import {
  DIFFICULTIES,
  MUSCLE_GROUPS,
  TRAINING_CATEGORIES,
  type Difficulty,
} from '@/domain/exercise/taxonomy';
import { MEASUREMENT_TYPES, type MeasurementType } from '@/domain/measurement';
import { V1_ENABLED_SPORTS } from '@/domain/sport';
import { useApp } from '@/features/AppProvider';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { isFormDirty } from '@/features/navigation/formDirty';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { MultiChoiceChips } from '@/ui/MultiChoiceChips';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

import {
  categoryLabel,
  comparisonLabel,
  difficultyLabel,
  equipmentLabel,
  measurementTypeLabel,
  muscleLabel,
} from './exerciseLabels';

/** What the form edits (flat, so the unsaved-changes check compares field by field). */
type Values = {
  name: string;
  categories: string;
  primary: string;
  secondary: string;
  difficulty: Difficulty | null;
  sports: string;
  needed: string;
  alternative: string;
  measurementType: MeasurementType | null;
  comparison: ComparisonPolicy | null;
  usesLoad: boolean;
  instructions: string;
  tutorialUrl: string;
};
const list = (joined: string) => (joined.length === 0 ? [] : joined.split(','));
const join = (values: readonly string[]) => values.join(',');
const toggleIn = (joined: string, value: string) => {
  const values = list(joined);
  return join(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
};

const EMPTY: Values = {
  name: '',
  categories: '',
  primary: '',
  secondary: '',
  difficulty: null,
  sports: '',
  needed: '',
  alternative: '',
  measurementType: null,
  comparison: null,
  usesLoad: false,
  instructions: '',
  tutorialUrl: '',
};

function valuesOf(exercise: Exercise): Values {
  return {
    name: exercise.name.en,
    categories: join(exercise.categories),
    primary: join(exercise.primaryMuscles),
    secondary: join(exercise.secondaryMuscles),
    difficulty: exercise.difficulty,
    sports: join(exercise.sports),
    needed: join(exercise.equipment[0] ?? []),
    alternative: join(exercise.equipment[1] ?? []),
    measurementType: exercise.measurement.type,
    comparison: exercise.measurement.comparison,
    usesLoad: exercise.measurement.usesLoad,
    instructions: exercise.instructions?.en ?? '',
    tutorialUrl: exercise.tutorialUrl ?? '',
  };
}

function inputOf(values: Values): CustomExerciseInput {
  const options = [list(values.needed), list(values.alternative)].filter((option) => option.length > 0);
  return {
    name: values.name,
    categories: list(values.categories),
    primaryMuscles: list(values.primary),
    secondaryMuscles: list(values.secondary),
    difficulty: values.difficulty,
    sports: list(values.sports),
    equipment: options,
    measurementType: values.measurementType,
    comparison: values.comparison,
    usesLoad: values.usesLoad && values.measurementType !== null && loadApplies(values.measurementType),
    instructions: values.instructions,
    tutorialUrl: values.tutorialUrl,
  };
}

const ERRORS: {
  [K in keyof CustomExerciseErrors]-?: Partial<Record<NonNullable<CustomExerciseErrors[K]>, TranslationKey>>;
} = {
  name: {
    REQUIRED: 'exercises.errors.nameRequired',
    TOO_LONG: 'exercises.errors.nameTooLong',
    DUPLICATE: 'exercises.errors.nameDuplicate',
  },
  categories: {
    REQUIRED: 'exercises.errors.categoriesRequired',
    UNKNOWN_CODE: 'exercises.errors.invalidValue',
  },
  primaryMuscles: {
    REQUIRED: 'exercises.errors.primaryRequired',
    UNKNOWN_CODE: 'exercises.errors.invalidValue',
  },
  secondaryMuscles: {
    OVERLAPS_PRIMARY: 'exercises.errors.secondaryOverlaps',
    UNKNOWN_CODE: 'exercises.errors.invalidValue',
  },
  difficulty: { REQUIRED: 'exercises.errors.difficultyRequired' },
  sports: { UNKNOWN_CODE: 'exercises.errors.invalidValue' },
  equipment: { UNKNOWN_CODE: 'exercises.errors.invalidValue', EMPTY_OPTION: 'exercises.errors.invalidValue' },
  measurementType: { REQUIRED: 'exercises.errors.measurementRequired' },
  comparison: {
    REQUIRED: 'exercises.errors.comparisonRequired',
    UNKNOWN_CODE: 'exercises.errors.invalidValue',
  },
  usesLoad: { NOT_FOR_TYPE: 'exercises.errors.loadNotForType' },
  instructions: { TOO_LONG: 'exercises.errors.instructionsTooLong' },
  tutorialUrl: { INVALID_URL: 'exercises.errors.invalidUrl' },
};
function messageFor<K extends keyof CustomExerciseErrors>(
  errors: CustomExerciseErrors,
  key: K,
): TranslationKey | undefined {
  const code = errors[key];
  return code === undefined ? undefined : (ERRORS[key] as Record<string, TranslationKey>)[code as string];
}

/**
 * Create (no `exerciseId`) or edit a custom exercise. The name is the
 * user's own text (never translated). Leaving with changes asks first
 * (NAV-DIRTY-001); Save releases the guard; Cancel discards on purpose.
 * Built-in exercises are not editable (the screen shows not-found for them).
 */
export function ExerciseForm({ exerciseId }: { exerciseId?: string }) {
  const { boot } = useApp();
  const [initial, setInitial] = useState<Values | 'loading' | 'error'>(exerciseId ? 'loading' : EMPTY);

  useFocusEffect(
    useCallback(() => {
      if (!exerciseId || boot.status !== 'ready') return;
      let active = true;
      getExercise(boot.db, exerciseId)
        .then((exercise) => {
          if (active) setInitial(exercise && !exercise.builtin ? valuesOf(exercise) : 'error');
        })
        .catch((e: unknown) => {
          console.warn('[exercises] form load failed', e);
          if (active) setInitial('error');
        });
      return () => {
        active = false;
      };
    }, [boot, exerciseId]),
  );

  if (boot.status === 'error' || initial === 'error') {
    return <ErrorScreen testID="exercise-form-error" message="exercises.notFound" fallback="/exercises" />;
  }
  if (initial === 'loading') return <LoadingScreen />;
  return <Form initial={initial} exerciseId={exerciseId} />;
}

function Form({ initial, exerciseId }: { initial: Values; exerciseId?: string }) {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<CustomExerciseErrors>({});
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInProgress = useRef(false);
  const guard = useUnsavedChangesGuard(isFormDirty(values, initial));
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const selectedLabel = (label: string) => t('exercises.selectedChip', { label });
  const message = (key: keyof CustomExerciseErrors) => {
    const k = messageFor(errors, key);
    return k ? t(k) : undefined;
  };
  const needsComparison =
    values.measurementType !== null && defaultComparisonPolicy(values.measurementType) === null;

  const save = async () => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const input = inputOf(values);
      const result = exerciseId
        ? await updateCustomExercise(boot.db, exerciseId, input, { clock: services.clock })
        : await createCustomExercise(boot.db, input, { ids: services.ids, clock: services.clock });
      if (result.ok) {
        guard.release(); // saved: leaving is safe
        router.back();
        return; // stays guarded: the screen is leaving
      }
      setErrors(result.errors);
    } catch (e) {
      console.warn('[exercises] save failed', e);
      setSaveError(true);
    }
    saveInProgress.current = false;
    setSaving(false);
  };

  return (
    <KeyboardSafeScrollView
      testID="exercise-form-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <TextField
        testID="exercise-form-name"
        label={t('exercises.name')}
        value={values.name}
        onChangeText={(name) => set('name', name)}
        maxLength={Math.max(EXERCISE_NAME_MAX_LENGTH, initial.name.length)}
        error={message('name')}
      />
      <Text style={styles.hint}>{t('exercises.nameHint')}</Text>
      <MultiChoiceChips
        testID="exercise-form-categories"
        label={t('exercises.categories')}
        choices={TRAINING_CATEGORIES.map((value) => ({ value, label: categoryLabel(t, value) }))}
        selected={list(values.categories)}
        onToggle={(value) => set('categories', toggleIn(values.categories, value))}
        selectedLabel={selectedLabel}
        error={message('categories')}
      />
      <ChoiceChips<Difficulty>
        testID="exercise-form-difficulty"
        label={t('exercises.difficulty')}
        choices={DIFFICULTIES.map((value) => ({ value, label: difficultyLabel(t, value) }))}
        value={values.difficulty}
        onChange={(difficulty) => set('difficulty', difficulty)}
        error={message('difficulty')}
      />
      <MultiChoiceChips
        testID="exercise-form-primary"
        label={t('exercises.primary')}
        choices={MUSCLE_GROUPS.map((value) => ({ value, label: muscleLabel(t, value) }))}
        selected={list(values.primary)}
        onToggle={(value) => set('primary', toggleIn(values.primary, value))}
        selectedLabel={selectedLabel}
        error={message('primaryMuscles')}
      />
      <MultiChoiceChips
        testID="exercise-form-secondary"
        label={t('exercises.secondary')}
        choices={MUSCLE_GROUPS.map((value) => ({ value, label: muscleLabel(t, value) }))}
        selected={list(values.secondary)}
        onToggle={(value) => set('secondary', toggleIn(values.secondary, value))}
        selectedLabel={selectedLabel}
        error={message('secondaryMuscles')}
      />
      <MultiChoiceChips
        testID="exercise-form-sports"
        label={t('exercises.sports')}
        choices={V1_ENABLED_SPORTS.map((value) => ({ value, label: sportLabel(t, value) }))}
        selected={list(values.sports)}
        onToggle={(value) => set('sports', toggleIn(values.sports, value))}
        selectedLabel={selectedLabel}
      />
      <MultiChoiceChips<EquipmentId>
        testID="exercise-form-equipment"
        label={t('exercises.equipmentNeeded')}
        choices={EQUIPMENT.map((value) => ({ value, label: equipmentLabel(t, value) }))}
        selected={list(values.needed) as EquipmentId[]}
        onToggle={(value) => set('needed', toggleIn(values.needed, value))}
        selectedLabel={selectedLabel}
        error={message('equipment')}
      />
      {list(values.needed).length > 0 ? (
        <MultiChoiceChips<EquipmentId>
          testID="exercise-form-alternative"
          label={t('exercises.equipmentAlternative')}
          choices={EQUIPMENT.map((value) => ({ value, label: equipmentLabel(t, value) }))}
          selected={list(values.alternative) as EquipmentId[]}
          onToggle={(value) => set('alternative', toggleIn(values.alternative, value))}
          selectedLabel={selectedLabel}
        />
      ) : (
        <Text style={styles.hint} testID="exercise-form-no-equipment">
          {t('exercises.noEquipment')}
        </Text>
      )}
      <ChoiceChips<MeasurementType>
        testID="exercise-form-measurement"
        label={t('exercises.measurementType')}
        choices={MEASUREMENT_TYPES.map((value) => ({ value, label: measurementTypeLabel(t, value) }))}
        value={values.measurementType}
        onChange={(type) => {
          set('measurementType', type);
          if (type !== null && !loadApplies(type)) set('usesLoad', false);
        }}
        error={message('measurementType')}
      />
      {needsComparison ? (
        <ChoiceChips<ComparisonPolicy>
          testID="exercise-form-comparison"
          label={t('exercises.comparison')}
          choices={COMPARISON_POLICIES.filter((p) => p !== 'CUSTOM').map((value) => ({
            value,
            label: comparisonLabel(t, value),
          }))}
          value={values.comparison}
          onChange={(comparison) => set('comparison', comparison)}
          error={message('comparison')}
        />
      ) : null}
      {values.measurementType !== null && loadApplies(values.measurementType) ? (
        <ChoiceChips<'LOAD'>
          testID="exercise-form-load"
          label={t('exercises.usesLoad')}
          choices={[{ value: 'LOAD', label: t('exercises.usesLoad') }]}
          value={values.usesLoad ? 'LOAD' : null}
          onChange={(value) => set('usesLoad', value !== null)}
          error={message('usesLoad')}
        />
      ) : null}
      <TextField
        testID="exercise-form-instructions"
        label={t('exercises.instructions')}
        value={values.instructions}
        onChangeText={(text) => set('instructions', text)}
        multiline
        visibleLines={4}
        maxLength={EXERCISE_INSTRUCTIONS_MAX_LENGTH}
        error={message('instructions')}
      />
      <TextField
        testID="exercise-form-tutorial"
        label={t('exercises.tutorialUrl')}
        value={values.tutorialUrl}
        onChangeText={(url) => set('tutorialUrl', url)}
        keyboardType="url"
        error={message('tutorialUrl')}
      />
      {saveError ? (
        <Text style={styles.error} testID="exercise-form-save-error">
          {t('exercises.saveFailed')}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <BigButton
          testID="exercise-form-save"
          label={saving ? t('exercises.saving') : t('exercises.save')}
          onPress={() => void save()}
          disabled={saving}
        />
        <BigButton
          testID="exercise-form-cancel"
          variant="secondary"
          label={t('exercises.cancel')}
          onPress={() => {
            guard.release(); // Cancel discards on purpose (the accepted form behaviour)
            router.back();
          }}
          disabled={saving}
        />
      </View>
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  hint: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  buttons: { gap: spacing.sm },
});
