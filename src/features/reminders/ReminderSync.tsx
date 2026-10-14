import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onDataChanged } from '@/data/changes';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { expoReminderPermissions, type ReminderPermissions } from '@/services/notifications/reminderPermissions';
import { expoReminderScheduler, type ReminderScheduler } from '@/services/notifications/reminderScheduler';

import { createReconcileRunner, reconcileReminders, reminderWords, type DescribeReminder } from './reminderEngine';

/**
 * CAL-SYNC-NOTIFY-001C — keeps the device's reminders reconciled with the
 * calendar: at app start, when the app comes back to the foreground, when the app
 * language changes, and after every write to the calendar / Players / reminder
 * settings (data change signal).
 * Renders nothing. Reconciles are serialized and coalesced (an import = one run).
 */
export function ReminderSync({
  scheduler = expoReminderScheduler,
  permissions = expoReminderPermissions,
  delayMs,
}: {
  scheduler?: ReminderScheduler;
  permissions?: ReminderPermissions;
  delayMs?: number;
}) {
  const { boot, services } = useApp();
  // `t` changes with the app language: the effect below then re-runs, and its first reconcile
  // rewrites every scheduled reminder in the current language (HE ↔ EN).
  const { t } = useI18n();

  useEffect(() => {
    if (boot.status !== 'ready') return;
    const describe: DescribeReminder = (event, player) => reminderWords(t, event, player);
    const runner = createReconcileRunner(
      () => reconcileReminders({ db: boot.db, scheduler, permissions, now: () => services.clock.wallNow(), describe }),
      delayMs,
    );
    runner.request(); // app start
    const appState = AppState.addEventListener('change', (state) => state === 'active' && runner.request());
    const off = onDataChanged(() => runner.request());
    return () => {
      appState.remove();
      off();
      runner.dispose();
    };
  }, [boot, services, scheduler, permissions, delayMs, t]);

  return null;
}
