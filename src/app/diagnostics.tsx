import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { useApp } from '@/features/AppProvider';
import { ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

/** On-device proof screen: shows that each foundation layer is wired up. */
export default function DiagnosticsScreen() {
  const { boot, services } = useApp();
  const { t, direction, nativeDirection, directionMismatch } = useI18n();

  const dbLine =
    boot.status === 'ready'
      ? t('diagnostics.sqliteReady', { version: boot.migration.to, applied: boot.migration.applied.length })
      : boot.status === 'error'
        ? t('diagnostics.sqliteError', { message: boot.error.message })
        : t('diagnostics.sqliteOpening');

  const directionLine = t('diagnostics.directionValue', { actual: nativeDirection, expected: direction });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Row label={t('diagnostics.platform')} value={ltr(`${Platform.OS} ${String(Platform.Version)}`)} />
      <Row label={t('diagnostics.appVersion')} value={Constants.expoConfig?.version ? ltr(Constants.expoConfig.version) : t('common.unknown')} />
      <Row label={t('diagnostics.sqlite')} value={dbLine} testID="diag-sqlite" />
      <Row
        label={t('diagnostics.supabase')}
        value={env.supabase ? t('diagnostics.supabaseConfigured') : t('diagnostics.supabaseOffline')}
      />
      <Row
        label={t('diagnostics.direction')}
        value={directionMismatch ? `${directionLine} · ${t('diagnostics.directionMismatch')}` : directionLine}
        testID="diag-direction"
      />
      <Row
        label={t('diagnostics.rtlSample')}
        value={t('diagnostics.rtlSampleValue', {
          shots: ltr('18/20'),
          percent: ltr('80%'),
          sprint: ltr('4.38'),
          rest: ltr('00:45'),
          distance: ltr('20m'),
        })}
        testID="diag-rtl-sample"
      />
      <BigButton variant="secondary" label={t('diagnostics.testHaptics')} onPress={() => services.haptics.success()} />
    </ScrollView>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 13, color: colors.inkMuted, marginBottom: spacing.xs },
  value: { fontSize: 16, color: colors.ink, fontWeight: '600' },
});
