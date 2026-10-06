# ARCHITECTURE

> **Status: CONTROLLED.** Agents may *propose* changes when evidence requires
> them (in PROJECT_STATE.md "Proposals"), but must not silently change approved
> architecture. Product rules live in [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).

## 1. Core principle — Generic domain, specialized UX

The **domain and storage are sport-agnostic**; the **screens are allowed (and
encouraged) to be basketball-specific**.

- `src/domain/` knows about `Child`, `Sport`, `Exercise`, `Workout`, `Session`,
  `Set`, `Attempt`, `Result`, `Measurement` and **never** about "free throws".
- Basketball lives in data (exercise library rows with `sport = BASKETBALL`)
  and in UX (a Shooting screen with giant MADE / MISS buttons).
- Forbidden: tables or types such as `basketball_results`,
  `free_throw_results`, `basketball_sessions`. A free-throw set is
  `Exercise(MADE_ATTEMPTS) → Set → Attempt → Measurement { made, attempts }`.
- Approved exception (Slice 1.1): sport-specific **player profile
  attributes** (e.g. basketball position) live in a per-sport profile table
  (`basketball_player_profiles`, types in `src/domain/basketball/`) that hangs
  off the generic `player_sports` assignment. `Player` and `player_sports`
  stay generic; sessions, sets, attempts, results and measurements never get
  sport-specific types or tables.
- Not building: a sport plugin engine, a universal everything system, a generic
  measurement form as the primary UX.

## 2. Stack

| Layer | Choice |
|---|---|
| App | Expo SDK 57, React Native 0.86, React 19.2, TypeScript (strict + `noUncheckedIndexedAccess`) |
| Navigation | Expo Router (file-based, routes in `src/app/`) |
| Local store | `expo-sqlite` — operational source of truth on-device |
| Cloud | Supabase (Postgres + Auth + RLS) — canonical after sync |
| Platform services | `expo-audio`, `expo-haptics`, `expo-crypto` behind interfaces |
| Tests | Jest (`jest-expo` preset) + React Native Testing Library + `expo-router/testing-library` |
| Lint | ESLint 9 flat config (`eslint-config-expo`) |
| Builds | EAS Build (`development`, `development-simulator`, `preview`, `production`) |

Native folders (`android/`, `ios/`) are **generated** (Continuous Native
Generation) and git-ignored. Configure native behaviour only through
`app.json` and config plugins.

## 3. Source layout

```
src/
  app/          Expo Router routes ONLY (screens + _layout). No business logic.
  features/     Feature modules: hooks, state, screen-level components (per feature).
  domain/       Pure, sport-agnostic types + rules. No React, no Expo, no I/O.
  services/     Platform abstractions (audio, haptics, clock, ids). Interfaces first.
  data/
    local/      SQLite: open, migrations, repositories.
    remote/     Supabase client + (later) sync uploaders.
  config/       Typed environment parsing.
  ui/           Reusable presentational components + theme tokens.
  i18n/         Localization layer: he / en strings + t() (Slice 1.0).
  preferences/  Device-local UI preferences in AsyncStorage (e.g. language). Not domain data, never synced.
  test-support/ Test-only helpers (e.g. node:sqlite adapter). Never imported by app code.
docs/           Governance documents.
supabase/       SQL migrations + RLS policies for the cloud schema.
```

Dependency direction: `app → features → (domain, services, data, ui)`;
`data → domain`; `domain → nothing`. The `@/` alias maps to `src/`.

## 4. Cross-platform rule

No Android-only implementation where a reasonable cross-platform one exists.
Every platform capability is consumed through an interface:

| Interface | File | V1 implementation |
|---|---|---|
| `AudioCueService` (`WHISTLE`, `DOUBLE_WHISTLE`, `COUNTDOWN_TICK`) | `services/audio/AudioCueService.ts` | Phase 0: silent stub. Slice 2.1: `expo-audio` with **bundled local assets**, preloaded before a workout. Always wrapped by `withAudioFailureSafety` (`services/audio/failSafeAudio.ts`). |
| `HapticsService` | `services/haptics/HapticsService.ts` | `expo-haptics`, best-effort (errors swallowed). |
| `Clock` | `services/clock/Clock.ts` | `performance.now()` (monotonic) + `Date.now()` (wall). |
| `IdService.newUuid()` | `services/ids/IdService.ts` | `expo-crypto.randomUUID()`, validated as a UUID before use. Tests inject `createSequentialIdService()` for deterministic ids. |
| `DirectionService` (`isRTL`, `apply`, `reload`) | `services/direction/DirectionService.ts` | `I18nManager` (Hebrew: `allowRTL(true)` + `forceRTL(true)`; English: `forceRTL(false)` + `allowRTL(false)`) and `reloadAppAsync()` from `expo`. |
| Notifications | — | Notifications slice. |

Services are composed in `services/index.ts` (`createServices`) and provided
via `AppProvider` (which also accepts injected `services` for tests). Tests
construct fakes.

**Audio is never load-bearing.** A failed preload, play or release is reported
(`console.warn`) and swallowed; it must not crash the app, block boot, or
affect timers, workouts or result persistence. Training without sound is
degraded, not broken. Two deliberate layers:

1. `createServices()` wraps the real `AudioCueService` in
   `withAudioFailureSafety` — this protects **every** call site, including
   `play()` inside the Training Engine.
2. `AppProvider` additionally guards its own boot-time `preload()` /
   `release()` calls, so boot stays safe even when an *unwrapped* service is
   injected (tests, future composition changes).

If a real platform difference
appears, use `x.ts` / `x.android.ts` / `x.ios.ts` behind the same interface.

## 5. Timer

Elapsed time = `clock.monotonicNow() - startedAt`. The UI re-renders on a
frame/interval only to *display* it. A stalled JS thread can delay the
display but never changes the measured value. No `setInterval` counters as a
source of truth. Countdown steps are likewise derived from a start timestamp.

Results store `measuredResult`, `finalResult`, `wasEdited`; statistics read
`finalResult`.

The timer itself is delivered in slice 2.1b (moved 2026-10-06); TRAIN-002
records results by manual entry into the same result model (§15).

## 6. Local-first & sync

### Offline / sync hard rules (approved)

1. No generic bidirectional sync engine in V1.
2. Active and unsynchronized training data is local-first.
3. SQLite is the operational source of truth for active and unsynchronized workouts.
4. Supabase becomes the canonical cloud source after successful synchronization.
5. All syncable entities receive client-generated UUIDs (`IdService`) before their first local write.
6. The MVP assumes one primary writer (the parent device).
7. Multi-device conflict resolution is deferred until Child Mode introduces additional writers.
8. Sync must preserve entity dependency order (`Session → Exercise entry → Set → Attempt`).
9. The upload strategy is chosen later: dependency-aware writes **or** aggregate workout/session synchronization.

None of this is implemented yet; it binds the slices that add storage and sync.

### Mechanics

- Active training never depends on the network.
- Every syncable entity gets a UUID **on device before its first write**, so
  upload retries are idempotent upserts.
- Write path: `local write (+ outbox row, same transaction) → network
  available → upsert → mark synced`.
- Upload order respects dependencies (`Session → Exercise entry → Set →
  Attempt`). The choice between dependency-aware outbox and aggregate
  workout upload is deferred until the Training Engine / Progress slices need it.
- Single writer (the parent device) in the MVP. No multi-device conflict
  resolution yet.

## 6a. Future Child Mode authentication (approved direction — not implemented)

Child devices never need an email/password account.

```
Parent account → pairing code → child device
→ Supabase Anonymous Auth → server-controlled pairing (code validated server-side)
→ auth.uid() linked to the correct family/player → RLS
```

- The anonymous child must **never** be able to choose an arbitrary
  `family_id` or `player_id`. The link is created only by server-side code
  (e.g. a `SECURITY DEFINER` RPC or Edge Function) after validating the
  pairing code (single-use, expiring).
- RLS policies resolve the child's access from that server-written link,
  never from client-supplied ids.
- Implemented in the Child Mode Foundation slice.

## 7. Local database

- File: `gals_coacher.db`, WAL mode, `foreign_keys = ON`.
- Schema version: `PRAGMA user_version`.
- Migrations: append-only list in `data/local/migrations/index.ts`, versions
  `1..n` with no gaps, each applied in its own transaction by
  `runMigrations`. A shipped migration is never edited. The app refuses to run
  against a newer schema than it knows.
- Tests run the real SQL against Node's built-in SQLite (`node:sqlite`, Node ≥ 22.13) via
  `src/test-support/nodeSqlite.ts`, including a close/reopen restart test
  and migration rollback.
- Domain tables arrive with their slice (1.1 family/players, 1.2
  self-assessment, 2.0 exercises, 2.1 sessions/results; the outbox arrives
  with Cloud Foundation C, which now follows 2.1 — revised 2026-10-06).
- **v8 (TRAIN-001, implemented 2026-10-06): exercise library.** Built-in
  exercise content is curated in code under stable ids; the database holds
  one row per built-in id (its active state only) plus full rows for custom
  exercises (client UUID) with child rows for categories, muscles (role),
  equipment options and sports. Exercises are never deleted (inactive
  instead); reads fail closed on unknown codes or a missing / unknown
  built-in row.
- **v9 (TRAIN-002, approved 2026-10-06): training.** See §15 for the model;
  every table uses client UUIDs (or a parent UUID + position for ordered
  children), `created_at` / `updated_at`, and an ownership column (family
  for reusable blocks / templates, player for plans and sessions).
- v2 (Slice 1.1): `families (id)`; `players` (generic: name, date_of_birth
  `YYYY-MM-DD`, height_cm, created_at/updated_at); `player_sports` (PK
  `player_id, sport`); `basketball_player_profiles` (PK `player_id`, `sport`
  fixed to `BASKETBALL`, FK `(player_id, sport)` → `player_sports`). SQL
  enforces structure only (keys, FKs, non-blank name, date shape, positive
  height); code lists are validated in the domain.
- **Sport assignment contract (revised 2026-10-04; implemented in Slice 1.1
  by `389fbca`, `a0932b0` and `19441f1`, no schema change; physical Android
  acceptance of Slice 1.1 is partial — see PROJECT_STATE).** `player_sports` holds zero or more rows
  per player. A sport profile row exists only for a matching assignment and
  is written in the same transaction as that assignment. Reading Basketball,
  the assignment and the profile are each LEFT JOINed from `players`
  independently, so every state is observable:

  | BASKETBALL assignment | Basketball profile | Result |
  |---|---|---|
  | absent | absent | valid player without Basketball (`basketball: null`) |
  | present | present | valid Basketball player |
  | present | absent | corrupt → `PlayerDataError` |
  | absent | present | corrupt → `PlayerDataError` (`INVALID_RELATIONSHIP`); normally prevented by the FK |

  Nothing is repaired on read. Basketball may be added to an existing player
  (assignment + profile inserted atomically with the player update).
  Removing a persisted Basketball assignment is **not supported in Slice
  1.1**: the repository rejects it with a typed `SportRemovalNotSupportedError`
  and writes nothing. The `experience` and `weekly_frequency` columns stay
  (nullable); the V1 UI no longer collects them, and updates preserve stored
  values.
- **v3 (Slice 1.2, approved 2026-10-04 — not implemented): self-assessment.**
  Generic tables; no Basketball-specific persistence table.

  `self_assessments` — one row per completed assessment:
  `id TEXT PRIMARY KEY` (client UUID), `player_id TEXT NOT NULL`,
  `sport TEXT NOT NULL`, `taken_at INTEGER NOT NULL` (epoch ms, device wall
  clock at save), `FOREIGN KEY (player_id, sport) → player_sports (player_id,
  sport)`, and an index on `(player_id, sport, taken_at)` for history. No
  `created_at` (an assessment is persisted at the moment it is taken), no
  `updated_at`, no status.

  `self_assessment_ratings` — one row per answered category:
  `assessment_id TEXT NOT NULL → self_assessments (id)`,
  `category TEXT NOT NULL`, `rating INTEGER NOT NULL` with the structural
  `CHECK (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5)`,
  `PRIMARY KEY (assessment_id, category)`. Category codes are validated in
  the domain, not with a SQL enum CHECK.

  Appended as migration v3; v1 and v2 are not altered. An assessment and its
  ratings are written in one transaction; a partial assessment is never
  persisted. Rows are never updated or deleted in Slice 1.2. History is read
  per player **and sport** (`listSelfAssessments(db, playerId, sport)`),
  ordered `taken_at DESC, id DESC`; malformed stored data fails the read
  as a whole and is never repaired.
- **v4 (Slice 1.3, approved 2026-10-04 — not implemented): calendar events.**
  One generic table; no sport-specific calendar table, no type CHECK list
  (type codes are validated in the domain).

  `calendar_events`: `id TEXT PRIMARY KEY` (client UUID),
  `player_id TEXT NOT NULL → players (id)`, `type TEXT NOT NULL`,
  `sport TEXT` (nullable), `start_at INTEGER NOT NULL` (integer CHECK),
  `end_at INTEGER` (nullable; integer and `> start_at` CHECK),
  `title TEXT` and `notes TEXT` (nullable; non-blank CHECK when present),
  `created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer')`,
  `updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer')`
  (safe-integer semantics enforced by the domain),
  `FOREIGN KEY (player_id, sport) → player_sports (player_id, sport)` (only
  enforced when `sport` is set — SQLite skips a composite FK with a NULL
  column), index `(player_id, start_at)`. No status, timezone, recurrence /
  series, source / creator, location, reminder, `deleted_at` or sync columns.

  Appended as migration v4; v1–v3 are not altered. Repository operations
  (create / get / list / update / delete, all Player-scoped) validate before
  writing, run one at a time per connection (`runSerialized`) in one
  transaction, verify the Player and any sport assignment, re-read and
  re-validate the persisted row, and fail closed on malformed stored data
  (including a missing Player / sport relationship). Update never changes
  `id`, `player_id` or `created_at` and sets `updated_at`; delete is a hard
  delete in this local-only, single-writer stage (tombstones only when cloud
  sync requires them). Repository list order: `start_at ASC, id ASC`
  (canonical); the screen derives the two sections from it — Current &
  upcoming `start_at ASC, id ASC` (nearest first), Past `start_at DESC,
  id DESC` (most recent first). The visible order is the contract.
- expo-sqlite's `withTransactionAsync` is not exclusive (a concurrent BEGIN
  failure rolls back the other open transaction), and
  `withExclusiveTransactionAsync` opens a new connection without
  `foreign_keys`. Repository operations therefore run one at a time per
  connection through `data/local/connectionQueue.ts` (`runSerialized`).

## 8. Cloud (Supabase)

- Client: `data/remote/supabase.ts`, created only when both
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set;
  otherwise the app runs offline-only. Partial config fails fast.
- Session persistence: AsyncStorage.
- Every table has RLS enabled; access is scoped to the owning family.
  Policies are added in the same migration as the table and verified in the
  phase gate.
- Schema mirrors the local domain (same UUIDs, same generic shape).

## 9. Domain model (target, filled in by phases)

```
Parent (auth user) ─┬─ Family ─── Player (a child; name, dateOfBirth, height)
                    │                ├── PlayerSport (sport) 0..n
                    │                │     └── <Sport>Profile (only for its assignment; V1: BasketballProfile)
                    │                └── SelfAssessment (sport, takenAt) ── SelfAssessmentRating (category, 1–5)
Exercise (builtin | custom, active; categories, primary / secondary muscles → body areas,
          movement patterns, difficulty, sports 0..n, equipment options,
          measurementType + comparisonPolicy + load / distance conditions, defaults,
          instructions, cues, mistakes, safety, tutorialUrl)
Family ─┬─ WorkoutBlock (name, active) ── BlockItem (exercise, prescription, order)
        └─ WorkoutTemplate (name, active) ── ordered WorkoutBlocks
Player ─┬─ PlannedWorkout (FROZEN snapshot of a template: items with exercise snapshot + prescription)
        └─ TrainingSession (purpose, status, plannedWorkout?, startedAt, endedAt)
             └── SessionExercise (exercise snapshot) ── Set / Interval (planned prescription; PENDING / DONE / SKIPPED)
                    └── Measurement (kind, measuredResult, finalResult, wasEdited, source, confidence?)
```

**Superseded 2026-10-06:** the earlier target lines `Exercise (category, …,
isCustom)`, `WorkoutTemplate (purpose) ── TemplateItem` and `WorkoutSession
→ SessionExercise → Set → Attempt → Measurement / Result`. `TrainingSession`
is the name of the former `WorkoutSession`; `Attempt` is not a stored level
in TRAIN-002 (a set holds its made / attempts measurements) and may be added
later for per-shot recording (2.3) without changing sets or measurements.

- "Child" in PRODUCT_SPEC and "Player" here are the same entity; code uses
  `Player` / `player_id`.
- Player (generic, PRODUCT_SPEC §65): name, dateOfBirth, height. A player
  may have no sport. **No weight column** in V1 (§66).
- `PlayerSport` stays minimal: `(player_id, sport)`. No surrogate id, status,
  start date or primary flag until they have precise business semantics.
- `BasketballProfile`: primary position, secondary position, dominant hand
  (V1 UI); `experience` and `weekly_frequency` remain as dormant nullable
  columns (not collected by the V1 UI, preserved when present).
- `Exercise` is generic and linked to 0..n sports (implemented in TRAIN-001;
  none = general fitness). No `BasketballExercise` core entity.
- **Exercise model (approved 2026-10-06, implemented in TRAIN-001):**
  categories (1..n), primary muscles (required except for skill-only
  basketball drills) and secondary muscles; body areas are derived from the
  primary muscles (posterior chain only when at least two primary muscles
  belong to it), movement patterns, difficulty, sports, equipment as
  alternative options (any one option suffices; every item inside an option
  is needed; no option = bodyweight), the approved measurement type with its
  comparison policy and set conditions (load applies to reps / duration /
  time / distance; a fixed distance for timed runs), defaults, instructions,
  coaching cues, common mistakes, safety notes. Built-in exercises are
  curated, versioned with the app and read-only; custom exercises belong to
  the user. Active / inactive replaces deletion so history always resolves.
- `SelfAssessment` is subjective data and lives in its own tables. It never
  writes to, or is derived from, the result pipeline (§12 below).
- **Self-assessment contract (approved 2026-10-04 — not implemented):**
  - A `SelfAssessment` carries its `sport` and belongs to a player's sport
    assignment (`(player_id, sport)` → `player_sports`), so a multi-sport
    player's histories never mix. Basketball is the only self-assessment
    sport today.
  - The generic part (assessment, rating 1–5, completeness and validation)
    is sport-neutral domain code; the category **list** is Basketball data
    (`SHOOTING`, `BALL_HANDLING`, `PASSING`, `FINISHING`, `DEFENSE`, `SPEED`;
    PRODUCT_SPEC §67), looked up per sport. Adding a sport adds a category
    list, not tables or Player changes.
  - A self-rating is the athlete's perception. It is **not**
    `MeasurementType.RATING`, an exercise result, an objective measurement,
    a performance grade or a deterministic score. No total, average, overall
    score or gap score is calculated. Later Progress may show subjective and
    objective histories together while keeping their meaning separate; any
    future AI may use self-assessments only as context about
    self-perception (§14 layer 1 facts), never as measurements.
  - Assessments are immutable; a new one never changes an older one.

**Measurement type = WHAT was measured. Comparison policy = HOW improvement
is evaluated.** They are separate (`domain/measurement.ts`,
`domain/comparison.ts`).

- `MeasurementType`: `TIME`, `DURATION`, `REPETITIONS`, `MADE_ATTEMPTS`,
  `DISTANCE`, `RATING`, `COMPLETION`.
- `ComparisonPolicy`: `LOWER_IS_BETTER`, `HIGHER_IS_BETTER`, `CUSTOM`,
  `NOT_RANKED`. An exercise may declare its policy; otherwise the
  measurement type's default applies:

| MeasurementType | Default policy | Why |
|---|---|---|
| `TIME` | `LOWER_IS_BETTER` | sprint / slalom completion time |
| `DURATION` | none — exercise must declare | plank (longer better) vs. timed drill (shorter better) |
| `REPETITIONS` | `HIGHER_IS_BETTER` | |
| `MADE_ATTEMPTS` | `CUSTOM` | 1/1 = 100% must not beat 18/20 = 90%; needs a sample-size rule (open decision) |
| `DISTANCE` | none — exercise must declare | jump/throw distance vs. distance from a target |
| `RATING` | none — exercise must declare | skill (higher better) vs. fatigue / discomfort (lower) vs. effort / RPE (not ranked) |
| `COMPLETION` | `NOT_RANKED` | |

`resolveComparisonPolicy` throws when neither the exercise nor the type
provides a policy, so results are never compared with a guessed rule. PB
significance thresholds and the shooting minimum sample are not implemented.

Age is always computed from `dateOfBirth`.

Personal-record rules (minimum sample for percentages, improvement threshold
for manually timed results) are **product rules to be defined after field
testing** — the engine must accept them as configuration, not hard-code a number.

## 10. iOS readiness

- iOS bundle id and EAS profiles exist from Phase 0 (`development` for device,
  `development-simulator` for simulator).
- `npx expo export --platform ios` and `npx expo prebuild` must succeed in CI-like
  checks every phase.
- **Early iOS dev-build gate: Slice 2.1 (Training Engine)** — verify the core
  runtime path (navigation, SQLite, timer, audio cue, haptics) on iOS.
- **Full iOS validation: the dedicated iOS Validation slice** — the
  accumulated product on iOS, plus notifications on Android + iPhone in the
  Notifications slice.
- No iOS build or iOS runtime check has been run yet.
- iOS builds run on EAS (no Mac required): `npm run build:ios:dev` (needs an
  Apple Developer account for device builds) or `npm run build:ios:sim`.

## 11. Localization and direction (approved — implemented in Slice 1.0)

- One localization layer in `src/i18n/` (`he.*`, `en.*`, `index.*`).
  Screens call `t('home.quickTraining')`, `t('common.save')`, … — no visible
  text literals in feature screens. `en` and `he` must have identical key
  sets (enforced by a test).
- **Hebrew is the default** on a fresh install regardless of the OS locale.
  The chosen language is persisted in AsyncStorage
  (`@gals-coacher/ui.language`; missing or invalid → Hebrew), independent
  of the SQLite domain database. A temporary key
  (`@gals-coacher/rtl.reloadTarget`) guards against direction-reload loops.
- Direction follows the language: Hebrew RTL, English LTR. If the platform
  needs an app reload to apply a direction change, the app reloads; no
  per-screen mirroring hacks.
- Direction-safe layout only: logical `start` / `end` (e.g.
  `marginStart`, `paddingEnd`, `textAlign: 'auto'`) instead of left/right;
  directional icons (back/next) mirror with direction.
- Sports values keep their LTR logical order inside RTL text (`18/20`,
  `80%`, `4.38`, `00:45`, `20m`). Formatting is measurement-specific and
  added when the measurement appears (`formatTime`, `formatDuration`,
  `formatMadeAttempts`, `formatPercentage`, `formatDistance`) — no single
  generic formatter.
- Avoid a large i18n dependency unless Slice 1.0 shows it is justified;
  iOS uses the same layer.

## 12. One result pipeline — Baseline is a Training Engine use case (approved)

**One player · one result model · one training engine · multiple session purposes (TRAINING, BASELINE, REASSESSMENT).**

```
   entry (UX):   Quick Training   Workout / template run
                        │                    │
   purpose:         TRAINING         TRAINING · BASELINE · REASSESSMENT
                        └─────────┬──────────┘
                                  ▼
          WorkoutTemplate (optional; purpose)  →  WorkoutSession (purpose)
                                              ▼
                       SessionExercise → Set → Attempt → Result
                    (same timer, same MADE/MISS, same manual input,
                     measuredResult / finalResult / wasEdited)
                                              ▼
                      one history · one PB logic · one graph pipeline
```

- **Session purpose = WHY the measurement exists:** `TRAINING`, `BASELINE`,
  `REASSESSMENT`. It is the only thing that differs between uses, stored on
  the session (and on its template when there is one). Analytics
  distinguish a baseline reference point from training by `purpose`, never
  by a separate table. Column introduced with the session table (Slice 2.1).
- **Quick Training is an entry mode, not a purpose.** It is how the user
  starts a session (minimal taps); it always creates an ordinary
  `TRAINING` session. If analytics ever need the entry path, a separate
  field (conceptually `entryMode = QUICK | WORKOUT`) may be added — **not
  built now**, and never merged into `purpose`.
- **Forbidden:** `BaselineAssessment`, `AssessmentResult`, a baseline timer,
  a baseline shooting engine, baseline-only graphs, or any second result store.
- **Baseline template:** a predefined `WorkoutTemplate` (purpose BASELINE)
  whose item order encodes the coaching order (jump → sprint → agility →
  ball handling → shooting). Age variations are template parameters (shot
  count, distance, duration, rest).
- **Multi-session baselines:** if a baseline must span days, an optional
  grouping (conceptually `AssessmentCycle` → its `WorkoutSession`s) may be
  added. It only groups sessions and stores no results. Not built until a
  slice needs it.
- **Reassessment** repeats the baseline template as new sessions; the
  original baseline sessions are never modified.
- The Training Engine does not depend on Baseline; Baseline depends on the
  Training Engine.
- **Naming update (2026-10-06):** `WorkoutSession` is now `TrainingSession`
  and results are set-level measurements with a source (§15); the single
  pipeline and the purpose rules above are unchanged.

## 13. Cloud-ready ownership (approved)

- Every local entity that will sync carries a client-generated UUID from its
  first write: `family_id`, `player_id`, `session_id`, `exercise_id`,
  `set_id`, `attempt_id`, … No server-generated or sequential ids.
- Local rows carry their ownership from the start: a local `Family` row
  (UUID) is created on first use and every `Player` references it, so
  attaching the family to a cloud account later is an ownership hand-over,
  not a schema migration.
- The local Family is identified by the `app_meta` row `local_family_id`
  (its primary key makes it a singleton). It is created in the same
  transaction as the first Player; a pointer to a missing Family is a data
  error, never silently replaced.
- No sync is built until its slice.

- **Training ownership (approved 2026-10-06):** reusable Workout Blocks and
  Workout Templates are owned by the Family (never global, never
  "the only user"); Planned Workouts and Training Sessions are owned by a
  Player (and through it the Family). Cloud representation, RLS and sync of
  these tables come with Cloud Foundation C; nothing in the local model
  assumes a single device user.

## 14. Planning: facts, calendar and AI (approved 2026-10-04 — not implemented)

- **`CalendarEvent ≠ TrainingSession`.** A calendar event is what was
  *planned* in time (e.g. Personal Training, Wednesday 17:00); a training
  session is what *happened* (actual start/end, exercises, results). They are
  separate entities, optionally linked, so planned + completed, planned +
  skipped and unplanned + completed are all representable. Calendar work never
  writes results; the Training Engine never edits the plan.
- **Layers, in one direction only:**
  1. **Facts** (authoritative): school, team practice, game, personal
     training, unavailable time, sleep, actual training results.
  2. **Deterministic calculations** from facts: free time, recovery gap,
     weekly volume, training load.
  3. **Recommendations** derived from 1 and 2 (e.g. "a 30-minute shooting
     session may fit").
  4. **AI** explains, offers alternatives, summarizes progress.
- **AI is never the source of truth** for schedule, availability, game times,
  player identity, training results or recovery facts, and never writes them.
- **Available time is not appropriate training time** (PRODUCT_SPEC §71): a
  free slot is an input to the calculation and recommendation layers, never a
  recommendation by itself.
- **Calendar Foundation (Slice 1.3, approved 2026-10-04 — not implemented):**
  one-off `CalendarEvent`s owned by a Player; types `TEAM_TRAINING`,
  `PERSONAL_TRAINING`, `GAME`, `GYM`, `RECOVERY`, `OTHER` (stable codes,
  labels in i18n; `SCHOOL` / `UNAVAILABLE` deferred); `sport` optional and
  independent of type; `startAt` + optional `endAt` stored as epoch
  milliseconds (absolute instants), entered as device-local date / time
  (a non-existent DST-gap time is rejected; an ambiguous overlap time
  resolves as the platform `Date` does, documented and tested), displayed
  in the device's current timezone and the active app language — no stored
  timezone, no all-day events. Current & upcoming vs Past is decided from
  `Clock.wallNow()`: `endAt >= now`, or `startAt >= now` without an end.
  Current & upcoming is ordered `startAt` ascending then `id` ascending;
  Past `startAt` descending then `id` descending.
  Events reference `player_id` and, where relevant, `sport`.
- **CAL-TRAIN-001 (approved conceptually 2026-10-06; built after TRAIN-002):**
  a `CalendarEvent` may carry an optional `planned_workout_id` — it links to
  what was planned only, never to performed results; the Training Session
  stays independent.
- **Recurrence and occurrence exceptions move to 2.2** (Calendar UI +
  Calendar ↔ Training). Wall-clock recurrence needs a stored timezone, so
  that slice reopens the timezone contract; the recurrence schema shape is
  not decided.

## 15. Training system (approved 2026-10-06 — TRAIN-002)

```
Exercise → WorkoutBlock → WorkoutTemplate → PlannedWorkout → TrainingSession
                                                  (frozen)          │
                              SessionExercise → Set / Interval → Measurement
```

- **Reusable vs frozen.** Blocks and templates are reusable and editable.
  Planning a template for a player writes a **frozen PlannedWorkout**: each
  item copies the exercise snapshot it needs to be displayed (names,
  measurement type, comparison, load / distance conditions) and its
  prescription (sets, target, load, rest). Planned items are never updated
  or deleted; later edits to an exercise, block, template or the equipment
  catalog never reach them. The template reference is provenance only.
- **Planned ≠ performed.** Starting a planned workout creates a separate
  `TrainingSession` (purpose `TRAINING`) whose session exercises carry their
  own exercise snapshot and whose sets copy the per-set prescription.
  `CalendarEvent ≠ TrainingSession`, `PlannedWorkout ≠ TrainingSession`;
  "what was planned?" is answered from the plan, "what happened?" from the
  session — independently.
- **Status:** `IN_PROGRESS`, `COMPLETED` (every planned set performed),
  `PARTIAL` (finished with planned sets not performed), `ABANDONED`. Only an
  in-progress session accepts results; a finished session is read-only. At
  most one in-progress session per player; a planned workout is performed at
  most once.
- **Sets / intervals:** `PENDING`, `DONE`, `SKIPPED`; extra sets beyond the
  plan have no prescription. Actual values are never normalized to the plan.
- **Measurement** = one objective value of one kind for one set (e.g.
  repetitions, load kg, time, duration, distance, made, attempts, rating,
  completion), with `measuredResult`, `finalResult`, `wasEdited`, **source**
  (`MANUAL` now; `CAMERA`, `DEVICE`, `SENSOR` reserved) and an optional
  **confidence** (0–1; null for manual entry). Source and confidence belong
  to the measurement, not the set, so one set may mix sources. No
  camera / device / sensor capture or computer-vision schema is built.
- **History is non-destructive:** plans, sessions, sets and measurements are
  never deleted; objective results never write to, or read from, the
  subjective Self-Assessment, and no combined score exists.
- **Cloud-ready, not cloud:** client UUIDs, timestamps and Family / Player
  ownership (§13); no auth, sync, outbox or RLS until Cloud Foundation C.
