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
  {
    // CAL-COMP-001. Explicit, manual completion of a calendar event — never
    // inferred from time. Additive: existing events upgrade as not completed
    // (both NULL). The pair is all-or-nothing; the source code (who marked it)
    // is validated in the domain, like the event type. Being columns of the
    // event row, completion is removed with the event (no orphan).
    version: 6,
    name: 'calendar_event_completion',
    sql: `
      ALTER TABLE calendar_events
        ADD COLUMN completed_at INTEGER
        CHECK (completed_at IS NULL OR typeof(completed_at) = 'integer');
      ALTER TABLE calendar_events
        ADD COLUMN completion_source TEXT
        CHECK (
          (completion_source IS NULL) = (completed_at IS NULL)
          AND (completion_source IS NULL OR length(trim(completion_source)) > 0)
        );
    `,
  },
  {
    // ACTIVITY-001. Activity Types become a catalog. Additive: the six
    // built-ins are seeded with id = the code every existing event already
    // stores in calendar_events.type, so no event row changes and that column
    // stays the one source of an event's type identity. Custom types get a
    // client UUID and a name; built-ins are named by i18n (name NULL).
    // `calendar_events` is deliberately NOT rebuilt to add a foreign key: a
    // rebuild would fail (and the app could not open its data) if any legacy
    // row held an unknown code. The repository checks the reference on every
    // write and every read fails closed instead. Types are never deleted
    // (inactive instead): the trigger refuses a DELETE at the database itself.
    version: 7,
    name: 'activity_types',
    sql: `
      CREATE TABLE activity_types (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        builtin INTEGER NOT NULL CHECK (typeof(builtin) = 'integer' AND builtin IN (0, 1)),
        name TEXT CHECK (name IS NULL OR length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(active) = 'integer' AND active IN (0, 1)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        CHECK ((builtin = 1) = (name IS NULL))
      );

      INSERT INTO activity_types (id, builtin, name, active, created_at, updated_at) VALUES
        ('TEAM_TRAINING', 1, NULL, 1, 0, 0),
        ('PERSONAL_TRAINING', 1, NULL, 1, 0, 0),
        ('GAME', 1, NULL, 1, 0, 0),
        ('GYM', 1, NULL, 1, 0, 0),
        ('RECOVERY', 1, NULL, 1, 0, 0),
        ('OTHER', 1, NULL, 1, 0, 0);

      CREATE TRIGGER activity_types_never_deleted BEFORE DELETE ON activity_types
      BEGIN
        SELECT RAISE(ABORT, 'activity types are never deleted; make them inactive');
      END;
    `,
  },
  {
    // TRAIN-001. The exercise library. Built-in exercises are curated content
    // shipped in code (src/domain/exercise/catalog); here they get a row with
    // their stable id (frozen list below) so every use can reference them and
    // their active state is stored. Custom exercises are full rows (name,
    // difficulty, measurement, …) with their categories / muscles / equipment
    // options / sports in child tables. Codes are validated in the domain (no
    // SQL CHECK lists). Exercises are never deleted — inactive instead — so
    // history keeps every reference; the trigger refuses a DELETE.
    // Additive: no existing table changes.
    version: 8,
    name: 'exercises',
    sql: `
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        builtin INTEGER NOT NULL CHECK (typeof(builtin) = 'integer' AND builtin IN (0, 1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(active) = 'integer' AND active IN (0, 1)),
        name TEXT CHECK (name IS NULL OR length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        difficulty TEXT,
        measurement_type TEXT,
        comparison_policy TEXT,
        uses_load INTEGER CHECK (uses_load IS NULL OR (typeof(uses_load) = 'integer' AND uses_load IN (0, 1))),
        instructions TEXT CHECK (instructions IS NULL OR length(trim(instructions, ' ' || char(9, 10, 11, 12, 13))) > 0),
        tutorial_url TEXT CHECK (tutorial_url IS NULL OR length(trim(tutorial_url)) > 0),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        CHECK ((builtin = 1) = (name IS NULL)),
        CHECK (builtin = 1 OR (difficulty IS NOT NULL AND measurement_type IS NOT NULL AND uses_load IS NOT NULL)),
        CHECK (builtin = 0 OR (difficulty IS NULL AND measurement_type IS NULL AND comparison_policy IS NULL
          AND uses_load IS NULL AND instructions IS NULL AND tutorial_url IS NULL))
      );

      CREATE TABLE exercise_categories (
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        category TEXT NOT NULL,
        PRIMARY KEY (exercise_id, category)
      );

      CREATE TABLE exercise_muscles (
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        muscle TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (exercise_id, muscle)
      );

      CREATE TABLE exercise_equipment (
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        option_index INTEGER NOT NULL CHECK (typeof(option_index) = 'integer' AND option_index >= 0),
        equipment TEXT NOT NULL,
        PRIMARY KEY (exercise_id, option_index, equipment)
      );

      CREATE TABLE exercise_sports (
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        sport TEXT NOT NULL,
        PRIMARY KEY (exercise_id, sport)
      );

      INSERT INTO exercises (id, builtin, name, active, created_at, updated_at) VALUES
        ('JUMPING_JACKS', 1, NULL, 1, 0, 0),
        ('HIGH_KNEES', 1, NULL, 1, 0, 0),
        ('BUTT_KICKS', 1, NULL, 1, 0, 0),
        ('A_SKIP', 1, NULL, 1, 0, 0),
        ('LEG_SWINGS', 1, NULL, 1, 0, 0),
        ('WORLDS_GREATEST_STRETCH', 1, NULL, 1, 0, 0),
        ('HIP_90_90', 1, NULL, 1, 0, 0),
        ('CAT_COW', 1, NULL, 1, 0, 0),
        ('THORACIC_OPEN_BOOK', 1, NULL, 1, 0, 0),
        ('ANKLE_KNEE_TO_WALL', 1, NULL, 1, 0, 0),
        ('BAND_PULL_APART', 1, NULL, 1, 0, 0),
        ('STANDING_HAMSTRING_STRETCH', 1, NULL, 1, 0, 0),
        ('HIP_FLEXOR_STRETCH', 1, NULL, 1, 0, 0),
        ('CHILDS_POSE', 1, NULL, 1, 0, 0),
        ('CALF_STRETCH', 1, NULL, 1, 0, 0),
        ('PUSH_UP', 1, NULL, 1, 0, 0),
        ('INCLINE_PUSH_UP', 1, NULL, 1, 0, 0),
        ('BENCH_DIP', 1, NULL, 1, 0, 0),
        ('PARALLEL_BAR_DIP', 1, NULL, 1, 0, 0),
        ('PULL_UP', 1, NULL, 1, 0, 0),
        ('INVERTED_ROW', 1, NULL, 1, 0, 0),
        ('ONE_ARM_DUMBBELL_ROW', 1, NULL, 1, 0, 0),
        ('BAND_ROW', 1, NULL, 1, 0, 0),
        ('BARBELL_BENCH_PRESS', 1, NULL, 1, 0, 0),
        ('DUMBBELL_BENCH_PRESS', 1, NULL, 1, 0, 0),
        ('DUMBBELL_SHOULDER_PRESS', 1, NULL, 1, 0, 0),
        ('BARBELL_OVERHEAD_PRESS', 1, NULL, 1, 0, 0),
        ('LAT_PULLDOWN', 1, NULL, 1, 0, 0),
        ('SEATED_CABLE_ROW', 1, NULL, 1, 0, 0),
        ('FACE_PULL', 1, NULL, 1, 0, 0),
        ('DUMBBELL_BICEPS_CURL', 1, NULL, 1, 0, 0),
        ('TRICEPS_PUSHDOWN', 1, NULL, 1, 0, 0),
        ('LATERAL_RAISE', 1, NULL, 1, 0, 0),
        ('FARMER_CARRY', 1, NULL, 1, 0, 0),
        ('BODYWEIGHT_SQUAT', 1, NULL, 1, 0, 0),
        ('GOBLET_SQUAT', 1, NULL, 1, 0, 0),
        ('BARBELL_BACK_SQUAT', 1, NULL, 1, 0, 0),
        ('BULGARIAN_SPLIT_SQUAT', 1, NULL, 1, 0, 0),
        ('REVERSE_LUNGE', 1, NULL, 1, 0, 0),
        ('WALKING_LUNGE', 1, NULL, 1, 0, 0),
        ('LATERAL_LUNGE', 1, NULL, 1, 0, 0),
        ('STEP_UP', 1, NULL, 1, 0, 0),
        ('GLUTE_BRIDGE', 1, NULL, 1, 0, 0),
        ('HIP_THRUST', 1, NULL, 1, 0, 0),
        ('ROMANIAN_DEADLIFT', 1, NULL, 1, 0, 0),
        ('SINGLE_LEG_RDL', 1, NULL, 1, 0, 0),
        ('DEADLIFT', 1, NULL, 1, 0, 0),
        ('LEG_PRESS', 1, NULL, 1, 0, 0),
        ('NORDIC_HAMSTRING', 1, NULL, 1, 0, 0),
        ('CALF_RAISE', 1, NULL, 1, 0, 0),
        ('WALL_SIT', 1, NULL, 1, 0, 0),
        ('BAND_LATERAL_WALK', 1, NULL, 1, 0, 0),
        ('PLANK', 1, NULL, 1, 0, 0),
        ('SIDE_PLANK', 1, NULL, 1, 0, 0),
        ('DEAD_BUG', 1, NULL, 1, 0, 0),
        ('BIRD_DOG', 1, NULL, 1, 0, 0),
        ('HOLLOW_HOLD', 1, NULL, 1, 0, 0),
        ('PALLOF_PRESS', 1, NULL, 1, 0, 0),
        ('HANGING_KNEE_RAISE', 1, NULL, 1, 0, 0),
        ('RUSSIAN_TWIST', 1, NULL, 1, 0, 0),
        ('MOUNTAIN_CLIMBERS', 1, NULL, 1, 0, 0),
        ('STABILITY_BALL_ROLLOUT', 1, NULL, 1, 0, 0),
        ('MED_BALL_ROTATIONAL_THROW', 1, NULL, 1, 0, 0),
        ('SQUAT_JUMP', 1, NULL, 1, 0, 0),
        ('BOX_JUMP', 1, NULL, 1, 0, 0),
        ('BROAD_JUMP', 1, NULL, 1, 0, 0),
        ('VERTICAL_JUMP', 1, NULL, 1, 0, 0),
        ('LATERAL_BOUNDS', 1, NULL, 1, 0, 0),
        ('POGO_JUMPS', 1, NULL, 1, 0, 0),
        ('TUCK_JUMP', 1, NULL, 1, 0, 0),
        ('MED_BALL_SLAM', 1, NULL, 1, 0, 0),
        ('MED_BALL_CHEST_PASS', 1, NULL, 1, 0, 0),
        ('KETTLEBELL_SWING', 1, NULL, 1, 0, 0),
        ('SPRINT_10M', 1, NULL, 1, 0, 0),
        ('SPRINT_20M', 1, NULL, 1, 0, 0),
        ('SPRINT_30M_FLYING', 1, NULL, 1, 0, 0),
        ('FALLING_START_ACCELERATION', 1, NULL, 1, 0, 0),
        ('PRO_AGILITY_5_10_5', 1, NULL, 1, 0, 0),
        ('T_DRILL', 1, NULL, 1, 0, 0),
        ('AGILITY_LADDER_FOOTWORK', 1, NULL, 1, 0, 0),
        ('SHUTTLE_RUN', 1, NULL, 1, 0, 0),
        ('BURPEE', 1, NULL, 1, 0, 0),
        ('JUMP_ROPE', 1, NULL, 1, 0, 0),
        ('BATTLE_ROPE_WAVES', 1, NULL, 1, 0, 0),
        ('ROW_500M', 1, NULL, 1, 0, 0),
        ('BIKE_INTERVALS', 1, NULL, 1, 0, 0),
        ('EASY_RUN', 1, NULL, 1, 0, 0),
        ('SKI_ERG_INTERVALS', 1, NULL, 1, 0, 0),
        ('SLED_PUSH', 1, NULL, 1, 0, 0),
        ('BEAR_CRAWL', 1, NULL, 1, 0, 0),
        ('FORM_SHOOTING', 1, NULL, 1, 0, 0),
        ('FREE_THROWS', 1, NULL, 1, 0, 0),
        ('MID_RANGE_SPOT_SHOOTING', 1, NULL, 1, 0, 0),
        ('THREE_POINT_SHOOTING', 1, NULL, 1, 0, 0),
        ('PULL_UP_JUMPER', 1, NULL, 1, 0, 0),
        ('LAYUPS', 1, NULL, 1, 0, 0),
        ('MIKAN_DRILL', 1, NULL, 1, 0, 0),
        ('STATIONARY_DRIBBLING', 1, NULL, 1, 0, 0),
        ('FIGURE_8_DRIBBLE', 1, NULL, 1, 0, 0),
        ('TWO_BALL_DRIBBLING', 1, NULL, 1, 0, 0),
        ('CONE_DRIBBLE_SLALOM', 1, NULL, 1, 0, 0),
        ('WALL_PASSING', 1, NULL, 1, 0, 0),
        ('DEFENSIVE_SLIDES', 1, NULL, 1, 0, 0),
        ('LANE_AGILITY', 1, NULL, 1, 0, 0),
        ('COURT_SPRINTS_SUICIDES', 1, NULL, 1, 0, 0),
        ('TIP_DRILL', 1, NULL, 1, 0, 0),
        ('CLOSEOUT_DRILL', 1, NULL, 1, 0, 0);

      CREATE TRIGGER exercises_never_deleted BEFORE DELETE ON exercises
      BEGIN
        SELECT RAISE(ABORT, 'exercises are never deleted; make them inactive');
      END;
    `,
  },
];
