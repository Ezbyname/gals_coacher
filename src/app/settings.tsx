import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { useI18n } from '@/i18n/I18nProvider';
import { LANGUAGES, type Language } from '@/i18n/languages';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useI18n();

  const choose = (next: Language) => {
    if (next === language) return;
    // Confirmation is shown in the current language; the app restarts in the new one.
    Alert.alert(t('settings.restartTitle'), t('settings.restartBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () => {
          setLanguage(next).catch((e: unknown) => console.warn('[i18n] language change failed', e));
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>{t('settings.language')}</Text>
      {LANGUAGES.map((lang) => (
        <BigButton
          key={lang}
          testID={`settings-language-${lang}`}
          variant={lang === language ? 'primary' : 'secondary'}
          selected={lang === language}
          label={t(`language.${lang}`)}
          onPress={() => choose(lang)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
});
