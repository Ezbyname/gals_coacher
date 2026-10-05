import type { Migration } from './types';

/**
 * Append-only list of local SQLite migrations. Never edit a shipped migration;
 * add a new one. Domain tables arrive with their slice (see
 * docs/ARCHITECTURE.md §7).
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'app_meta',
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
  {
    // Slice 1.1. SQL guards structure only; codes (positions, hand, experience,
    // frequency) are validated in the domain, not with CHECK lists.
    version: 2,
    name: 'players',
    sql: `
      CREATE TABLE families (
        id TEXT PRIMARY KEY NOT NULL
      );

      CREATE TABLE players (
        id TEXT PRIMARY KEY NOT NULL,
        family_id TEXT NOT NULL REFERENCES families (id),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        date_of_birth TEXT NOT NULL
          CHECK (date_of_birth GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        height_cm INTEGER CHECK (height_cm IS NULL OR (typeof(height_cm) = 'integer' AND height_cm > 0)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX players_family_id ON players (family_id);

      CREATE TABLE player_sports (
        player_id TEXT NOT NULL REFERENCES players (id),
        sport TEXT NOT NULL,
        PRIMARY KEY (player_id, sport)
      );

      CREATE TABLE basketball_player_profiles (
        player_id TEXT PRIMARY KEY NOT NULL,
        sport TEXT NOT NULL DEFAULT 'BASKETBALL' CHECK (sport = 'BASKETBALL'),
        primary_position TEXT,
        secondary_position TEXT,
        dominant_hand TEXT,
        experience TEXT,
        weekly_frequency TEXT,
        FOREIGN KEY (player_id, sport) REFERENCES player_sports (player_id, sport)
      );
    `,
  },
  {
    // Slice 1.2. Generic self-assessment storage (subjective; not results). SQL
    // guards structure and the 1–5 range; category codes are validated in the
    // domain, not with CHECK lists. Rows are never updated or deleted.
    version: 3,
    name: 'self_assessments',
    sql: `
      CREATE TABLE self_assessments (
        id TEXT PRIMARY KEY NOT NULL,
        player_id TEXT NOT NULL,
        sport TEXT NOT NULL,
        taken_at INTEGER NOT NULL CHECK (typeof(taken_at) = 'integer'),
        FOREIGN KEY (player_id, sport) REFERENCES player_sports (player_id, sport)
      );

      CREATE INDEX self_assessments_history ON self_assessments (player_id, sport, taken_at);

      CREATE TABLE self_assessment_ratings (
        assessment_id TEXT NOT NULL REFERENCES self_assessments (id),
        category TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5),
        PRIMARY KEY (assessment_id, category)
      );
    `,
  },
  {
    // Slice 1.3. One-off calendar events owned by a Player (plans, never
    // training sessions). Generic table: type codes are validated in the
    // domain, not with a CHECK list. The composite sport FK only applies when
    // sport is set (SQLite skips a composite FK with a NULL column). Blank text
    // checks strip ASCII whitespace (plain trim() strips spaces only); the
    // domain stays the authority and the read rejects anything not normalized.
    version: 4,
    name: 'calendar_events',
    sql: `
      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY NOT NULL,
        player_id TEXT NOT NULL REFERENCES players (id),
        type TEXT NOT NULL,
        sport TEXT,
        start_at INTEGER NOT NULL CHECK (typeof(start_at) = 'integer'),
        end_at INTEGER CHECK (end_at IS NULL OR (typeof(end_at) = 'integer' AND end_at > start_at)),
        title TEXT CHECK (title IS NULL OR length(trim(title, ' ' || char(9, 10, 11, 12, 13))) > 0),
        notes TEXT CHECK (notes IS NULL OR length(trim(notes, ' ' || char(9, 10, 11, 12, 13))) > 0),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        FOREIGN KEY (player_id, sport) REFERENCES player_sports (player_id, sport)
      );

      CREATE INDEX calendar_events_player_start ON calendar_events (player_id, start_at);
    `,
  },
  {
    // SPORT-LIFE-001. A sport assignment can become inactive without losing
    // anything: the row stays (profiles, self-assessments and calendar events
    // keep referencing it); only its lifecycle changes. Additive: every
    // existing assignment upgrades as active.
    version: 5,
    name: 'player_sports_active',
    sql: `
      ALTER TABLE player_sports
        ADD COLUMN active INTEGER NOT NULL DEFAULT 1
        CHECK (typeof(active) = 'integer' AND active IN (0, 1));
    `,
  },
];
