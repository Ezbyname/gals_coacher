/**
 * Older migration tests compare rows "before" and "after" upgrading to the
 * current schema. Schema v13 (CAL-TEXT-IMPORT-001B) added three nullable
 * calendar_events columns (location, source, import_batch_id), proven
 * separately in calendarImportMigration.sqlite.test.ts; those tests compare the
 * columns that existed before v13 — exactly what they proved before.
 */
const CALENDAR_EVENTS_PRE_V13 =
  'id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at, completed_at, completion_source';
/** Schema v14 (CAL-SCHEDULE-IMPORT-002A) added players.team_name — proven in playerTeamNameMigration.sqlite.test.ts. */
const PLAYERS_PRE_V14 = 'id, family_id, name, date_of_birth, height_cm, created_at, updated_at';

/**
 * `SELECT … FROM <table> ORDER BY rowid`, limited to the columns that existed
 * before the later additive migrations (calendar_events before v13, players
 * before v14).
 */
export function selectPreV13(table: string): string {
  const columns = table === 'calendar_events' ? CALENDAR_EVENTS_PRE_V13 : table === 'players' ? PLAYERS_PRE_V14 : '*';
  return `SELECT ${columns} FROM ${table} ORDER BY rowid`;
}
