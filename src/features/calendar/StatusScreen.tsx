import { router, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

/** A calendar screen that is still loading. */
export function LoadingScreen() {
  const { t } = useI18n();
  return (
    <View style={styles.centered}>
      <Text style={styles.muted}>{t('calendar.loading')}</Text>
    </View>
  );
}

/**
 * A calendar screen that cannot be shown: a localized, user-safe message (raw
 * details are only logged) and a way back — one step back when there is
 * somewhere to go back to, else `fallback`.
 */
export function ErrorScreen({
  message,
  fallback,
  testID,
}: {
  message: TranslationKey;
  fallback: Href;
  testID: string;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.centered}>
      <Text style={styles.error} testID={testID}>
        {t(message)}
      </Text>
      <BigButton
        testID={`${testID}-back`}
        variant="secondary"
        label={t('calendar.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  muted: { fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
});
