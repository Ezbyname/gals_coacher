import { requireOptionalNativeModule } from 'expo-modules-core';
import { Linking } from 'react-native';

import type { ExternalPayload } from '@/domain/calendarSync';

/**
 * CAL-SYNC-NOTIFY-001D — the device calendar as the sync engine sees it (expo-calendar,
 * Android CalendarContract: a Google account's calendar on the phone is written through the
 * phone; no Google API / OAuth). expo-calendar is NATIVE code: an app build without it
 * (the current dev client) reports available() = false and the engine does nothing.
 */
export type CalendarPermissionState = 'GRANTED' | 'UNDETERMINED' | 'DENIED' | 'BLOCKED';

export interface WritableCalendar {
  readonly id: string;
  readonly title: string;
  /** The account it belongs to (e.g. a Google address), for telling calendars apart. */
  readonly account: string | null;
}

export interface DeviceCalendar {
  available(): boolean;
  permission(): Promise<CalendarPermissionState>;
  /** Ask only when the user turns calendar sync on. */
  requestPermission(): Promise<CalendarPermissionState>;
  writableCalendars(): Promise<WritableCalendar[]>;
  calendarExists(calendarId: string): Promise<boolean>;
  /** The entry as the calendar holds it now, or null when it no longer exists. */
  readEvent(externalEventId: string): Promise<ExternalPayload | null>;
  createEvent(calendarId: string, payload: ExternalPayload): Promise<string>;
  updateEvent(externalEventId: string, payload: ExternalPayload): Promise<void>;
  deleteEvent(externalEventId: string): Promise<void>;
  openSettings(): Promise<void>;
}

type CalendarModule = typeof import('expo-calendar');

function lib(): CalendarModule {
  if (requireOptionalNativeModule('CalendarNext') === null) throw new Error('expo-calendar is not in this app build');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-calendar') as CalendarModule;
}

const stateOf = (p: { granted: boolean; status: string; canAskAgain: boolean }): CalendarPermissionState =>
  p.granted || p.status === 'granted' ? 'GRANTED' : p.status === 'undetermined' ? 'UNDETERMINED' : p.canAskAgain ? 'DENIED' : 'BLOCKED';

const details = (p: ExternalPayload) => ({
  title: p.title,
  startDate: new Date(p.startAt),
  endDate: new Date(p.endAt),
  location: p.location ?? '',
  notes: p.notes ?? '',
});

const time = (v: Date | string | undefined) => (v === undefined ? NaN : new Date(v).getTime());

export const expoDeviceCalendar: DeviceCalendar = {
  available: () => requireOptionalNativeModule('CalendarNext') !== null,
  permission: async () => stateOf(await lib().getCalendarPermissions()),
  requestPermission: async () => stateOf(await lib().requestCalendarPermissions()),
  async writableCalendars() {
    return (await lib().getCalendars())
      .filter((c) => c.allowsModifications)
      .map((c) => ({ id: c.id, title: c.title, account: c.source?.name ?? null }));
  },
  async calendarExists(calendarId) {
    return (await lib().getCalendars()).some((c) => c.id === calendarId && c.allowsModifications);
  },
  async readEvent(externalEventId) {
    try {
      const e = await lib().ExpoCalendarEvent.get(externalEventId);
      return {
        title: e.title ?? '',
        startAt: time(e.startDate as Date | string | undefined),
        endAt: time(e.endDate as Date | string | undefined),
        location: e.location ? e.location : null,
        notes: e.notes ? e.notes : null,
      };
    } catch {
      return null; // deleted outside the app (or no longer readable): recreated by the next sync
    }
  },
  async createEvent(calendarId, payload) {
    const calendar = await lib().ExpoCalendar.get(calendarId);
    return (await calendar.createEvent(details(payload))).id;
  },
  async updateEvent(externalEventId, payload) {
    await (await lib().ExpoCalendarEvent.get(externalEventId)).update(details(payload));
  },
  async deleteEvent(externalEventId) {
    await (await lib().ExpoCalendarEvent.get(externalEventId)).delete();
  },
  openSettings: () => Linking.openSettings(),
};
