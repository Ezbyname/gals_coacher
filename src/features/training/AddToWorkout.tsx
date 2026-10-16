import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getExercise } from '@/data/local/exercises/exerciseRepository';
import { listPlayers, type PlayerProfile } from '@/data/local/players/playerRepository';
import { AssignmentFailedError } from '@/data/local/training/errors';
import {
  assignContentToPlayers,
  type AssignedPlan,
  type AssignTarget,
} from '@/data/local/training/plannedWorkoutCompositionRepository';
import { listTraining, type PlannedWorkout } from '@/data/local/training/trainingRepository';
import { getBlock } from '@/data/local/training/workoutRepository';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { exerciseName } from '@/features/exercises/exerciseLabels';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate, stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing, touch } from '@/ui/theme';

import { editPlanPath, seededBuilderPath, trainingErrorMessage, type AssignKind } from './trainingLabels';

/**
 * QB-WORKOUT-BUILDER-001C — Exercise / Block Details → Add to workout.
 *
 * Choose the Player(s) (active Players only, explicit selection unless there is exactly one), and for EACH selected
 * Player independently: one of that Player's own editable workouts (planned, no session yet) or a new workout.
 * - exactly ONE Player + new workout: the 001B Builder opens with the item as its first entry (a local draft;
 *   Cancel leaves nothing, Save creates the workout);
 * - otherwise ONE atomic assignment: every Player gets its OWN workout / copied section, or nobody does and the
 *   failing Player is named. Never one shared plan. Blocks are copied (v17 section copy), Exercises are standalone.
 */

type Subject = { name: string; active: boolean };
type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; subject: Subject; players: PlayerProfile[]; editable: Record<string, PlannedWorkout[]> };
type Choice = { type: 'EXISTING'; planId: string } | { type: 'NEW' };

export function AddToWorkout({ kind, id }: { kind: AssignKind; id: string }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<AssignedPlan[] | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const preselected = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      (async () => {
        const subject: Subject | null =
          kind === 'BLOCK'
            ? await getBlock(boot.db, id).then((b) => (b ? { name: b.name, active: b.active } : null))
            : await getExercise(boot.db, id).then((e) => (e ? { name: exerciseName(e, language), active: e.active } : null));
        if (subject === null) return setLoaded({ status: 'error' });
        const players = await listPlayers(boot.db); // active Players only (archived ones are never offered)
        const editable: Record<string, PlannedWorkout[]> = {};
        for (const p of players) editable[p.player.id] = [...(await listTraining(boot.db, p.player.id)).planned]; // planned = no session yet
        if (!active) return;
        setLoaded({ status: 'ready', subject, players, editable });
        // the screen shows what is true NOW: a Player who is no longer active, or a workout that started meanwhile, is
        // dropped from the selection instead of failing later (the repository refuses both anyway)
        const offered = new Set<string>(players.map((p) => p.player.id));
        setSelected((list) => list.filter((playerId) => offered.has(playerId)));
        setChoices((c) =>
          Object.fromEntries(
            Object.entries(c).filter(([playerId, choice]) => offered.has(playerId) && (choice.type === 'NEW' || editable[playerId]!.some((plan) => plan.id === choice.planId))),
          ),
        );
        if (!preselected.current && players.length === 1) {
          preselected.current = true; // the one relevant Player is visibly preselected
          const only = players[0]!.player.id;
          setSelected([only]);
          if (editable[only]!.length === 0) setChoices({ [only]: { type: 'NEW' } });
        }
      })().catch((e: unknown) => {
        console.warn('[training] add-to-workout load failed', e);
        if (active) setLoaded({ status: 'error' });
      });
      return () => {
        active = false;
      };
    }, [boot, kind, id, language]),
  );

  if (boot.status === 'error' || loaded.status === 'error') {
    return <ErrorScreen testID="assign-error" message="training.errors.notFound" fallback="/workouts" />;
  }
  if (loaded.status === 'loading') return <LoadingScreen />;
  const { subject, players, editable } = loaded;
  const subjectName = isolate(subject.name);

  if (!subject.active) {
    return (
      <KeyboardSafeScrollView testID="assign-scroll" contentContainerStyle={styles.container}>
        <Text style={styles.error} testID="assign-inactive">
          {t(kind === 'BLOCK' ? 'training.errors.blockInactive' : 'training.errors.exerciseInactive')}
        </Text>
        <BigButton testID="assign-back" variant="secondary" label={t('training.cancel')} onPress={() => router.back()} />
      </KeyboardSafeScrollView>
    );
  }

  const nameOf = (playerId: string) => players.find((p) => p.player.id === playerId)?.player.name ?? '';
  const toggle = (playerId: string) => {
    setFailure(null);
    setSelected((list) => (list.includes(playerId) ? list.filter((x) => x !== playerId) : [...list, playerId]));
    // a Player with no editable workout gets "new workout" (the only possible destination) once selected
    setChoices((c) => (c[playerId] || editable[playerId]!.length > 0 ? c : { ...c, [playerId]: { type: 'NEW' } }));
  };
  const choose = (playerId: string, choice: Choice) => {
    setFailure(null);
    setChoices((c) => ({ ...c, [playerId]: choice }));
  };
  const ready = selected.length > 0 && selected.every((p) => choices[p] !== undefined) && !working;

  const submit = async () => {
    if (busy.current || !ready || boot.status !== 'ready') return;
    const only = selected.length === 1 ? selected[0]! : null;
    if (only !== null && choices[only]!.type === 'NEW') {
      router.replace(seededBuilderPath(only, kind, id)); // the same Builder: a local draft, nothing stored yet
      return;
    }
    busy.current = true;
    setWorking(true);
    setFailure(null);
    const targets: AssignTarget[] = selected.map((playerId) => {
      const choice = choices[playerId]!;
      return {
        playerId,
        destination: choice.type === 'EXISTING' ? { type: 'EXISTING', planId: choice.planId } : { type: 'NEW', name: t('training.builder.defaultName') },
      };
    });
    try {
      const assigned = await assignContentToPlayers(boot.db, kind === 'BLOCK' ? { kind, blockId: id } : { kind, exerciseId: id }, targets, {
        ids: services.ids,
        clock: services.clock,
      });
      setDone(assigned);
    } catch (e) {
      console.warn('[training] add-to-workout failed', e);
      const key: TranslationKey = trainingErrorMessage(e instanceof AssignmentFailedError ? e.cause : e);
      setFailure(
        e instanceof AssignmentFailedError
          ? `${t('training.assign.failed', { player: isolate(nameOf(e.playerId)) })} ${t(key)}`
          : t('training.assign.failedGeneric'),
      );
    }
    busy.current = false;
    setWorking(false);
  };

  if (done !== null) {
    return (
      <KeyboardSafeScrollView testID="assign-scroll" contentContainerStyle={styles.container}>
        <Text style={styles.title} testID="assign-done-title" accessibilityRole="header">
          {t('training.assign.doneTitle')}
        </Text>
        {done.map((r) => (
          <View key={r.playerId} style={styles.card} testID={`assign-result-${r.playerId}`}>
            <Text style={styles.name} testID={`assign-result-${r.playerId}-text`}>
              {t(r.created ? 'training.assign.resultNew' : 'training.assign.resultExisting', { player: isolate(nameOf(r.playerId)), plan: isolate(r.planName) })}
            </Text>
            <BigButton testID={`assign-result-${r.playerId}-edit`} variant="secondary" label={t('training.builder.edit')} onPress={() => router.push(editPlanPath(r.playerId, r.planId))} />
          </View>
        ))}
        <BigButton testID="assign-done" label={t('training.assign.done')} onPress={() => router.back()} />
      </KeyboardSafeScrollView>
    );
  }

  return (
    <KeyboardSafeScrollView testID="assign-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted} testID="assign-intro">
        {t('training.assign.intro', { name: subjectName })}
      </Text>
      <Text style={styles.heading} accessibilityRole="header">
        {t('training.assign.players')}
      </Text>
      {players.length === 0 ? (
        <Text style={styles.muted} testID="assign-no-players">
          {t('training.assign.noPlayers')}
        </Text>
      ) : null}
      {players.map((p) => {
        const playerId = p.player.id;
        const on = selected.includes(playerId);
        const plans = editable[playerId]!;
        const choice = choices[playerId];
        return (
          <View key={playerId} style={styles.card} testID={`assign-card-${playerId}`}>
            <Pressable
              testID={`assign-player-${playerId}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={stripBidi(p.player.name)}
              onPress={() => toggle(playerId)}
              style={({ pressed }) => [styles.playerRow, pressed && { opacity: 0.8 }]}>
              <Text style={styles.box}>{on ? '☑' : '☐'}</Text>
              <Text style={styles.name}>{p.player.name}</Text>
            </Pressable>
            {on ? (
              <View style={styles.destinations}>
                {plans.length === 0 ? (
                  <Text style={styles.muted} testID={`assign-nodest-${playerId}`}>
                    {t('training.assign.noEditable', { player: isolate(p.player.name) })}
                  </Text>
                ) : (
                  plans.map((plan) => (
                    <Option
                      key={plan.id}
                      testID={`assign-dest-${playerId}-${plan.id}`}
                      selected={choice?.type === 'EXISTING' && choice.planId === plan.id}
                      label={plan.name}
                      onPress={() => choose(playerId, { type: 'EXISTING', planId: plan.id })}
                    />
                  ))
                )}
                <Option
                  testID={`assign-dest-${playerId}-new`}
                  selected={choice?.type === 'NEW'}
                  label={t('training.assign.newWorkout')}
                  onPress={() => choose(playerId, { type: 'NEW' })}
                />
              </View>
            ) : null}
          </View>
        );
      })}
      {failure ? (
        <Text style={styles.error} testID="assign-failed">
          {failure}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <BigButton testID="assign-continue" label={working ? t('training.assign.adding') : t('training.assign.continue')} onPress={() => void submit()} disabled={!ready} />
        <BigButton testID="assign-cancel" variant="secondary" label={t('training.cancel')} onPress={() => router.back()} disabled={working} />
      </View>
    </KeyboardSafeScrollView>
  );
}

function Option(props: { testID: string; selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={stripBidi(props.label)}
      onPress={props.onPress}
      style={({ pressed }) => [styles.option, props.selected && styles.optionOn, pressed && { opacity: 0.8 }]}>
      <Text style={styles.box}>{props.selected ? '●' : '○'}</Text>
      <Text style={styles.name}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  heading: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  playerRow: { minHeight: touch.buttonMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  destinations: { gap: spacing.sm },
  option: { minHeight: touch.buttonMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  optionOn: { borderColor: colors.courtDark },
  box: { fontSize: 20, color: colors.courtDark },
  name: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  buttons: { gap: spacing.sm },
});
