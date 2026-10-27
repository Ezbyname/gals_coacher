import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExerciseMeasurement } from '@/domain/exercise/exercise';
import {
  repeatPlan,
  useActualPerformance as baselineFromActuals,
  type BaselineDisabledReason,
  type BaselineResult,
  type PreviousExercisePerformance,
  type PreviousSet,
} from '@/domain/training/previousPerformance';
import { STALE_AFTER_DAYS, suggestProgression } from '@/domain/training/progressionSuggestion';
import type { Prescription } from '@/domain/training/training';
import { formatShortDate } from '@/features/calendar/formatEventTime';
import type { Measurement } from '@/data/local/training/trainingRepository';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate, stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { colors, spacing, touch } from '@/ui/theme';

import { actualSetText, formatNumber, plannedSetText, prescriptionText } from './trainingLabels';

const REASON: Record<BaselineDisabledReason, TranslationKey> = {
  NON_UNIFORM_PLAN: 'training.prev.nonUniform',
  UNSUPPORTED_MEASUREMENT: 'training.prev.unsupported',
  TIMED_RESULT_NOT_A_GOAL: 'training.prev.timed',
  NOT_APPLICABLE_NOW: 'training.prev.notApplicable',
};

const measurementsOf = (s: PreviousSet): Measurement[] =>
  s.values.map((v) => ({ kind: v.kind, measuredValue: v.measuredValue, finalValue: v.finalValue, wasEdited: v.edited, source: 'MANUAL' as const, confidence: null }));

/**
 * TRAINING-PROGRESSION-001 — the compact "Last performance" disclosure of one exercise of the Builder (collapsed by default; omitted by the
 * caller when there is no eligible previous performance). It only READS: opening it writes nothing. The two actions hand a Prescription to
 * the caller, which puts it into the NEW draft (still editable); the business rules live in the domain (`repeatPlan`, `useActualPerformance`).
 * Planned and Actual are always shown apart: "Previous plan 3 × 10 @ 40 kg" and, separately, the sets as they were really done.
 */
export function LastPerformance(props: {
  testID: string;
  name: string;
  performance: PreviousExercisePerformance;
  /** TRAINING-PROGRESSION-002: the newest eligible occurrences (newest first, at most two; the first is `performance`) the suggestion is derived from. */
  recent: readonly PreviousExercisePerformance[];
  /** The clock reading the suggestion's staleness is judged against (passed in so the pure engine stays deterministic). */
  nowMs: number;
  measurement: ExerciseMeasurement;
  onApply: (prescription: Prescription) => void;
}) {
  const { t, language } = useI18n();
  const { performance: p, measurement } = props;
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const suggestion = suggestProgression({ occurrences: props.recent, current: measurement, nowMs: props.nowMs, staleAfterDays: STALE_AFTER_DAYS });
  const repeat: BaselineResult = repeatPlan(p, measurement); // pure and cheap: no memo needed
  const baseline: BaselineResult = baselineFromActuals(p, measurement);
  const planText = p.previousPlan.uniform
    ? prescriptionText(t, measurement, { sets: p.previousPlan.sets, target: p.previousPlan.target, loadKg: p.previousPlan.loadKg, restSec: p.previousPlan.restSec, timeSemantics: p.previousPlan.timeSemantics })
    : t('training.prev.nonUniform');
  const setText = (s: PreviousSet): string => {
    if (s.status === 'SKIPPED') return t('training.skipped');
    if (s.status === 'PENDING') return t('training.notDone');
    const final = actualSetText(t, measurementsOf(s), true);
    return s.values.some((v) => v.edited) ? t('training.prev.editedLine', { value: final, measured: actualSetText(t, measurementsOf(s), false) }) : final;
  };
  const apply = (r: BaselineResult) => {
    if (!r.ok) return;
    props.onApply(r.prescription);
    setApplied(true);
  };
  return (
    <View style={styles.box} testID={props.testID}>
      <Pressable
        testID={`${props.testID}-toggle`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={stripBidi([t('training.prev.toggleA11y', { name: props.name }), suggestion.status === 'SUGGESTION' ? t('training.prev.suggest.badge') : null].filter(Boolean).join('. '))}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.8 }]}>
        <Text style={styles.toggleLabel}>{t('training.prev.lastPerformance')}</Text>
        {suggestion.status === 'SUGGESTION' ? (
          <Text style={styles.badge} testID={`${props.testID}-badge`}>
            {t('training.prev.suggest.badge')}
          </Text>
        ) : null}
      </Pressable>
      {open ? (
        <View style={styles.panel} testID={`${props.testID}-panel`}>
          <Text style={styles.muted} testID={`${props.testID}-when`}>
            {t('training.prev.when', { date: formatShortDate(p.startedAt, language), name: isolate(p.sessionName) })}
          </Text>
          <Text style={styles.heading}>{t('training.prev.previousPlan')}</Text>
          <Text style={styles.text} testID={`${props.testID}-plan`}>
            {planText}
          </Text>
          <Text style={styles.heading}>{t('training.prev.actual')}</Text>
          {p.sets.map((s) => (
            <Text key={s.setNumber} style={styles.text} testID={`${props.testID}-set-${s.setNumber}`}>
              {t('training.prev.setLine', {
                label: s.planned ? t('training.setLabel', { n: s.setNumber }) : [t('training.setLabel', { n: s.setNumber }), t('training.extraSet')].join(' · '),
                value: setText(s),
              })}
            </Text>
          ))}
          {suggestion.status === 'SUGGESTION' ? (
            <View style={styles.suggestion} testID={`${props.testID}-suggestion`}>
              <Text style={styles.heading}>{t('training.prev.suggest.heading')}</Text>
              <Text style={styles.text} testID={`${props.testID}-suggestion-value`}>
                {t(suggestion.changedField === 'target' && measurement.type === 'TIME' ? 'training.prev.suggest.considerGoal' : 'training.prev.suggest.consider', {
                  value: suggestion.changedField === 'load' ? t('training.unit.kg', { n: formatNumber(suggestion.suggestedValue) }) : plannedSetText(t, measurement, suggestion.suggestedValue, null, suggestion.prescription.timeSemantics) ?? '',
                })}
              </Text>
              <Text style={styles.heading}>{t('training.prev.suggest.reasonHeading')}</Text>
              <Text style={styles.text} testID={`${props.testID}-suggestion-reason`}>
                {t(`training.prev.suggest.basis.${suggestion.reasonCode}`, {
                  sets: suggestion.prescription.sets,
                  load: suggestion.currentValue !== null && suggestion.changedField === 'load' ? t('training.unit.kg', { n: formatNumber(suggestion.currentValue) }) : '',
                  time: t('training.unit.seconds', { n: formatNumber(Math.max(...suggestion.evidence.occurrences.flatMap((o) => o.results))) }),
                })}
              </Text>
              <Action
                testID={`${props.testID}-suggest-apply`}
                label={t('training.prev.suggest.apply')}
                a11y={t('training.prev.suggest.applyA11y', { name: props.name })}
                enabled
                onPress={() => {
                  props.onApply(suggestion.prescription);
                  setSuggestionApplied(true);
                }}
              />
              {suggestionApplied ? (
                <Text style={styles.muted} testID={`${props.testID}-suggest-applied`} accessibilityLiveRegion="polite">
                  {t('training.prev.suggest.applied')}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.muted} testID={`${props.testID}-no-suggestion`}>
              {t('training.prev.suggest.none', { reason: t(`training.prev.suggest.why.${suggestion.reasonCode}`) })}
            </Text>
          )}
          <Action testID={`${props.testID}-repeat`} label={t('training.prev.repeatPlan')} a11y={t('training.prev.repeatA11y', { name: props.name })} enabled={repeat.ok} onPress={() => apply(repeat)} />
          {!repeat.ok ? (
            <Text style={styles.muted} testID={`${props.testID}-repeat-reason`}>
              {t(REASON[repeat.reason])}
            </Text>
          ) : null}
          <Action testID={`${props.testID}-baseline`} label={t('training.prev.useBaseline')} a11y={t('training.prev.baselineA11y', { name: props.name })} enabled={baseline.ok} onPress={() => apply(baseline)} />
          {!baseline.ok ? (
            <Text style={styles.muted} testID={`${props.testID}-baseline-reason`}>
              {t(REASON[baseline.reason])}
            </Text>
          ) : null}
          {applied ? (
            <Text style={styles.muted} testID={`${props.testID}-applied`} accessibilityLiveRegion="polite">
              {t('training.prev.applied')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Action(props: { testID: string; label: string; a11y: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={stripBidi(`${props.a11y}`)}
      accessibilityState={{ disabled: !props.enabled }}
      disabled={!props.enabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.action, !props.enabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
      <Text style={styles.actionLabel}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  toggle: { minHeight: touch.buttonMinHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  badge: { fontSize: 12, fontWeight: '800', color: colors.courtDark, marginStart: spacing.sm },
  suggestion: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.courtDark },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: colors.courtDark },
  panel: { gap: spacing.sm, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heading: { fontSize: 14, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  text: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 13, color: colors.inkMuted, textAlign: 'auto' },
  action: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.courtDark, backgroundColor: colors.surface },
  actionLabel: { fontSize: 15, fontWeight: '700', color: colors.courtDark, textAlign: 'center' },
});
