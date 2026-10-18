import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { listActivityTypes } from '@/data/local/activityTypes/activityTypeRepository';
import { listPlayers } from '@/data/local/players/playerRepository';
import {
  inheritedRules,
  MAX_REMINDER_RULES,
  togglePlayer,
  type ReminderPreferences,
} from '@/domain/reminders';
import type { ActivityType } from '@/domain/activityType';
import { useApp } from '@/features/AppProvider';
import { activityTypeLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { isolate, stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { readReminderPreferences, saveReminderPreferences } from '@/preferences/reminderPreference';
import {
  expoReminderPermissions,
  type NotificationPermissionState,
  type ReminderPermissions,
} from '@/services/notifications/reminderPermissions';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { MultiChoiceChips } from '@/ui/MultiChoiceChips';
import { colors, spacing, touch } from '@/ui/theme';

import { RuleListEditor } from './RuleListEditor';
import { rulesSummary } from './ruleLabel';

export { ruleLabel } from './ruleLabel';

export const reminderTypePath = (typeId: string) => `/settings/reminder-type/${typeId}` as const;

/**
 * CAL-SYNC-NOTIFY-001B — Settings → Training reminders. Edits THIS device's
 * reminder preference (001A model, AsyncStorage): master switch, the Players
 * whose events remind here (explicit only), and 0–5 rules. Shows the
 * notification / exact-alarm permission state with the way to fix it.
 * Nothing is scheduled here (001C).
 */
type Loaded = {
  readonly prefs: ReminderPreferences;
  readonly players: readonly { id: string; name: string }[];
  readonly types: readonly ActivityType[];
};

export function ReminderSettings({ permissions = expoReminderPermissions }: { permissions?: ReminderPermissions }) {
  const { boot } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | 'error' | null>(null);
  const [notif, setNotif] = useState<NotificationPermissionState | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listPlayers(boot.db) // the ACTIVE roster: archived Players are never offered
        .then(async (profiles) => {
          const players = profiles.map((p) => ({ id: p.player.id as string, name: p.player.name }));
          const prefs = await readReminderPreferences(players.map((p) => p.id));
          const types = (await listActivityTypes(boot.db)).filter((type) => type.active);
          if (active) setLoaded({ prefs, players, types });
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
  const { prefs, players, types } = loaded;

  const save = (next: ReminderPreferences) => {
    setLoaded({ prefs: next, players, types });
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

  const exact = permissions.exactAlarmState();

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
            // The exact-alarm grant is NOT observable from JS: neutral guidance, never "it is off".
            <>
              <Text style={styles.muted} testID="reminders-exact-info">
                {t('reminders.permission.exactMayRequire')}
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
      <RuleListEditor prefix="reminders" rules={prefs.rules} onChange={(rules) => save({ ...prefs, rules })} />

      <Text style={styles.section}>{t('reminders.types.title')}</Text>
      <Text style={styles.muted}>{t('reminders.types.hint')}</Text>
      {types.map((type) => {
        const own = prefs.typeRules[type.id];
        const name = activityTypeLabel(t, type);
        return (
          <Card key={type.id} testID={`reminders-type-${type.id}`} style={styles.ruleRow}>
            <View style={styles.flex}>
              <Text style={styles.body} testID={`reminders-type-${type.id}-name`}>
                {name}
              </Text>
              <Text style={styles.muted} testID={`reminders-type-${type.id}-summary`}>
                {own === undefined
                  ? t('reminders.types.inherits', { rules: rulesSummary(t, inheritedRules(prefs, type.id).rules) })
                  : rulesSummary(t, own)}
              </Text>
            </View>
            <RowAction
              testID={`reminders-type-${type.id}-edit`}
              label={t('reminders.edit')}
              a11y={t('reminders.types.editA11y', { name })}
              onPress={() => router.push(reminderTypePath(type.id))}
            />
          </Card>
        );
      })}
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
