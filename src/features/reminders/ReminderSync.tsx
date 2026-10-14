import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { onDataChanged } from '@/data/changes';
import type { CalendarEvent } from '@/domain/calendarEvent';
import { activityTypeLabel } from '@/features/calendar/calendarLabels';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { epochToLocalDateTime } from '@/services/clock/localCalendarDate';
import { expoReminderPermissions, type ReminderPermissions } from '@/services/notifications/reminderPermissions';
import { expoReminderScheduler, type ReminderScheduler } from '@/services/notifications/reminderScheduler';

import { createReconcileRunner, reconcileReminders, type DescribeReminder } from './reminderEngine';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * CAL-SYNC-NOTIFY-001C — keeps the device's reminders reconciled with the
 * calendar: at app start, when the app comes back to the foreground, and after
 * every write to the calendar / Players / reminder settings (data change signal).
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
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t; // the current language for the next reminder text
  }, [t]);

  useEffect(() => {
    if (boot.status !== 'ready') return;
    const describe: DescribeReminder = (event: CalendarEvent, player) => {
      const tt = tRef.current;
      const start = epochToLocalDateTime(event.startAt);
      const end = event.endAt === null ? null : epochToLocalDateTime(event.endAt);
      const time = end === null ? `${pad(start.hour)}:${pad(start.minute)}` : `${pad(start.hour)}:${pad(start.minute)}–${pad(end.hour)}:${pad(end.minute)}`;
      const when = `${start.day}/${start.month} · ${time}`;
      return {
        title: tt('reminders.notification.title', { player, what: event.title ?? activityTypeLabel(tt, event.activityType) }),
        body: event.location === null ? when : tt('reminders.notification.bodyAt', { when, place: event.location }),
      };
    };
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
  }, [boot, services, scheduler, permissions, delayMs]);

  return null;
}
