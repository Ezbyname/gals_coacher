import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onDataChanged } from '@/data/changes';
import { activityTypeLabel } from '@/features/calendar/calendarLabels';
import { useApp } from '@/features/AppProvider';
import { createReconcileRunner } from '@/features/reminders/reminderEngine';
import { useI18n } from '@/i18n/I18nProvider';
import { expoDeviceCalendar, type DeviceCalendar } from '@/services/calendar/deviceCalendar';

import { syncDeviceCalendar, type DescribeEntry } from './calendarSyncEngine';

/**
 * CAL-SYNC-NOTIFY-001D — keeps the chosen device calendar mirroring the app: at app
 * start, when the app comes back to the foreground, when the language changes, and
 * after every committed calendar / Player write or calendar-sync settings change.
 * Renders nothing; runs are serialized and coalesced (an import = one run).
 */
export function CalendarSync({ device = expoDeviceCalendar, delayMs }: { device?: DeviceCalendar; delayMs?: number }) {
  const { boot, services } = useApp();
  const { t } = useI18n();

  useEffect(() => {
    if (boot.status !== 'ready') return;
    const title: DescribeEntry = (event, player) =>
      t('calendarSync.entryTitle', { player, what: event.title ?? activityTypeLabel(t, event.activityType) });
    const runner = createReconcileRunner(() => syncDeviceCalendar({ db: boot.db, device, now: () => services.clock.wallNow(), title }), delayMs);
    runner.request();
    const appState = AppState.addEventListener('change', (state) => state === 'active' && runner.request());
    const off = onDataChanged((topic) => topic !== 'reminders' && runner.request());
    return () => {
      appState.remove();
      off();
      runner.dispose();
    };
  }, [boot, services, device, delayMs, t]);

  return null;
}
