# PROJECT STATE

> **Living document.** Updated after every completed slice/phase. Where we are *now*.

## Current status

**Phase 0 — Foundation: CLOSED / VERIFIED** (2026-10-02).
**Phase 0.H — Hardening: CLOSED / VERIFIED** (2026-10-03).
Both verified by the owner on a physical Android device.

| Item | State |
|---|---|
| Verified baseline on `main` | `fb3e960` chore: establish verified Phase 0 baseline · `1b538a8` chore: link EAS project and tighten audio permissions · `a023e00` docs: close verified Phase 0 gate · `67844b2` docs: align controlled docs with approved product decisions · **`13a09c9` chore: harden phase 0 architecture** (HEAD, pushed) |
| EAS | Project linked (`owner: ezbyname`, `extra.eas.projectId: 80ab62ce-99fc-494d-bb5c-a41877158a18`) |
| Android | **Verified on a physical device** (preview/internal APK, see below) |
| iOS | Configuration prepared; **no iOS build or runtime validation has been run.** Early iOS dev-build gate: Slice 2.1; full iOS validation: dedicated iOS Validation slice (ROADMAP) |
| Controlled docs | PRODUCT_SPEC, ARCHITECTURE and ROADMAP aligned with the owner decisions of 2026-10-02, corrected after the 2026-10-03 patch review (languages/RTL, player profile, no weight in V1, self-assessment, baseline as a Training Engine use case, one result pipeline, new slice order). **Documentation only — none of these features is implemented.** |
| Phase 0 hardening (slice 0.H) | **CLOSED / VERIFIED** — merged as `13a09c9`, 40/40 tests on the owner's machine, physical Android device verified (see below) |
| Cloud Foundation position | **RECOMMENDED / PENDING PRODUCT OWNER APPROVAL** (see Proposals) |
| Slice 1.0 and later | **Not started** — Slice 1.0 (Localization / RTL) requires explicit owner approval |

---

## Phase 0.H closure — 2026-10-03

### What the hardening contains (`13a09c9`, merged on `main`)

- Measurement type separated from comparison policy (`LOWER_IS_BETTER`, `HIGHER_IS_BETTER`, `CUSTOM`, `NOT_RANKED`).
- `RATING` (like `DURATION` and `DISTANCE`) has no implicit comparison direction; `MADE_ATTEMPTS` defaults to `CUSTOM`.
- Fail-closed comparison resolution (no policy → error, never a guess).
- Injectable `IdService` (`services.ids`), validated UUIDs, deterministic test ids.
- Audio failure safety (`withAudioFailureSafety` + guarded boot-time preload/release).
- Real-SQLite tests (`node:sqlite`): first launch, restart persistence, PRAGMAs, migration rollback.
- ARCHITECTURE: offline/sync hard rules, future Child Mode auth rules.
- Node >= 22.13 requirement (`package.json` `engines`, clear test-time error).
- Document governance (CLAUDE.md).

No schema change (local SQLite still v1), no product feature.

### Automated evidence (owner's Windows machine, after applying the hardening)

| Check | Result |
|---|---|
| `npm ci` | ✅ completed successfully |
| `npm run check` | ✅ PASS |
| TypeScript | ✅ PASS |
| Lint | ✅ PASS |
| Jest | ✅ **9/9 suites, 40/40 tests PASS, 0 failed, 0 skipped** |

### Physical Android evidence (EAS Preview APK containing the hardening)

| Check | Result |
|---|---|
| APK built through EAS and installed on a real device | ✅ |
| App launches | ✅ |
| Home / Diagnostics / Players / Exercises / History / Quick Training open | ✅ all, no crash observed |
| Haptics | ✅ physically verified |
| SQLite after Android app data was explicitly cleared | ✅ `ready · schema v1 (applied this launch: 1)` |
| SQLite after fully closing and reopening | ✅ `ready · schema v1 (applied this launch: 0)` |
| Supabase | `not configured (offline only)` — expected at this stage, not a failure |

Proven on the physical Android build: schema v1 is created from clean
application data, the migration applies once, database state persists across
an application restart, and the migration is not re-applied.

### Not verified / not started

- No iOS physical-device (or any iOS) build or validation.
- No Cloud / Auth implementation.
- No Localization, Player Profile or Training Engine implementation.

---

## Phase 0 closure — 2026-10-02

### Android runtime evidence (physical device, verified manually by the owner)

| Check | Result |
|---|---|
| Preview/internal APK built through EAS | ✅ build successful |
| APK installed on physical Android device | ✅ |
| App launches directly, without Metro | ✅ |
| Home screen renders | ✅ |
| Players screen opens | ✅ no crash |
| Exercises screen opens | ✅ no crash |
| History screen opens | ✅ no crash |
| Quick Training screen opens | ✅ no crash |
| Diagnostics screen opens | ✅ |
| Platform displayed | ✅ correct |
| App version displayed | ✅ `0.1.0` |
| SQLite, first real-device launch | ✅ `schema v1`, `applied this launch: 1` |
| SQLite, after fully closing and reopening | ✅ `schema v1`, `applied this launch: 0` |
| SQLite persistence across restart | ✅ confirmed (schema version survived restart; migration not re-applied) |
| Test Haptics | ✅ worked on the physical device |
| Supabase | `not configured (offline only)` — expected in Phase 0 |

Constraints recorded: no security/network bypass is permitted or required; the
owner's work-machine Cato / corporate security configuration must not be modified.

### Automated evidence

| Check | Owner PC (verified baseline) | Authoring sandbox re-run on `1b538a8` |
|---|---|---|
| `npm ci` | — | PASS (1080 packages) |
| TypeScript (`tsc --noEmit`) | PASS | PASS (via `npm run check`) |
| Lint (`expo lint`) | PASS | PASS (via `npm run check`) |
| Jest | **18/18 PASS, 4/4 suites** | **18/18 PASS, 4/4 suites** (`npm run check` exit 0) |
| Expo Doctor | **21/21 PASS** | 19/21 — the 2 remaining checks (config schema, React Native Directory) cannot reach `api.expo.dev` / `reactnative.directory` from the sandbox; not a project failure. Owner's 21/21 is authoritative. |
| Expo dependency check | up to date | — |
| Android EAS preview build | successful | — |

### Phase 0 gate

| Gate | Result |
|---|---|
| App opens | ✅ physical Android device, without Metro |
| Navigation works | ✅ all five screens on device |
| TypeScript passes | ✅ |
| Tests run | ✅ 18/18 |
| Android build works | ✅ EAS preview build, installed and run |
| iOS build path documented | ✅ ARCHITECTURE §10, EAS iOS profiles (not executed) |

### Configuration added on `main` since the original Phase 0 commit

- `app.json`: EAS `projectId` + `owner`; `expo-audio` plugin configured with `microphonePermission: false`, `recordAudioAndroid: false`, `enableBackgroundPlayback: false` (playback-only whistles; no microphone permission requested).
- `package-lock.json`: npm metadata only (`dev` → `devOptional`), no version changes.

### Known limitations

- iOS: no build or runtime validation yet (early dev-build gate in Slice 2.1, full validation in the dedicated iOS Validation slice).
- Verified build was the **preview** profile; the development-client build path was not part of this validation.
- `AudioCueService` is a silent stub; whistle assets come in Slice 2.1.
- Supabase: client wired, offline-only; no project/schema/RLS yet.
- Players / Exercises / Quick Training / History are placeholders.
- Comparison policies exist in the domain, but PB rules (shooting minimum sample, manual-timer significance threshold) are open product decisions and not implemented.
- Android may follow system dark mode (`userInterfaceStyle: "light"` is not enforced on Android without `expo-system-ui`). Theme behaviour is an open product decision — **DEFERRED** to UI/theme work.

### Next proposed action

**Slice 1.0 — Localization / RTL**, only after explicit owner approval. Not started.

---

## History

### Phase 0 implementation report — 2026-10-02 (pre-device; superseded by the closure record above)

#### Gate checklist

| Gate | Result | Evidence |
|---|---|---|
| App opens | ⚠️ Proven in test renderer only | `navigation.test.tsx` renders the real root layout + Home. On-device: **not yet verified**. |
| Navigation works | ✅ (test) | Home → Quick Training and Home → Diagnostics asserted via `expo-router/testing-library`. |
| TypeScript passes | ✅ | `npx tsc --noEmit` → exit 0 (strict, `noUncheckedIndexedAccess`). |
| Tests run | ✅ | `npx jest --ci` → **4/4 suites, 18/18 tests PASS**. |
| Lint | ✅ | `npx expo lint` → exit 0, 0 problems. |
| Android build works | ⚠️ JS + native config only | `expo export --platform android` → Hermes bundle produced. `expo prebuild` → `android/` generated, `applicationId com.ezbyname.galscoacher`. **Gradle/EAS build not run.** |
| iOS build path documented | ✅ | `expo export --platform ios` → Hermes bundle produced. `expo prebuild` → `ios/` generated, bundle id `com.ezbyname.galscoacher`. EAS `development` / `development-simulator` profiles + ARCHITECTURE §10. |

#### Open gate items for the owner (Windows machine)

1. `npm install`
2. `npx eas-cli@latest login` then `npx eas-cli@latest init` (links the EAS project; adds `extra.eas.projectId` to app config — commit it).
3. `npm run build:android:dev` → install the APK on an Android phone.
4. `npm run start:dev-client` → open the app → Home appears → tap **Diagnostics** → expect `SQLite: ready · schema v1 (applied this launch: 1)`. Close and reopen → expect `applied this launch: 0` (proves the DB persisted and migrations are idempotent).
5. Tap **Test haptics** → the phone vibrates.
6. Record the results here.

#### Files

- App config: `app.json`, `eas.json`, `package.json`, `tsconfig.json`, `eslint.config.js`, `jest.config.js`, `jest.setup.ts`, `.env.example`, `.gitignore`
- Routes: `src/app/_layout.tsx`, `index.tsx`, `quick-training.tsx`, `children.tsx`, `exercises.tsx`, `history.tsx`, `diagnostics.tsx`
- Domain: `src/domain/{measurement,sport,ids,index}.ts`
- Services: `src/services/{audio,haptics,clock,ids}/*`, `src/services/index.ts`
- Data: `src/data/local/database.ts`, `src/data/local/migrations/{index,runMigrations,types}.ts`, `src/data/remote/supabase.ts`
- Config: `src/config/env.ts`
- UI: `src/ui/{theme.ts,BigButton.tsx,PlaceholderScreen.tsx}`, `src/features/AppProvider.tsx`
- Docs: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/{PRODUCT_SPEC,ARCHITECTURE,ROADMAP,PROJECT_STATE}.md`, `supabase/README.md`

#### DB changes

- Local SQLite v1: `app_meta (key TEXT PK, value TEXT)`. Versioned via `PRAGMA user_version`.
- Supabase: none (no project linked yet).

#### Tests

| Suite | Tests |
|---|---|
| `domain/__tests__/measurement.test.ts` | 6 |
| `config/__tests__/env.test.ts` | 4 |
| `data/local/migrations/__tests__/runMigrations.test.ts` | 6 |
| `app/__tests__/navigation.test.tsx` | 2 |
| **Total** | **18 / 18 PASS** |

#### Commands run

```
npx tsc --noEmit                                   → exit 0
npx expo lint                                      → exit 0
npx jest --ci                                      → 18/18 PASS
npx expo export --platform android --platform ios  → both Hermes bundles produced
npx expo prebuild --no-install --clean (scratch copy) → android/ + ios/ generated
npx expo-doctor                                    → 19/21; the 2 failures are network-only (schema + RN Directory fetch blocked in the authoring sandbox)
```

#### iOS impact

None platform-specific. All native modules used (`expo-sqlite`, `expo-audio`,
`expo-haptics`, `expo-crypto`, `expo-router`) are cross-platform Expo modules.

#### Known limitations

- No on-device run yet (see open gate items).
- `AudioCueService` is a silent stub; whistle assets and `expo-audio` implementation come in Phase 3.
- Supabase client is wired but no project, schema or RLS exists yet (Phase 1).
- Placeholder screens for Players / Exercises / Quick Training / History.
- Light theme only.

#### Decisions taken in Phase 0

- **Expo SDK 57** (current stable) instead of 56: `expo-doctor` flags a Hermes V1 memory regression in SDK 56 that is fixed in SDK 57.
- App identifiers `com.ezbyname.galscoacher`, URL scheme `galscoacher` — change before the first store submission if desired.
- Jest 29 (`jest-expo` 57 is built on Jest 29).

#### Next proposed phase

**Phase 1 — Family + Children**, after the open gate items above are recorded as passing.

---

## Proposals (architecture changes awaiting owner approval)

1. **Cloud Foundation before the Training Engine** (slice C after 1.2, before 2.0) — **RECOMMENDED / PENDING PRODUCT OWNER APPROVAL.** Shown at that position in ROADMAP with the same label; not yet explicitly approved.
- `expo-system-ui` to enforce the light theme on Android — **DEFERRED — decide during UI/theme work.** Theme behaviour (light only / dark / system) is not decided; no dependency added.
