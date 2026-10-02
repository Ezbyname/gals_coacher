import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { useApp } from '@/features/AppProvider';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

/** Phase 0 proof screen: shows that each foundation layer is wired up on-device. */
export default function DiagnosticsScreen() {
  const { boot, services } = useApp();

  const dbLine =
    boot.status === 'ready'
      ? `ready · schema v${boot.migration.to} (applied this launch: ${boot.migration.applied.length})`
      : boot.status === 'error'
        ? `ERROR · ${boot.error.message}`
        : 'opening…';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Row label="Platform" value={`${Platform.OS} ${String(Platform.Version)}`} />
      <Row label="App version" value={Constants.expoConfig?.version ?? 'unknown'} />
      <Row label="SQLite" value={dbLine} testID="diag-sqlite" />
      <Row label="Supabase" value={env.supabase ? 'configured' : 'not configured (offline only)'} />
      <BigButton variant="secondary" label="Test haptics" onPress={() => services.haptics.success()} />
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
