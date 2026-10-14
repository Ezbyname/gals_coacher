import { requireOptionalNativeModule } from 'expo-modules-core';

/** CAL-SYNC-NOTIFY-001C — the device scheduler adapter. */
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: jest.fn() }));
const mockLib = {
  getAllScheduledNotificationsAsync: jest.fn(async () => [
    { identifier: 'cal:e:0:1', content: { title: 'Daniel · Game', body: '15/10 · 19:00' } },
    { identifier: 'other', content: { title: null, body: null } },
  ]),
  scheduleNotificationAsync: jest.fn(async () => 'cal:e:0:1'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
jest.mock('expo-notifications', () => mockLib);

// eslint-disable-next-line import/first
import { expoReminderScheduler as s, ReminderSchedulerUnavailable } from '../reminderScheduler';

const native = requireOptionalNativeModule as jest.Mock;
afterEach(() => jest.clearAllMocks());

it('without the native module every call refuses (never a silent "scheduled")', async () => {
  native.mockReturnValue(null);
  await expect(s.scheduled()).rejects.toBeInstanceOf(ReminderSchedulerUnavailable);
  await expect(s.schedule({ id: 'cal:e:0:1', at: 1, title: 't', body: 'b', data: { eventId: 'e', playerId: 'p' } })).rejects.toBeInstanceOf(ReminderSchedulerUnavailable);
  expect(mockLib.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('schedules at the exact instant with OUR identifier on the reminders channel; lists; cancels by id', async () => {
  native.mockReturnValue({});
  const at = new Date(2026, 9, 15, 18, 30).getTime();
  await s.schedule({ id: 'cal:e:2:99', at, title: 'Daniel · Game', body: '15/10 · 19:00', data: { eventId: 'e', playerId: 'p' } });
  expect(mockLib.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: 'cal:e:2:99',
    content: { title: 'Daniel · Game', body: '15/10 · 19:00', data: { eventId: 'e', playerId: 'p' } },
    trigger: { type: 'date', date: new Date(at), channelId: 'training-reminders' },
  });
  expect(await s.scheduled()).toEqual([
    { id: 'cal:e:0:1', title: 'Daniel · Game', body: '15/10 · 19:00' },
    { id: 'other', title: '', body: '' },
  ]);
  await s.cancel('cal:e:2:99');
  expect(mockLib.cancelScheduledNotificationAsync).toHaveBeenCalledWith('cal:e:2:99');
});
