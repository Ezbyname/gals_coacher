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
];
