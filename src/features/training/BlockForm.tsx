import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { readTaxonomy } from '@/data/local/taxonomy/taxonomyRepository';
import {
  createBlock,
  duplicateBlock,
  getBlock,
  setBlockActive,
  updateBlock,
  type BlockErrors,
  type WorkoutBlock,
} from '@/data/local/training/workoutRepository';
import { filterExercises, NO_EXERCISE_FILTER, type Exercise } from '@/domain/exercise/exercise';
import type { Taxonomy } from '@/domain/taxonomy/taxonomy';
import {
  defaultPrescription,
  parseEntry,
  targetApplies,
  WORKOUT_NAME_MAX_LENGTH,
  type Prescription,
  type PrescriptionErrors,
} from '@/domain/training/training';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { exerciseName, measurementStyle } from '@/features/exercises/exerciseLabels';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { useI18n } from '@/i18n/I18nProvider';
import { stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { addToWorkoutPath, blockPath, formatNumber, targetLabelKey } from './trainingLabels';

type Item = { exercise: Exercise; sets: string; target: string; load: string; rest: string };
type Values = { name: string; items: Item[] };

const text = (n: number | null) => (n === null ? '' : formatNumber(n));
const itemOf = (exercise: Exercise, p: Prescription): Item => ({
  exercise,
  sets: String(p.sets),
  target: text(p.target),
  load: text(p.loadKg),
  rest: text(p.restSec),
});
const key = (v: Values) =>
  JSON.stringify([v.name, v.items.map((i) => [i.exercise.id, i.sets, i.target, i.load, i.rest])]);

/** Typed text → number; empty → null; not a number → NaN (validation then names the field). */
function numberOf(value: string, time: boolean): number | null {
  if (value.trim() === '') return null;
  return parseEntry(value, time ? 'DURATION_S' : 'LOAD_KG') ?? NaN;
}
function prescriptionOf(item: Item): Prescription {
  const type = item.exercise.measurement.type;
  return {
    sets: numberOf(item.sets, false) ?? NaN,
    target: numberOf(item.target, type === 'DURATION' || type === 'TIME'),
    loadKg: numberOf(item.load, false),
    restSec: numberOf(item.rest, false),
  };
}

const NAME_ERRORS: Record<NonNullable<BlockErrors['name']>, TranslationKey> = {
  REQUIRED: 'training.errors.nameRequired',
  TOO_LONG: 'training.errors.nameTooLong',
  DUPLICATE: 'training.errors.nameDuplicate',
};
const FIELD_ERRORS: Record<keyof PrescriptionErrors, TranslationKey> = {
  sets: 'training.errors.setsInvalid',
  target: 'training.errors.targetInvalid',
  loadKg: 'training.errors.loadInvalid',
  restSec: 'training.errors.restInvalid',
};

/**
 * Create (no `blockId`) or edit a reusable workout block: a name and an
 * ordered list of exercises, each with its prescription. Editing never
 * changes anything already planned or performed. Leaving with changes asks
 * first; Save and Cancel leave on purpose.
 */
export function BlockForm({ blockId, exerciseId }: { blockId?: string; exerciseId?: string }) {
  const { boot } = useApp();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; exercises: Exercise[]; taxonomy: Taxonomy; block: WorkoutBlock | null }
  >({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready' || state.status === 'ready') return;
      let active = true;
      Promise.all([
        listExercises(boot.db),
        readTaxonomy(boot.db),
        blockId ? getBlock(boot.db, blockId) : Promise.resolve(null),
      ])
        .then(([exercises, taxonomy, block]) => {
          if (!active) return;
          setState(blockId && !block ? { status: 'error' } : { status: 'ready', exercises, taxonomy, block });
        })
        .catch((e: unknown) => {
          console.warn('[training] block load failed', e);
          if (active) setState({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, blockId, state.status]),
  );

  if (boot.status === 'error' || state.status === 'error') {
    return <ErrorScreen testID="block-form-error" message="training.errors.notFound" fallback="/workouts" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  // A NEW block can start with one Exercise (Exercise Details → Add to block → New block); only an ACTIVE one.
  const startExercise = !blockId && exerciseId ? (state.exercises.find((e) => e.id === exerciseId && e.active) ?? null) : null;
  return <Form exercises={state.exercises} taxonomy={state.taxonomy} block={state.block} startExercise={startExercise} />;
}

function Form({
  exercises,
  taxonomy,
  block,
  startExercise,
}: {
  exercises: Exercise[];
  taxonomy: Taxonomy;
  block: WorkoutBlock | null;
  startExercise: Exercise | null;
}) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const initial = useMemo<Values>(
    () => ({
      name: block?.name ?? '',
      items: block
        ? block.items.map((i) => itemOf(i.exercise, i.prescription))
        : startExercise
          ? [itemOf(startExercise, defaultPrescription(startExercise.measurement, startExercise.defaults))]
          : [],
    }),
    [block, startExercise],
  );
  const [values, setValues] = useState<Values>(initial);
  const [active, setActive] = useState(block?.active ?? true);
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const pickerData = useMemo(
    () => ({ exercises, taxonomy, activeIds: new Set(exercises.filter((e) => e.active).map((e) => e.id)) }),
    [exercises, taxonomy],
  );
  const [errors, setErrors] = useState<BlockErrors>({});
  const [failure, setFailure] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const guard = useUnsavedChangesGuard(key(values) !== key(initial));

  const matches = useMemo(
    () =>
      query.trim().length === 0
        ? []
        : filterExercises(exercises, { ...NO_EXERCISE_FILTER, query }, language).slice(0, 8),
    [exercises, query, language],
  );
  const setItem = (index: number, change: Partial<Item>) =>
    setValues((v) => ({
      ...v,
      items: v.items.map((item, i) => (i === index ? { ...item, ...change } : item)),
    }));
  const move = (index: number, by: -1 | 1) =>
    setValues((v) => {
      const items = [...v.items];
      const [item] = items.splice(index, 1);
      items.splice(index + by, 0, item!);
      return { ...v, items };
    });
  const remove = (index: number) =>
    setValues((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }));
  const add = (exercise: Exercise) => {
    setValues((v) => ({
      ...v,
      items: [...v.items, itemOf(exercise, defaultPrescription(exercise.measurement, exercise.defaults))],
    }));
    setQuery('');
  };

  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setFailure(false);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const input = {
        name: values.name,
        items: values.items.map((i) => ({ exerciseId: i.exercise.id, prescription: prescriptionOf(i) })),
      };
      const result = block
        ? await updateBlock(boot.db, block.id, input, { clock: services.clock })
        : await createBlock(boot.db, input, { ids: services.ids, clock: services.clock });
      if (result.ok) {
        guard.release();
        router.back();
        return;
      }
      setErrors(result.errors);
    } catch (e) {
      console.warn('[training] block save failed', e);
      setFailure(true);
    }
    busy.current = false;
    setSaving(false);
  };

  const dirty = key(values) !== key(initial);
  const duplicate = async () => {
    if (!block || busy.current || boot.status !== 'ready') return;
    busy.current = true;
    setSaving(true);
    setFailure(false);
    try {
      const copy = await duplicateBlock(boot.db, block.id, {
        ids: services.ids,
        clock: services.clock,
        copyLabel: t('training.copySuffix'),
      });
      if (copy.ok) {
        guard.release();
        router.replace(blockPath(copy.block.id)); // open the copy: the user can rename and adjust it
        return;
      }
      setErrors(copy.errors);
    } catch (e) {
      console.warn('[training] block duplicate failed', e);
      setFailure(true);
    }
    busy.current = false;
    setSaving(false);
  };

  const toggle = () => {
    if (!block || boot.status !== 'ready') return;
    const apply = (next: boolean) =>
      setBlockActive(boot.db, block.id, next, { clock: services.clock })
        .then((b) => setActive(b.active))
        .catch((e: unknown) => {
          console.warn('[training] block toggle failed', e);
          setFailure(true);
        });
    if (!active) {
      void apply(true);
      return;
    }
    Alert.alert(t('training.deactivateTitle', { name: block.name }), t('training.deactivateBody'), [
      { text: t('training.keepActive'), style: 'cancel' },
      { text: t('training.confirmInactive'), onPress: () => void apply(false) },
    ]);
  };

  return (
    <KeyboardSafeScrollView
      testID="block-form-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <TextField
        testID="block-form-name"
        label={t('training.name')}
        value={values.name}
        onChangeText={(name) => setValues((v) => ({ ...v, name }))}
        maxLength={Math.max(WORKOUT_NAME_MAX_LENGTH, initial.name.length)}
        error={errors.name ? t(NAME_ERRORS[errors.name], { max: WORKOUT_NAME_MAX_LENGTH }) : undefined}
      />
      {block ? (
        <Text style={styles.muted} testID="block-form-status">
          {t(active ? 'training.statusActive' : 'training.inactive')}
        </Text>
      ) : null}

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.exercisesInBlock')}
      </Text>
      {errors.items ? (
        <Text style={styles.error} testID="block-form-items-error">
          {t('training.errors.itemsRequired')}
        </Text>
      ) : null}
      {errors.inactiveItems ? (
        <Text style={styles.error} testID="block-form-inactive-error">
          {t('training.errors.inactiveItems')}
        </Text>
      ) : null}
      {values.items.map((item, index) => (
        <ItemEditor
          key={`${item.exercise.id}-${index}`}
          index={index}
          last={index === values.items.length - 1}
          item={item}
          errors={errors.itemErrors?.[index]}
          onChange={(change) => setItem(index, change)}
          onMove={(by) => move(index, by)}
          onRemove={() => remove(index)}
        />
      ))}

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.addExercise')}
      </Text>
      <BigButton
        testID="block-form-browse"
        variant="secondary"
        label={t('training.browse')}
        onPress={() => setBrowsing(true)}
      />
      <ExercisePicker
        visible={browsing}
        data={pickerData}
        onPick={(exercise) => {
          setBrowsing(false);
          add(exercise);
        }}
        onClose={() => setBrowsing(false)}
      />
      <TextField
        testID="block-form-search"
        label={t('training.searchExercise')}
        value={query}
        onChangeText={setQuery}
      />
      {query.trim().length === 0 ? (
        <Text style={styles.muted}>{t('training.searchHint')}</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.muted} testID="block-form-no-matches">
          {t('training.noMatches')}
        </Text>
      ) : (
        matches.map((exercise) => {
          const name = exerciseName(exercise, language);
          return (
            <Pressable
              key={exercise.id}
              testID={`block-form-add-${exercise.id}`}
              accessibilityRole="button"
              accessibilityLabel={stripBidi(t('training.addThis', { name }))}
              onPress={() => add(exercise)}
              style={({ pressed }) => [styles.match, pressed && { opacity: 0.8 }]}>
              <Text style={styles.matchName}>{name}</Text>
              <Text style={styles.muted}>{measurementStyle(t, exercise.measurement)}</Text>
            </Pressable>
          );
        })
      )}

      {failure ? (
        <Text style={styles.error} testID="block-form-failed">
          {t('training.saveFailed')}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <BigButton
          testID="block-form-save"
          label={saving ? t('training.saving') : t('training.save')}
          onPress={() => void save()}
          disabled={saving}
        />
        <BigButton
          testID="block-form-cancel"
          variant="secondary"
          label={t('training.cancel')}
          onPress={() => {
            guard.release();
            router.back();
          }}
          disabled={saving}
        />
        {block && active ? (
          <BigButton
            testID="block-form-add-to-workout"
            variant="secondary"
            label={t('training.assign.button')}
            onPress={() => router.push(addToWorkoutPath('BLOCK', block.id))}
            disabled={saving || dirty}
          />
        ) : null}
        {block && active ? (
          <BigButton
            testID="block-form-duplicate"
            variant="secondary"
            label={t('training.duplicate')}
            onPress={() => void duplicate()}
            disabled={saving || dirty}
          />
        ) : null}
        {block && active && dirty ? (
          <Text style={styles.muted} testID="block-form-duplicate-hint">
            {t('training.duplicateSaveFirst')}
          </Text>
        ) : null}
        {block ? (
          <BigButton
            testID="block-form-toggle"
            variant="secondary"
            label={t(active ? 'training.makeInactive' : 'training.makeActive')}
            onPress={toggle}
            disabled={saving}
          />
        ) : null}
      </View>
    </KeyboardSafeScrollView>
  );
}

function ItemEditor(props: {
  index: number;
  last: boolean;
  item: Item;
  errors: PrescriptionErrors | undefined;
  onChange: (change: Partial<Item>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t, language } = useI18n();
  const { item, index } = props;
  const id = `block-item-${index}`;
  const name = exerciseName(item.exercise, language);
  const measurement = item.exercise.measurement;
  const targetKey = targetApplies(measurement.type) ? targetLabelKey(measurement.type) : null;
  const err = (field: keyof PrescriptionErrors) => {
    const code = props.errors?.[field];
    if (!code) return undefined;
    return t(code === 'NOT_APPLICABLE' ? 'training.errors.targetNotApplicable' : FIELD_ERRORS[field]);
  };
  return (
    <View
      style={styles.item}
      testID={id}
      accessibilityLabel={stripBidi(t('training.itemA11y', { position: index + 1, name }))}>
      <Text style={styles.matchName} testID={`${id}-name`}>
        {name}
      </Text>
      <Text style={styles.muted}>{measurementStyle(t, measurement)}</Text>
      <TextField
        testID={`${id}-sets`}
        label={t('training.sets')}
        value={item.sets}
        onChangeText={(sets) => props.onChange({ sets })}
        keyboardType="number-pad"
        numeric
        error={err('sets')}
      />
      {targetKey ? (
        <TextField
          testID={`${id}-target`}
          label={`${t(targetKey)} · ${t('training.optional')}`}
          value={item.target}
          onChangeText={(target) => props.onChange({ target })}
          keyboardType="decimal-pad"
          numeric
          error={err('target')}
        />
      ) : null}
      {measurement.usesLoad ? (
        <TextField
          testID={`${id}-load`}
          label={`${t('training.load')} · ${t('training.optional')}`}
          value={item.load}
          onChangeText={(load) => props.onChange({ load })}
          keyboardType="decimal-pad"
          numeric
          error={err('loadKg')}
        />
      ) : null}
      <TextField
        testID={`${id}-rest`}
        label={`${t('training.rest')} · ${t('training.optional')}`}
        value={item.rest}
        onChangeText={(rest) => props.onChange({ rest })}
        keyboardType="number-pad"
        numeric
        error={err('restSec')}
      />
      <View style={styles.actions}>
        {index > 0 ? (
          <Small testID={`${id}-up`} label={t('training.moveUp')} onPress={() => props.onMove(-1)} />
        ) : null}
        {!props.last ? (
          <Small testID={`${id}-down`} label={t('training.moveDown')} onPress={() => props.onMove(1)} />
        ) : null}
        <Small testID={`${id}-remove`} label={t('training.remove')} onPress={props.onRemove} />
      </View>
    </View>
  );
}

export function Small({ testID, label, a11yLabel, onPress }: { testID: string; label: string; a11yLabel?: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.small, pressed && { opacity: 0.8 }]}>
      <Text style={styles.smallLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto', marginTop: spacing.sm },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  item: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  match: {
    minHeight: touch.buttonMinHeight,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  matchName: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  small: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  smallLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  buttons: { gap: spacing.sm },
});
