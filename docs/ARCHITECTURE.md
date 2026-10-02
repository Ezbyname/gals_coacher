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
| `AudioCueService` (`WHISTLE`, `DOUBLE_WHISTLE`, `COUNTDOWN_TICK`) | `services/audio/AudioCueService.ts` | Phase 0: silent stub. Phase 3: `expo-audio` with **bundled local assets**, preloaded before a workout. |
| `HapticsService` | `services/haptics/HapticsService.ts` | `expo-haptics`, best-effort (errors swallowed). |
| `Clock` | `services/clock/Clock.ts` | `performance.now()` (monotonic) + `Date.now()` (wall). |
| `newUuid()` | `services/ids/newUuid.ts` | `expo-crypto.randomUUID()`. |
| Notifications | — | Phase 12. |

Services are composed in `services/index.ts` (`createServices`) and provided
via `AppProvider`. Tests construct fakes. If a real platform difference
appears, use `x.ts` / `x.android.ts` / `x.ios.ts` behind the same interface.

## 5. Timer

Elapsed time = `clock.monotonicNow() - startedAt`. The UI re-renders on a
frame/interval only to *display* it. A stalled JS thread can delay the
display but never changes the measured value. No `setInterval` counters as a
source of truth. Countdown steps are likewise derived from a start timestamp.

Results store `measuredResult`, `finalResult`, `wasEdited`; statistics read
`finalResult`.

## 6. Local-first & sync

- Active training never depends on the network.
- Every syncable entity gets a UUID **on device before its first write**, so
  upload retries are idempotent upserts.
- Write path: `local write (+ outbox row, same transaction) → network
  available → upsert → mark synced`.
- Upload order respects dependencies (`Session → Exercise entry → Set →
  Attempt`). The choice between dependency-aware outbox and aggregate
  workout upload is deferred until Phase 3/6 needs it.
- Single writer (the parent device) in the MVP. No multi-device conflict
  resolution yet.

## 7. Local database

- File: `gals_coacher.db`, WAL mode, `foreign_keys = ON`.
- Schema version: `PRAGMA user_version`.
- Migrations: append-only list in `data/local/migrations/index.ts`, versions
  `1..n` with no gaps, each applied in its own transaction by
  `runMigrations`. A shipped migration is never edited. The app refuses to run
  against a newer schema than it knows.
- Domain tables arrive with their phase (Phase 1 children, Phase 2 exercises,
  Phase 3 sessions/results/outbox).

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
Parent (auth user) ─┬─ Family ─── Child (dateOfBirth, avatar, active)
                    │                └── ChildSport (sport)
Sport (key) ─── Exercise (category, measurementType, defaults, tutorialUrl, isCustom)
WorkoutTemplate ── TemplateItem (exercise, sets, target, rest, order)
Session (child, sport, startedAt, endedAt)
  └── SessionExercise ── Set ── Attempt ── Measurement / Result
                                 (measuredResult, finalResult, wasEdited)
```

`MeasurementType`: `TIME` (lower is better), `DURATION`, `REPETITIONS`,
`MADE_ATTEMPTS`, `DISTANCE`, `RATING` (higher is better), `COMPLETION` (not
ranked). Age is always computed from `dateOfBirth`.

Personal-record rules (minimum sample for percentages, improvement threshold
for manually timed results) are **product rules to be defined after field
testing** — the engine must accept them as configuration, not hard-code a number.

## 10. iOS readiness

- iOS bundle id and EAS profiles exist from Phase 0 (`development` for device,
  `development-simulator` for simulator).
- `npx expo export --platform ios` and `npx expo prebuild` must succeed in CI-like
  checks every phase.
- Real iOS dev-build gates: after Phase 3 (Training Engine), Phase 10 (full
  validation), Phase 12 (notifications).
- iOS builds run on EAS (no Mac required): `npm run build:ios:dev` (needs an
  Apple Developer account for device builds) or `npm run build:ios:sim`.
