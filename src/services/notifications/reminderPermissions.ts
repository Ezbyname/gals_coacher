import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Linking, Platform } from 'react-native';

/**
 * CAL-SYNC-NOTIFY-001B — the permission state behind Training Reminders
 * (Settings only: nothing is scheduled here; that is 001C).
 *
 * Notifications (Android 13+: POST_NOTIFICATIONS): asked only when the user
 * turns reminders on, after the reminder channel exists (Android shows the
 * prompt only then). Denied for good → "Open settings".
 *
 * Exact alarms (Android 12+: SCHEDULE_EXACT_ALARM, "Alarms & reminders"): no
 * JS API reads this grant (design §2), so on Android 12+ the state is UNKNOWN
 * and Settings says precise timing may be unavailable, with "Open settings".
 *
 * `expo-notifications` is NATIVE code: an app build without it (e.g. the
 * current dev client) reports UNAVAILABLE instead of crashing — the library is
 * loaded only after its native module is found.
 */
export type NotificationPermissionState = 'GRANTED' | 'UNDETERMINED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';
export type ExactAlarmState = 'NOT_REQUIRED' | 'UNKNOWN';

export interface ReminderPermissions {
  notificationState(): Promise<NotificationPermissionState>;
  /** Creates the reminder channel, then asks. Never call at launch — only when the user turns reminders on. */
  requestNotifications(): Promise<NotificationPermissionState>;
  exactAlarmState(): ExactAlarmState;
  openNotificationSettings(): Promise<void>;
  openExactAlarmSettings(): Promise<void>;
}

export const REMINDER_CHANNEL_ID = 'training-reminders';
const PACKAGE = Constants.expoConfig?.android?.package ?? 'com.ezbyname.galscoacher';

type NotificationsModule = typeof import('expo-notifications');

function notifications(): NotificationsModule | null {
  // The JS library throws on import when its native module is missing: check first.
  if (requireOptionalNativeModule('ExpoNotificationPermissionsModule') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

function stateOf(p: { granted: boolean; status: string; canAskAgain: boolean }): NotificationPermissionState {
  if (p.granted || p.status === 'granted') return 'GRANTED';
  if (p.status === 'undetermined') return 'UNDETERMINED';
  return p.canAskAgain ? 'DENIED' : 'BLOCKED';
}

async function openIntent(action: string, fallback: () => Promise<void>): Promise<void> {
  if (Platform.OS !== 'android') return fallback();
  try {
    await Linking.sendIntent(action, [{ key: 'android.provider.extra.APP_PACKAGE', value: PACKAGE }]);
  } catch {
    await fallback();
  }
}

export const expoReminderPermissions: ReminderPermissions = {
  async notificationState() {
    const n = notifications();
    if (n === null) return 'UNAVAILABLE';
    return stateOf(await n.getPermissionsAsync());
  },
  async requestNotifications() {
    const n = notifications();
    if (n === null) return 'UNAVAILABLE';
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'Training reminders',
        importance: n.AndroidImportance.HIGH,
      });
    }
    return stateOf(await n.requestPermissionsAsync());
  },
  exactAlarmState() {
    return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 31 ? 'UNKNOWN' : 'NOT_REQUIRED';
  },
  openNotificationSettings: () => openIntent('android.settings.APP_NOTIFICATION_SETTINGS', () => Linking.openSettings()),
  openExactAlarmSettings: () => openIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', () => Linking.openSettings()),
};
