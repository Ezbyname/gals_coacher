# PROJECT STATE

> **Living document.** Updated after every completed slice/phase. Where we are *now*.

## Current status

**Phase 0 — Foundation: CLOSED / VERIFIED** (2026-10-02).
**Phase 0.H — Hardening: CLOSED / VERIFIED** (2026-10-03).
**Slice 1.0 — Localization / RTL / Startup Splash: CLOSED / VERIFIED** (2026-10-03).
All verified by the owner on a physical Android device.
**Slice 1.1 — Player Profile: IMPLEMENTED** with strong automated / native verification and **PARTIAL** physical Android acceptance (2026-10-04) — not fully physically accepted. The PlayerForm bottom safe-area defect is fixed in `35c7158` (implemented); its physical Android verification is pending (see below).
**Slice 1.2 — Self-Assessment: IMPLEMENTED** with **PARTIAL** physical Android acceptance (2026-10-04). Remaining physical acceptance items are carried forward to the next Preview APK, including revalidation of the post-Save navigation fix `e181fba`.
**Slice 1.3 — Calendar Foundation: contract APPROVED (2026-10-04), NOT implemented** — no Slice 1.3 code exists yet, so nothing of it has been exported, built or validated on any platform.
**iOS (project baseline):** the current pre-Calendar application has passed iOS bundle export (`npx expo export --platform ios`); no physical iOS device/runtime validation or native iOS build has been performed.

| Item | State |
|---|---|
| Verified baseline on `main` | `fb3e960` chore: establish verified Phase 0 baseline · `1b538a8` chore: link EAS project and tighten audio permissions · `a023e00` docs: close verified Phase 0 gate · `67844b2` docs: align controlled docs with approved product decisions · `13a09c9` chore: harden phase 0 architecture · `25e3694` docs: close verified Phase 0 hardening gate · **Slice 1.0:** `590ce2a` feat(i18n): add translation core · `baf761f` feat(i18n): add persisted language and direction control · `15feb2d` feat(i18n): localize existing app · `5f97f8b` feat(startup): add coach splash experience (owner's local `main`; applied with `git am`, so they differ from the authoring-branch hashes, e.g. startup = authoring `cafd90a`) |
| EAS | Project linked (`owner: ezbyname`, `extra.eas.projectId: 80ab62ce-99fc-494d-bb5c-a41877158a18`) |
| Android | **Verified on a physical device** (preview/internal APK, see below) |
| iOS | Configuration prepared; **iOS bundle export validated (`npx expo export --platform ios`); no physical iOS device/runtime validation or native iOS build has been performed.** Early iOS dev-build gate: Slice 2.1; full iOS validation: dedicated iOS Validation slice (ROADMAP) |
| Controlled docs | PRODUCT_SPEC, ARCHITECTURE and ROADMAP aligned with the owner decisions of 2026-10-02, corrected after the 2026-10-03 patch review (languages/RTL, player profile, no weight in V1, self-assessment, baseline as a Training Engine use case, one result pipeline, new slice order). **Slice 1.0 decisions (Hebrew/English, Hebrew default, RTL/LTR, measurement display) are implemented and verified on Android. Baseline/Reassessment, the one-result-pipeline Training Engine and the Cloud Foundation position remain roadmap/product decisions — not implemented.** Self-Assessment: see Slice 1.2 (implemented; partial physical acceptance). Player Profile: see Slice 1.1 (implemented; partial physical acceptance). **2026-10-04 — Slice 1.1 profile contract revised and now IMPLEMENTED** (optional sport, Basketball profile details, native DOB picker; PRODUCT_SPEC §65, ARCHITECTURE §7 / §9; commits `389fbca`, `a0932b0`, `19441f1`; physical Android acceptance partial — see Slice 1.1). **2026-10-04 — approved, NOT implemented (future work):** Calendar Foundation (Slice 1.3) and the later Calendar UI (2.2) added to ROADMAP, Cloud Foundation position approved (slice C), True MVP redefined by capabilities (including Calendar Foundation and Calendar UI; Cloud Foundation as required enabling infrastructure; Hebrew and English first-class), planning principles recorded (PRODUCT_SPEC §71; ARCHITECTURE §14). **2026-10-04 (Slice 1.2):** Self-Assessment contract recorded (PRODUCT_SPEC §67, §70; ARCHITECTURE §7 schema v3, §9) — **now IMPLEMENTED** (see Slice 1.2). **2026-10-04 (Slice 1.3):** Calendar Foundation contract recorded (ROADMAP 1.3 / 2.2 revised; PRODUCT_SPEC §51; ARCHITECTURE §7 schema v4, §14) — **approved, not implemented**. |
| Phase 0 hardening (slice 0.H) | **CLOSED / VERIFIED** — merged as `13a09c9`, 40/40 tests on the owner's machine, physical Android device verified (see below) |
| Cloud Foundation position | **APPROVED (2026-10-04):** after 1.3 Calendar Foundation, before 2.0 (see Proposals) |
| Slice 1.0 (Localization / RTL + startup splash) | **CLOSED / VERIFIED** — 123/123 tests, 20/20 suites; physical Android Preview APK verified (see below) |
| Slice 1.1 (Player Profile) | **IMPLEMENTED** — 312/312 tests, 28/28 suites on the owner's machine; native checks pass; **PARTIAL** physical Android acceptance; PlayerForm safe-area fix implemented in `35c7158`, physical verification pending (see below) |
| Slice 1.2 (Self-Assessment) | **IMPLEMENTED** — 37/37 suites, 504/504 tests; schema v3; **PARTIAL** physical Android acceptance; remaining items carried forward to the next Preview APK (see below) |
| Slice 1.3 (Calendar Foundation) | **Contract approved, NOT implemented** — see below |
| Slices after 1.3 | **Not started** |

---

## Slice 1.3 — Calendar Foundation: CONTRACT APPROVED, NOT IMPLEMENTED (2026-10-04)

The owner approved the Slice 1.3 contract on 2026-10-04 (ROADMAP 1.3 / 2.2,
PRODUCT_SPEC §51, ARCHITECTURE §7 / §14). **No application code, no
migration v4 and no UI exist yet.**

Approved contract, in short:

- A **one-off** `CalendarEvent` per Player: `id`, `playerId`, `type`, `sport` (optional), `startAt`, `endAt` (optional), `title`, `notes`, `createdAt`, `updatedAt`. `CalendarEvent ≠ TrainingSession`: no event creates, completes or skips a training session.
- Six type codes: `TEAM_TRAINING`, `PERSONAL_TRAINING`, `GAME`, `GYM`, `RECOVERY`, `OTHER` (labels in i18n only). `SCHOOL` and `UNAVAILABLE` deferred.
- `sport` is optional and independent of `type`; only a supported sport the Player is assigned to (today `BASKETBALL`).
- `startAt` required, `endAt` optional with `endAt > startAt`; epoch milliseconds (absolute instants), entered as device-local date / time (a non-existent DST-gap time is rejected), shown in the device's current timezone and the active app language. No stored timezone, no all-day events.
- `title` optional except **required (non-blank) for `OTHER`**; `notes` optional; blank → null. No length limits locked.
- Create, edit and delete (delete with explicit confirmation; hard delete — no tombstones / `deleted_at` / sync status). `createdAt` set once; `updatedAt` set on create and on every successful edit; `id` and `playerId` never change.
- Agenda / list UI reached from Player Edit (every Player, with or without a sport): Current & upcoming / Past, add, details, edit, delete. Current & upcoming = `endAt >= now`, or `startAt >= now` without an end; otherwise Past; `now` from `Clock.wallNow()`. **Display order:** Current & upcoming by `startAt` ascending, then `id` ascending (nearest first); Past by `startAt` descending, then `id` descending (most recent first). Tests cover both the classification and the ordering.
- Not in Slice 1.3: recurrence and occurrence exceptions (moved to 2.2), month / week / day grids, statuses, notifications, Coach / cloud / sync, device-calendar access or permissions, Player tabs.

### Planned commits (one at a time, owner review after each)

1. `docs(calendar): define Slice 1.3 contract` — this document change.
2. Calendar event domain + local date / time helpers.
3. Schema v4 + repository + real-SQLite tests.
4. Calendar UI / routes / edit / delete.
5. Final integration / regression evidence, only if genuinely required.

Then one Preview APK covering: **A.** Slice 1.3 Calendar Foundation; **B.** the remaining Slice 1.2 physical acceptance (see Slice 1.2); **C.** the remaining Slice 1.1 physical acceptance (see Slice 1.1).

---

## Slice 1.2 — Self-Assessment: IMPLEMENTED, PARTIAL PHYSICAL ACCEPTANCE (2026-10-04)

**Status:** IMPLEMENTED with strong automated verification and **PARTIAL**
physical Android acceptance. Remaining physical acceptance items are carried
forward to the next Preview APK (built after Slice 1.3; no separate APK),
including revalidation of the post-Save navigation fix `e181fba`.

### Commits (owner hashes)

| Commit | Content |
|---|---|
| `ebd0e22` docs(self-assessment): define Slice 1.2 contract | Contract (PRODUCT_SPEC §67 / §70, ARCHITECTURE §7 / §9) and the true Slice 1.1 status |
| `35c7158` fix(players): respect bottom safe-area inset in player form | Slice 1.1 carry-forward: `SafeAreaScrollView` (real bottom inset, existing `react-native-safe-area-context`) |
| `4236be5` feat(self-assessment): add domain model and validation | Sport-neutral `SelfAssessment` / `SelfRating` (1–5); Basketball category codes; Map-based validation (fail-closed for `__proto__`-like codes) |
| `52480e6` feat(self-assessment): add local persistence | Migration v3 (`self_assessments`, `self_assessment_ratings`); create / list repository; read-side Player / sport relationship check; fail-closed corrupt reads |
| `96ad686` feat(self-assessment): add self-assessment screens | Player Edit entry (Basketball only), history, new assessment (`RatingScale`, LTR 1–5, end anchors), HE / EN, local date + time |
| `e181fba` fix(self-assessment): return to history after saving | Physical-gate defect fix: leaving New uses one plain back step to History (or replaces New with History when opened directly) |

Schema: **v3**.

### Automated evidence (authoring environment, after `e181fba`)

| Check | Result |
|---|---|
| `npm run check` | ✅ **37/37 suites, 504/504 tests PASS** |
| Android / iOS export | ✅ |
| Android prebuild permissions | ✅ unchanged: INTERNET, MODIFY_AUDIO_SETTINGS, READ / WRITE_EXTERNAL_STORAGE (maxSdkVersion 32), SYSTEM_ALERT_WINDOW, VIBRATE — no RECORD_AUDIO, CAMERA, location or contacts |

### Physical Android evidence (owner, Preview APK of `96ad686`)

| Check | Result |
|---|---|
| APK installed over the existing app (v2 data) | ✅ |
| Schema migrated v2 → v3 | ✅ |
| The two existing players and their profile data intact | ✅ |
| Self-assessment entry only for a Basketball player; none for a player without Basketball | ✅ |
| Hebrew / RTL assessment screen; the six Basketball categories | ✅ |
| Rating row reads 1 → 5 left-to-right; Hebrew low / high anchors | ✅ |
| Incomplete assessment: validation shown, nothing saved, chosen answers kept | ✅ |
| Complete assessment persists; latest date / time on Player Edit updates; reopening "Open self-assessment" shows it | ✅ |
| Navigation after Save | ❌ returned to Player Edit instead of the history → fixed in `e181fba` (automated tests walk the real route stack; the Jest renderer did not reproduce the device behaviour) — **not yet physically revalidated** |

### Still physically unverified — carried forward to the next Preview APK

1. **Navigation (`e181fba`):** Save → History · the new assessment is visible immediately · Android Back from History → Player Edit · Cancel → History.
2. **Repeatability:** a second assessment with different values · newest first · the first one unchanged · both kept · same-day entries told apart by time · no edit / delete path.
3. **Persistence:** kill and reopen the app · both assessments still present.
4. **English:** English / LTR flow · the six English labels · 1 → 5 still left-to-right · English anchors · saved data unchanged when the language changes.
5. **Safe area:** New Assessment Save / Cancel visible and tappable above the Android navigation area · the History screen's bottom content usable.

---

## Slice 1.1 — Player Profile: IMPLEMENTED, PARTIAL PHYSICAL ACCEPTANCE (2026-10-04)

**Status:** implemented with strong automated / native verification and
**partial** physical Android acceptance. **Not** fully physically accepted.
Not on `origin/main` (owner's local `main`, 7 commits ahead of `823cdc7`).

### Commits (owner hashes)

| Commit | Content |
|---|---|
| `670b184` feat(players): add player domain and age calculation | `CalendarDate`, `ageOn` (29 Feb → 1 Mar), `validatePlayerCore`, Basketball profile codes and validation |
| `01df7d4` feat(players): add local family and player persistence | Migration v2 (`families`, `players`, `player_sports`, `basketball_player_profiles`), `app_meta.local_family_id` singleton, repository with one-operation-at-a-time queue, `PlayerDataError`, DB closed on init failure |
| `c7928d6` feat(players): add player list and profile form | `/children`, `/children/new`, `/children/[id]`, shared form, Hebrew/English copy, save protection |
| `b52c6be` docs(players): revise Slice 1.1 profile contract | Optional sport, Basketball details, DOB picker, Calendar Foundation, True MVP by capabilities |
| `389fbca` refactor(players): make basketball assignment optional | `basketball: null` = no sport; four read states (corrupt states → `PlayerDataError`, never repaired); `SportRemovalNotSupportedError` (zero writes); authoritative re-read before writes; dormant `experience` / `weekly_frequency` preserved |
| `a0932b0` refactor(players): separate personal and sport profile UI | Personal / Sport / Basketball sections; Basketball chip locked once saved; secondary position only for PG–C with explicit None; Experience / Frequency removed from the UI; height `cm` suffix |
| `19441f1` feat(players): add native date picker | `@react-native-community/datetimepicker` 9.1.0 (SDK 57 compatible; no config plugin); calendar button fills the same day / month / year; opens on a valid typed date else local today; maximum = local today; local-only date conversion (child-process timezone proofs in Asia/Jerusalem and America/Los_Angeles) |

Schema: **v2** (no change after `01df7d4`).

### Automated / native evidence (owner's machine, after `19441f1`)

| Check | Result |
|---|---|
| `npm ci` | ✅ |
| `npm ls` | ✅ datetimepicker 9.1.0 |
| `npm run check` | ✅ **28/28 suites, 312/312 tests PASS, 0 failed** |
| `expo config` | ✅ (no datetimepicker config plugin) |
| Android clean prebuild | ✅ package `com.ezbyname.galscoacher`; autolinking resolves `@react-native-community/datetimepicker` (`RNDateTimePickerPackage`) |
| Android manifest permissions | ✅ INTERNET, MODIFY_AUDIO_SETTINGS, READ_EXTERNAL_STORAGE (maxSdkVersion 32), WRITE_EXTERNAL_STORAGE (maxSdkVersion 32), SYSTEM_ALERT_WINDOW, VIBRATE — none added by the date picker; no RECORD_AUDIO, CAMERA, location, POST_NOTIFICATIONS or contacts |
| Android / iOS export | ✅ |
| EAS Preview APK | ✅ built (`d318602d-88c7-496a-8ede-cc98db7d52d8`) |

### Physical Android evidence (owner, Preview APK above)

| Check | Result |
|---|---|
| App starts without crash; splash | ✅ |
| Create new players | ✅ |
| Basketball profile section | ✅ works sufficiently to create players |
| Upgrade persistence of an existing player | ⚠️ not performed on this APK (no player existed before the upgrade); later shown on the Slice 1.2 APK (`96ad686`): both existing players and their profile data survived the v2 → v3 upgrade |

### PlayerForm bottom safe-area defect — fixed in `35c7158`, physical verification pending

Found on the Slice 1.1 APK: with Basketball selected the Player form is
longer, and on physical Android with the system navigation area visible,
Save was visible but **Cancel (the last control) was partially covered by
the navigation area.** Cause: the app draws edge-to-edge and the form's
scroll content did not add the bottom safe-area inset.

**Implemented** in `35c7158` fix(players): respect bottom safe-area inset in
player form (`SafeAreaScrollView`: the device's real bottom inset, no fixed
constant; Save / Cancel stay in normal flow; automated tests for insets 0 /
24 / 48, Basketball collapsed and expanded, Hebrew and English). **Physical
Android verification remains pending** (checklist item 7 below).

### Still unevidenced Slice 1.1 checks — carried forward to the next Preview APK

1. Edit an existing player and save.
2. Add Basketball later to a player without a sport.
3. Manual date of birth.
4. Native date-of-birth picker.
5. Persistence after a restart.
6. The relevant Hebrew and English checks.
7. **PlayerForm bottom safe-area fix (`35c7158`, implemented):** with the Basketball section expanded, Save and Cancel visible and tappable above Android 3-button navigation (and gesture navigation if practical), in the Hebrew and English layouts.

(Keep players and self-assessments on the current APK before installing the next one, so the v3 → v4 upgrade is checked on real data.)

### Known gaps / limitations

- **No way to delete a player** — recorded product gap; out of scope for Slice 1.2 unless the owner approves it.
- Native date picker follows the device language (accepted, PRODUCT_SPEC §65).
- iOS: export only; no native build or device validation; the iOS date-picker presentation is unverified.

---

## Slice 1.0 closure — 2026-10-03

### What Slice 1.0 contains

- **Languages:** Hebrew (default on every fresh install, independent of the OS locale) and English; one translation layer (`t()`, typed keys, HE/EN key and placeholder parity); all existing screens, headers and Diagnostics localized; approved Hebrew copy; `react/jsx-no-literals` enforced.
- **Direction:** Hebrew RTL / English LTR via `DirectionService` (Hebrew `allowRTL(true)`+`forceRTL(true)`, English `forceRTL(false)`+`allowRTL(false)`, `reloadAppAsync()`); reload-loop protection (`@gals-coacher/rtl.reloadTarget`); mismatches exposed on Diagnostics, never retried.
- **Persistence:** language in AsyncStorage (`@gals-coacher/ui.language`; missing/invalid → Hebrew). No SQLite migration (schema still v1).
- **Settings:** Hebrew / English selector with confirmation; fast language-switch reload (no 5 s splash; transient marker `@gals-coacher/startup.languageSwitchAt`, consumed once, ≤30 s freshness).
- **Startup splash:** approved coach artwork `assets/images/splash-coach.png` (SHA-256 `E3CA6E7124A11F55B923B194763C26B97D81AC9DA62236E7A76D2A614C5E8805`); native splash = same artwork small and centred on `#A9886F` (supported SDK 57 config), app-level full-screen artwork; ~5 s minimum on cold start (including the first-launch RTL correction, without a double wait), gated on language/direction and app readiness; background → foreground never replays it (completion remembered per JS runtime).
- **Diagnostics:** direction actual/expected row and RTL measurement sample (`18/20`, `80%`, `4.38`, `00:45`, `20m`).

### Automated evidence (final)

| Check | Result |
|---|---|
| Jest | ✅ **20/20 suites, 123/123 tests PASS, 0 failed, 0 skipped** |
| TypeScript | ✅ PASS |
| Lint | ✅ PASS |
| Android / iOS bundle export | ✅ validated during implementation |
| Prebuild + Android manifest | ✅ `supportsRtl="true"`, `MODIFY_AUDIO_SETTINGS`, **no `RECORD_AUDIO`** |
| Splash artwork | ✅ SHA-256 verified (above) |

### Physical Android evidence (EAS Preview APK, owner)

| Check | Result |
|---|---|
| Fresh launch | ✅ native splash shows the smaller centred coach image, then the app-level splash fills the screen; ~5 s startup; Hebrew + RTL |
| Home / Players / Exercises / History / Quick Training / Settings / Diagnostics | ✅ all open, no crash |
| Diagnostics | ✅ schema v1; direction actual/expected correct; haptics work; `18/20`, `80%`, `4.38`, `00:45`, `20m` render correctly |
| Hebrew → English | ✅ switch succeeds, LTR, app works |
| Full restart | ✅ English and LTR persist |
| English → Hebrew | ✅ switch succeeds, RTL |
| Full restart | ✅ Hebrew and RTL persist |
| Background → foreground | ✅ **bug found and fixed:** the first Preview APK replayed the 5 s splash on resume; fixed in the startup commit (JS-runtime startup completion state); a new Preview APK was verified with ≥3 background → foreground cycles — no splash, no delay, returns to the active screen. **Closed.** |

### Not verified / not started

- iOS bundle export validated; no physical iOS device/runtime validation or native iOS build has been performed.
- No Player Profile, Self-Assessment, Cloud/Auth, Exercise Model or Training Engine work.

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

- iOS: bundle export validated; no physical iOS device/runtime validation or native iOS build yet (early dev-build gate in Slice 2.1, full validation in the dedicated iOS Validation slice).
- Verified build was the **preview** profile; the development-client build path was not part of this validation.
- `AudioCueService` is a silent stub; whistle assets come in Slice 2.1.
- Supabase: client wired, offline-only; no project/schema/RLS yet.
- Players / Exercises / Quick Training / History are placeholders.
- Comparison policies exist in the domain, but PB rules (shooting minimum sample, manual-timer significance threshold) are open product decisions and not implemented.
- Android may follow system dark mode (`userInterfaceStyle: "light"` is not enforced on Android without `expo-system-ui`). Theme behaviour is an open product decision — **DEFERRED** to UI/theme work.

### Next proposed action

**Slice 1.1 — Player Profile**, only after explicit owner approval. Not started. (Cloud Foundation position remains RECOMMENDED / PENDING PRODUCT OWNER APPROVAL.)

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

1. **Cloud Foundation before the Training Engine** (slice C after 1.3 Calendar Foundation, before 2.0; previously proposed after 1.2) — **APPROVED by the owner on 2026-10-04.** Recorded in ROADMAP. Kept here as history.
- `expo-system-ui` to enforce the light theme on Android — **DEFERRED — decide during UI/theme work.** Theme behaviour (light only / dark / system) is not decided; no dependency added.
