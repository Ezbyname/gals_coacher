import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { listSyncLinks } from '@/data/local/calendarSync/syncLinkRepository';
import { listPlayers } from '@/data/local/players/playerRepository';
import type { CalendarSyncPreferences } from '@/domain/calendarSync';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { isolate, ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { readCalendarSyncPreferences, saveCalendarSyncPreferences } from '@/preferences/calendarSyncPreference';
import { epochToLocalDateTime } from '@/services/clock/localCalendarDate';
import {
  expoDeviceCalendar,
  type CalendarPermissionState,
  type DeviceCalendar,
  type WritableCalendar,
} from '@/services/calendar/deviceCalendar';
import { BigButton } from '@/ui/BigButton';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { MultiChoiceChips } from '@/ui/MultiChoiceChips';
import { colors, spacing, touch } from '@/ui/theme';

/**
 * CAL-SYNC-NOTIFY-001D — Settings → Phone calendar. OFF by default. The user chooses
 * the ONE writable calendar and the Players explicitly (independent of reminders).
 * Turning it off asks first: future Gals Coacher entries are removed, past ones stay.
 * Gals Coacher stays the source of truth: phone-calendar edits never come back.
 */
type Loaded = {
  readonly prefs: CalendarSyncPreferences;
  readonly players: readonly { id: string; name: string }[];
  readonly needsEndTime: number;
  readonly lastSync: number | null;
};
const pad = (n: number) => String(n).padStart(2, '0');

export function CalendarSyncSettings({ device = expoDeviceCalendar }: { device?: DeviceCalendar }) {
  const { boot } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | 'error' | null>(null);
  const [permission, setPermission] = useState<CalendarPermissionState | null>(null);
  const [calendars, setCalendars] = useState<readonly WritableCalendar[] | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const available = device.available();

  const loadCalendars = useCallback(async () => {
    const state = await device.permission();
    setPermission(state);
    setCalendars(state === 'GRANTED' ? await device.writableCalendars() : null);
  }, [device]);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      Promise.all([listPlayers(boot.db), readCalendarSyncPreferences(), listSyncLinks(boot.db)])
        .then(([profiles, prefs, links]) => {
          if (!active) return;
          const synced = links.map((l) => l.syncedAt).filter((v): v is number => v !== null);
          setLoaded({
            prefs,
            players: profiles.map((p) => ({ id: p.player.id as string, name: p.player.name })), // ACTIVE roster only
            needsEndTime: links.filter((l) => l.state === 'NEEDS_END_TIME').length,
            lastSync: synced.length > 0 ? Math.max(...synced) : null,
          });
          if (available && prefs.enabled) void loadCalendars().catch(() => setPermission(null));
        })
        .catch((e: unknown) => {
          console.warn('[calendarSync] settings load failed', e);
          if (active) setLoaded('error');
        });
      return () => {
        active = false;
      };
    }, [boot, available, loadCalendars]),
  );

  if (boot.status === 'error' || loaded === 'error') {
    return <ErrorScreen testID="calsync-error" message="calendarSync.loadFailed" fallback="/settings" />;
  }
  if (loaded === null) return <LoadingScreen />;
  const { prefs, players } = loaded;

  const save = (next: CalendarSyncPreferences) => {
    setLoaded({ ...loaded, prefs: next });
    setSaveFailed(false);
    saveCalendarSyncPreferences(next).catch((e: unknown) => {
      console.warn('[calendarSync] save failed', e);
      setSaveFailed(true);
    });
  };

  const turnOn = () => {
    save({ ...prefs, enabled: true });
    if (!available) return; // this app build cannot write to the phone calendar: no prompt
    void (async () => {
      const state = await device.permission();
      setPermission(state);
      if (state === 'GRANTED') return setCalendars(await device.writableCalendars());
      if (state === 'BLOCKED') return;
      // Explained first, then the system asks (only when the user turns the feature on).
      Alert.alert(t('calendarSync.permission.askTitle'), t('calendarSync.permission.askBody'), [
        { text: t('calendarSync.permission.notNow'), style: 'cancel' },
        {
          text: t('calendarSync.permission.continue'),
          onPress: () =>
            void device.requestPermission().then(async (next) => {
              setPermission(next);
              if (next === 'GRANTED') setCalendars(await device.writableCalendars());
            }),
        },
      ]);
    })();
  };
  const turnOff = () =>
    Alert.alert(t('calendarSync.offTitle'), t('calendarSync.offBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('calendarSync.offConfirm'), style: 'destructive', onPress: () => save({ ...prefs, enabled: false }) },
    ]);

  const chosenMissing = calendars !== null && prefs.calendarId !== null && !calendars.some((c) => c.id === prefs.calendarId);
  const last = loaded.lastSync === null ? null : epochToLocalDateTime(loaded.lastSync);

  return (
    <KeyboardSafeScrollView testID="calsync-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading} accessibilityRole="header">
        {t('calendarSync.title')}
      </Text>
      <View style={styles.row}>
        <Text style={styles.body}>{t('calendarSync.enabled')}</Text>
        <Switch testID="calsync-enabled" accessibilityLabel={t('calendarSync.enabled')} value={prefs.enabled}
          onValueChange={(on) => (on ? turnOn() : turnOff())} />
      </View>
      <Text style={styles.muted}>{t('calendarSync.intro')}</Text>

      {prefs.enabled && !available ? (
        <Text style={styles.warning} testID="calsync-unavailable">
          {t('calendarSync.unavailable')}
        </Text>
      ) : null}
      {prefs.enabled && available && permission === 'BLOCKED' ? (
        <>
          <Text style={styles.warning} testID="calsync-blocked">
            {t('calendarSync.permission.blocked')}
          </Text>
          <BigButton testID="calsync-open-settings" variant="secondary" label={t('calendarSync.permission.openSettings')}
            onPress={() => void device.openSettings()} />
        </>
      ) : null}

      {prefs.enabled && calendars !== null ? (
        calendars.length === 0 ? (
          <Text style={styles.warning} testID="calsync-no-calendars">
            {t('calendarSync.noCalendars')}
          </Text>
        ) : (
          <ChoiceChips<string>
            testID="calsync-calendar"
            label={t('calendarSync.calendarLabel')}
            choices={calendars.map((c, i) => ({
              value: String(i),
              label: c.account ? t('calendarSync.calendarAccount', { title: c.title, account: c.account }) : c.title,
            }))}
            value={(() => {
              const i = calendars.findIndex((c) => c.id === prefs.calendarId);
              return i < 0 ? null : String(i);
            })()}
            onChange={(v) => v !== null && save({ ...prefs, calendarId: calendars[Number(v)]!.id })}
          />
        )
      ) : null}
      {prefs.enabled && chosenMissing ? (
        <Text style={styles.warning} testID="calsync-calendar-missing">
          {t('calendarSync.calendarMissing')}
        </Text>
      ) : null}
      {prefs.enabled && calendars !== null && calendars.length > 0 && prefs.calendarId === null ? (
        <Text style={styles.warning} testID="calsync-calendar-required">
          {t('calendarSync.calendarRequired')}
        </Text>
      ) : null}

      <Text style={styles.section}>{t('calendarSync.playersLabel')}</Text>
      {players.length === 0 ? (
        <Text style={styles.muted} testID="calsync-players-none">
          {t('calendarSync.noPlayers')}
        </Text>
      ) : (
        <MultiChoiceChips<string>
          testID="calsync-players"
          label={t('calendarSync.playersHint')}
          choices={players.map((p) => ({ value: p.id, label: p.name }))}
          selected={prefs.players}
          onToggle={(id) =>
            save({ ...prefs, players: prefs.players.includes(id) ? prefs.players.filter((p) => p !== id) : [...prefs.players, id] })
          }
          selectedLabel={(name) => t('calendarSync.playerSelected', { name: isolate(name) })}
        />
      )}
      {prefs.enabled && players.length > 0 && prefs.players.length === 0 ? (
        <Text style={styles.warning} testID="calsync-players-required">
          {t('calendarSync.playersRequired')}
        </Text>
      ) : null}

      {loaded.needsEndTime > 0 ? (
        <Text style={styles.body} testID="calsync-needs-end">
          {t('calendarSync.needsEndTime', { count: loaded.needsEndTime })}
        </Text>
      ) : null}
      {last !== null ? (
        <Text style={styles.muted} testID="calsync-last">
          {t('calendarSync.lastSync', { when: ltr(`${last.day}/${last.month} ${pad(last.hour)}:${pad(last.minute)}`) })}
        </Text>
      ) : null}
      {saveFailed ? (
        <Text style={styles.warning} testID="calsync-save-error">
          {t('calendarSync.saveFailed')}
        </Text>
      ) : null}
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  section: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: spacing.md, textAlign: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: touch.buttonMinHeight },
  body: { fontSize: 16, color: colors.ink, textAlign: 'auto', flexShrink: 1 },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  warning: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
