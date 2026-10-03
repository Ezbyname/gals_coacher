import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { AppProvider } from '@/features/AppProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { createServices } from '@/services';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  // One composition root: the same services feed language/direction and the app.
  const services = useMemo(() => createServices(), []);
  return (
    <I18nProvider direction={services.direction}>
      <AppProvider services={services}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="index" options={{ title: 'Gals Coacher' }} />
          <Stack.Screen name="quick-training" options={{ title: 'Quick Training' }} />
          <Stack.Screen name="children" options={{ title: 'Players' }} />
          <Stack.Screen name="exercises" options={{ title: 'Exercises' }} />
          <Stack.Screen name="history" options={{ title: 'History' }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
        </Stack>
      </AppProvider>
    </I18nProvider>
  );
}
