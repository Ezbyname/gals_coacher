import { requireOptionalNativeModule } from 'expo-modules-core';
import { Linking, Platform } from 'react-native';

/** CAL-SYNC-NOTIFY-001B — permission states; an app build without the native module never crashes. */
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: jest.fn() }));
const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { HIGH: 4 },
};
jest.mock('expo-notifications', () => mockNotifications);

// eslint-disable-next-line import/first
import { expoReminderPermissions as p, REMINDER_CHANNEL_ID } from '../reminderPermissions';

const native = requireOptionalNativeModule as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('reminder permissions', () => {
  it('no native module in this app build → UNAVAILABLE; the library is never touched', async () => {
    native.mockReturnValue(null);
    expect(await p.notificationState()).toBe('UNAVAILABLE');
    expect(await p.requestNotifications()).toBe('UNAVAILABLE');
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('maps the system answer: granted / undetermined / denied (ask again) / blocked (settings only)', async () => {
    native.mockReturnValue({});
    const cases = [
      [{ granted: true, status: 'granted', canAskAgain: true }, 'GRANTED'],
      [{ granted: false, status: 'undetermined', canAskAgain: true }, 'UNDETERMINED'],
      [{ granted: false, status: 'denied', canAskAgain: true }, 'DENIED'],
      [{ granted: false, status: 'denied', canAskAgain: false }, 'BLOCKED'],
    ] as const;
    for (const [answer, state] of cases) {
      mockNotifications.getPermissionsAsync.mockResolvedValueOnce(answer);
      expect(await p.notificationState()).toBe(state);
    }
  });

  it('Android: the reminder channel exists BEFORE the prompt (else Android 13+ shows none)', async () => {
    native.mockReturnValue({});
    jest.replaceProperty(Platform, 'OS', 'android');
    const order: string[] = [];
    mockNotifications.setNotificationChannelAsync.mockImplementationOnce(async () => (order.push('channel'), null));
    mockNotifications.requestPermissionsAsync.mockImplementationOnce(async () => (order.push('request'), { granted: true, status: 'granted', canAskAgain: true }));
    expect(await p.requestNotifications()).toBe('GRANTED');
    expect(order).toEqual(['channel', 'request']);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(REMINDER_CHANNEL_ID, expect.objectContaining({ importance: 4 }));
  });

  it('exact alarms: Android 12+ (API 31) → UNKNOWN (no JS API reads the grant); older / iOS → not required', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const version = jest.spyOn(Platform, 'Version', 'get').mockReturnValue(37);
    expect(p.exactAlarmState()).toBe('UNKNOWN');
    version.mockReturnValue(30);
    expect(p.exactAlarmState()).toBe('NOT_REQUIRED');
  });

  it('Open settings: the exact-alarm / notification screen for this app, else the app settings', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const send = jest.spyOn(Linking, 'sendIntent').mockResolvedValue(undefined);
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await p.openExactAlarmSettings();
    expect(send).toHaveBeenCalledWith('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'com.ezbyname.galscoacher' },
    ]);
    send.mockRejectedValueOnce(new Error('no activity'));
    await p.openNotificationSettings();
    expect(open).toHaveBeenCalled();
  });
});
