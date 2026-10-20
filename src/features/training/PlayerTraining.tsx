import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { listWorkoutSchedules, unscheduleWorkout } from '@/data/local/calendar/calendarEventRepository';
import { setExerciseActive } from '@/data/local/exercises/exerciseRepository';
import {
  getPlannedWorkout,
  listTraining,
  planAndStart,
  planWorkout,
  startSession,
  type PlannedWorkout,
  type TrainingOverview,
} from '@/data/local/training/trainingRepository';
import { TemplateUnavailableItemsError, type UnavailableItems } from '@/data/local/training/errors';
import {
  listTemplates,
  setBlockActive,
  unavailableItemsOf,
  type WorkoutTemplate,
} from '@/data/local/training/workoutRepository';
import { MissingPlayerContextError, requireActivePlayer } from '@/domain/training/activePlayer';
import { groupEntries } from '@/domain/training/composition';
import { useApp } from '@/features/AppProvider';
import { formatDateTime } from '@/features/calendar/formatEventTime';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { PlayerTargetLabel, RoutePlayerScope, useActivePlayer } from '@/features/players/ActivePlayerContext';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate, stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing, touch } from '@/ui/theme';

import { Small } from './BlockForm';
import {
  builderPath,
  chooseWorkoutPath,
  editPlanPath,
  performedText,
  planPath,
  prescriptionText,
  timeCapHint,
  scheduleWorkoutPath,
  sessionPath,
  sessionStatusLabel,
  templatePath,
  trainingErrorMessage,
  trainingPath,
} from './trainingLabels';

/** Loads on focus with a memoized loader (`useCallback`), so a change of its inputs reloads. */
type Db = Parameters<typeof listTraining>[0];

function useLoad<T>(load: (db: Db) => Promise<T>, reloadKey = 0) {
  const { boot } = useApp();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' }
  >({
    status: 'loading',
  });
  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      void reloadKey; // a changed key reloads (e.g. after items were restored)
      let active = true;
      load(boot.db)
        .then((value) => active && setState({ status: 'ready', value }))
        .catch((e: unknown) => {
          console.warn('[training] load failed', e);
          if (active) setState({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, load, reloadKey]),
  );
  return boot.status === 'error' ? ({ status: 'error' } as const) : state;
}

/**
 * Entry to a Player's training on Edit Player: the workout in progress (if
 * any), Start a workout, and the planned workouts / history.
 */
export function TrainingSection({ playerId }: { playerId: string }) {
  const { t, language } = useI18n();
  const { boot, services } = useApp();
  const state = useLoad(useCallback((db: Db) => listTraining(db, playerId), [playerId]));
  const [scheduleReload, setScheduleReload] = useState(0);
  const schedules = useLoad(useCallback((db: Db) => listWorkoutSchedules(db, playerId), [playerId]), scheduleReload);
  const scheduleOf = (planId: string) => (schedules.status === 'ready' ? schedules.value.find((s) => s.planId === planId) : undefined);
  const unschedule = (plan: PlannedWorkout) =>
    Alert.alert(t('training.schedule.unscheduleTitle'), t('training.schedule.unscheduleBody'), [
      { text: t('training.schedule.keep'), style: 'cancel' },
      {
        text: t('training.schedule.unscheduleConfirm'),
        style: 'destructive',
        onPress: () => {
          if (boot.status !== 'ready') return;
          setFailure(null);
          unscheduleWorkout(boot.db, playerId, plan.id)
            .then(() => setScheduleReload((n) => n + 1))
            .catch((e: unknown) => {
              console.warn('[training] unschedule failed', e);
              setFailure('training.schedule.unscheduleFailed');
            });
        },
      },
    ]);
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const busy = useRef(false);
  const running =
    state.status === 'ready' ? state.value.sessions.find((s) => s.status === 'IN_PROGRESS') : undefined;
  const planned = state.status === 'ready' ? state.value.planned : [];
  const startPlan = async (plan: PlannedWorkout) => {
    if (busy.current || boot.status !== 'ready') return;
    busy.current = true;
    setFailure(null);
    try {
      const session = await startSession(boot.db, plan.id, { ids: services.ids, clock: services.clock });
      router.push(sessionPath(playerId, session.id));
    } catch (e) {
      console.warn('[training] start failed', e);
      setFailure(trainingErrorMessage(e));
    }
    busy.current = false;
  };
  return (
    <View style={styles.section} testID="training-section">
      <Text style={styles.title}>{t('training.sectionTitle')}</Text>
      <Text style={styles.muted}>{t('training.sectionAbout')}</Text>
      {state.status === 'error' ? (
        <Text style={styles.error} testID="training-section-error">
          {t('training.errors.loadFailed')}
        </Text>
      ) : null}
      {running ? (
        <>
          <Text style={styles.status} testID="training-in-progress">
            {t('training.inProgressNow', { name: running.name })}
          </Text>
          <BigButton
            testID="training-continue"
            label={t('training.continue')}
            onPress={() => router.push(sessionPath(playerId, running.id))}
          />
        </>
      ) : (
        <BigButton
          testID="training-start"
          label={t('training.start')}
          onPress={() => router.push(chooseWorkoutPath(playerId))}
        />
      )}
      <BigButton
        testID="training-create-workout"
        variant="secondary"
        label={t('training.builder.create')}
        onPress={() => router.push(builderPath(playerId))}
      />
      {planned.length > 0 ? (
        <>
          <Text style={styles.heading} accessibilityRole="header" testID="training-planned-title">
            {t('training.builder.plannedTitle')}
          </Text>
          {planned.slice(0, 3).map((plan) => (
            <View key={plan.id} style={styles.plannedCard} testID={`training-planned-${plan.id}`}>
              <Text style={styles.name} testID={`training-planned-${plan.id}-name`}>
                {plan.name}
              </Text>
              <Text style={styles.muted} testID={`training-planned-${plan.id}-summary`}>
                {t('training.builder.plannedSummary', { count: groupEntries(plan.items).length })}
              </Text>
              <Text style={styles.muted} testID={`training-planned-${plan.id}-when`}>
                {scheduleOf(plan.id) ? t('training.schedule.when', { when: formatDateTime(scheduleOf(plan.id)!.startAt, language) }) : t('training.schedule.notScheduled')}
              </Text>
              <View style={styles.plannedActions}>
                {scheduleOf(plan.id) ? (
                  <>
                    <Small testID={`training-planned-${plan.id}-reschedule`} label={t('training.schedule.reschedule')} onPress={() => router.push(scheduleWorkoutPath(playerId, plan.id))} />
                    <Small testID={`training-planned-${plan.id}-unschedule`} label={t('training.schedule.unschedule')} onPress={() => unschedule(plan)} />
                  </>
                ) : plan.items.length > 0 ? (
                  <Small testID={`training-planned-${plan.id}-schedule`} label={t('training.schedule.button')} onPress={() => router.push(scheduleWorkoutPath(playerId, plan.id))} />
                ) : null}
                <Small testID={`training-planned-${plan.id}-view`} label={t('training.builder.view')} onPress={() => router.push(planPath(playerId, plan.id))} />
                <Small testID={`training-planned-${plan.id}-edit`} label={t('training.builder.edit')} onPress={() => router.push(editPlanPath(playerId, plan.id))} />
                {!running && plan.items.length > 0 ? (
                  <Small testID={`training-planned-${plan.id}-start`} label={t('training.builder.start')} onPress={() => void startPlan(plan)} />
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}
      {failure ? (
        <Text style={styles.error} testID="training-section-failed">
          {t(failure)}
        </Text>
      ) : null}
      <BigButton
        testID="training-open"
        variant="secondary"
        label={planned.length > 3 ? t('training.builder.allPlanned') : t('training.history')}
        onPress={() => router.push(trainingPath(playerId))}
      />
    </View>
  );
}

/** A Player's planned workouts (not started) and every workout performed, newest first. */
export function TrainingOverviewScreen({ playerId }: { playerId: string }) {
  return (
    <RoutePlayerScope playerId={playerId}>
      <TrainingOverviewView />
    </RoutePlayerScope>
  );
}

function TrainingOverviewView() {
  const playerId = requireActivePlayer(useActivePlayer()).id;
  const { t, language } = useI18n();
  const state = useLoad(useCallback((db: Db) => listTraining(db, playerId), [playerId]));
  if (state.status === 'error') {
    return <ErrorScreen testID="training-error" message="training.errors.loadFailed" fallback="/children" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  const overview: TrainingOverview = state.value;
  const running = overview.sessions.some((s) => s.status === 'IN_PROGRESS');
  return (
    <SafeAreaScrollView testID="training-scroll" contentContainerStyle={styles.container}>
      <PlayerTargetLabel />
      {!running ? (
        <BigButton
          testID="training-overview-start"
          label={t('training.start')}
          onPress={() => router.push(chooseWorkoutPath(playerId))}
        />
      ) : null}
      <Text style={styles.heading} accessibilityRole="header">
        {t('training.planned')}
      </Text>
      {overview.planned.length === 0 ? (
        <Text style={styles.muted} testID="training-none-planned">
          {t('training.nonePlanned')}
        </Text>
      ) : (
        overview.planned.map((plan) => (
          <Row
            key={plan.id}
            testID={`training-plan-${plan.id}`}
            title={plan.name}
            lines={[t('training.builder.plannedSummary', { count: groupEntries(plan.items).length })]}
            onPress={() => router.push(planPath(playerId, plan.id))}
          />
        ))
      )}
      <Text style={styles.heading} accessibilityRole="header">
        {t('training.sessions')}
      </Text>
      {overview.sessions.length === 0 ? (
        <Text style={styles.muted} testID="training-none-sessions">
          {t('training.noneSessions')}
        </Text>
      ) : (
        overview.sessions.map((session) => (
          <Row
            key={session.id}
            testID={`training-session-${session.id}`}
            title={session.name}
            lines={[
              t('training.sessionLine', {
                when: formatDateTime(session.startedAt, language),
                status: sessionStatusLabel(t, session.status),
              }),
              performedText(t, session),
            ]}
            onPress={() => router.push(sessionPath(playerId, session.id))}
          />
        ))
      )}
    </SafeAreaScrollView>
  );
}

/** Choose an active template: start it now (plan + session) or plan it for later (a frozen plan). */
export function ChooseWorkoutScreen({ playerId }: { playerId: string }) {
  return (
    <RoutePlayerScope playerId={playerId}>
      <ChooseWorkoutView />
    </RoutePlayerScope>
  );
}

function ChooseWorkoutView() {
  const context = useActivePlayer();
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  // `version` changes after "Restore items" so the list reloads.
  const [version, setVersion] = useState(0);
  const state = useLoad(listTemplates, version);
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const busy = useRef(false);
  if (state.status === 'error') {
    return <ErrorScreen testID="choose-error" message="training.errors.loadFailed" fallback="/children" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  const templates = state.value.filter((x: WorkoutTemplate) => x.active);

  /**
   * QB safety gate S2: a Template that still holds a hidden Block / inactive Exercise cannot start a NEW workout.
   * Nothing is added or left out silently — the user edits the Template, restores the items, or cancels.
   */
  const explainUnavailable = (template: WorkoutTemplate, unavailable: UnavailableItems) => {
    const lines = [
      ...unavailable.blocks.map((b) => t('training.unavailableBlock', { name: isolate(b.name) })),
      ...unavailable.exercises.map((e) => t('training.unavailableExercise', { name: isolate(e.name[language]) })),
    ];
    Alert.alert(t('training.unavailableTitle'), `${t('training.unavailableBody')}\n\n${lines.join('\n')}`, [
      { text: t('training.unavailableCancel'), style: 'cancel' },
      {
        text: t('training.unavailableRestore'),
        onPress: () => {
          if (boot.status !== 'ready') return;
          void (async () => {
            try {
              for (const b of unavailable.blocks) await setBlockActive(boot.db, b.id, true, { clock: services.clock });
              for (const e of unavailable.exercises) await setExerciseActive(boot.db, e.id, true, { clock: services.clock });
              setVersion((v) => v + 1);
            } catch (e) {
              console.warn('[training] restore items failed', e);
              setFailure('training.errors.changeFailed');
            }
          })();
        },
      },
      { text: t('training.unavailableEdit'), onPress: () => router.push(templatePath(template.id)) },
    ]);
  };

  const run = async (template: WorkoutTemplate, now: boolean) => {
    if (busy.current || boot.status !== 'ready') return;
    const unavailable = unavailableItemsOf(template);
    if (unavailable.blocks.length > 0 || unavailable.exercises.length > 0) {
      explainUnavailable(template, unavailable);
      return;
    }
    busy.current = true;
    setFailure(null);
    try {
      // The Player this workout is for comes from the context — the one guard for Player-specific writes.
      const playerId = requireActivePlayer(context).id;
      const deps = { ids: services.ids, clock: services.clock };
      if (now) {
        const session = await planAndStart(boot.db, { playerId, templateId: template.id }, deps);
        router.replace(sessionPath(playerId, session.id));
      } else {
        const plan = await planWorkout(boot.db, { playerId, templateId: template.id }, deps);
        router.replace(planPath(playerId, plan.id));
      }
    } catch (e) {
      console.warn('[training] start failed', e);
      if (e instanceof TemplateUnavailableItemsError) explainUnavailable(template, e.unavailable);
      else setFailure(e instanceof MissingPlayerContextError ? 'training.errors.playerRequired' : trainingErrorMessage(e));
    }
    busy.current = false;
  };

  return (
    <SafeAreaScrollView testID="choose-scroll" contentContainerStyle={styles.container}>
      <PlayerTargetLabel />
      <Text style={styles.muted}>{t('training.chooseHint')}</Text>
      {failure ? (
        <Text style={styles.error} testID="choose-failed">
          {t(failure)}
        </Text>
      ) : null}
      {templates.length === 0 ? (
        <Text style={styles.muted} testID="choose-none">
          {t('training.noTemplatesToStart')}
        </Text>
      ) : (
        templates.map((template) => (
          <View key={template.id} style={styles.section} testID={`choose-${template.id}`}>
            <Text style={styles.title}>{template.name}</Text>
            {template.blocks.map((block, i) => (
              <Text key={`${block.id}-${i}`} style={styles.muted}>
                {block.name}
              </Text>
            ))}
            {(() => {
              const u = unavailableItemsOf(template);
              return u.blocks.length > 0 || u.exercises.length > 0 ? (
                <Text style={styles.error} testID={`choose-${template.id}-unavailable`}>
                  {t('training.unavailableBadge')}
                </Text>
              ) : null;
            })()}
            <BigButton
              testID={`choose-${template.id}-start`}
              label={t('training.startNow')}
              onPress={() => void run(template, true)}
            />
            <BigButton
              testID={`choose-${template.id}-plan`}
              variant="secondary"
              label={t('training.planLater')}
              onPress={() => void run(template, false)}
            />
          </View>
        ))
      )}
    </SafeAreaScrollView>
  );
}

/** A planned workout exactly as it was planned (a frozen snapshot), and Start / Open. */
export function PlannedWorkoutScreen({ playerId, planId }: { playerId: string; planId: string }) {
  return (
    <RoutePlayerScope playerId={playerId}>
      <PlannedWorkoutView planId={planId} />
    </RoutePlayerScope>
  );
}

function PlannedWorkoutView({ planId }: { planId: string }) {
  const playerId = requireActivePlayer(useActivePlayer()).id;
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const state = useLoad(useCallback((db: Db) => getPlannedWorkout(db, planId), [planId]));
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const busy = useRef(false);
  // A plan of another Player is never shown (or started) under this Player.
  if (
    state.status === 'error' ||
    (state.status === 'ready' && (state.value === null || state.value.playerId !== playerId))
  ) {
    return <ErrorScreen testID="plan-error" message="training.errors.notFound" fallback="/children" />;
  }
  if (state.status === 'loading') return <LoadingScreen />;
  const plan = state.value as PlannedWorkout;

  const start = async () => {
    if (busy.current || boot.status !== 'ready') return;
    busy.current = true;
    setFailure(null);
    try {
      const session = await startSession(boot.db, plan.id, { ids: services.ids, clock: services.clock });
      router.replace(sessionPath(playerId, session.id));
    } catch (e) {
      console.warn('[training] start failed', e);
      setFailure(trainingErrorMessage(e));
    }
    busy.current = false;
  };

  return (
    <SafeAreaScrollView testID="plan-scroll" contentContainerStyle={styles.container}>
      <PlayerTargetLabel />
      <Text style={styles.title} testID="plan-name" accessibilityRole="header">
        {plan.name}
      </Text>
      <Text style={styles.muted}>{t('training.frozenNote')}</Text>
      {plan.items.map((item, i) => {
        // A block's name heads its first exercise.
        const header = i === 0 || item.blockName !== plan.items[i - 1]!.blockName ? item.blockName : null;
        return (
          <View key={item.position} style={styles.gap}>
            {header ? <Text style={styles.heading}>{header}</Text> : null}
            <View style={styles.section} testID={`plan-item-${item.position}`}>
              <Text style={styles.name} testID={`plan-item-${item.position}-name`}>
                {item.exercise.name[language]}
              </Text>
              <Text style={styles.status} testID={`plan-item-${item.position}-rx`}>
                {prescriptionText(t, item.exercise.measurement, item.prescription, item.exercise.exerciseId)}
              </Text>
              {timeCapHint(t, item.exercise.measurement, item.prescription.target, item.exercise.exerciseId) ? (
                <Text style={styles.muted} testID={`plan-item-${item.position}-time-cap-hint`}>
                  {t('training.timeCapHint')}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {failure ? (
        <Text style={styles.error} testID="plan-failed">
          {t(failure)}
        </Text>
      ) : null}
      {plan.sessionId === null ? (
        <>
          {plan.items.length > 0 ? (
            <BigButton testID="plan-start" label={t('training.startPlan')} onPress={() => void start()} />
          ) : null}
          <BigButton
            testID="plan-edit"
            variant="secondary"
            label={t('training.builder.editPlan')}
            onPress={() => router.push(editPlanPath(playerId, plan.id))}
          />
        </>
      ) : (
        <BigButton
          testID="plan-open-session"
          variant="secondary"
          label={t('training.openSession')}
          onPress={() => router.push(sessionPath(playerId, plan.sessionId!))}
        />
      )}
    </SafeAreaScrollView>
  );
}

function Row({
  testID,
  title,
  lines,
  onPress,
}: {
  testID: string;
  title: string;
  lines: string[];
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={stripBidi([title, ...lines].join(', '))}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <Text style={styles.name} testID={`${testID}-name`}>
        {title}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.muted} testID={`${testID}-line-${i}`}>
          {line}
        </Text>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  gap: { gap: spacing.sm },
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  plannedCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  plannedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    minHeight: touch.buttonMinHeight,
    gap: 2,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  heading: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'auto', marginTop: spacing.sm },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  status: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
