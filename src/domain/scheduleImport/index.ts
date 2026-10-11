/**
 * CAL-SCHEDULE-IMPORT-002 — schedule import from text and Excel / XLSX.
 * 002A: the shared foundation — one normalized candidate contract, the source
 * adapter boundary (the weekly text import behind it) and exact team matching.
 * Every source ends in the same Preview → Confirm → CalendarEvent batch write.
 */
export * from './candidate';
export * from './adapter';
export * from './teams';
export * from './xlsx';
export * from './fixtures';
