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
 * Schema v17 (QB-WORKOUT-BUILDER-001A) added planned_workout_items.section_id / source_block_id (NULL for every older
 * row) — proven in plannedWorkoutCompositionMigration.sqlite.test.ts.
 */
const PLANNED_ITEMS_PRE_V17 =
  'planned_workout_id, position, block_name, exercise_id, exercise_name_he, exercise_name_en, measurement_type, comparison_policy, uses_load, distance_m, sets, target, load_kg, rest_sec';

/**
 * `SELECT … FROM <table> ORDER BY rowid`, limited to the columns that existed
 * before the later additive migrations (calendar_events before v13, players
 * before v14, planned_workout_items before v17).
 */
export function selectPreV13(table: string): string {
  const columns =
    table === 'calendar_events'
      ? CALENDAR_EVENTS_PRE_V13
      : table === 'players'
        ? PLAYERS_PRE_V14
        : table === 'planned_workout_items'
          ? PLANNED_ITEMS_PRE_V17
          : '*';
  return `SELECT ${columns} FROM ${table} ORDER BY rowid`;
}
