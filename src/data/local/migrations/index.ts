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
  },  {
    // TRAIN-002 (ARCHITECTURE §15): reusable blocks / templates (Family-owned)
    // → frozen planned workouts → separate training sessions (Player-owned)
    // whose sets keep the plan next to the actual measurements. History is
    // never deleted; a planned workout and every snapshot are immutable; a
    // finished session is read-only. Additive: no existing table changes.
    version: 9,
    name: 'training',
    sql: `
      CREATE TABLE workout_blocks (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        family_id TEXT NOT NULL REFERENCES families (id),
        name TEXT NOT NULL CHECK (length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(active) = 'integer' AND active IN (0, 1)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer')
      );

      CREATE TABLE workout_block_items (
        block_id TEXT NOT NULL REFERENCES workout_blocks (id),
        position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        sets INTEGER NOT NULL CHECK (typeof(sets) = 'integer' AND sets >= 1),
        target REAL CHECK (target IS NULL OR target > 0),
        load_kg REAL CHECK (load_kg IS NULL OR load_kg > 0),
        rest_sec INTEGER CHECK (rest_sec IS NULL OR (typeof(rest_sec) = 'integer' AND rest_sec >= 0)),
        PRIMARY KEY (block_id, position)
      );

      CREATE TABLE workout_templates (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        family_id TEXT NOT NULL REFERENCES families (id),
        name TEXT NOT NULL CHECK (length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(active) = 'integer' AND active IN (0, 1)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer')
      );

      CREATE TABLE workout_template_blocks (
        template_id TEXT NOT NULL REFERENCES workout_templates (id),
        position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
        block_id TEXT NOT NULL REFERENCES workout_blocks (id),
        PRIMARY KEY (template_id, position)
      );

      CREATE TABLE planned_workouts (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        player_id TEXT NOT NULL REFERENCES players (id),
        template_id TEXT REFERENCES workout_templates (id),
        name TEXT NOT NULL CHECK (length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer')
      );
      CREATE INDEX planned_workouts_by_player ON planned_workouts (player_id, created_at);

      CREATE TABLE planned_workout_items (
        planned_workout_id TEXT NOT NULL REFERENCES planned_workouts (id),
        position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
        block_name TEXT,
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        exercise_name_he TEXT NOT NULL CHECK (length(trim(exercise_name_he)) > 0),
        exercise_name_en TEXT NOT NULL CHECK (length(trim(exercise_name_en)) > 0),
        measurement_type TEXT NOT NULL,
        comparison_policy TEXT,
        uses_load INTEGER NOT NULL CHECK (typeof(uses_load) = 'integer' AND uses_load IN (0, 1)),
        distance_m REAL CHECK (distance_m IS NULL OR distance_m > 0),
        sets INTEGER NOT NULL CHECK (typeof(sets) = 'integer' AND sets >= 1),
        target REAL CHECK (target IS NULL OR target > 0),
        load_kg REAL CHECK (load_kg IS NULL OR load_kg > 0),
        rest_sec INTEGER CHECK (rest_sec IS NULL OR (typeof(rest_sec) = 'integer' AND rest_sec >= 0)),
        PRIMARY KEY (planned_workout_id, position)
      );

      CREATE TABLE training_sessions (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        player_id TEXT NOT NULL REFERENCES players (id),
        planned_workout_id TEXT REFERENCES planned_workouts (id),
        name TEXT NOT NULL CHECK (length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        purpose TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL CHECK (typeof(started_at) = 'integer'),
        ended_at INTEGER CHECK (ended_at IS NULL OR (typeof(ended_at) = 'integer' AND ended_at >= started_at)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        CHECK ((status = 'IN_PROGRESS') = (ended_at IS NULL))
      );
      CREATE INDEX training_sessions_by_player ON training_sessions (player_id, started_at);
      -- A planned workout is performed at most once; a player has at most one session in progress.
      CREATE UNIQUE INDEX training_sessions_one_per_plan ON training_sessions (planned_workout_id)
        WHERE planned_workout_id IS NOT NULL;
      CREATE UNIQUE INDEX training_sessions_one_in_progress ON training_sessions (player_id)
        WHERE status = 'IN_PROGRESS';

      CREATE TABLE session_exercises (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        session_id TEXT NOT NULL REFERENCES training_sessions (id),
        position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
        planned_position INTEGER CHECK (planned_position IS NULL OR typeof(planned_position) = 'integer'),
        block_name TEXT,
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        exercise_name_he TEXT NOT NULL CHECK (length(trim(exercise_name_he)) > 0),
        exercise_name_en TEXT NOT NULL CHECK (length(trim(exercise_name_en)) > 0),
        measurement_type TEXT NOT NULL,
        comparison_policy TEXT,
        uses_load INTEGER NOT NULL CHECK (typeof(uses_load) = 'integer' AND uses_load IN (0, 1)),
        distance_m REAL CHECK (distance_m IS NULL OR distance_m > 0),
        rest_sec INTEGER CHECK (rest_sec IS NULL OR (typeof(rest_sec) = 'integer' AND rest_sec >= 0)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        UNIQUE (session_id, position)
      );

      CREATE TABLE session_sets (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        session_exercise_id TEXT NOT NULL REFERENCES session_exercises (id),
        set_number INTEGER NOT NULL CHECK (typeof(set_number) = 'integer' AND set_number >= 1),
        planned INTEGER NOT NULL CHECK (typeof(planned) = 'integer' AND planned IN (0, 1)),
        planned_target REAL CHECK (planned_target IS NULL OR planned_target > 0),
        planned_load_kg REAL CHECK (planned_load_kg IS NULL OR planned_load_kg > 0),
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        CHECK (planned = 1 OR (planned_target IS NULL AND planned_load_kg IS NULL)),
        UNIQUE (session_exercise_id, set_number)
      );

      CREATE TABLE set_measurements (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        set_id TEXT NOT NULL REFERENCES session_sets (id),
        kind TEXT NOT NULL,
        measured_value REAL NOT NULL,
        final_value REAL NOT NULL,
        was_edited INTEGER NOT NULL CHECK (typeof(was_edited) = 'integer' AND was_edited IN (0, 1)),
        source TEXT NOT NULL CHECK (source IN ('MANUAL', 'CAMERA', 'DEVICE', 'SENSOR')),
        confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        CHECK (source <> 'MANUAL' OR confidence IS NULL),
        UNIQUE (set_id, kind)
      );

      -- Reusable definitions: never deleted (inactive instead).
      CREATE TRIGGER workout_blocks_never_deleted BEFORE DELETE ON workout_blocks
      BEGIN SELECT RAISE(ABORT, 'workout blocks are never deleted; make them inactive'); END;
      CREATE TRIGGER workout_templates_never_deleted BEFORE DELETE ON workout_templates
      BEGIN SELECT RAISE(ABORT, 'workout templates are never deleted; make them inactive'); END;

      -- A planned workout is a frozen snapshot.
      CREATE TRIGGER planned_workouts_frozen_update BEFORE UPDATE ON planned_workouts
      BEGIN SELECT RAISE(ABORT, 'planned workouts are frozen'); END;
      CREATE TRIGGER planned_workouts_never_deleted BEFORE DELETE ON planned_workouts
      BEGIN SELECT RAISE(ABORT, 'planned workouts are never deleted'); END;
      -- Items are written with their plan; nothing is added once the plan has been started.
      CREATE TRIGGER planned_items_frozen_insert BEFORE INSERT ON planned_workout_items
      WHEN EXISTS (SELECT 1 FROM training_sessions WHERE planned_workout_id = NEW.planned_workout_id)
      BEGIN SELECT RAISE(ABORT, 'planned workouts are frozen'); END;
      CREATE TRIGGER planned_items_frozen_update BEFORE UPDATE ON planned_workout_items
      BEGIN SELECT RAISE(ABORT, 'planned workouts are frozen'); END;
      CREATE TRIGGER planned_items_never_deleted BEFORE DELETE ON planned_workout_items
      BEGIN SELECT RAISE(ABORT, 'planned workouts are frozen'); END;

      -- Performed history: never deleted; snapshots never change; a finished session is read-only.
      CREATE TRIGGER training_sessions_never_deleted BEFORE DELETE ON training_sessions
      BEGIN SELECT RAISE(ABORT, 'training sessions are never deleted'); END;
      CREATE TRIGGER training_sessions_closed BEFORE UPDATE ON training_sessions
      WHEN OLD.status <> 'IN_PROGRESS'
        OR NEW.player_id IS NOT OLD.player_id OR NEW.planned_workout_id IS NOT OLD.planned_workout_id
        OR NEW.started_at IS NOT OLD.started_at OR NEW.created_at IS NOT OLD.created_at
        OR NEW.name IS NOT OLD.name OR NEW.purpose IS NOT OLD.purpose
      BEGIN SELECT RAISE(ABORT, 'a finished training session is read-only'); END;
      CREATE TRIGGER session_exercises_frozen_update BEFORE UPDATE ON session_exercises
      BEGIN SELECT RAISE(ABORT, 'session exercises are snapshots'); END;
      CREATE TRIGGER session_exercises_never_deleted BEFORE DELETE ON session_exercises
      BEGIN SELECT RAISE(ABORT, 'training history is never deleted'); END;
      CREATE TRIGGER session_exercises_closed_insert BEFORE INSERT ON session_exercises
      WHEN (SELECT status FROM training_sessions WHERE id = NEW.session_id) IS NOT 'IN_PROGRESS'
      BEGIN SELECT RAISE(ABORT, 'a finished training session is read-only'); END;
      CREATE TRIGGER session_sets_never_deleted BEFORE DELETE ON session_sets
      BEGIN SELECT RAISE(ABORT, 'training history is never deleted'); END;
      CREATE TRIGGER session_sets_closed_insert BEFORE INSERT ON session_sets
      WHEN (SELECT s.status FROM training_sessions s JOIN session_exercises e ON e.session_id = s.id
            WHERE e.id = NEW.session_exercise_id) IS NOT 'IN_PROGRESS'
      BEGIN SELECT RAISE(ABORT, 'a finished training session is read-only'); END;
      CREATE TRIGGER session_sets_closed_update BEFORE UPDATE ON session_sets
      WHEN (SELECT s.status FROM training_sessions s JOIN session_exercises e ON e.session_id = s.id
            WHERE e.id = OLD.session_exercise_id) IS NOT 'IN_PROGRESS'
        OR NEW.session_exercise_id IS NOT OLD.session_exercise_id OR NEW.set_number IS NOT OLD.set_number
        OR NEW.planned IS NOT OLD.planned OR NEW.planned_target IS NOT OLD.planned_target
        OR NEW.planned_load_kg IS NOT OLD.planned_load_kg
      BEGIN SELECT RAISE(ABORT, 'a finished training session is read-only; the plan never changes'); END;
      CREATE TRIGGER set_measurements_never_deleted BEFORE DELETE ON set_measurements
      BEGIN SELECT RAISE(ABORT, 'training history is never deleted'); END;
      CREATE TRIGGER set_measurements_closed_insert BEFORE INSERT ON set_measurements
      WHEN (SELECT s.status FROM training_sessions s JOIN session_exercises e ON e.session_id = s.id
            JOIN session_sets t ON t.session_exercise_id = e.id WHERE t.id = NEW.set_id) IS NOT 'IN_PROGRESS'
      BEGIN SELECT RAISE(ABORT, 'a finished training session is read-only'); END;
      CREATE TRIGGER set_measurements_closed_update BEFORE UPDATE ON set_measurements
      WHEN (SELECT s.status FROM training_sessions s JOIN session_exercises e ON e.session_id = s.id
            JOIN session_sets t ON t.session_exercise_id = e.id WHERE t.id = OLD.set_id) IS NOT 'IN_PROGRESS'
        OR NEW.set_id IS NOT OLD.set_id OR NEW.kind IS NOT OLD.kind
        OR NEW.measured_value IS NOT OLD.measured_value OR NEW.created_at IS NOT OLD.created_at
      BEGIN SELECT RAISE(ABORT, 'a measured value is never rewritten; a finished session is read-only'); END;
    `,
  },
  {
    // TRAIN-TAXONOMY-001A. The training taxonomy: a curated DISCOVERY /
    // NAVIGATION tree over the exercise library (src/domain/taxonomy). Like
    // built-in exercises, built-in nodes are curated in code under stable keys
    // and get a row here (frozen list below) holding only their active state;
    // their hierarchy, order, labels and built-in memberships live in code, so
    // an app update can improve them without touching user data. Users cannot
    // reclassify built-in exercises (trigger); custom exercises' memberships are
    // rows in exercise_taxonomy. Custom nodes are not implemented: the columns
    // exist for cloud-ready family-owned nodes later. Nodes are never deleted
    // (inactive instead). Taxonomy is never part of a plan / session snapshot,
    // so it can never rewrite training history. Additive: no existing table
    // changes.
    version: 10,
    name: 'taxonomy',
    sql: `
      CREATE TABLE taxonomy_nodes (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        builtin INTEGER NOT NULL CHECK (typeof(builtin) = 'integer' AND builtin IN (0, 1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(active) = 'integer' AND active IN (0, 1)),
        parent_id TEXT REFERENCES taxonomy_nodes (id),
        family_id TEXT REFERENCES families (id),
        name TEXT CHECK (name IS NULL OR length(trim(name, ' ' || char(9, 10, 11, 12, 13))) > 0),
        sort_order INTEGER CHECK (sort_order IS NULL OR typeof(sort_order) = 'integer'),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
        CHECK ((builtin = 1) = (name IS NULL)),
        CHECK (builtin = 0 OR (parent_id IS NULL AND family_id IS NULL AND sort_order IS NULL)),
        CHECK (builtin = 1 OR (family_id IS NOT NULL AND sort_order IS NOT NULL))
      );

      CREATE INDEX taxonomy_nodes_by_parent ON taxonomy_nodes (parent_id);

      CREATE TABLE exercise_taxonomy (
        exercise_id TEXT NOT NULL REFERENCES exercises (id),
        node_id TEXT NOT NULL REFERENCES taxonomy_nodes (id),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        PRIMARY KEY (exercise_id, node_id)
      );

      CREATE INDEX exercise_taxonomy_by_node ON exercise_taxonomy (node_id, exercise_id);

      INSERT INTO taxonomy_nodes (id, builtin, active, created_at, updated_at) VALUES
        ('FITNESS', 1, 1, 0, 0),
        ('FITNESS_CHEST', 1, 1, 0, 0),
        ('FITNESS_BACK', 1, 1, 0, 0),
        ('FITNESS_SHOULDERS', 1, 1, 0, 0),
        ('FITNESS_ARMS', 1, 1, 0, 0),
        ('FITNESS_CORE', 1, 1, 0, 0),
        ('FITNESS_CORE_STABILITY', 1, 1, 0, 0),
        ('FITNESS_CORE_ROTATION_FLEXION', 1, 1, 0, 0),
        ('FITNESS_LEGS', 1, 1, 0, 0),
        ('FITNESS_LEGS_SQUAT_LUNGE', 1, 1, 0, 0),
        ('FITNESS_LEGS_HINGE', 1, 1, 0, 0),
        ('FITNESS_LEGS_SINGLE_LEG', 1, 1, 0, 0),
        ('FITNESS_LEGS_CALVES_ANKLES', 1, 1, 0, 0),
        ('FITNESS_FULL_BODY', 1, 1, 0, 0),
        ('FITNESS_STRENGTH', 1, 1, 0, 0),
        ('FITNESS_POWER', 1, 1, 0, 0),
        ('FITNESS_SPEED', 1, 1, 0, 0),
        ('FITNESS_AGILITY', 1, 1, 0, 0),
        ('FITNESS_CONDITIONING', 1, 1, 0, 0),
        ('FITNESS_MOBILITY', 1, 1, 0, 0),
        ('FITNESS_WARMUP', 1, 1, 0, 0),
        ('FITNESS_COOLDOWN', 1, 1, 0, 0),
        ('BASKETBALL', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_FORM_CLOSE_RANGE', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_FREE_THROWS', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_MID_RANGE', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_THREE_POINT', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_CATCH_AND_SHOOT', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_PULL_UP', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_OFF_THE_DRIBBLE', 1, 1, 0, 0),
        ('BASKETBALL_SHOOTING_ON_THE_MOVE', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING_LAYUPS', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING_REVERSE_LAYUP', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING_AROUND_THE_RIM', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING_CONTACT', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING_FLOATER', 1, 1, 0, 0),
        ('BASKETBALL_FINISHING_POWER', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_STATIONARY', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_STRONG_HAND', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_WEAK_HAND', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_CROSSOVER', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_BETWEEN_THE_LEGS', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_BEHIND_THE_BACK', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_HESITATION', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_CHANGE_OF_PACE', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_COMBINATION', 1, 1, 0, 0),
        ('BASKETBALL_BALL_HANDLING_MOVING', 1, 1, 0, 0),
        ('BASKETBALL_PASSING', 1, 1, 0, 0),
        ('BASKETBALL_PASSING_CHEST', 1, 1, 0, 0),
        ('BASKETBALL_PASSING_BOUNCE', 1, 1, 0, 0),
        ('BASKETBALL_PASSING_ONE_HAND', 1, 1, 0, 0),
        ('BASKETBALL_PASSING_ON_THE_MOVE', 1, 1, 0, 0),
        ('BASKETBALL_DEFENSE', 1, 1, 0, 0),
        ('BASKETBALL_DEFENSE_ON_BALL', 1, 1, 0, 0),
        ('BASKETBALL_DEFENSE_CLOSEOUTS', 1, 1, 0, 0),
        ('BASKETBALL_DEFENSE_CHANGE_OF_DIRECTION', 1, 1, 0, 0),
        ('BASKETBALL_DEFENSE_RECOVERY', 1, 1, 0, 0),
        ('BASKETBALL_FOOTWORK', 1, 1, 0, 0),
        ('BASKETBALL_FOOTWORK_JUMP_STOP', 1, 1, 0, 0),
        ('BASKETBALL_FOOTWORK_PIVOT', 1, 1, 0, 0),
        ('BASKETBALL_FOOTWORK_JAB_STEP', 1, 1, 0, 0),
        ('BASKETBALL_FOOTWORK_TRIPLE_THREAT', 1, 1, 0, 0),
        ('BASKETBALL_REBOUNDING', 1, 1, 0, 0),
        ('BASKETBALL_ATHLETIC', 1, 1, 0, 0),
        ('BASKETBALL_ATHLETIC_SPEED', 1, 1, 0, 0),
        ('BASKETBALL_ATHLETIC_AGILITY', 1, 1, 0, 0),
        ('BASKETBALL_ATHLETIC_JUMPING', 1, 1, 0, 0),
        ('BASKETBALL_ATHLETIC_CONDITIONING', 1, 1, 0, 0);

      CREATE TRIGGER taxonomy_nodes_never_deleted BEFORE DELETE ON taxonomy_nodes
      BEGIN SELECT RAISE(ABORT, 'taxonomy nodes are never deleted; make them inactive'); END;
      -- Built-in exercises are classified in code (curated); never in the database.
      CREATE TRIGGER exercise_taxonomy_builtin_curated BEFORE INSERT ON exercise_taxonomy
      WHEN (SELECT builtin FROM exercises WHERE id = NEW.exercise_id) IS NOT 0
      BEGIN SELECT RAISE(ABORT, 'built-in exercises are classified by the curated taxonomy'); END;
      CREATE TRIGGER exercise_taxonomy_frozen_update BEFORE UPDATE ON exercise_taxonomy
      BEGIN SELECT RAISE(ABORT, 'a taxonomy membership is replaced, never rewritten'); END;
    `,
  },
  {
    // TRAIN-TAXONOMY-001B. Professional Basketball content: 17 new built-in
    // drills (ball-handling moves, finishes, shooting on the move, passing,
    // footwork, defense) curated in code (src/domain/exercise/catalog). As
    // with v8, each built-in gets a row with its stable id holding only its
    // active state; content stays in code. Additive: rows only, no schema
    // change; existing rows (user data and history) untouched.
    version: 11,
    name: 'basketball_content',
    sql: `
      INSERT INTO exercises (id, builtin, name, active, created_at, updated_at) VALUES
        ('CROSSOVER_DRIBBLE', 1, NULL, 1, 0, 0),
        ('BETWEEN_THE_LEGS_DRIBBLE', 1, NULL, 1, 0, 0),
        ('BEHIND_THE_BACK_DRIBBLE', 1, NULL, 1, 0, 0),
        ('HESITATION_DRIVE', 1, NULL, 1, 0, 0),
        ('CHANGE_OF_PACE_DRIBBLE', 1, NULL, 1, 0, 0),
        ('COMBO_MOVE_SERIES', 1, NULL, 1, 0, 0),
        ('REVERSE_LAYUPS', 1, NULL, 1, 0, 0),
        ('CONTACT_FINISHES', 1, NULL, 1, 0, 0),
        ('FLOATERS', 1, NULL, 1, 0, 0),
        ('POWER_LAYUPS', 1, NULL, 1, 0, 0),
        ('RELOCATION_SHOOTING', 1, NULL, 1, 0, 0),
        ('ONE_HAND_PUSH_PASS', 1, NULL, 1, 0, 0),
        ('PASSING_ON_THE_MOVE', 1, NULL, 1, 0, 0),
        ('JUMP_STOP_PIVOTS', 1, NULL, 1, 0, 0),
        ('JAB_STEP_SERIES', 1, NULL, 1, 0, 0),
        ('DEFENSIVE_RECOVERY_DRILL', 1, NULL, 1, 0, 0),
        ('ZIGZAG_DEFENSIVE_SLIDES', 1, NULL, 1, 0, 0);
    `,
  },
  {
    // TRAIN-TAXONOMY-001E. Workout Template classification: the coach's
    // explicit 0..3 taxonomy categories for a template, at most one primary.
    // Discovery metadata only — plans and sessions keep their own snapshots
    // and never reference it. Additive: one new table, no existing table
    // changes. The schema itself enforces the shape: a position 0..2 that is
    // unique per template (so never a 4th), one row per (template, node) (so
    // never a duplicate), one primary per template (partial unique index).
    // Rows are replaced as a set, never rewritten in place.
    version: 12,
    name: 'template_classification',
    sql: `
      CREATE TABLE workout_template_taxonomy (
        template_id TEXT NOT NULL REFERENCES workout_templates (id),
        node_id TEXT NOT NULL REFERENCES taxonomy_nodes (id),
        position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position BETWEEN 0 AND 2),
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (typeof(is_primary) = 'integer' AND is_primary IN (0, 1)),
        created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
        PRIMARY KEY (template_id, node_id),
        UNIQUE (template_id, position)
      );

      CREATE INDEX workout_template_taxonomy_by_node ON workout_template_taxonomy (node_id, template_id);
      CREATE UNIQUE INDEX workout_template_taxonomy_one_primary
        ON workout_template_taxonomy (template_id) WHERE is_primary = 1;

      CREATE TRIGGER workout_template_taxonomy_frozen_update BEFORE UPDATE ON workout_template_taxonomy
      BEGIN SELECT RAISE(ABORT, 'a template classification is replaced, never rewritten'); END;
    `,
  },
  {
    // CAL-TEXT-IMPORT-001B. Location becomes first-class event data, and an
    // event can say where it came from. Additive: three nullable columns, no
    // existing row rewritten (every existing event upgrades with NULLs — no
    // location, entered by hand). Text is stored trimmed and non-blank (same
    // CHECK style as title / notes). `source` is NOT restricted to a value set
    // here: known codes are validated in the domain, so a new origin needs no
    // migration. A batch id never exists without a source. The partial index
    // serves "this Player's events of that import" (Undo Import) without
    // touching hand-entered events.
    version: 13,
    name: 'calendar_event_import',
    sql: `
      ALTER TABLE calendar_events
        ADD COLUMN location TEXT
        CHECK (location IS NULL OR length(trim(location, ' ' || char(9, 10, 11, 12, 13))) > 0);
      ALTER TABLE calendar_events
        ADD COLUMN source TEXT
        CHECK (source IS NULL OR length(trim(source, ' ' || char(9, 10, 11, 12, 13))) > 0);
      ALTER TABLE calendar_events
        ADD COLUMN import_batch_id TEXT
        CHECK (
          import_batch_id IS NULL
          OR (length(trim(import_batch_id, ' ' || char(9, 10, 11, 12, 13))) > 0 AND source IS NOT NULL)
        );

      CREATE INDEX calendar_events_player_import_batch
        ON calendar_events (player_id, import_batch_id)
        WHERE import_batch_id IS NOT NULL;
    `,
  },
  {
    // CAL-SCHEDULE-IMPORT-002A. A Player may carry the name of their current
    // team (e.g. "הפועל חוף הכרמל") so a league fixture list can be filtered to
    // that team's games. Metadata only — never identity, ownership or
    // authorization. Additive: one nullable column, every existing Player
    // upgrades with NULL (no team). Stored trimmed and non-blank, at most 60
    // characters (same CHECK style as the other optional texts). One current
    // team in V1; a seasonal membership model may replace it later.
    version: 14,
    name: 'player_team_name',
    sql: `
      ALTER TABLE players
        ADD COLUMN team_name TEXT
        CHECK (
          team_name IS NULL
          OR (length(trim(team_name, ' ' || char(9, 10, 11, 12, 13))) > 0 AND length(team_name) <= 60)
        );
    `,
  },
  {
    // PLAYER-ARCHIVE-001 (owner 2026-10-12). A Player leaves the active roster
    // by ARCHIVE, never by deletion: training history is never destructively
    // deleted (the TRAIN-002 triggers stay exactly as they are). archived_at =
    // when (epoch ms); NULL = active; restoring sets it back to NULL. Additive:
    // one nullable column (every existing Player upgrades active) and guards
    // that refuse NEW Player-owned activity for an archived Player at the
    // database itself. Existing rows stay readable and editable.
    version: 15,
    name: 'player_archive',
    sql: `
      ALTER TABLE players
        ADD COLUMN archived_at INTEGER
        CHECK (archived_at IS NULL OR (typeof(archived_at) = 'integer' AND archived_at > 0));
      CREATE TRIGGER calendar_events_archived_player BEFORE INSERT ON calendar_events
        WHEN (SELECT archived_at FROM players WHERE id = NEW.player_id) IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'an archived player gets no new activity'); END;
      CREATE TRIGGER self_assessments_archived_player BEFORE INSERT ON self_assessments
        WHEN (SELECT archived_at FROM players WHERE id = NEW.player_id) IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'an archived player gets no new activity'); END;
      CREATE TRIGGER planned_workouts_archived_player BEFORE INSERT ON planned_workouts
        WHEN (SELECT archived_at FROM players WHERE id = NEW.player_id) IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'an archived player gets no new activity'); END;
      CREATE TRIGGER training_sessions_archived_player BEFORE INSERT ON training_sessions
        WHEN (SELECT archived_at FROM players WHERE id = NEW.player_id) IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'an archived player gets no new activity'); END;
    `,
  },
  {
    // CAL-SYNC-NOTIFY-001D (owner 2026-10-14): optional one-way mirror of CalendarEvents into ONE
    // device calendar. Each row records an external entry GALS COACHER created, so sync only ever
    // updates / deletes its own entries (never other calendar events). CalendarEvent stays the source
    // of truth; a link is device data, never event ownership. No FK: when an app event is deleted its
    // link survives until the external entry is removed (then the row goes). synced_start_at decides
    // future (managed) vs started / past (history, left untouched). Additive: one new table.
    version: 16,
    name: 'calendar_event_sync_links',
    sql: `
      CREATE TABLE calendar_event_sync_links (
        event_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(event_id)) > 0),
        player_id TEXT NOT NULL CHECK (length(trim(player_id)) > 0),
        calendar_id TEXT NOT NULL CHECK (length(trim(calendar_id)) > 0),
        external_event_id TEXT CHECK (external_event_id IS NULL OR length(trim(external_event_id)) > 0),
        state TEXT NOT NULL CHECK (state IN ('SYNCED', 'NEEDS_END_TIME', 'ERROR')),
        synced_hash TEXT,
        synced_start_at INTEGER NOT NULL,
        synced_at INTEGER,
        last_error TEXT
      );
      CREATE INDEX calendar_event_sync_links_player ON calendar_event_sync_links (player_id);
    `,
  },
];
