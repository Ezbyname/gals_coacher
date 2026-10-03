import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { AppProvider } from '@/features/AppProvider';
import { keepNativeSplash } from '@/features/startup/nativeSplash';
import { StartupReadySignal } from '@/features/startup/StartupReadySignal';
import { StartupSplash } from '@/features/startup/StartupSplash';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';
import { createServices } from '@/services';
import { colors } from '@/ui/theme';

// Keep the native splash up until the app-level coach splash is ready (module
// scope, so it runs before the first render as Expo recommends).
keepNativeSplash();

export default function RootLayout() {
  // One composition root: the same services feed language/direction and the app.
  const services = useMemo(() => createServices(), []);
  return (
    <StartupSplash>
      <I18nProvider direction={services.direction}>
        <AppProvider services={services}>
          <StatusBar style="dark" />
          <StartupReadySignal />
          <AppStack />
        </AppProvider>
      </I18nProvider>
    </StartupSplash>
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
