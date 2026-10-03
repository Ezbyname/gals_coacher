import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

export default function HomeScreen() {
  const { t } = useI18n();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('home.title')}</Text>
      <Text style={styles.subtitle}>{t('home.subtitle')}</Text>

      <BigButton
        testID="home-quick-training"
        label={t('home.quickTraining')}
        onPress={() => router.push('/quick-training')}
      />

      <View style={styles.grid}>
        <BigButton variant="secondary" label={t('nav.players')} onPress={() => router.push('/children')} />
        <BigButton variant="secondary" label={t('nav.exercises')} onPress={() => router.push('/exercises')} />
        <BigButton variant="secondary" label={t('nav.history')} onPress={() => router.push('/history')} />
        <BigButton
          testID="home-settings"
          variant="secondary"
          label={t('nav.settings')}
          onPress={() => router.push('/settings')}
        />
        <BigButton
          testID="home-diagnostics"
          variant="secondary"
          label={t('nav.diagnostics')}
          onPress={() => router.push('/diagnostics')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 16, color: colors.inkMuted, marginBottom: spacing.sm },
  grid: { gap: spacing.sm, marginTop: spacing.md },
});
