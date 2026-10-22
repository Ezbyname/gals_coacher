import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useI18n } from '@/i18n/I18nProvider';
import { DEFAULT_TIMER_PREFERENCES, readTimerPreferences, saveTimerPreferences, type TimerPreferences } from '@/preferences/timerPreference';
import { colors, spacing } from '@/ui/theme';

/**
 * TRAINING-TIMER-001: the two timer preferences — sounds and vibration, both ON by default, device-local. They only
 * control the supplementary cues; the screen always shows the same state.
 */
export function TimerSettings() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<TimerPreferences>(DEFAULT_TIMER_PREFERENCES);

  useEffect(() => {
    let active = true;
    readTimerPreferences().then((p) => active && setPrefs(p));
    return () => {
      active = false;
    };
  }, []);

  const change = (next: TimerPreferences) => {
    setPrefs(next);
    saveTimerPreferences(next).catch((e: unknown) => console.warn('[timer] could not save the timer preference', e));
  };

  return (
    <View style={styles.group}>
      <Row
        testID="settings-timer-sound"
        label={t('settings.timerSounds')}
        value={prefs.sound}
        onChange={(sound) => change({ ...prefs, sound })}
      />
      <Row
        testID="settings-timer-vibration"
        label={t('settings.timerVibration')}
        value={prefs.vibration}
        onChange={(vibration) => change({ ...prefs, vibration })}
      />
    </View>
  );
}

function Row({ testID, label, value, onChange }: { testID: string; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{label}</Text>
      <Switch testID={testID} accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 48 },
  text: { flexShrink: 1, fontSize: 16, color: colors.ink, textAlign: 'auto' },
});
