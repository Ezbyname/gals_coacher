import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { listActivityTypes } from '@/data/local/activityTypes/activityTypeRepository';
import type { ActivityType } from '@/domain/activityType';
import { inheritedRules, SUGGESTED_TYPE_DEFAULTS, withTypeRules, type ReminderPreferences, type ReminderRule } from '@/domain/reminders';
import { useApp } from '@/features/AppProvider';
import { activityTypeLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { readReminderPreferences, saveReminderPreferences } from '@/preferences/reminderPreference';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing } from '@/ui/theme';

import { RuleListEditor } from './RuleListEditor';
import { rulesSummary } from './ruleLabel';

type Loaded = { readonly prefs: ReminderPreferences; readonly type: ActivityType };

/**
 * One activity type's default reminders (CAL-REMINDER-RULES-002). No list of its own = the type uses the general
 * reminders; a list (even an empty one) is the type's own. Suggested defaults (Game, Team training) are previewed and
 * applied only on request — never silently.
 */
export function ReminderTypeDefaults({ typeId }: { typeId: string }) {
  const { boot } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | 'error' | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      Promise.all([listActivityTypes(boot.db), readReminderPreferences([])])
        .then(([types, prefs]) => {
          const type = types.find((candidate) => candidate.id === typeId);
          if (active) setLoaded(type ? { prefs, type } : 'error');
        })
        .catch((e: unknown) => {
          console.warn('[reminders] type defaults load failed', e);
          if (active) setLoaded('error');
        });
      return () => {
        active = false;
      };
    }, [boot, typeId]),
  );

  if (boot.status === 'error' || loaded === 'error') {
    return <ErrorScreen testID="reminder-type-error" message="reminders.loadFailed" fallback="/settings/reminders" />;
  }
  if (loaded === null) return <LoadingScreen />;
  const { prefs, type } = loaded;
  const own = prefs.typeRules[type.id];
  const name = activityTypeLabel(t, type);
  const suggested = type.builtin === 'GAME' || type.builtin === 'TEAM_TRAINING' ? SUGGESTED_TYPE_DEFAULTS[type.builtin] : null;

  const save = (rules: readonly ReminderRule[] | null) => {
    const next = withTypeRules(prefs, type.id, rules);
    setLoaded({ prefs: next, type });
    setSaveFailed(false);
    saveReminderPreferences(next).catch((e: unknown) => {
      console.warn('[reminders] type defaults save failed', e);
      setSaveFailed(true);
    });
  };

  return (
    <KeyboardSafeScrollView testID="reminder-type-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading} accessibilityRole="header" testID="reminder-type-name">
        {name}
      </Text>
      <Text style={styles.muted}>{t('reminders.types.screenIntro', { name })}</Text>

      {own === undefined ? (
        <>
          <Text style={styles.body} testID="reminder-type-inherits">
            {t('reminders.types.usingGeneral', { rules: rulesSummary(t, inheritedRules(prefs, type.id).rules) })}
          </Text>
          <BigButton testID="reminder-type-customize" variant="secondary" label={t('reminders.types.customize')} onPress={() => save(prefs.rules)} />
        </>
      ) : (
        <>
          <RuleListEditor prefix="reminder-type" rules={own} onChange={save} />
          <BigButton testID="reminder-type-use-general" variant="secondary" label={t('reminders.types.useGeneral')} onPress={() => save(null)} />
        </>
      )}

      {suggested !== null ? (
        <Card testID="reminder-type-suggested" style={styles.gap}>
          <Text style={styles.body}>{t('reminders.types.suggestedPreview', { rules: rulesSummary(t, suggested) })}</Text>
          <BigButton testID="reminder-type-suggested-apply" variant="secondary" label={t('reminders.types.suggestedApply')} onPress={() => save(suggested)} />
        </Card>
      ) : null}

      {saveFailed ? (
        <Text style={styles.error} testID="reminder-type-save-error">
          {t('reminders.saveFailed')}
        </Text>
      ) : null}
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  gap: { gap: spacing.sm },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  body: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
