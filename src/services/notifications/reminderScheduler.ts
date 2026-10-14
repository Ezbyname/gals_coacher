import { requireOptionalNativeModule } from 'expo-modules-core';

import { REMINDER_CHANNEL_ID } from './reminderPermissions';

/**
 * CAL-SYNC-NOTIFY-001C — the device's scheduled local notifications, as the
 * reminder engine sees them: list the identifiers, schedule one at an instant,
 * cancel one. Notifications are a PROJECTION of the calendar: nothing here reads
 * or writes CalendarEvents. Without the native module (the current dev client)
 * every call throws ReminderSchedulerUnavailable — the engine checks first and
 * never reports a schedule it did not make.
 */
export interface ReminderNotification {
  readonly id: string;
  /** Epoch ms. */
  readonly at: number;
  readonly title: string;
  readonly body: string;
  readonly data: { readonly eventId: string; readonly playerId: string };
}

export interface ReminderScheduler {
  scheduledIds(): Promise<string[]>;
  schedule(notification: ReminderNotification): Promise<void>;
  cancel(id: string): Promise<void>;
}

export class ReminderSchedulerUnavailable extends Error {
  constructor() {
    super('Local notifications are not available in this app build');
    this.name = 'ReminderSchedulerUnavailable';
  }
}

type NotificationsModule = typeof import('expo-notifications');

function notifications(): NotificationsModule {
  if (requireOptionalNativeModule('ExpoNotificationScheduler') === null) throw new ReminderSchedulerUnavailable();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

export const expoReminderScheduler: ReminderScheduler = {
  async scheduledIds() {
    return (await notifications().getAllScheduledNotificationsAsync()).map((r) => r.identifier);
  },
  async schedule(n) {
    const lib = notifications();
    await lib.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { ...n.data } },
      trigger: { type: lib.SchedulableTriggerInputTypes.DATE, date: new Date(n.at), channelId: REMINDER_CHANNEL_ID },
    });
  },
  async cancel(id) {
    await notifications().cancelScheduledNotificationAsync(id);
  },
};
