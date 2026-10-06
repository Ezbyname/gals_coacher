# PROJECT STATE

> **Living document.** Updated after every completed slice/phase. Where we are *now*.

## Current status

**Phase 0 — Foundation: CLOSED / VERIFIED** (2026-10-02).
**Phase 0.H — Hardening: CLOSED / VERIFIED** (2026-10-03).
**Slice 1.0 — Localization / RTL / Startup Splash: CLOSED / VERIFIED** (2026-10-03).
All verified by the owner on a physical Android device.
**Slice 1.1 — Player Profile: IMPLEMENTED; carried-forward physical items PASSED** (owner-reported, Preview APK `302bbd33…`, gate G33: 33/33 PASS, 2026-10-05) — including the PlayerForm safe-area fix `35c7158`. The "Basketball cannot be removed" rule is superseded by SPORT-LIFE-001 (below).
**Slice 1.2 — Self-Assessment: IMPLEMENTED; carried-forward physical items PASSED** (owner-reported, gate G33), including the post-Save navigation fix `e181fba`.
**Slice 1.3 — Calendar Foundation: IMPLEMENTED.** Commits A–D physically PASSED (gate G33, schema v4 upgrade over the previous APK). The UI polish `143fa3e`: **automated PASS, PHYSICAL ACCEPTANCE FAIL** (gate NB, build `d20190fb…`: 17 PASS / 2 FAIL — NB-02, NB-03 keyboard; open as CAL-KEY-001).
**CAL-KEY-001 (keyboard) and SPORT-LIFE-001 (Basketball active / inactive): IMPLEMENTED + AUTOMATED GATE PASS, PHYSICAL ACCEPTANCE PENDING** (next Preview APK; plan below).
**CAL-COMP-001 (explicit manual calendar event completion): IMPLEMENTED + AUTOMATED GATE PASS, PHYSICAL ACCEPTANCE PENDING.** Schema is now **v6**.
**CAL-VIEW-001 / CAL-FILTER-001 / CAL-COLOR-001 (Full Calendar: Month / Week, filters, colour meaning): IMPLEMENTED + AUTOMATED GATE PASS, PHYSICAL ACCEPTANCE PENDING.** Schema unchanged (v6).
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
| Slice 1.1 (Player Profile) | **IMPLEMENTED**; carried-forward physical items **PASS** (gate G33, owner-reported) |
| Slice 1.2 (Self-Assessment) | **IMPLEMENTED**; carried-forward physical items **PASS** (gate G33, owner-reported) |
| Slice 1.3 (Calendar Foundation) | **IMPLEMENTED**; A–D physical **PASS** (G33); UI polish physical **FAIL** (NB-02 / NB-03) → CAL-KEY-001 |
| CAL-KEY-001 (Calendar keyboard) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING** (NB-02 / NB-03 / NB-04 next build) |
| SPORT-LIFE-001 (Basketball active / inactive) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING**; schema **v5** |
| CAL-COMP-001 (manual event completion) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING**; schema **v6** |
| CAL-VIEW-001 / CAL-FILTER-001 / CAL-COLOR-001 (Full Calendar) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING**; no schema change |
| Slices after 1.3 (C, 2.x …) | **Not started** |

---

## Next build — validation plan (Preview APK after `dc58ea2`; schema v5)

Install **over** the current APK (`d20190fb…`, schema v4) — never uninstall
first. A build is physically accepted only when every applicable test below
is PASS (none NOT RUN, FAIL or BLOCKED).

**Blocking, carried forward (CAL-KEY-001):**

| ID | Test |
|---|---|
| NB-02 | Calendar Create and Edit: tap **Title** near the bottom — the field and the cursor move above the keyboard; typing stays visible; the form still scrolls with the keyboard open. HE and EN. |
| NB-03 | Calendar Create and Edit: tap **Notes**, type several lines — the current typing line stays above the keyboard as Notes grows; scrolling works with the keyboard open. HE and EN. |
| NB-04 | Close the keyboard — the layout returns to normal; no doubled / oversized bottom gap; Save / Cancel reachable; nothing under the Android navigation bar (3-button and gesture navigation). |

**New — SPORT-LIFE-001 (blocking):**

| ID | Test |
|---|---|
| SL-01 | Upgrade over the current APK: no crash; Diagnostics shows schema v5; all players, details, self-assessments and calendar events unchanged. |
| SL-02 | An existing Basketball player is still **active** after the upgrade: Basketball selected, positions / hand shown, Self-assessment offers a new assessment. |
| SL-03 | Edit the Basketball player → tap Basketball → confirmation appears; **Keep active** leaves everything as it was. |
| SL-04 | Tap Basketball → **Make inactive** → **Cancel** the form → reopen: Basketball still active, nothing changed. |
| SL-05 | Tap Basketball → **Make inactive** → **Save**: the player saves; Basketball unselected; the player list no longer shows the position. |
| SL-06 | Player valid without an active sport: reopen, edit the name, save — works; no error. |
| SL-07 | Self-assessment while inactive: section says "history only"; history opens with every earlier assessment; there is **no** New button. |
| SL-08 | Calendar while inactive: earlier Basketball events still listed with "Basketball"; a **new** event offers no Basketball choice and saves without a sport. |
| SL-09 | Edit an earlier Basketball event while inactive: Basketball shown selected; save keeping it works; clearing it also works. |
| SL-10 | Reactivate: tap Basketball (no confirmation) → the earlier positions / hand are pre-filled → Save → position back in the list; New self-assessment offered again; history unchanged. |
| SL-11 | Full restart while inactive, and again after reactivation: state, history and events persist. |
| SL-12 | No duplicates / no loss: after SL-05 → SL-10 there is one player, one set of assessments (no extra), the same events. |
| SL-13 | Hebrew and English: confirmation dialog, "history only" notice, unavailable-sport messages read correctly (RTL / LTR). |
| SL-14 | A player who never had Basketball: unaffected (no Basketball anywhere, schedule works). |

**Regression re-run (code touched):** the whole previous NB plan (NB-01,
NB-05 … NB-19) — the calendar form, Player Edit, Self-assessment and Player
list changed — and from gate G33: 1 (upgrade), 2 (entry gating), 14–18
(Self-assessment navigation, multiple, persistence, English), 21–22 (edit
player / add Basketball), 25 (player without Basketball), 28 (optional
sport), 29–31 (positions, clear secondary, persistence).

---

## CAL-VIEW-001 / CAL-FILTER-001 / CAL-COLOR-001 — Full Calendar: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-06)

- **Entry:** Home → **Calendar** (`/calendar`); no new main-navigation tab (Home stays selected). Per-Player Schedule screens unchanged; `splitAgenda` unchanged.
- **Month:** 7-column grid of whole weeks, weekday headers, previous / next month, Today; today ringed and announced; neighbouring-month days muted; each day shows up to 2 markers (colour + Player initial or activity glyph) and "+N"; the selected day's events are listed below in full. **Week:** the same seven-day strip for one week with previous / next / Today and the selected day's list. Tapping an event opens the existing Event Details (delete there returns to the calendar).
- **Dates:** local civil dates only; an event occupies [start, end) — an end at exactly midnight does not reach the next day; no end = its start date. One range query per visible month / week across all Players (`listCalendarEventsInRange`).
- **Week start — OWNER DECISION PENDING:** the repository had no rule; Sunday is used for both languages (one constant, `WEEK_STARTS_ON` in `src/domain/calendarView.ts`).
- **Filters:** Player, Sport (incl. "No sport"), Activity type; multi-select; OR inside a dimension, AND across; empty = All; screen state only (nothing stored); active filters shown as a count and a "Showing only" line with Clear. Sport filtering uses the event's stored sport — an inactive sport's history stays visible.
- **Colour:** several Players can show → colour = Player (slot by creation order: stable across rename, filter, order, restart); exactly one Player (filtered, or a one-Player family) → colour = activity type (fixed map). Always with text (initial / glyph / labels), a legend, and "✓ Completed" for completion.

**Automated evidence (authoring environment):** `npm run check` exit 0 — 58/58 suites, 1028/1028 tests; Android bundle export exit 0. Focused: calendar view domain 38/38, local-date projection (incl. Jerusalem / Los Angeles / Auckland child processes) 13/13, range repository 7/7, Full Calendar UI 28/28 (HE / EN); negative proof 18/18 mutants killed.

**Physical (next batched Preview APK) — all PENDING:** CV-01 Month layout / navigation (cell size and readability on a phone) · CV-02 Week layout / navigation · CV-03 event → existing Event Details and back (and delete returns to the calendar) · CF-01 Player filter · CF-02 Sport filter (incl. No sport; inactive Basketball history) · CF-03 Activity Type filter · CF-04 combined filters + Clear + no-match message · CCOLOR-01 several Players → Player colours (same Player, same colour after rename / restart) · CCOLOR-02 one Player → activity-type colours · CCOLOR-03 meaning without colour (initials, glyphs, legend, TalkBack) · CV-04 Hebrew RTL / English LTR (grid mirrors, weekday order, arrows) · CV-05 overnight / multi-day / ending-at-midnight display · CV-06 completion shown without moving the event · CV-07 main navigation / safe-area regression.

## CAL-COMP-001 — Explicit manual calendar event completion: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-05)

- **Schema v6 (additive):** `calendar_events.completed_at INTEGER` and `completion_source TEXT`, both NULL = not completed; SQL CHECKs keep them set / cleared together, the time an integer, the source non-blank. Existing events upgrade as **not completed**. Source codes are validated in the domain (`LOCAL_USER` only today; room for later provenance without a schema change).
- **Explicit only:** completion never follows from time; agenda sections and order stay schedule-based (`splitAgenda` unchanged). A completed event is not a training session, result or self-assessment; nothing else is written.
- **Repository API:** `markCalendarEventCompleted` / `undoCalendarEventCompletion` — idempotent (a second mark keeps the first time), scoped to the Player, transactional, fail closed on malformed data; they never change the schedule, type, sport, title, notes or `updatedAt`. Edit keeps the completion; delete removes it with the row. Allowed for history of an inactive sport. Undo clears the current state (no history of marks is kept).
- **UI:** Event Details — *Mark as completed* / *סימון כהושלם*; when completed, *✓ Completed* / *✓ הושלם* with the time it was marked and *Undo completion* / *ביטול הסימון*; no confirmation; a failure stays on Details with a safe message and allows retry. Agenda cards show a *✓ Completed* badge (symbol + word, not colour alone) and the screen-reader label ends with "completed"; cards never move.

**Automated evidence (authoring environment):** `npm run check` exit 0 — 54/54 suites, 939/939 tests; Android bundle export exit 0. Focused: v6 migration 11/11, repository completion 20/20, agenda classification 14/14, UI completion 13/13 (HE / EN); mutation gate 14/14 killed (all compiled, restored byte-identical).

**Physical (next Preview APK, install over the previous one):** CC-01 upgrade → Diagnostics schema v6, every earlier event shown as not completed · CC-02 Mark / Undo on Details (HE + EN), no dialog · CC-03 completed state survives a full restart · CC-04 the agenda badge and TalkBack text; cards do not move · CC-05 Edit a completed event keeps it completed · CC-06 a past Basketball event while Basketball is inactive can be marked and undone · CC-07 Mark / Undo buttons are easy to tap; nothing under the navigation bar.

## SPORT-LIFE-001 — Basketball active / inactive: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-05)

Owner-approved design (2026-10-05). Commit (authoring) `dc58ea2`.

- **Schema v5 (additive):** `player_sports.active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(active) = 'integer' AND active IN (0, 1))`. Existing assignments upgrade as active. No status timestamp (owner decision).
- **Never destructive:** deactivation sets `active = 0` only. The assignment row, the Basketball profile (incl. dormant experience / weekly frequency), height, self-assessments and calendar events are untouched; foreign keys stay valid.
- **Reactivation** reuses the same assignment and profile rows (no duplicates); the form pre-fills the stored details; `active = 1` only when Save succeeds.
- **Rules:** `SportInactiveError` (distinct from "not assigned"): no new self-assessment and no new calendar event with an inactive sport; an existing event may keep or clear the sport it already has. Deactivation is confirmed in the Player form (safe default: keep active) and applies only on Save; Cancel discards it.
- **UI while inactive:** Basketball unselected; Self-assessment "history only" (read-only history, no New); the calendar offers no Basketball for new events; the player list hides the position.
- **Superseded:** "a saved sport cannot be removed" (Slice 1.1) and `SportRemovalNotSupportedError` (retired).

**Automated evidence (authoring environment):** `npm run check` exit 0 — 46/46 suites, 825/825 tests; Android and iOS bundle exports exit 0. Focused: v5 migration 12/12, repository lifecycle 14/14, UI lifecycle 12/12; mutation gate 15/15 killed (all compiled, restored byte-identical). Legacy-schema fixtures are written with raw SQL (`src/test-support/legacyFixtures.ts`).

## CAL-KEY-001 — Calendar Title / Notes under the Android keyboard: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-05)

Physical failure: NB-02 / NB-03 (build `d20190fb…`). Cause: Android draws
edge-to-edge, so the window no longer shrinks for the keyboard, and the
previous fix padded the form on iOS only. Fix (authoring `8e6cc07`, no new
dependency): the form's KeyboardAvoidingView pads by the keyboard overlap on
both platforms (offset = the form's measured window position), and the focused
Title / Notes is scrolled into the visible area on focus, on keyboard show, on
viewport change and while Notes grows. Automated: wiring and arithmetic tests
+ 7/7 mutations killed — **not physical proof**; NB-02 / NB-03 / NB-04 must
pass on a device to close it.

## Physical gates (owner-reported)

- **G33** — Preview APK `302bbd33-52cb-4863-9e41-c551a730f645` (owner HEAD `7d9daf8`, schema v4, installed over the previous APK): **33/33 PASS** (test 33, Hebrew restart persistence, owner-reported PASS). Covers Slice 1.3 A–D and the Slice 1.1 / 1.2 carried-forward items.
- **NB** — Preview APK `d20190fb-b0b6-4a6e-bb3f-b0b75331544d` (owner HEAD `143fa3e`, schema v4, installed over G33's APK): NB-01, NB-04 … NB-19 **PASS**; **NB-02, NB-03 FAIL** → 17 PASS / 2 FAIL / 0 BLOCKED → **physical acceptance FAIL** for the UI polish `143fa3e`.

## Owner-directed queue (recorded 2026-10-05; not a ROADMAP reorder)

After SPORT-LIFE-001 / CAL-KEY-001 pass physically, and only with explicit
owner approval: NAV-001 (main navigation shell: Home / Players / Exercises /
Settings) · NAV-DIRTY-001 (reusable unsaved-changes guard, default Stay) ·
later CAL-COMP-001 (manual completion), CAL-VIEW-001 (month / week),
CAL-FILTER-001, CAL-COLOR-001, ACTIVITY-001 (configurable activity types),
COACH-EVENT-001 / COACH-CAL-001, PERF-SELF-001 / PERF-OBJ-001, CLOUD-001,
TRAIN-001 / TRAIN-002 (training direction recorded in ROADMAP),
CAL-TRAIN-001. Daily Motivation / AI Coach remain deferred.

---

## Slice 1.3 — Calendar Foundation: IMPLEMENTED (2026-10-05)

Contract approved 2026-10-04 (ROADMAP 1.3 / 2.2, PRODUCT_SPEC §51,
ARCHITECTURE §7 / §14). Owner commits: `c8a87e5` docs contract · `60ba318`
domain + local time rules · `3f46445` schema v4 + repository · `7d9daf8`
schedule UI · `143fa3e` UI polish after device QA (physical FAIL, see
CAL-KEY-001). Physical evidence: gates G33 and NB above.

Approved contract, in short:

- A **one-off** `CalendarEvent` per Player: `id`, `playerId`, `type`, `sport` (optional), `startAt`, `endAt` (optional), `title`, `notes`, `createdAt`, `updatedAt`. `CalendarEvent ≠ TrainingSession`: no event creates, completes or skips a training session.
- Six type codes: `TEAM_TRAINING`, `PERSONAL_TRAINING`, `GAME`, `GYM`, `RECOVERY`, `OTHER` (labels in i18n only). `SCHOOL` and `UNAVAILABLE` deferred.
- `sport` is optional and independent of `type`; only a supported sport the Player is assigned to (today `BASKETBALL`).
- `startAt` required, `endAt` optional with `endAt > startAt`; epoch milliseconds (absolute instants), entered as device-local date / time (a non-existent DST-gap time is rejected), shown in the device's current timezone and the active app language. No stored timezone, no all-day events.
- `title` optional except **required (non-blank) for `OTHER`**; `notes` optional; blank → null. No length limits locked.
- Create, edit and delete (delete with explicit confirmation; hard delete — no tombstones / `deleted_at` / sync status). `createdAt` set once; `updatedAt` set on create and on every successful edit; `id` and `playerId` never change.
- Agenda / list UI reached from Player Edit (every Player, with or without a sport): Current & upcoming / Past, add, details, edit, delete. Current & upcoming = `endAt >= now`, or `startAt >= now` without an end; otherwise Past; `now` from `Clock.wallNow()`. **Display order:** Current & upcoming by `startAt` ascending, then `id` ascending (nearest first); Past by `startAt` descending, then `id` descending (most recent first). Tests cover both the classification and the ordering.
- Not in Slice 1.3: recurrence and occurrence exceptions (moved to 2.2), month / week / day grids, statuses, notifications, Coach / cloud / sync, device-calendar access or permissions, Player tabs.

## Slice 1.2 — Self-Assessment: IMPLEMENTED; carried-forward physical items PASSED in gate G33 (2026-10-05)

> Historical record below (written 2026-10-04, when acceptance was partial). The carried-forward items listed here were physically verified in gate G33 (owner-reported, 33/33 PASS).

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

## Slice 1.1 — Player Profile: IMPLEMENTED; carried-forward physical items PASSED in gate G33 (2026-10-05)

> Historical record below (written 2026-10-04, when acceptance was partial). The carried-forward items were physically verified in gate G33 (owner-reported). The "Basketball cannot be removed" rule is superseded by SPORT-LIFE-001.

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
2. **Align controlled docs with SPORT-LIFE-001 (proposed 2026-10-05):** PRODUCT_SPEC and ARCHITECTURE still describe a saved sport as not removable. The owner superseded that rule and approved the active / inactive design; the implementation exists (schema v5). Proposed: update PRODUCT_SPEC (player profile / sport) and ARCHITECTURE §7 (schema v5, `player_sports.active`) accordingly — **awaiting owner approval** for the controlled-doc edit.
- `expo-system-ui` to enforce the light theme on Android — **DEFERRED — decide during UI/theme work.** Theme behaviour (light only / dark / system) is not decided; no dependency added.
