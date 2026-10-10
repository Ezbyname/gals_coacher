/**
 * Device-local UI preferences (AsyncStorage). Not domain data, never synced,
 * and independent of the SQLite domain database being healthy or migrated.
 */
export const PREFERENCE_KEYS = {
  language: '@gals-coacher/ui.language',
  /** Temporary reload-loop guard: the direction a reload was last attempted for. */
  rtlReloadTarget: '@gals-coacher/rtl.reloadTarget',
  /** CAL-SYNC-NOTIFY-001: this device's reminder preference (JSON, versioned). */
  reminders: '@gals-coacher/reminders.v1',
} as const;
