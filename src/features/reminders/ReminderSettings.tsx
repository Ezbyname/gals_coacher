import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { listPlayers } from '@/data/local/players/playerRepository';
import {
  addRule,
  BEFORE_UNITS,
  beforeStartParts,
  beforeStartRule,
  MAX_REMINDER_RULES,
  removeRule,
  replaceRule,
  togglePlayer,
  type BeforeUnit,
  type ReminderPreferences,
  type ReminderRule,
  type RuleEditError,
} from '@/domain/reminders';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { isolate, ltr, stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { readReminderPreferences, saveReminderPreferences } from '@/preferences/reminderPreference';
import type { LocalDateTime } from '@/services/clock/localCalendarDate';
import {
  expoReminderPermissions,
  type NotificationPermissionState,
  type ReminderPermissions,
} from '@/services/notifications/reminderPermissions';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { DateTimeField } from '@/ui/DateTimeField';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { MultiChoiceChips } from '@/ui/MultiChoiceChips';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

/**
 * CAL-SYNC-NOTIFY-001B — Settings → Training reminders. Edits THIS device's
 * reminder preference (001A model, AsyncStorage): master switch, the Players
 * whose events remind here (explicit only), and 0–5 rules. Shows the
 * notification / exact-alarm permission state with the way to fix it.
 * Nothing is scheduled here (001C).
 */
type Editor = {
  readonly index: number | null; // null = a new rule
  readonly kind: ReminderRule['kind'];
  readonly time: { readonly hour: number; readonly minute: number };
  readonly value: string;
  readonly unit: BeforeUnit;
};
type Loaded = { readonly prefs: ReminderPreferences; readonly players: readonly { id: string; name: string }[] };

const pad = (n: number) => String(n).padStart(2, '0');
const NEW_EDITOR: Editor = { index: null, kind: 'BEFORE_START', time: { hour: 8, minute: 0 }, value: '60', unit: 'MINUTES' };

export function ruleLabel(t: (key: TranslationKey, params?: Record<string, string | number>) => string, rule: ReminderRule): string {
  if (rule.kind === 'DAY_OF_AT') return t('reminders.rule.dayOfAt', { time: ltr(`${pad(rule.hour)}:${pad(rule.minute)}`) });
  const { value, unit } = beforeStartParts(rule.minutes);
  const key = `reminders.rule.before${unit === 'MINUTES' ? 'Minutes' : unit === 'HOURS' ? 'Hours' : 'Days'}${value === 1 ? 'One' : ''}`;
  return t(key as TranslationKey, { value });
}

export function ReminderSettings({ permissions = expoReminderPermissions }: { permissions?: ReminderPermissions }) {
  const { boot } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | 'error' | null>(null);
  const [notif, setNotif] = useState<NotificationPermissionState | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editError, setEditError] = useState<RuleEditError | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listPlayers(boot.db) // the ACTIVE roster: archived Players are never offered
        .then(async (profiles) => {
          const players = profiles.map((p) => ({ id: p.player.id as string, name: p.player.name }));
          const prefs = await readReminderPreferences(players.map((p) => p.id));
          if (active) setLoaded({ prefs, players });
        })
        .catch((e: unknown) => {
          console.warn('[reminders] settings load failed', e);
          if (active) setLoaded('error');
        });
      return () => {
        active = false;
      };
    }, [boot]),
  );

  // The permission state, again whenever the app comes back (e.g. from the system settings).
  const refresh = useCallback(() => {
    permissions
      .notificationState()
      .then(setNotif)
      .catch((e: unknown) => {
        console.warn('[reminders] permission state failed', e);
        setNotif('UNAVAILABLE');
      });
  }, [permissions]);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (boot.status === 'error' || loaded === 'error') {
    return <ErrorScreen testID="reminders-error" message="reminders.loadFailed" fallback="/settings" />;
  }
  if (loaded === null) return <LoadingScreen />;
  const { prefs, players } = loaded;

  const save = (next: ReminderPreferences) => {
    setLoaded({ prefs: next, players });
    setSaveFailed(false);
    saveReminderPreferences(next).catch((e: unknown) => {
      console.warn('[reminders] save failed', e);
      setSaveFailed(true);
    });
  };

  const ask = async () => setNotif(await permissions.requestNotifications().catch(() => 'UNAVAILABLE' as const));
  const toggleEnabled = (enabled: boolean) => {
    save({ ...prefs, enabled });
    // Asked only when the user turns reminders ON — explained first, never at launch.
    if (enabled && (notif === 'UNDETERMINED' || notif === 'DENIED')) {
      Alert.alert(t('reminders.permission.askTitle'), t('reminders.permission.askBody'), [
        { text: t('reminders.permission.notNow'), style: 'cancel' },
        { text: t('reminders.permission.continue'), onPress: () => void ask() },
      ]);
    }
  };

  const openEditor = (index: number | null) => {
    setEditError(null);
    if (index === null) return setEditor(NEW_EDITOR);
    const rule = prefs.rules[index]!;
    setEditor(
      rule.kind === 'DAY_OF_AT'
        ? { ...NEW_EDITOR, index, kind: 'DAY_OF_AT', time: { hour: rule.hour, minute: rule.minute } }
        : { ...NEW_EDITOR, index, kind: 'BEFORE_START', value: String(beforeStartParts(rule.minutes).value), unit: beforeStartParts(rule.minutes).unit },
    );
  };
  const saveEditor = () => {
    if (editor === null) return;
    let rule: ReminderRule;
    if (editor.kind === 'DAY_OF_AT') rule = { kind: 'DAY_OF_AT', hour: editor.time.hour, minute: editor.time.minute };
    else {
      const built = beforeStartRule(editor.value, editor.unit);
      if (!built.ok) return setEditError(built.error);
      rule = built.rule;
    }
    const result = editor.index === null ? addRule(prefs.rules, rule) : replaceRule(prefs.rules, editor.index, rule);
    if (!result.ok) return setEditError(result.error);
    save({ ...prefs, rules: result.rules });
    setEditor(null);
  };

  const exact = permissions.exactAlarmState();
  const timeValue: LocalDateTime | null = editor === null ? null : { year: 2026, month: 1, day: 1, ...editor.time };

  return (
    <KeyboardSafeScrollView testID="reminders-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading} accessibilityRole="header">
        {t('reminders.title')}
      </Text>
      <View style={styles.row}>
        <Text style={styles.body} nativeID="reminders-enabled-label">
          {t('reminders.enabled')}
        </Text>
        <Switch
          testID="reminders-enabled"
          accessibilityLabel={t('reminders.enabled')}
          value={prefs.enabled}
          onValueChange={toggleEnabled}
        />
      </View>
      <Text style={styles.muted}>{t('reminders.intro')}</Text>

      {prefs.enabled ? (
        <View style={styles.gap} testID="reminders-permissions">
          {notif === 'GRANTED' ? (
            <Text style={styles.ok} testID="reminders-notif-granted">
              {t('reminders.permission.granted')}
            </Text>
          ) : notif === 'UNAVAILABLE' ? (
            <Text style={styles.warning} testID="reminders-notif-unavailable">
              {t('reminders.permission.unavailable')}
            </Text>
          ) : notif === 'BLOCKED' ? (
            <>
              <Text style={styles.warning} testID="reminders-notif-blocked">
                {t('reminders.permission.blocked')}
              </Text>
              <BigButton testID="reminders-notif-settings" variant="secondary" label={t('reminders.permission.openSettings')}
                onPress={() => void permissions.openNotificationSettings()} />
            </>
          ) : notif !== null ? (
            <>
              <Text style={styles.warning} testID="reminders-notif-off">
                {t('reminders.permission.off')}
              </Text>
              <BigButton testID="reminders-notif-allow" variant="secondary" label={t('reminders.permission.allow')} onPress={() => void ask()} />
            </>
          ) : null}
          {exact === 'UNKNOWN' && notif !== 'UNAVAILABLE' ? (
            <>
              <Text style={styles.warning} testID="reminders-exact-warning">
                {t('reminders.permission.exactUnavailable')}
              </Text>
              <BigButton testID="reminders-exact-settings" variant="secondary" label={t('reminders.permission.openSettings')}
                onPress={() => void permissions.openExactAlarmSettings()} />
            </>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.section}>{t('reminders.playersLabel')}</Text>
      {players.length === 0 ? (
        <Text style={styles.muted} testID="reminders-players-none">
          {t('reminders.noPlayers')}
        </Text>
      ) : (
        <MultiChoiceChips<string>
          testID="reminders-players"
          label={t('reminders.playersHint')}
          choices={players.map((p) => ({ value: p.id, label: p.name }))}
          selected={prefs.players}
          onToggle={(id) => save(togglePlayer(prefs, id))}
          selectedLabel={(name) => t('reminders.playerSelected', { name: isolate(name) })}
        />
      )}
      {prefs.enabled && players.length > 0 && prefs.players.length === 0 ? (
        <Text style={styles.warning} testID="reminders-players-required">
          {t('reminders.playersRequired')}
        </Text>
      ) : null}

      <Text style={styles.section}>{t('reminders.rulesLabel', { max: MAX_REMINDER_RULES })}</Text>
      {prefs.rules.length === 0 ? (
        <Text style={styles.muted} testID="reminders-rules-none">
          {t('reminders.noRules')}
        </Text>
      ) : null}
      {prefs.rules.map((rule, i) => {
        const text = ruleLabel(t, rule);
        return (
          <Card key={`${rule.kind}-${i}`} testID={`reminders-rule-${i}`} style={styles.ruleRow}>
            <Text style={[styles.body, styles.flex]} testID={`reminders-rule-${i}-text`}>
              {text}
            </Text>
            <RowAction testID={`reminders-rule-${i}-edit`} label={t('reminders.edit')} a11y={t('reminders.editA11y', { rule: text })}
              onPress={() => openEditor(i)} />
            <RowAction testID={`reminders-rule-${i}-remove`} label={t('reminders.remove')} a11y={t('reminders.removeA11y', { rule: text })}
              onPress={() => save({ ...prefs, rules: removeRule(prefs.rules, i) })} />
          </Card>
        );
      })}

      {editor !== null ? (
        <Card testID="reminders-editor" style={styles.gap}>
          <ChoiceChips<ReminderRule['kind']>
            testID="reminders-editor-kind"
            label={t('reminders.editor.kind')}
            choices={[
              { value: 'DAY_OF_AT', label: t('reminders.editor.dayOfAt') },
              { value: 'BEFORE_START', label: t('reminders.editor.beforeStart') },
            ]}
            value={editor.kind}
            onChange={(kind) => kind !== null && setEditor({ ...editor, kind })}
          />
          {editor.kind === 'DAY_OF_AT' && timeValue !== null ? (
            <DateTimeField
              testID="reminders-editor-time"
              label={t('reminders.editor.time')}
              mode="time"
              value={timeValue}
              displayValue={ltr(`${pad(editor.time.hour)}:${pad(editor.time.minute)}`)}
              onSelect={(v) => setEditor({ ...editor, time: { hour: v.hour, minute: v.minute } })}
            />
          ) : (
            <>
              <TextField
                testID="reminders-editor-value"
                label={t('reminders.editor.value')}
                value={editor.value}
                onChangeText={(value) => setEditor({ ...editor, value })}
                numeric
                keyboardType="number-pad"
                maxLength={5}
              />
              <ChoiceChips<BeforeUnit>
                testID="reminders-editor-unit"
                label={t('reminders.editor.unit')}
                choices={BEFORE_UNITS.map((u) => ({ value: u, label: t(`reminders.editor.units.${u}`) }))}
                value={editor.unit}
                onChange={(unit) => unit !== null && setEditor({ ...editor, unit })}
              />
            </>
          )}
          {editError !== null ? (
            <Text style={styles.error} testID="reminders-editor-error">
              {t(`reminders.editor.errors.${editError}`, { max: MAX_REMINDER_RULES })}
            </Text>
          ) : null}
          <BigButton testID="reminders-editor-save" label={t('reminders.editor.save')} onPress={saveEditor} />
          <BigButton testID="reminders-editor-cancel" variant="secondary" label={t('common.cancel')} onPress={() => setEditor(null)} />
        </Card>
      ) : (
        <BigButton
          testID="reminders-add"
          variant="secondary"
          label={t('reminders.add')}
          disabled={prefs.rules.length >= MAX_REMINDER_RULES}
          onPress={() => openEditor(null)}
        />
      )}
      {editor === null && prefs.rules.length >= MAX_REMINDER_RULES ? (
        <Text style={styles.muted} testID="reminders-max">
          {t('reminders.max', { max: MAX_REMINDER_RULES })}
        </Text>
      ) : null}
      {saveFailed ? (
        <Text style={styles.error} testID="reminders-save-error">
          {t('reminders.saveFailed')}
        </Text>
      ) : null}
    </KeyboardSafeScrollView>
  );
}

function RowAction({ testID, label, a11y, onPress }: { testID: string; label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={stripBidi(a11y)} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  section: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: spacing.md, textAlign: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: touch.buttonMinHeight },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  gap: { gap: spacing.sm },
  body: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  ok: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  warning: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  action: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.court },
});
