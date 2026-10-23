import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  abandonSession,
  addSet,
  finishSession,
  getSession,
  recordSet,
  skipSet,
  type SessionExercise,
  type SessionSet,
  type TrainingSession,
} from '@/data/local/training/trainingRepository';
import {
  parseEntry,
  resultKinds,
  type MeasurementKind,
  type SetValueErrors,
  type SetValues,
} from '@/domain/training/training';
import { exerciseProgress, nextSetId, workoutProgress } from '@/domain/training/sessionProgress';
import { timedRecordValues } from '@/domain/training/timedRecord';
import { stopwatchEligible, suggestedTimeSeconds } from '@/domain/training/workoutStopwatch';
import { nextPendingSet, restTimerSeconds, suggestedSeconds, workTimerSeconds, type TimerIdentity } from '@/domain/training/workoutTimer';
import { useApp } from '@/features/AppProvider';
import { PlayerTargetLabel, useActivePlayer } from '@/features/players/ActivePlayerContext';
import { formatDateTime } from '@/features/calendar/formatEventTime';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

import { Small } from './BlockForm';
import { findSet, TimerBar, type TimedKind } from './timer/TimerBar';
import { isStopwatch, useWorkoutTimer } from './timer/WorkoutTimerProvider';
import {
  actualSetText,
  formatNumber,
  performedText,
  plannedSetText,
  prescriptionText,
  timeCapHint,
  sessionStatusLabel,
  trainingErrorMessage,
} from './trainingLabels';

type Change = (session: TrainingSession) => void;

/** What a set row lets the screen read / fill, so a timer's Record can combine the timed value with the user's other fields. */
interface SetFields {
  get(): Partial<Record<MeasurementKind, string>>;
  fill(kind: MeasurementKind, value: string): void;
}
type FieldRegistry = { current: Map<string, SetFields> };

/**
 * One training session. In progress: every set shows what was planned next
 * to inputs for what was actually done (Save / Skip / Add a set), then
 * Finish (Completed or Partial) or Stop (asks first). Finished: read-only —
 * planned and actual side by side, corrections marked. Actual values are
 * never pre-filled from the plan.
 *
 * Under a Player's route the active Player is shown as the target, and a
 * session that belongs to another Player is not shown (or changed) there.
 */
export function SessionScreen({ sessionId }: { sessionId: string }) {
  const { boot, services } = useApp();
  const context = useActivePlayer();
  const { t, language } = useI18n();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; session: TrainingSession } | { status: 'error' }
  >({ status: 'loading' });
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const busy = useRef(false);
  const timer = useWorkoutTimer();
  const registry = useRef<Map<string, SetFields>>(new Map());
  const [missing, setMissing] = useState<{ setId: string; kinds: readonly MeasurementKind[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      getSession(boot.db, sessionId)
        .then((session) => active && setState(session ? { status: 'ready', session } : { status: 'error' }))
        .catch((e: unknown) => {
          console.warn('[training] session load failed', e);
          if (active) setState({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, sessionId]),
  );

  const otherPlayers =
    state.status === 'ready' && context.status === 'resolved' && state.session.playerId !== context.activePlayerId;
  if (boot.status === 'error' || state.status === 'error' || otherPlayers) {
    return <ErrorScreen testID="session-error" message="training.errors.notFound" fallback="/children" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  const { session } = state;
  // An archived Player's session is history: shown, never changed (no record / skip / finish / stop).
  const archived = context.status === 'resolved' && context.archived === true;
  const live = session.status === 'IN_PROGRESS' && !archived;
  const update: Change = (next) => setState({ status: 'ready', session: next });
  const nextId = live ? nextSetId(session.exercises) : null;

  /** Runs one write; a refused write shows its reason and reloads the truth. */
  const act = async (write: () => Promise<TrainingSession | null>) => {
    if (busy.current || boot.status !== 'ready') return;
    busy.current = true;
    setFailure(null);
    try {
      const next = await write();
      if (next) update(next);
    } catch (e) {
      console.warn('[training] change failed', e);
      setFailure(trainingErrorMessage(e));
      const fresh = await getSession(boot.db, session.id).catch(() => null);
      if (fresh) update(fresh);
    }
    busy.current = false;
  };
  const db = boot.status === 'ready' ? boot.db : null;
  const deps = { ids: services.ids, clock: services.clock };

  /**
   * The ONE record path (the Save button and the timer's Record button both use it). After a set that was PENDING is
   * saved, a rest timer starts when this exercise has rest and another PENDING set of the SAME exercise is left.
   * The timer itself never writes anything: this only runs from a user action.
   */
  const recordAction = (setId: string, values: SetValues, onErrors: (e: SetValueErrors) => void) =>
    act(async () => {
      const wasPending = findSet(session, setId)?.set.status === 'PENDING';
      const result = await recordSet(db!, setId, values, deps);
      if (!result.ok) {
        onErrors(result.errors);
        return null;
      }
      onErrors({});
      if (wasPending) {
        const found = findSet(result.session, setId);
        const rest = found ? restTimerSeconds(found.exercise.restSec) : null;
        const next = found ? nextPendingSet(found.exercise.sets, setId) : null;
        if (found && rest !== null && next !== null) timer.startRest(timerIdentity(result.session.id, found.exercise, next), rest);
      }
      return result.session;
    });

  /**
   * Record from the countdown / stopwatch. The timed value is only ONE of the kinds a set may need (FARMER_CARRY also needs
   * a load, SLED_PUSH too): the others come from what the user has in the set's fields, never from the plan. When one is
   * still missing nothing is saved — the timed value is put in the field and the bar says what is still needed.
   */
  const timedRecord = async (setId: string, kind: TimedKind, seconds: number) => {
    const found = findSet(session, setId);
    if (found === null) return;
    const fields = registry.current.get(setId);
    const { values, missing: lacking } = timedRecordValues(found.exercise.exercise.measurement, kind, seconds, fields?.get() ?? {});
    if (lacking.length > 0) {
      fields?.fill(kind, formatNumber(seconds));
      setMissing({ setId, kinds: lacking });
      return;
    }
    setMissing(null);
    await recordAction(setId, values, () => {});
  };

  const abandon = () =>
    Alert.alert(t('training.abandonTitle'), t('training.abandonBody'), [
      { text: t('training.keepTraining'), style: 'cancel' },
      {
        text: t('training.confirmAbandon'),
        onPress: () =>
          void act(async () => {
            const closed = await abandonSession(db!, session.id, deps);
            timer.clearForSession(session.id); // only after the close succeeded
            return closed;
          }),
      },
    ]);

  return (
    <View style={styles.root} testID="session-root">
    <TimerBar session={session} live={live} missing={missing} onRecord={timedRecord} />
    <KeyboardSafeScrollView
      testID="session-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <PlayerTargetLabel />
      <Text style={styles.title} testID="session-name" accessibilityRole="header">
        {session.name}
      </Text>
      <Text style={styles.status} testID="session-status">
        {sessionStatusLabel(t, session.status)}
      </Text>
      <Text style={styles.muted} testID="session-started">
        {t('training.started', { when: formatDateTime(session.startedAt, language) })}
      </Text>
      {session.endedAt !== null ? (
        <Text style={styles.muted} testID="session-ended">
          {t('training.ended', { when: formatDateTime(session.endedAt, language) })}
        </Text>
      ) : null}
      <Text style={styles.muted} testID="session-summary">
        {performedText(t, session)}
      </Text>
      {!live ? (
        <Text style={styles.muted} testID="session-read-only">
          {t('training.readOnly')}
        </Text>
      ) : null}
      {archived ? (
        <Text style={styles.muted} testID="session-archived">
          {t('players.archive.archived')}
        </Text>
      ) : null}

      <WorkoutProgressBlock session={session} live={live} />

      {session.exercises.map((exercise, index) => (
        <ExerciseCard
          key={exercise.id}
          index={index}
          exercise={exercise}
          live={live}
          sessionId={session.id}
          nextId={nextId}
          registry={registry}
          onClockStarted={() => setMissing(null)}
          onRecord={recordAction}
          onSkip={(setId) => act(() => skipSet(db!, setId, deps))}
          onAddSet={() => act(() => addSet(db!, exercise.id, deps))}
        />
      ))}

      {failure ? (
        <Text style={styles.error} testID="session-failed">
          {t(failure)}
        </Text>
      ) : null}
      {live ? (
        <View style={styles.buttons}>
          <BigButton
            testID="session-finish"
            label={t('training.finish')}
            onPress={() =>
              void act(async () => {
                const closed = await finishSession(db!, session.id, deps);
                timer.clearForSession(session.id); // only after the close succeeded; a refused close keeps the timer
                return closed;
              })
            }
          />
          <BigButton
            testID="session-abandon"
            variant="secondary"
            label={t('training.abandon')}
            onPress={abandon}
          />
        </View>
      ) : null}
    </KeyboardSafeScrollView>
    </View>
  );
}

function timerIdentity(sessionId: string, exercise: SessionExercise, set: SessionSet): TimerIdentity {
  return { sessionId, exerciseId: exercise.id, exercisePosition: exercise.position, setId: set.id, setNumber: set.setNumber };
}

/** Compact live progress while training, the finish summary afterwards. Derived from the set states — nothing is stored. */
function WorkoutProgressBlock({ session, live }: { session: TrainingSession; live: boolean }) {
  const { t } = useI18n();
  const p = workoutProgress(session.exercises);
  if (p.plannedSets === 0 && p.extraDone === 0 && p.extraPending === 0) return null;
  const lines = [
    t('training.progress.planned', { done: p.plannedDone, planned: p.plannedSets }),
    t('training.progress.exercises', { done: p.exercisesCompleted, total: p.exercises }),
    ...(p.skipped > 0 ? [t('training.progress.skipped', { n: p.skipped })] : []),
    ...(p.extraDone > 0 ? [t('training.progress.extraPerformed', { n: p.extraDone })] : []),
    ...(p.extraPending > 0 ? [t('training.progress.extraPending', { n: p.extraPending })] : []),
  ];
  return (
    <View style={styles.progress} testID="session-progress">
      <Text style={styles.name} accessibilityRole="header">
        {t(live ? 'training.progress.progressTitle' : 'training.progress.summaryTitle')}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.status} testID={`session-progress-${i}`}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function ExerciseCard(props: {
  index: number;
  sessionId: string;
  nextId: string | null;
  registry: FieldRegistry;
  onClockStarted: () => void;
  exercise: SessionExercise;
  live: boolean;
  onRecord: (setId: string, values: SetValues, onErrors: (e: SetValueErrors) => void) => Promise<void>;
  onSkip: (setId: string) => Promise<void>;
  onAddSet: () => Promise<void>;
}) {
  const { t, language } = useI18n();
  const { exercise, index } = props;
  const id = `session-ex-${index}`;
  const planned = exercise.sets.filter((s) => s.planned);
  const first = planned[0];
  const rx =
    first === undefined
      ? null
      : prescriptionText(t, exercise.exercise.measurement, {
          sets: planned.length,
          target: first.plannedTarget,
          loadKg: first.plannedLoadKg,
          restSec: exercise.restSec,
          timeSemantics: exercise.timeSemantics ?? null,
        });
  const progress = exerciseProgress(exercise.sets);
  const stateText =
    progress.state === 'COMPLETED'
      ? t('training.progress.completed')
      : progress.state === 'COMPLETED_WITH_SKIPPED'
        ? t('training.progress.completedSkipped')
        : progress.state === 'PLANNED_DONE_EXTRA_PENDING'
          ? t('training.progress.plannedDone')
          : null;
  return (
    <View style={styles.card} testID={id}>
      {exercise.blockName ? <Text style={styles.muted}>{exercise.blockName}</Text> : null}
      <Text style={styles.name} testID={`${id}-name`}>
        {exercise.exercise.name[language]}
      </Text>
      {rx ? (
        <Text style={styles.status} testID={`${id}-planned`}>
          {t('training.plannedRx', { rx })}
        </Text>
      ) : null}
      {first !== undefined && timeCapHint(t, exercise.exercise.measurement, first.plannedTarget, exercise.timeSemantics) ? (
        <Text style={styles.muted} testID={`${id}-time-cap-hint`}>
          {t('training.timeCapHint')}
        </Text>
      ) : null}
      {progress.planned > 0 || progress.extraDone > 0 || progress.extraPending > 0 ? (
        <Text style={styles.status} testID={`${id}-progress`}>
          {[
            t('training.progress.planned', { done: progress.plannedDone, planned: progress.planned }),
            ...(progress.skipped > 0 ? [t('training.progress.skipped', { n: progress.skipped })] : []),
            ...(progress.extraDone > 0 ? [t('training.progress.extraPerformed', { n: progress.extraDone })] : []),
            ...(progress.extraPending > 0 ? [t('training.progress.extraPending', { n: progress.extraPending })] : []),
          ].join(' · ')}
        </Text>
      ) : null}
      {stateText !== null && exercise.sets.length > 0 ? (
        <Text style={styles.complete} testID={`${id}-state`}>
          {stateText}
        </Text>
      ) : null}
      {exercise.sets.map((set, i) => (
        <SetRow
          key={set.id}
          nextId={props.nextId}
          registry={props.registry}
          onClockStarted={props.onClockStarted}
          testID={`${id}-set-${set.setNumber}`}
          exercise={exercise}
          set={set}
          previous={exercise.sets.slice(0, i)}
          live={props.live}
          sessionId={props.sessionId}
          onRecord={props.onRecord}
          onSkip={props.onSkip}
        />
      ))}
      {props.live ? (
        <Small testID={`${id}-add-set`} label={t('training.addSet')} onPress={() => void props.onAddSet()} />
      ) : null}
    </View>
  );
}

const ERROR_KEYS: Record<NonNullable<SetValueErrors[MeasurementKind]>, TranslationKey> = {
  REQUIRED: 'training.errors.valueRequired',
  INVALID: 'training.errors.valueInvalid',
  MADE_OVER_ATTEMPTS: 'training.errors.madeOverAttempts',
};

function SetRow(props: {
  nextId: string | null;
  registry: FieldRegistry;
  onClockStarted: () => void;
  testID: string;
  exercise: SessionExercise;
  set: SessionSet;
  previous: readonly SessionSet[];
  live: boolean;
  sessionId: string;
  onRecord: (setId: string, values: SetValues, onErrors: (e: SetValueErrors) => void) => Promise<void>;
  onSkip: (setId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { set, exercise, testID } = props;
  const measurement = exercise.exercise.measurement;
  const kinds = resultKinds(measurement);
  const typed = kinds.filter((k) => k !== 'COMPLETED');
  // Inputs start from this set's own actual values. An untouched load of a
  // set not recorded yet shows the last ACTUAL load in this exercise (never
  // the plan); it is derived on every render, so it follows the set before.
  const lastLoad = [...props.previous]
    .reverse()
    .find((s) => s.status === 'DONE')
    ?.measurements.find((m) => m.kind === 'LOAD_KG')?.finalValue;
  const [typedInputs, setInputs] = useState<Partial<Record<MeasurementKind, string>>>(() =>
    Object.fromEntries(
      set.measurements.filter((m) => m.kind !== 'COMPLETED').map((m) => [m.kind, formatNumber(m.finalValue)]),
    ),
  );
  const inputs = Object.fromEntries(
    typed.map((kind) => [
      kind,
      typedInputs[kind] ?? (kind === 'LOAD_KG' && lastLoad !== undefined ? formatNumber(lastLoad) : ''),
    ]),
  ) as Record<MeasurementKind, string>;
  const [errors, setErrors] = useState<SetValueErrors>({});
  const timer = useWorkoutTimer();
  // The screen reads this set's fields when a timer's Record needs the other kinds (e.g. the load), and fills one in.
  const inputsRef = useRef(inputs);
  useEffect(() => {
    inputsRef.current = inputs;
  });
  const { registry } = props;
  useEffect(() => {
    const fields = registry.current;
    fields.set(set.id, {
      get: () => inputsRef.current,
      fill: (kind, value) => setInputs((v) => ({ ...v, [kind]: value })),
    });
    return () => {
      fields.delete(set.id);
    };
  }, [registry, set.id]);
  const workSeconds = props.live && set.planned && set.status === 'PENDING' ? workTimerSeconds(measurement.type, set.plannedTarget) : null;
  // A stopped timer of THIS set suggests what was actually worked; the user still has to save it.
  const state = timer.state;
  const stoppedHere =
    state !== null && state.phase === 'STOPPED' && state.identity.setId === set.id
      ? isStopwatch(state)
        ? suggestedTimeSeconds(state)
        : suggestedSeconds(state)
      : null;
  const stoppedKind: TimedKind = isStopwatch(state) ? 'TIME_S' : 'DURATION_S';
  const [suggested, setSuggested] = useState<number | null>(null);
  if (stoppedHere !== null && suggested !== stoppedHere) {
    setSuggested(stoppedHere);
    setInputs((v) => ({ ...v, [stoppedKind]: String(stoppedHere) }));
  }
  const stopwatchAllowed = props.live && set.status === 'PENDING' && stopwatchEligible(measurement.type);
  const startClock = (begin: (identity: TimerIdentity) => void) => {
    const identity = { sessionId: props.sessionId, exerciseId: exercise.id, exercisePosition: exercise.position, setId: set.id, setNumber: set.setNumber };
    // An active work timer / running stopwatch of another set is never discarded silently (a rest timer may be replaced freely).
    if (!timer.isActiveWorkElsewhere(identity)) {
      props.onClockStarted();
      begin(identity);
      return;
    }
    Alert.alert(t('training.timer.replaceTitle'), t('training.timer.replaceBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.timer.replaceConfirm'),
        onPress: () => {
          props.onClockStarted();
          begin(identity);
        },
      },
    ]);
  };
  const isNext = props.live && set.status === 'PENDING' && props.nextId === set.id;

  const planned = set.planned ? plannedSetText(t, measurement, set.plannedTarget, set.plannedLoadKg, exercise.timeSemantics) : null;
  const done = set.status === 'DONE';
  const actual = done ? actualSetText(t, set.measurements) : null;
  const edited = set.measurements.some((m) => m.wasEdited);
  const statusText =
    set.status === 'SKIPPED'
      ? t('training.skipped')
      : done
        ? t('training.actualValue', {
            value: edited
              ? t('training.editedNote', {
                  value: actual!,
                  measured: actualSetText(t, set.measurements, false),
                })
              : actual!,
          })
        : props.live
          ? t('training.pending')
          : t('training.notDone');

  const save = () => {
    const values: SetValues = {};
    for (const kind of kinds) {
      if (kind === 'COMPLETED') {
        values.COMPLETED = 1;
        continue;
      }
      const parsed = parseEntry(inputs[kind] ?? '', kind);
      if (parsed !== null) values[kind] = parsed;
      else if ((inputs[kind] ?? '').trim() !== '') values[kind] = NaN; // typed, but not a number
    }
    void props.onRecord(set.id, values, setErrors);
  };

  return (
    <View style={[styles.set, isNext ? styles.setNext : null]} testID={testID}>
      <View style={styles.setHeader}>
        <Text style={styles.setTitle} testID={`${testID}-label`}>
          {t('training.setLabel', { n: set.setNumber })}
        </Text>
        <Text style={[styles.pill, pillStyle(set.status)]} testID={`${testID}-state`}>
          {t(`training.setState.${set.status}`)}
        </Text>
        {isNext ? (
          <Text style={[styles.pill, styles.pillNext]} testID={`${testID}-next`}>
            {t('training.setState.NEXT')}
          </Text>
        ) : null}
      </View>
      <Text style={styles.muted} testID={`${testID}-planned`}>
        {set.planned
          ? planned === null
            ? '—'
            : t('training.plannedValue', { value: planned })
          : t('training.extraSet')}
      </Text>
      <Text style={done ? styles.status : styles.muted} testID={`${testID}-actual`}>
        {statusText}
      </Text>
      {props.live ? (
        <>
          {typed.map((kind) => (
            <TextField
              key={kind}
              testID={`${testID}-${kind}`}
              label={t(`training.kind.${kind}`)}
              value={inputs[kind] ?? ''}
              onChangeText={(value) => setInputs((v) => ({ ...v, [kind]: value }))}
              keyboardType="decimal-pad"
              numeric
              error={errors[kind] ? t(ERROR_KEYS[errors[kind]!]) : undefined}
            />
          ))}
          <View style={styles.actions}>
            {workSeconds !== null ? (
              <Small
                testID={`${testID}-timer-start`}
                label={t('training.timer.startTimer')}
                onPress={() => startClock((identity) => timer.startWork(identity, workSeconds))}
              />
            ) : null}
            {stopwatchAllowed ? (
              <Small
                testID={`${testID}-stopwatch-start`}
                label={t('training.timer.startStopwatch')}
                onPress={() => startClock((identity) => timer.startStopwatch(identity))}
              />
            ) : null}
            <Small
              testID={`${testID}-save`}
              label={t(done ? 'training.updateSet' : 'training.saveSet')}
              onPress={save}
            />
            {set.status === 'PENDING' ? (
              <Small
                testID={`${testID}-skip`}
                label={t('training.skip')}
                onPress={() => void props.onSkip(set.id)}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const pillStyle = (status: SessionSet['status']) => (status === 'DONE' ? styles.pillDone : status === 'SKIPPED' ? styles.pillSkipped : styles.pillPending);

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  status: { fontSize: 15, color: colors.ink, fontWeight: '600', textAlign: 'auto' },
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
  set: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  setNext: { borderLeftWidth: 4, borderLeftColor: colors.court, paddingLeft: spacing.sm, backgroundColor: '#FDEBDD' },
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  pill: { fontSize: 12, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  pillPending: { color: colors.inkMuted, backgroundColor: colors.border },
  pillDone: { color: '#14532D', backgroundColor: '#DCFCE7' },
  pillSkipped: { color: colors.inkMuted, backgroundColor: '#E5E7EB' },
  pillNext: { color: colors.courtDark, backgroundColor: '#FDEBDD' },
  complete: { fontSize: 15, color: colors.ink, fontWeight: '800', textAlign: 'auto' },
  progress: { gap: 2, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  setTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm },
});
