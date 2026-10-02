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
  `free_throw_results`. A free-throw set is `Exercise(MADE_ATTEMPTS) → Set →
  Attempt → Measurement { made, attempts }`.
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
| Notifications | — | Calendar + Notifications slice. |

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
  self-assessment, 2.0 exercises, 2.1 sessions/results/outbox).

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
Parent (auth user) ─┬─ Family ─── Player (a child; dateOfBirth, profile, active)
                    │                ├── PlayerSport (sport)
                    │                └── SelfAssessment (takenAt) ── SelfAssessmentRating (category, 1–5)
Sport (key) ─── Exercise (category, measurementType, comparisonPolicy?, defaults, tutorialUrl, isCustom)
WorkoutTemplate (purpose) ── TemplateItem (exercise, sets, target, rest, order)
WorkoutSession (player, sport, purpose, template?, startedAt, endedAt)
  └── SessionExercise ── Set ── Attempt ── Measurement / Result
                                 (measuredResult, finalResult, wasEdited)
```

- "Child" in PRODUCT_SPEC and "Player" here are the same entity; code uses
  `Player` / `player_id`.
- Player profile fields (PRODUCT_SPEC §65): name, dateOfBirth, primary and
  optional secondary position, dominant hand, experience, weekly training
  frequency, height. **No weight column** in V1 (§66).
- `SelfAssessment` is subjective data and lives in its own tables. It never
  writes to, or is derived from, the result pipeline (§12 below).

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
  Calendar + Notifications slice.
- No iOS build or iOS runtime check has been run yet.
- iOS builds run on EAS (no Mac required): `npm run build:ios:dev` (needs an
  Apple Developer account for device builds) or `npm run build:ios:sim`.

## 11. Localization and direction (approved — implemented in Slice 1.0)

- One localization layer in `src/i18n/` (`he.*`, `en.*`, `index.*`).
  Screens call `t('home.quickTraining')`, `t('common.save')`, … — no visible
  text literals in feature screens. `en` and `he` must have identical key
  sets (enforced by a test).
- **Hebrew is the default** on a fresh install regardless of the OS locale.
  The chosen language is persisted locally.
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

## 13. Cloud-ready ownership (approved)

- Every local entity that will sync carries a client-generated UUID from its
  first write: `family_id`, `player_id`, `session_id`, `exercise_id`,
  `set_id`, `attempt_id`, … No server-generated or sequential ids.
- Local rows carry their ownership from the start: a local `Family` row
  (UUID) is created on first use and every `Player` references it, so
  attaching the family to a cloud account later is an ownership hand-over,
  not a schema migration.
- No sync is built until its slice.
