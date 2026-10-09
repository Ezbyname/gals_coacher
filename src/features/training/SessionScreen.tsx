import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import {
  actualSetText,
  formatNumber,
  performedText,
  plannedSetText,
  prescriptionText,
  sessionStatusLabel,
  trainingErrorMessage,
} from './trainingLabels';

type Change = (session: TrainingSession) => void;

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
  const live = session.status === 'IN_PROGRESS';
  const update: Change = (next) => setState({ status: 'ready', session: next });

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

  const abandon = () =>
    Alert.alert(t('training.abandonTitle'), t('training.abandonBody'), [
      { text: t('training.keepTraining'), style: 'cancel' },
      {
        text: t('training.confirmAbandon'),
        onPress: () => void act(() => abandonSession(db!, session.id, deps)),
      },
    ]);

  return (
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

      {session.exercises.map((exercise, index) => (
        <ExerciseCard
          key={exercise.id}
          index={index}
          exercise={exercise}
          live={live}
          onRecord={(setId, values, onErrors) =>
            act(async () => {
              const result = await recordSet(db!, setId, values, deps);
              if (!result.ok) {
                onErrors(result.errors);
                return null;
              }
              onErrors({});
              return result.session;
            })
          }
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
            onPress={() => void act(() => finishSession(db!, session.id, deps))}
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
  );
}

function ExerciseCard(props: {
  index: number;
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
        });
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
      {exercise.sets.map((set, i) => (
        <SetRow
          key={set.id}
          testID={`${id}-set-${set.setNumber}`}
          exercise={exercise}
          set={set}
          previous={exercise.sets.slice(0, i)}
          live={props.live}
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
  testID: string;
  exercise: SessionExercise;
  set: SessionSet;
  previous: readonly SessionSet[];
  live: boolean;
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

  const planned = set.planned ? plannedSetText(t, measurement, set.plannedTarget, set.plannedLoadKg) : null;
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
    <View style={styles.set} testID={testID}>
      <Text style={styles.setTitle} testID={`${testID}-label`}>
        {t('training.setLabel', { n: set.setNumber })}
      </Text>
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

const styles = StyleSheet.create({
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
  setTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm },
});
