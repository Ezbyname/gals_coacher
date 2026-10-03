import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { AppProvider } from '@/features/AppProvider';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';
import { createServices } from '@/services';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  // One composition root: the same services feed language/direction and the app.
  const services = useMemo(() => createServices(), []);
  return (
    <I18nProvider direction={services.direction}>
      <AppProvider services={services}>
        <StatusBar style="dark" />
        <AppStack />
      </AppProvider>
    </I18nProvider>
  );
}

function AppStack() {
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: t('app.name') }} />
      <Stack.Screen name="quick-training" options={{ title: t('nav.quickTraining') }} />
      <Stack.Screen name="children" options={{ title: t('nav.players') }} />
      <Stack.Screen name="exercises" options={{ title: t('nav.exercises') }} />
      <Stack.Screen name="history" options={{ title: t('nav.history') }} />
      <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
      <Stack.Screen name="diagnostics" options={{ title: t('nav.diagnostics') }} />
    </Stack>
  );
}
