import type { TimeSemantics } from '@/domain/exercise/timeSemantics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { readTaxonomy } from '@/data/local/taxonomy/taxonomyRepository';
import {
  savePlannedWorkout,
  type SaveEntry,
  type SavePlanErrors,
} from '@/data/local/training/plannedWorkoutCompositionRepository';
import { getPlannedWorkout, snapshotOf, type PlannedWorkout } from '@/data/local/training/trainingRepository';
import { listBlocks, type WorkoutBlock } from '@/data/local/training/workoutRepository';
import { filterExercises, NO_EXERCISE_FILTER, type Exercise } from '@/domain/exercise/exercise';
import type { Taxonomy } from '@/domain/taxonomy/taxonomy';
import { groupEntries } from '@/domain/training/composition';
import { dropIndex, moveInList } from '@/domain/training/reorder';
import {
  defaultPrescription,
  parseEntry,
  targetApplies,
  WORKOUT_NAME_MAX_LENGTH,
  type ExerciseSnapshot,
  type Prescription,
  type PrescriptionErrors,
} from '@/domain/training/training';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { exerciseName, measurementStyle } from '@/features/exercises/exerciseLabels';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { PlayerTargetLabel, RequireActivePlayer, RoutePlayerScope } from '@/features/players/ActivePlayerContext';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate, stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { BottomInsetHandledContext } from '@/ui/bottomInset';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { Small } from './BlockForm';
import {
  blockEntryOf,
  exerciseEntryOf,
  itemOf,
  prescriptionOf,
  reorderedItems,
  seedEntry,
  signature,
  toSaveEntries,
  type DEntry,
  type DItem,
  type Seed,
} from './builderDraft';
import { DragHandle } from './DragHandle';
import { prescriptionText, targetLabelKey, trainingErrorMessage } from './trainingLabels';

export type { Seed } from './builderDraft';

/**
 * QB-WORKOUT-BUILDER-001B — the Workout Builder. The Player's workout is composed in a LOCAL DRAFT: opening it (or
 * cancelling) never creates a database row; a valid composition is persisted by ONE atomic Save. A copied Block
 * is its own section (the same Block may be added twice), standalone Exercises sit between sections, the order is
 * exactly what the user sees, and prescriptions are edited for THIS workout only (the source Block is never read
 * back). A plan whose session already exists is shown read-only (the v17 freeze rule is also enforced below the UI).
 */

const FIELD_ERRORS: Record<keyof PrescriptionErrors, TranslationKey> = {
  sets: 'training.errors.setsInvalid',
  target: 'training.errors.targetInvalid',
  loadKg: 'training.errors.loadInvalid',
  restSec: 'training.errors.restInvalid',
};

type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; exercises: Exercise[]; taxonomy: Taxonomy; blocks: WorkoutBlock[]; plan: PlannedWorkout | null };

/** Route entry: the Player is the route's (an archived / missing Player gets the usual "no Player" screen). */
export function WorkoutBuilderScreen({ playerId, planId, seed }: { playerId: string; planId?: string; seed?: Seed }) {
  return (
    <RoutePlayerScope playerId={playerId}>
      <RequireActivePlayer>
        <BuilderLoader playerId={playerId} planId={planId} seed={seed} />
      </RequireActivePlayer>
    </RoutePlayerScope>
  );
}

function BuilderLoader({ playerId, planId, seed }: { playerId: string; planId?: string; seed?: Seed }) {
  const { boot } = useApp();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready' || state.status === 'ready') return;
      let active = true;
      Promise.all([
        listExercises(boot.db),
        readTaxonomy(boot.db),
        listBlocks(boot.db),
        planId ? getPlannedWorkout(boot.db, planId) : Promise.resolve(null),
      ])
        .then(([exercises, taxonomy, blocks, plan]) => {
          if (!active) return;
          // a plan that does not exist, or belongs to another Player, is never opened under this Player
          const missing = planId !== undefined && (plan === null || plan.playerId !== playerId);
          setState(missing ? { status: 'error' } : { status: 'ready', exercises, taxonomy, blocks, plan });
        })
        .catch((e: unknown) => {
          console.warn('[training] builder load failed', e);
          if (active) setState({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, playerId, planId, state.status]),
  );
  if (boot.status === 'error' || state.status === 'error') {
    return <ErrorScreen testID="builder-error" message="training.errors.notFound" fallback="/children" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  return <Builder playerId={playerId} seed={planId ? undefined : seed} {...state} />;
}

function Builder({
  playerId,
  seed,
  exercises,
  taxonomy,
  blocks,
  plan,
}: {
  playerId: string;
  seed: Seed | undefined;
  exercises: Exercise[];
  taxonomy: Taxonomy;
  blocks: WorkoutBlock[];
  plan: PlannedWorkout | null;
}) {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const counter = useRef(0);
  const nextKey = () => `e${counter.current++}`;
  const seeded = useMemo(() => (plan === null && seed ? seedEntry(seed, exercises, blocks) : null), [plan, seed, exercises, blocks]);
  const seedMissing = plan === null && seed !== undefined && seeded === null;
  const initialEntries = useMemo<DEntry[]>(
    () =>
      plan === null
        ? seeded === null ? [] : [seeded]
        : groupEntries(plan.items).map((e): DEntry =>
            e.kind === 'SECTION'
              ? { key: `k${e.items[0]!.position}`, kind: 'SECTION', name: e.blockName, origin: { type: 'KEEP', positions: e.items.map((i) => i.position) }, items: e.items.map((i) => itemOf(i.exercise, i.prescription)) }
              : { key: `k${e.item.position}`, kind: 'EXERCISE', name: null, origin: { type: 'KEEP', positions: [e.item.position] }, items: [itemOf(e.item.exercise, e.item.prescription)] },
          ),
    [plan, seeded],
  );
  const initialName = plan?.name ?? t('training.builder.defaultName');
  const [name, setName] = useState(initialName);
  const [entries, setEntries] = useState<DEntry[]>(initialEntries);
  const [errors, setErrors] = useState<SavePlanErrors>({});
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const busy = useRef(false);
  const readOnly = plan !== null && plan.sessionId !== null;
  const dirty = signature(name, entries) !== signature(initialName, initialEntries);
  const guard = useUnsavedChangesGuard(dirty && !readOnly);
  const canSave = !readOnly && entries.length > 0 && name.trim().length > 0 && !saving;

  const change = (key: string, itemIndex: number, patch: Partial<DItem>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, items: e.items.map((i, n) => (n === itemIndex ? { ...i, ...patch } : i)) } : e)));
  const moveTo = (from: number, to: number) => setEntries((list) => moveInList(list, from, to) ?? list);
  const move = (index: number, by: -1 | 1) => moveTo(index, index + by);
  const moveItem = (key: string, from: number, to: number) =>
    setEntries((list) => list.map((e) => (e.key === key ? reorderedItems(e, from, to) : e)));
  // Drag: the dragged row follows the finger; the measured rows decide where it is dropped.
  const rows = useRef<{ y: number; height: number }[]>([]);
  const [dragging, setDragging] = useState<{ index: number; dy: number } | null>(null);
  const remove = (key: string) => setEntries((list) => list.filter((e) => e.key !== key));
  const addBlock = (block: WorkoutBlock) => {
    setEntries((list) => [...list, blockEntryOf(nextKey(), block)]);
    setBlockOpen(false);
  };
  const addExercise = (exercise: Exercise) => {
    setEntries((list) => [...list, exerciseEntryOf(nextKey(), exercise)]);
    setExerciseOpen(false);
    setBrowsing(false);
  };

  const save = async () => {
    if (busy.current || !canSave || boot.status !== 'ready') return;
    busy.current = true;
    setSaving(true);
    setFailure(null);
    setErrors({});
    try {
      const result = await savePlannedWorkout(
        boot.db,
        { planId: plan?.id ?? null, playerId, name, entries: toSaveEntries(entries) },
        { ids: services.ids, clock: services.clock },
      );
      if (result.ok) {
        guard.release();
        router.back();
        return;
      }
      setErrors(result.errors);
    } catch (e) {
      console.warn('[training] builder save failed', e);
      setFailure(trainingErrorMessage(e));
    }
    busy.current = false;
    setSaving(false);
  };

  const pickerData = useMemo(() => ({ exercises, taxonomy, activeIds: new Set(exercises.filter((e) => e.active).map((e) => e.id)) }), [exercises, taxonomy]);

  return (
    <KeyboardSafeScrollView testID="builder-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <PlayerTargetLabel />
      {readOnly ? (
        <Text style={styles.warning} testID="builder-readonly">
          {t('training.builder.readOnly')}
        </Text>
      ) : null}
      {readOnly ? (
        <Text style={styles.cardTitle} testID="builder-name-readonly" accessibilityRole="header">
          {name}
        </Text>
      ) : (
        <TextField
          testID="builder-name"
          label={t('training.builder.name')}
          value={name}
          onChangeText={setName}
          maxLength={Math.max(WORKOUT_NAME_MAX_LENGTH, initialName.length)}
          error={errors.name ? t(errors.name === 'REQUIRED' ? 'training.errors.nameRequired' : 'training.errors.nameTooLong', { max: WORKOUT_NAME_MAX_LENGTH }) : undefined}
        />
      )}

      {seedMissing ? (
        <Text style={styles.error} testID="builder-seed-unavailable">
          {t('training.assign.seedUnavailable')}
        </Text>
      ) : null}
      {entries.length === 0 ? (
        <Text style={styles.muted} testID="builder-empty">
          {t('training.builder.empty')}
        </Text>
      ) : null}
      {entries.map((entry, index) => (
        <EntryCard
          key={entry.key}
          index={index}
          last={index === entries.length - 1}
          entry={entry}
          readOnly={readOnly}
          errors={errors.items}
          onChange={(itemIndex, patch) => change(entry.key, itemIndex, patch)}
          onMove={(by) => move(index, by)}
          onMoveItem={(from, to) => moveItem(entry.key, from, to)}
          onLayoutRow={(y, height) => {
            rows.current[index] = { y, height };
          }}
          dragDy={dragging?.index === index ? dragging.dy : null}
          onDrag={(dy) => setDragging(dy === null ? null : { index, dy })}
          onDrop={(dy) => moveTo(index, dropIndex(rows.current.slice(0, entries.length), index, dy))}
          onRemove={() => remove(entry.key)}
        />
      ))}

      {!readOnly ? (
        <>
          <BigButton testID="builder-add-block" variant="secondary" label={t('training.builder.addBlock')} onPress={() => setBlockOpen(true)} />
          <BigButton testID="builder-add-exercise" variant="secondary" label={t('training.builder.addExercise')} onPress={() => setExerciseOpen(true)} />
        </>
      ) : null}

      {failure ? (
        <Text style={styles.error} testID="builder-failed">
          {t(failure)}
        </Text>
      ) : null}
      {!readOnly && entries.length === 0 ? (
        <Text style={styles.muted} testID="builder-needs-content">
          {t('training.builder.needsContent')}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {!readOnly ? (
          <BigButton testID="builder-save" label={saving ? t('training.builder.saving') : t('training.builder.save')} onPress={() => void save()} disabled={!canSave} />
        ) : null}
        <BigButton
          testID="builder-cancel"
          variant="secondary"
          label={t('training.builder.cancel')}
          onPress={() => {
            if (!dirty) guard.release();
            router.back();
          }}
          disabled={saving}
        />
      </View>

      <BlockPicker visible={blockOpen} blocks={blocks} onPick={addBlock} onClose={() => setBlockOpen(false)} />
      <ExerciseSearch
        visible={exerciseOpen}
        exercises={exercises}
        onPick={addExercise}
        onBrowse={() => setBrowsing(true)}
        onClose={() => setExerciseOpen(false)}
      />
      <ExercisePicker visible={browsing} data={pickerData} onPick={addExercise} onClose={() => setBrowsing(false)} />
    </KeyboardSafeScrollView>
  );
}

function EntryCard(props: {
  index: number;
  last: boolean;
  entry: DEntry;
  readOnly: boolean;
  errors: SavePlanErrors['items'];
  onChange: (itemIndex: number, patch: Partial<DItem>) => void;
  onMove: (by: -1 | 1) => void;
  onMoveItem: (from: number, to: number) => void;
  onLayoutRow: (y: number, height: number) => void;
  dragDy: number | null;
  onDrag: (dy: number | null) => void;
  onDrop: (dy: number) => void;
  onRemove: () => void;
}) {
  const { t, language } = useI18n();
  const { entry, index } = props;
  const id = `builder-entry-${index}`;
  const title = entry.kind === 'SECTION' ? t('training.builder.sectionHeading', { name: isolate(entry.name ?? '') }) : t('training.builder.standalone');
  const label = entry.kind === 'SECTION' ? (entry.name ?? '') : entry.items[0]!.snapshot.name[language];
  const itemRows = useRef<{ y: number; height: number }[]>([]);
  const [itemDrag, setItemDrag] = useState<{ index: number; dy: number } | null>(null);
  const reorderable = !props.readOnly && entry.kind === 'SECTION' && entry.items.length > 1;
  return (
    <View
      style={[styles.card, props.dragDy !== null ? { transform: [{ translateY: props.dragDy }], zIndex: 2, opacity: 0.9 } : null]}
      testID={id}
      onLayout={(e) => props.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      accessibilityLabel={stripBidi(t('training.itemA11y', { position: index + 1, name: label }))}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, styles.cardTitleFlex]} testID={`${id}-title`}>
          {title}
        </Text>
        {!props.readOnly ? (
          <DragHandle
            testID={`${id}-handle`}
            label={stripBidi(t('training.reorder.handle', { name: label }))}
            hint={t('training.reorder.hint')}
            moveUpLabel={t('training.moveUp')}
            moveDownLabel={t('training.moveDown')}
            onDrag={props.onDrag}
            onDrop={props.onDrop}
            onStep={(by) => {
              if ((by === -1 && index > 0) || (by === 1 && !props.last)) props.onMove(by);
            }}
          />
        ) : null}
      </View>
      {entry.items.map((item, n) => (
        <View
          key={`${item.snapshot.exerciseId}-${n}`}
          testID={`${id}-row-${n}`}
          onLayout={(e) => {
            itemRows.current[n] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
          }}
          style={itemDrag?.index === n ? { transform: [{ translateY: itemDrag.dy }], zIndex: 2, opacity: 0.9 } : null}>
          {reorderable ? (
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleFlex} />
              <DragHandle
                testID={`${id}-item-${n}-handle`}
                label={stripBidi(t('training.reorder.handle', { name: item.snapshot.name[language] }))}
                hint={t('training.reorder.hint')}
                moveUpLabel={t('training.moveUp')}
                moveDownLabel={t('training.moveDown')}
                onDrag={(dy) => setItemDrag(dy === null ? null : { index: n, dy })}
                onDrop={(dy) => props.onMoveItem(n, dropIndex(itemRows.current.slice(0, entry.items.length), n, dy))}
                onStep={(by) => {
                  if ((by === -1 && n > 0) || (by === 1 && n < entry.items.length - 1)) props.onMoveItem(n, n + by);
                }}
              />
              {n > 0 ? <Small testID={`${id}-item-${n}-up`} label={t('training.moveUp')} onPress={() => props.onMoveItem(n, n - 1)} /> : null}
              {n < entry.items.length - 1 ? <Small testID={`${id}-item-${n}-down`} label={t('training.moveDown')} onPress={() => props.onMoveItem(n, n + 1)} /> : null}
            </View>
          ) : null}
          <ItemFields
            testID={`${id}-item-${n}`}
            item={item}
            errors={props.errors?.[`${index}.${n}`]}
            readOnly={props.readOnly}
            onChange={(patch) => props.onChange(n, patch)}
          />
        </View>
      ))}
      {!props.readOnly ? (
        <View style={styles.actions}>
          {index > 0 ? <Small testID={`${id}-up`} label={t('training.moveUp')} onPress={() => props.onMove(-1)} /> : null}
          {!props.last ? <Small testID={`${id}-down`} label={t('training.moveDown')} onPress={() => props.onMove(1)} /> : null}
          <Small testID={`${id}-remove`} label={t('training.remove')} onPress={props.onRemove} />
        </View>
      ) : null}
    </View>
  );
}

/** One exercise of the workout: its name, and the prescription for THIS workout (only what its measurement supports). */
function ItemFields(props: { testID: string; item: DItem; errors: PrescriptionErrors | undefined; readOnly: boolean; onChange: (patch: Partial<DItem>) => void }) {
  const { t, language } = useI18n();
  const { item, testID } = props;
  const measurement = item.snapshot.measurement;
  const name = item.snapshot.name[language];
  const targetKey = targetApplies(measurement.type) ? targetLabelKey(measurement.type, item.timeSemantics) : null;
  const err = (field: keyof PrescriptionErrors) => {
    const code = props.errors?.[field];
    if (!code) return undefined;
    return t(code === 'NOT_APPLICABLE' ? 'training.errors.targetNotApplicable' : FIELD_ERRORS[field]);
  };
  if (props.readOnly) {
    const p = prescriptionOf(item);
    return (
      <View style={styles.item} testID={testID}>
        <Text style={styles.itemName} testID={`${testID}-name`}>
          {name}
        </Text>
        <Text style={styles.muted} testID={`${testID}-rx`}>
          {prescriptionText(t, measurement, p)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.item} testID={testID}>
      <Text style={styles.itemName} testID={`${testID}-name`}>
        {name}
      </Text>
      <Text style={styles.muted}>{measurementStyle(t, measurement)}</Text>
      <TextField testID={`${testID}-sets`} label={t('training.sets')} value={item.sets} onChangeText={(sets) => props.onChange({ sets })} keyboardType="number-pad" numeric error={err('sets')} />
      {targetKey ? (
        <TextField testID={`${testID}-target`} label={`${t(targetKey)} · ${t('training.optional')}`} value={item.target} onChangeText={(target) => props.onChange({ target })} keyboardType="decimal-pad" numeric error={err('target')} />
      ) : null}
      {measurement.usesLoad ? (
        <TextField testID={`${testID}-load`} label={`${t('training.load')} · ${t('training.optional')}`} value={item.load} onChangeText={(load) => props.onChange({ load })} keyboardType="decimal-pad" numeric error={err('loadKg')} />
      ) : null}
      <TextField testID={`${testID}-rest`} label={`${t('training.rest')} · ${t('training.optional')}`} value={item.rest} onChangeText={(rest) => props.onChange({ rest })} keyboardType="number-pad" numeric error={err('restSec')} />
    </View>
  );
}

const norm = (s: string) => stripBidi(s).normalize('NFC').toLocaleLowerCase().trim();

/** A full-screen sheet over the Builder (the draft stays mounted underneath: nothing typed there is lost). */
function Sheet(props: { visible: boolean; testID: string; title: string; closeTestID: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <BottomInsetHandledContext.Provider value={false}>
        <View style={[styles.sheet, { paddingTop: insets.top }]} testID={props.testID}>
          <View style={styles.sheetBar}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {props.title}
            </Text>
            <Pressable testID={props.closeTestID} accessibilityRole="button" accessibilityLabel={t('training.builder.close')} onPress={props.onClose} style={styles.sheetClose}>
              <Text style={styles.sheetCloseLabel}>{t('training.builder.close')}</Text>
            </Pressable>
          </View>
          <KeyboardSafeScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {props.children}
          </KeyboardSafeScrollView>
        </View>
      </BottomInsetHandledContext.Provider>
    </Modal>
  );
}

/** Searchable ACTIVE blocks (name, count and the first exercises): picking one copies it into the draft. */
function BlockPicker({ visible, blocks, onPick, onClose }: { visible: boolean; blocks: WorkoutBlock[]; onPick: (block: WorkoutBlock) => void; onClose: () => void }) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const active = blocks.filter((b) => b.active);
  const q = norm(query);
  const shown = active.filter((b) => q === '' || norm(b.name).includes(q));
  return (
    <Sheet visible={visible} testID="builder-block-picker" title={t('training.builder.pickBlockTitle')} closeTestID="builder-block-picker-close" onClose={onClose}>
      <TextField testID="builder-block-search" label={t('training.builder.searchBlocks')} value={query} onChangeText={setQuery} />
      {active.length === 0 ? (
        <Text style={styles.muted} testID="builder-block-none">
          {t('training.builder.noActiveBlocks')}
        </Text>
      ) : shown.length === 0 ? (
        <Text style={styles.muted} testID="builder-block-no-matches">
          {t('training.builder.noBlockMatches')}
        </Text>
      ) : (
        shown.map((block) => (
          <Pressable
            key={block.id}
            testID={`builder-block-option-${block.id}`}
            accessibilityRole="button"
            onPress={() => {
              setQuery('');
              onPick(block);
            }}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}>
            <Text style={styles.itemName}>{block.name}</Text>
            <Text style={styles.muted}>
              {t('training.builder.blockOption', {
                count: block.items.length,
                names: block.items.slice(0, 3).map((i) => exerciseName(i.exercise, language)).join(' · '),
              })}
            </Text>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

/** Search the ACTIVE exercises (inactive ones are never offered), or browse by category. */
function ExerciseSearch({ visible, exercises, onPick, onBrowse, onClose }: { visible: boolean; exercises: Exercise[]; onPick: (exercise: Exercise) => void; onBrowse: () => void; onClose: () => void }) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const matches = useMemo(
    () => (query.trim().length === 0 ? [] : filterExercises(exercises, { ...NO_EXERCISE_FILTER, query }, language).slice(0, 25)),
    [exercises, query, language],
  );
  return (
    <Sheet visible={visible} testID="builder-exercise-picker" title={t('training.builder.pickExerciseTitle')} closeTestID="builder-exercise-picker-close" onClose={onClose}>
      <TextField testID="builder-exercise-search" label={t('training.builder.searchExercises')} value={query} onChangeText={setQuery} />
      <BigButton testID="builder-exercise-browse" variant="secondary" label={t('training.builder.browse')} onPress={onBrowse} />
      {query.trim().length === 0 ? (
        <Text style={styles.muted}>{t('training.builder.searchHint')}</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.muted} testID="builder-exercise-no-matches">
          {t('training.builder.noExercises')}
        </Text>
      ) : (
        matches.map((exercise) => (
          <Pressable
            key={exercise.id}
            testID={`builder-exercise-option-${exercise.id}`}
            accessibilityRole="button"
            onPress={() => {
              setQuery('');
              onPick(exercise);
            }}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}>
            <Text style={styles.itemName}>{exerciseName(exercise, language)}</Text>
            <Text style={styles.muted}>{measurementStyle(t, exercise.measurement)}</Text>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  warning: { fontSize: 15, color: colors.danger, fontWeight: '700', textAlign: 'auto' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleFlex: { flex: 1 },
  item: { gap: spacing.sm },
  itemName: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm },
  option: { minHeight: touch.buttonMinHeight, justifyContent: 'center', gap: 2, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: touch.buttonMinHeight },
  sheetTitle: { flexShrink: 1, fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  sheetClose: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md },
  sheetCloseLabel: { fontSize: 16, fontWeight: '700', color: colors.courtDark },
});
