import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { readTaxonomy } from '@/data/local/taxonomy/taxonomyRepository';
import {
  createTemplate,
  getTemplate,
  listBlocks,
  setTemplateActive,
  updateTemplate,
  type TemplateErrors,
  type WorkoutBlock,
  type WorkoutTemplate,
} from '@/data/local/training/workoutRepository';
import type { Exercise } from '@/domain/exercise/exercise';
import { isVisible, type Taxonomy } from '@/domain/taxonomy/taxonomy';
import {
  addCategory,
  MAX_TEMPLATE_CATEGORIES,
  NO_CLASSIFICATION,
  removeCategory,
  setPrimary,
  type TemplateClassification,
} from '@/domain/taxonomy/templateClassification';
import { WORKOUT_NAME_MAX_LENGTH } from '@/domain/training/training';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { CategoryPicker } from '@/features/exercises/ExercisePicker';
import { pathLabel } from '@/features/exercises/taxonomyLabels';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { useI18n } from '@/i18n/I18nProvider';
import { stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { Small } from './BlockForm';

type Values = { name: string; blocks: WorkoutBlock[]; classification: TemplateClassification };
const key = (v: Values) =>
  JSON.stringify([v.name, v.blocks.map((b) => b.id), v.classification.nodeKeys, v.classification.primary]);

const CATEGORY_ERRORS: Record<NonNullable<TemplateErrors['categories']>, TranslationKey> = {
  TOO_MANY: 'training.errors.categoriesTooMany',
  DUPLICATE: 'training.errors.categoriesDuplicate',
  PRIMARY_NOT_SELECTED: 'training.errors.categoriesPrimary',
  NOT_SELECTABLE: 'training.errors.categoriesNotSelectable',
};

const NAME_ERRORS: Record<NonNullable<TemplateErrors['name']>, TranslationKey> = {
  REQUIRED: 'training.errors.nameRequired',
  TOO_LONG: 'training.errors.nameTooLong',
  DUPLICATE: 'training.errors.nameDuplicate',
};

/**
 * Create (no `templateId`) or edit a reusable workout template: a name and
 * an ordered list of blocks (a block may appear more than once). Editing
 * never changes a planned workout — plans keep their own snapshot.
 */
export function TemplateForm({ templateId }: { templateId?: string }) {
  const { boot } = useApp();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | {
        status: 'ready';
        blocks: WorkoutBlock[];
        template: WorkoutTemplate | null;
        exercises: Exercise[];
        taxonomy: Taxonomy;
      }
  >({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready' || state.status === 'ready') return;
      let active = true;
      Promise.all([
        listBlocks(boot.db),
        templateId ? getTemplate(boot.db, templateId) : Promise.resolve(null),
        listExercises(boot.db),
        readTaxonomy(boot.db),
      ])
        .then(([blocks, template, exercises, taxonomy]) => {
          if (!active) return;
          setState(
            templateId && !template
              ? { status: 'error' }
              : { status: 'ready', blocks, template, exercises, taxonomy },
          );
        })
        .catch((e: unknown) => {
          console.warn('[training] template load failed', e);
          if (active) setState({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, templateId, state.status]),
  );

  if (boot.status === 'error' || state.status === 'error') {
    return (
      <ErrorScreen testID="template-form-error" message="training.errors.notFound" fallback="/workouts" />
    );
  }
  if (state.status === 'loading') return <LoadingScreen />;
  return (
    <Form blocks={state.blocks} template={state.template} exercises={state.exercises} taxonomy={state.taxonomy} />
  );
}

function Form({
  blocks,
  template,
  exercises,
  taxonomy,
}: {
  blocks: WorkoutBlock[];
  template: WorkoutTemplate | null;
  exercises: Exercise[];
  taxonomy: Taxonomy;
}) {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const initial = useMemo<Values>(
    () => ({
      name: template?.name ?? '',
      blocks: template ? [...template.blocks] : [],
      classification: template?.classification ?? NO_CLASSIFICATION,
    }),
    [template],
  );
  const [choosing, setChoosing] = useState(false);
  const pickerData = useMemo(
    () => ({ exercises, taxonomy, activeIds: new Set(exercises.filter((e) => e.active).map((e) => e.id)) }),
    [exercises, taxonomy],
  );
  const pathOf = (nodeKey: string) =>
    pathLabel(
      t,
      taxonomy.path(nodeKey).map((n) => n.key),
    );

  const [values, setValues] = useState<Values>(initial);
  const [active, setActive] = useState(template?.active ?? true);
  const [errors, setErrors] = useState<TemplateErrors>({});
  const [failure, setFailure] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const guard = useUnsavedChangesGuard(key(values) !== key(initial));
  const available = blocks.filter((b) => b.active);
  const classification = values.classification;
  const setClassification = (next: TemplateClassification) => setValues((v) => ({ ...v, classification: next }));
  const full = classification.nodeKeys.length >= MAX_TEMPLATE_CATEGORIES;

  const move = (index: number, by: -1 | 1) =>
    setValues((v) => {
      const list = [...v.blocks];
      const [block] = list.splice(index, 1);
      list.splice(index + by, 0, block!);
      return { ...v, blocks: list };
    });

  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setFailure(false);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const input = {
        name: values.name,
        blockIds: values.blocks.map((b) => b.id),
        classification: values.classification,
      };
      const result = template
        ? await updateTemplate(boot.db, template.id, input, { clock: services.clock })
        : await createTemplate(boot.db, input, { ids: services.ids, clock: services.clock });
      if (result.ok) {
        guard.release();
        router.back();
        return;
      }
      setErrors(result.errors);
    } catch (e) {
      console.warn('[training] template save failed', e);
      setFailure(true);
    }
    busy.current = false;
    setSaving(false);
  };

  const toggle = () => {
    if (!template || boot.status !== 'ready') return;
    const apply = (next: boolean) =>
      setTemplateActive(boot.db, template.id, next, { clock: services.clock })
        .then((x) => setActive(x.active))
        .catch((e: unknown) => {
          console.warn('[training] template toggle failed', e);
          setFailure(true);
        });
    if (!active) {
      void apply(true);
      return;
    }
    Alert.alert(t('training.deactivateTitle', { name: template.name }), t('training.deactivateBody'), [
      { text: t('training.keepActive'), style: 'cancel' },
      { text: t('training.confirmInactive'), onPress: () => void apply(false) },
    ]);
  };

  return (
    <KeyboardSafeScrollView
      testID="template-form-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <TextField
        testID="template-form-name"
        label={t('training.name')}
        value={values.name}
        onChangeText={(name) => setValues((v) => ({ ...v, name }))}
        maxLength={Math.max(WORKOUT_NAME_MAX_LENGTH, initial.name.length)}
        error={errors.name ? t(NAME_ERRORS[errors.name], { max: WORKOUT_NAME_MAX_LENGTH }) : undefined}
      />
      {template ? (
        <Text style={styles.muted} testID="template-form-status">
          {t(active ? 'training.statusActive' : 'training.inactive')}
        </Text>
      ) : null}

      <Text style={styles.heading} accessibilityRole="header" testID="template-form-categories-title">
        {t('training.categories')}
      </Text>
      <Text style={styles.muted}>{t('training.categoriesHint')}</Text>
      {errors.categories ? (
        <Text style={styles.error} testID="template-form-categories-error">
          {t(CATEGORY_ERRORS[errors.categories])}
        </Text>
      ) : null}
      <View style={styles.categories} testID="template-form-categories">
        {classification.nodeKeys.length === 0 ? (
          <Text style={styles.muted} testID="template-form-categories-none">
            {t('training.noCategoriesYet')}
          </Text>
        ) : null}
        {classification.nodeKeys.map((nodeKey) => {
          const id = `template-form-category-${nodeKey}`;
          const path = pathOf(nodeKey);
          const isPrimary = classification.primary === nodeKey;
          const selectable = isVisible(taxonomy, nodeKey, pickerData.activeIds);
          return (
            <View key={nodeKey} style={styles.card} testID={id}>
              <Text style={styles.name} testID={`${id}-label`}>
                {path}
              </Text>
              {!selectable ? (
                <Text style={styles.muted} testID={`${id}-inactive`}>
                  {t('training.categoryUnavailable')}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  testID={`${id}-primary`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isPrimary }}
                  accessibilityLabel={stripBidi(t('training.primaryA11y', { path }))}
                  onPress={() => setClassification(setPrimary(classification, isPrimary ? null : nodeKey))}
                  style={[styles.pill, isPrimary && styles.pillActive]}>
                  <Text style={styles.pillLabel}>{isPrimary ? t('training.primaryChosen') : t('training.primary')}</Text>
                </Pressable>
                <Small
                  testID={`${id}-remove`}
                  label={t('training.removeCategory')}
                  onPress={() => setClassification(removeCategory(classification, nodeKey))}
                />
              </View>
            </View>
          );
        })}
        <Text style={styles.muted} testID="template-form-primary">
          {classification.primary
            ? t('training.primaryIs', { path: pathOf(classification.primary) })
            : t('training.primaryNone')}
        </Text>
        <BigButton
          testID="template-form-add-category"
          variant="secondary"
          label={t('training.addCategory')}
          onPress={() => setChoosing(true)}
          disabled={full}
        />
        {full ? (
          <Text style={styles.muted} testID="template-form-categories-max">
            {t('training.categoriesMax')}
          </Text>
        ) : null}
      </View>
      <CategoryPicker
        visible={choosing}
        data={pickerData}
        choose={{
          unavailable: (nodeKey) => (classification.nodeKeys.includes(nodeKey) ? t('taxonomy.alreadyAdded') : null),
          onChoose: (nodeKey) => {
            setChoosing(false);
            setClassification(addCategory(classification, nodeKey));
          },
        }}
        onClose={() => setChoosing(false)}
      />

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.blocksInTemplate')}
      </Text>
      {errors.blocks ? (
        <Text style={styles.error} testID="template-form-blocks-error">
          {t('training.errors.blocksRequired')}
        </Text>
      ) : null}
      {values.blocks.map((block, index) => {
        const id = `template-block-${index}`;
        return (
          <View
            key={`${block.id}-${index}`}
            style={styles.card}
            testID={id}
            accessibilityLabel={stripBidi(t('training.itemA11y', { position: index + 1, name: block.name }))}>
            <Text style={styles.name} testID={`${id}-name`}>
              {block.name}
            </Text>
            <Text style={styles.muted}>{t('training.blockSummary', { count: block.items.length })}</Text>
            <View style={styles.actions}>
              {index > 0 ? (
                <Small testID={`${id}-up`} label={t('training.moveUp')} onPress={() => move(index, -1)} />
              ) : null}
              {index < values.blocks.length - 1 ? (
                <Small testID={`${id}-down`} label={t('training.moveDown')} onPress={() => move(index, 1)} />
              ) : null}
              <Small
                testID={`${id}-remove`}
                label={t('training.remove')}
                onPress={() => setValues((v) => ({ ...v, blocks: v.blocks.filter((_, i) => i !== index) }))}
              />
            </View>
          </View>
        );
      })}

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.addBlock')}
      </Text>
      {available.length === 0 ? (
        <Text style={styles.muted} testID="template-form-no-blocks">
          {t('training.noActiveBlocks')}
        </Text>
      ) : (
        available.map((block) => (
          <Pressable
            key={block.id}
            testID={`template-form-add-${block.id}`}
            accessibilityRole="button"
            accessibilityLabel={stripBidi(t('training.addThis', { name: block.name }))}
            onPress={() => setValues((v) => ({ ...v, blocks: [...v.blocks, block] }))}
            style={({ pressed }) => [styles.match, pressed && { opacity: 0.8 }]}>
            <Text style={styles.name}>{block.name}</Text>
            <Text style={styles.muted}>{t('training.blockSummary', { count: block.items.length })}</Text>
          </Pressable>
        ))
      )}

      {failure ? (
        <Text style={styles.error} testID="template-form-failed">
          {t('training.saveFailed')}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <BigButton
          testID="template-form-save"
          label={saving ? t('training.saving') : t('training.save')}
          onPress={() => void save()}
          disabled={saving}
        />
        <BigButton
          testID="template-form-cancel"
          variant="secondary"
          label={t('training.cancel')}
          onPress={() => {
            guard.release();
            router.back();
          }}
          disabled={saving}
        />
        {template ? (
          <BigButton
            testID="template-form-toggle"
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

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto', marginTop: spacing.sm },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  card: {
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
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm },
  categories: { gap: spacing.sm },
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
});
