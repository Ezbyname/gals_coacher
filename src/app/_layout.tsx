import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppProvider } from '@/features/AppProvider';
import { MainNavBar } from '@/features/navigation/MainNavBar';
import { ReminderSync } from '@/features/reminders/ReminderSync';
import { CalendarSync } from '@/features/calendarSync/CalendarSync';
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
          <ReminderSync />
          <CalendarSync />
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
      <Stack.Screen name="children/[id]/schedule/import" options={{ title: t('calendarImport.title') }} />
      <Stack.Screen
        name="children/[id]/schedule/[eventId]/index"
        options={{ title: t('calendar.detailsTitle') }}
      />
      <Stack.Screen
        name="children/[id]/schedule/[eventId]/edit"
        options={{ title: t('calendar.editTitle') }}
      />
      <Stack.Screen name="children/[id]/training/index" options={{ title: t('training.overviewTitle') }} />
      <Stack.Screen name="children/[id]/training/new" options={{ title: t('training.chooseTitle') }} />
      <Stack.Screen name="children/[id]/training/schedule/[planId]" options={{ title: t('training.schedule.title') }} />
      <Stack.Screen name="children/[id]/training/builder/new" options={{ title: t('training.builder.newTitle') }} />
      <Stack.Screen name="children/[id]/training/builder/[planId]" options={{ title: t('training.builder.editTitle') }} />
      <Stack.Screen
        name="children/[id]/training/plan/[planId]"
        options={{ title: t('training.planTitle') }}
      />
      <Stack.Screen
        name="children/[id]/training/session/[sessionId]"
        options={{ title: t('training.sessionTitle') }}
      />
      <Stack.Screen name="workouts/index" options={{ title: t('training.workoutsTitle') }} />
      <Stack.Screen name="workouts/blocks/new" options={{ title: t('training.newBlockTitle') }} />
      <Stack.Screen name="workouts/blocks/[blockId]" options={{ title: t('training.editBlockTitle') }} />
      <Stack.Screen name="workouts/templates/new" options={{ title: t('training.newTemplateTitle') }} />
      <Stack.Screen
        name="workouts/templates/[templateId]"
        options={{ title: t('training.editTemplateTitle') }}
      />
      <Stack.Screen name="calendar" options={{ title: t('nav.calendar') }} />
      <Stack.Screen name="exercises" options={{ title: t('exercises.libraryTitle') }} />
      <Stack.Screen name="exercises/new" options={{ title: t('exercises.newTitle') }} />
      <Stack.Screen name="exercises/[exerciseId]/index" options={{ title: t('exercises.detailsTitle') }} />
      <Stack.Screen name="exercises/[exerciseId]/edit" options={{ title: t('exercises.editTitle') }} />
      <Stack.Screen name="workouts/professional/index" options={{ title: t('training.professional.title') }} />
      <Stack.Screen name="workouts/professional/[workoutId]" options={{ title: t('training.professional.title') }} />
      <Stack.Screen name="workouts/add-to-workout" options={{ title: t('training.assign.title') }} />
      <Stack.Screen name="exercises/[exerciseId]/add-to-block" options={{ title: t('training.addToBlockTitle') }} />
      <Stack.Screen name="exercises/categories/[nodeKey]" options={{ title: t('taxonomy.title') }} />
      <Stack.Screen name="history" options={{ title: t('nav.history') }} />
      <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
      <Stack.Screen name="settings/activity-types/index" options={{ title: t('activityTypes.title') }} />
      <Stack.Screen name="settings/activity-types/new" options={{ title: t('activityTypes.newTitle') }} />
      <Stack.Screen name="settings/reminder-type/[typeId]" options={{ title: t('reminders.title') }} />
      <Stack.Screen name="diagnostics" options={{ title: t('nav.diagnostics') }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
});
