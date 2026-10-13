/**
 * CAL-SYNC-NOTIFY-001 — event reminders on this device (001A: pure domain).
 * Rules (0–5), the device preference (explicit Player targeting) and the
 * desired-reminder calculation + diff. No notification library here: 001C
 * schedules what `desiredReminders` returns.
 */
export * from './rules';
export * from './preferences';
export * from './schedule';
export * from './editor';
