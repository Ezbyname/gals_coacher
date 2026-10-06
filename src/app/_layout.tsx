import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppProvider } from '@/features/AppProvider';
import { MainNavBar } from '@/features/navigation/MainNavBar';
import { UnsavedChangesProvider } from '@/features/navigation/unsavedChanges';
import { keepNativeSplash } from '@/features/startup/nativeSplash';
import { StartupReadySignal } from '@/features/startup/StartupReadySignal';
import { StartupSplash } from '@/features/startup/StartupSplash';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';
import { createServices } from '@/services';
import { BottomInsetHandledContext } from '@/ui/bottomInset';
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

/** The screens, with the main navigation below them (NAV-001); unsaved changes are guarded app-wide. */
function AppStack() {
  return (
    <UnsavedChangesProvider>
      <View style={styles.shell}>
        {/* The navigation bar keeps clear of the bottom system area, so screens do not. */}
        <BottomInsetHandledContext.Provider value={true}>
          <ScreenStack />
        </BottomInsetHandledContext.Provider>
        <MainNavBar />
      </View>
    </UnsavedChangesProvider>
  );
}

function ScreenStack() {
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
      <Stack.Screen name="children/index" options={{ title: t('nav.players') }} />
      <Stack.Screen name="children/new" options={{ title: t('players.form.createTitle') }} />
      <Stack.Screen name="children/[id]" options={{ title: t('players.form.editTitle') }} />
      <Stack.Screen
        name="children/[id]/self-assessments/index"
        options={{ title: t('selfAssessment.title') }}
      />
      <Stack.Screen
        name="children/[id]/self-assessments/new"
        options={{ title: t('selfAssessment.newTitle') }}
      />
      <Stack.Screen name="children/[id]/schedule/index" options={{ title: t('calendar.title') }} />
      <Stack.Screen name="children/[id]/schedule/new" options={{ title: t('calendar.newTitle') }} />
      <Stack.Screen
        name="children/[id]/schedule/[eventId]/index"
        options={{ title: t('calendar.detailsTitle') }}
      />
      <Stack.Screen
        name="children/[id]/schedule/[eventId]/edit"
        options={{ title: t('calendar.editTitle') }}
      />
      <Stack.Screen name="calendar" options={{ title: t('nav.calendar') }} />
      <Stack.Screen name="exercises" options={{ title: t('nav.exercises') }} />
      <Stack.Screen name="history" options={{ title: t('nav.history') }} />
      <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
      <Stack.Screen name="settings/activity-types/index" options={{ title: t('activityTypes.title') }} />
      <Stack.Screen name="settings/activity-types/new" options={{ title: t('activityTypes.newTitle') }} />
      <Stack.Screen name="diagnostics" options={{ title: t('nav.diagnostics') }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
});
