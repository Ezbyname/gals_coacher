/**
 * Device-local UI preferences (AsyncStorage). Not domain data, never synced,
 * and independent of the SQLite domain database being healthy or migrated.
 */
export const PREFERENCE_KEYS = {
  language: '@gals-coacher/ui.language',
  /** Temporary reload-loop guard: the direction a reload was last attempted for. */
  rtlReloadTarget: '@gals-coacher/rtl.reloadTarget',
  /** CAL-SYNC-NOTIFY-001: this device's reminder preference (JSON, versioned). */
  reminders: '@gals-coacher/reminders.v2',
  /** CAL-REMINDER-RULES-002: the version-1 key. Read once (as v2 with empty type / event rules), removed by the first v2 save. */
  remindersV1: '@gals-coacher/reminders.v1',
  /** CAL-SYNC-NOTIFY-001D: this device's calendar-sync preference (JSON, versioned) — separate from reminders. */
  calendarSync: '@gals-coacher/calendarSync.v1',
  /** TRAINING-TIMER-001: this device's workout-timer preference (sound, vibration; JSON, versioned). */
  timer: '@gals-coacher/timer.v1',
} as const;
