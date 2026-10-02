import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '@/features/AppProvider';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <AppProvider>
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
  );
}
