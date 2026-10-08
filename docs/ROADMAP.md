# ROADMAP

> **Status: CONTROLLED.** Where the project is going. Not rewritten after every
> phase — progress is tracked in [PROJECT_STATE.md](./PROJECT_STATE.md).

Every phase: **Implement → Test → Run → Prove → Update PROJECT_STATE.md → STOP.**
No automatic transition to the next phase.

**Automation-first (locked, owner 2026-10-07):** every slice ships automation-ready
in the same slice — stable testIDs / resource ids for every new or changed
user-facing behaviour, its Product QA scenarios defined, and the Python Product
QA added or updated in the same development cycle where UI exists. Automation is
never a follow-up cleanup task. SKIPPED, NOT RUN and BLOCKED are never PASS;
every Product QA failure is classified (PRODUCT_BUG, AUTOMATION_BUG,
TEST_DATA_ISSUE, ENVIRONMENT_LIMITATION, REQUIREMENT_AMBIGUITY, AUTOMATION_GAP)
before any product change.

The slices below are the owner-approved product slices (2026-10-02,
revised 2026-10-04: Player Profile contract, Calendar Foundation added,
Calendar UI moved after the Training Engine, Shooting renamed, Quick
Training renumbered; revised again 2026-10-04: Slice 1.3 became one-off
Calendar Foundation with a minimal real UI, recurrence / exceptions moved to
2.2); they replace the original numbered phases 1–15 (the
former phase each slice absorbs is noted). Cloud Foundation (C) is
**approved (2026-10-04)** to sit after 1.3 Calendar Foundation and before
2.0. **Revised 2026-10-06 (owner): TRAIN-001 (2.0) and TRAIN-002 (2.1)
are built before Cloud Foundation C** — the 2026-10-04 position "C before 2.0"
is superseded. The training model stays cloud-ready (client UUIDs, created /
updated timestamps, family / player ownership, no single-user assumption) so
cloud, auth, sync and RLS can be added in C without redesigning it.

| Slice | Name | Scope | Gate |
|---|---|---|---|
| 0 | Foundation | Expo, RN, TypeScript strict, Expo Router, Supabase client, SQLite, testing, lint, env config, architecture, Android build, iOS build configuration | **CLOSED / VERIFIED** on a physical Android device (see PROJECT_STATE). |
| 0.H | Phase 0 Hardening | Result comparison policy (measurement type ≠ comparison), injectable `IdService`, safe audio preload, meaningful SQLite tests, offline/sync + Child Mode architecture docs, document governance. No features. | Patch reviewed; `npm run check` green; Android preview APK re-verified (launch, Diagnostics, SQLite restart, haptics). |
| 1.0 | Localization / RTL | Hebrew default, English, RTL Hebrew / LTR English, language preference persistence, direction handling (reload acceptable), all existing strings localized, measurement display safety | Fresh install opens in Hebrew RTL; switch to English LTR; choice survives restart; `18/20`, `80%`, `4.38` read correctly in Hebrew. **Physical Android device.** |
| 1.1 | Player Profile | Local-first. Local Family (UUID) + generic Player: name, DOB (manual day/month/year + native date picker) → age, optional height. **Optional** sport assignment (Basketball the only selectable sport; may be added later; not removable in 1.1 — **superseded 2026-10-05 by SPORT-LIFE-001 (owner decision):** Basketball can become inactive and be reactivated without losing any data; schema v5). Basketball profile only when Basketball is selected: primary / secondary position (None), dominant hand. Experience and weekly frequency not collected (stored values preserved). Create / edit / view, SQLite persistence. **No weight.** (former Phase 1, local part; contract revised 2026-10-04) | Create with and without Basketball, add Basketball later, edit, restart, data persists, both languages, manual + picker DOB, on device. |
| 1.2 | Self-Assessment | 5–6 basketball categories, 1–5 rating, persisted locally, repeatable over time, separate from objective results | Take twice; both kept with dates; nothing written to result tables. |
| 1.3 | Calendar Foundation | **One-off** `CalendarEvent` per Player (revised 2026-10-04): types `TEAM_TRAINING`, `PERSONAL_TRAINING`, `GAME`, `GYM`, `RECOVERY`, `OTHER`; optional sport independent of type; start + optional end (epoch ms, device-local entry / display, no stored timezone, no all-day); title required only for `OTHER`; local persistence (schema v4); Player-owned schedule reached from Player Edit: agenda / list (Current & upcoming / Past), create, details, edit, delete (confirmed, hard delete). `CalendarEvent ≠ TrainingSession`. **Not included:** recurrence and occurrence exceptions (→ 2.2), school / unavailable types, month / week / day grids, statuses, notifications, Coach / cloud, device-calendar access, recommendations, AI. (calendar data part of former Phase 12; added 2026-10-04) | Automated: domain / persistence / UI tests; migration v3 → v4 upgrade, idempotency and rollback proof with existing Player and Self-Assessment data unchanged; corruption fail-closed; DST-gap / overlap time handling. **Physical Android:** upgrade over the previous APK keeps all data (schema v4); create / edit / delete events with and without sport and end time; Current & upcoming / Past ordering; restart persistence; Hebrew and English; safe area. Same APK verifies the Slice 1.2 navigation carry-forward. |
| C | Cloud Foundation (position approved 2026-10-04: after 1.3, before 2.0 — **revised 2026-10-06: after TRAIN-002 (2.1)**; it then also covers ownership / RLS for the exercise and training tables) | Small by design: parent authentication, Family, Player ownership, cloud representation of SelfAssessment, RLS, RLS tests, first idempotent upload / attachment of the existing local family data. **Not included:** generic bidirectional sync, multi-device conflicts, Child Mode, full training-history sync, background sync framework. Local-first training stays a requirement. | RLS verified by tests (family A cannot read family B); local family data attached once, re-upload creates no duplicates; app still works offline after first sign-in. |
| 2.0 | Exercise Model + Exercise Library | Generic `Exercise` + `ExerciseSport` association (one exercise may serve several sports), generic measurement types + comparison policy, ~~small basketball-first library~~ (**superseded 2026-10-06:** a substantial professionally curated starter library for fitness and Basketball — quality and coverage over a fixed count; baseline 107), custom exercise foundation (former Phase 2). **TRAIN-001 IMPLEMENTED (2026-10-06)** — status in PROJECT_STATE. **TRAIN-001 future direction (2026-10-05, not implemented):** Exercises / Drills for general fitness **and** Basketball in one generic model; reusable Exercise Packs / Training Blocks by area / category and difficulty — see *Training system direction* below. | Predefined exercises load; create / edit custom exercise. |
| 2.1 | Training Engine — **TRAIN-002 re-scoped 2026-10-06 (owner):** Dynamic Workout Builder + Manual Training Execution + objective actual results | Reusable Workout Blocks and Workout Templates (create / edit / reorder / sets / targets / load / rest; absorbs former slice 5 Workout Builder); frozen Planned Workout snapshot per player; Training Session (In progress / Completed / Partial / Abandoned) with planned vs actual per set, skip / extra sets, manual entry with a per-measurement source (Manual now; Camera / Device / Sensor later); historical snapshots; session `purpose` TRAINING; local persistence; HE / EN. **Not included:** timer / countdown / audio / whistle (→ 2.1b), Cloud. | Automated domain / persistence / UI tests, migration upgrade + rollback, negative proof on planned ≠ actual, frozen snapshots and history; Android export. **Physical Android:** WB-xx / TS-xx IDs in PROJECT_STATE. |
| 2.1b | Timed Execution (former 2.1 timer scope, moved 2026-10-06; built on the TRAIN-002 records) | Countdown 5-4-3-2-1, audio cue, whistle, timestamp timer, STOP, manual correction (measured / final / edited), sets, attempts, session `purpose`, local persistence (former Phase 3). **TRAIN-002 future direction (2026-10-05, not implemented):** one engine for fitness and Basketball — Workout Templates built from Packs, planned workouts, Training Sessions with a live workout mode — see *Training system direction* below. | Player → 20m Sprint → START → 5-4-3-2-1 → 📣 → 4.38 → Edit → 4.35 → Save → restart → 4.35 still exists. **Early iOS dev-build gate:** core runtime path verified on iOS. |
| 2.1c | Training Taxonomy — **TRAIN-TAXONOMY-001 (approved 2026-10-07)** | Curated, many-to-many DISCOVERY / NAVIGATION tree over the exercise library (Fitness: by body area / by training goal; Basketball: Shooting, Finishing, Ball Handling, Passing, Defense, Footwork, Rebounding, Athletic Development). One exercise, many paths; built-in tree and membership curated in code, state in the database; no custom nodes and no reclassification of built-ins in V1; empty / inactive nodes hidden; Search All always available; virtualized exercise lists; Add Exercise reachable without scrolling. Bounded sub-slices: **001A** domain / data / migration v10 / curated taxonomy (**IMPLEMENTED 2026-10-07**, status in PROJECT_STATE) · **001B** professional Basketball content expansion (crossover, between the legs, behind the back, hesitation, change of pace, contact finish, floater, shooting on the move, passing / footwork / defensive drills — purpose before count) · **001C** Exercise Library taxonomy UX · **001D** Workout Builder taxonomy picker · **001E** Workout Template classification (0..3 tags, one optional primary) · **001F** Product QA + physical acceptance. **Not included:** EX-GUIDE-001, CAL-TRAIN-001, timers, camera, cloud. | Per sub-slice: domain / repository / migration / coherence tests; UI sub-slices ship Python Product QA in the same slice (TX-01…TX-13) and keyboard-visibility checks; Android export; physical acceptance in 001F. |
| 2.1d | Exercise Guidance — **EX-GUIDE-001 (FUTURE, approved direction 2026-10-07 — not started)** | Professional exercise learning per exercise id (never per taxonomy path): purpose, setup, execution steps, coaching cues, common mistakes, safety, illustration steps, optional VERIFIED tutorial video, regression / progression. Offline-first: text + local illustrations must be enough; video is optional enrichment. Reused from Exercise Library, Workout Builder and Training Session. Starts with a read-only content audit and design, then explicit owner approval. | Defined when it enters planning (GUIDE-01…GUIDE-16 proposed). Software quality **and** coaching-content review. |
| 2.2 | Calendar UI + Calendar ↔ Training | Day / week / month views, recurring team practices (recurrence and occurrence exceptions, moved from 1.3 on 2026-10-04; reopens the timezone contract for wall-clock recurrence), games, school / unavailable time; starting training from a planned event; planned + completed, planned + skipped, unplanned + completed (calendar UI part of former Phase 12; added 2026-10-04). **CAL-TRAIN-001 future direction (2026-10-05, not implemented):** a CalendarEvent may LINK to a planned workout and open the Training Session from it; the event never becomes the container of execution data — see *Training system direction* below. | User-facing: automated tests **and** full physical-device acceptance. Expected categories: day / week / month UI, event times, recurrence, occurrence exceptions / cancellation, RTL / LTR, timezone / DST, Calendar → Training flow, persistence after restart, background / foreground. Exact checklist finalized when 2.2 enters planning. |
| 2.3 | Basketball Measurements & Shooting | MADE / MISS, attempts, percentage, sets, totals (former 2.2 Basketball Shooting, renamed 2026-10-04; former Phase 4) | 10 shots, 8 made → 8/10, 80%. |
| 2.4 | Quick Training | Player → Exercise → Start, minimal taps; creates an ordinary `TRAINING` session (entry mode, not a purpose) (former 2.3; former Phase 5) | Closed app to active training in minimal taps. |
| 3.0 | Baseline Template | Smallest useful basketball baseline as a `WorkoutTemplate` (purpose BASELINE) on the **existing** Training Engine; coaching order jump → sprint → agility → ball handling → shooting; may span sessions. **No new measurement storage.** | Baseline run produces ordinary sessions/results tagged BASELINE. |
| 3.1 | Reassessment / Baseline Comparison | Repeat the same baseline, original preserved, comparison foundation (player vs own baseline) | Second baseline run does not alter the first; both visible. |
| 3.2 | Basic Progress | Exercise performance over time with baseline marker, training progression and reassessment marker; workout / exercise history and personal records (former Phase 6) | Free-throw trend correct; sprint trend correct as lower-is-better; baseline + reassessment markers from the same result stream. |

Then, in order:

| Slice | Name | Scope | Gate |
|---|---|---|---|
| 4 | Rest + Full Session Flow | Sets, rest timer, next set, next exercise, double whistle, automatic sequence (former Phase 7) | — |
| 5 | ~~Workout Builder~~ — **absorbed into 2.1 TRAIN-002 (2026-10-06)** | Create / reuse workout, reorder, sets / rest / targets (former Phase 8) | — |
| 6 | Coach Engine | Deterministic humorous coaching from measured events. No LLM. (former Phase 9) | — |
| 7 | iOS Validation Gate | **Full iOS validation** of the accumulated product. Build iOS; verify navigation, SQLite, timer, audio, whistle, haptics, training flow, shooting, RTL, sync. Fix platform issues now. (former Phase 10) | — |
| 8 | Child Mode Foundation | Anonymous auth, server-controlled pairing, permissions, child device (former Phase 11) | — |
| 9 | Notifications | Morning reminders, pre-training notifications driven by Calendar events (notification part of former Phase 12; calendar data moved to 1.3 and calendar UI to 2.2 on 2026-10-04) | Android + iPhone validation. |
| 10 | Sleep / Recovery / Habits | Sleep, hydration, recovery, readiness. No calorie/weight features for children. (former Phase 13) | — |
| 11 | Advanced Progress | Multiple charts, filters, trends, Progress Index (former Phase 14) | — |
| 12 | AI Coach | Only after real data exists. Designed separately. (former Phase 15) | — |

### Notes

- **Superseded 2026-10-06 (owner):** C now follows TRAIN-002 (2.1); see the
  revision above. The original 2026-10-04 note is kept for history:
- **Cloud Foundation (C) sits after 1.3 and before 2.0 — APPROVED
  (2026-10-04).** The first three domains (Player, Self-Assessment,
  Calendar) are defined before their cloud representation, and C still
  comes before high-volume session / set / attempt / result data exists,
  because ownership and RLS shape those tables. The local model is
  cloud-ready from Slice 1.1 (client UUIDs, local `family_id` on every
  player).
- **iOS:** early dev-build gate in 2.1b (timer / audio runtime path; moved with the timer scope 2026-10-06); full validation in slice 7; no iOS
  build has been run yet.
- **Dependency to watch:** Slice 3.0 runs several exercises in sequence,
  which needs at least a minimal multi-exercise session flow. Either 3.0
  includes that minimal sequencing on the Training Engine, or part of slice
  4 (Rest + Full Session Flow) moves before 3.0. Decide when 3.0 is planned.

### Stable item IDs (owner handoff, 2026-10-05)

IDs used in owner handoffs, mapped to slices here so they stay stable:
`TRAIN-001` = 2.0 Exercise Model + Exercise Library · `TRAIN-002` = 2.1
Training Engine (with 4 Rest + Full Session Flow and 5 Workout Builder as its
later parts) · `CAL-TRAIN-001` = 2.2 Calendar UI + Calendar ↔ Training
(recurrence / exceptions). `TRAIN-TAXONOMY-001` = 2.1c Training Taxonomy (sub-slices
001A–001F) · `EX-GUIDE-001` = 2.1d Exercise Guidance (future) ·
`TRAIN-TIMER-001` = 2.1b Timed Execution · `CAMERA-MEASURE-001` = camera-derived
objective measurements (future, not yet a numbered slice).

**Order revised 2026-10-07 (owner):** TRAIN-001 / TRAIN-002 Product QA closure →
TRAIN-TAXONOMY-001 → EX-GUIDE-001 → CAL-TRAIN-001 → TRAIN-TIMER-001 →
CAMERA-MEASURE-001 → Cloud / Auth / RLS / Coach collaboration. The order is not
permission to start a later slice: each one starts only with the owner's
explicit approval. Work items outside this table (`SPORT-LIFE-001`,
`CAL-KEY-001`, and the owner's later queue) are tracked in PROJECT_STATE; they
do not reorder this roadmap.

### Training system direction (owner, 2026-10-05) — FUTURE, NOT IMPLEMENTED

**Update 2026-10-06:** TRAIN-001 is implemented; the TRAIN-002 model is
approved (PRODUCT_SPEC §72, ARCHITECTURE §15) — Workout Block / Template /
frozen Planned Workout / Training Session, planned vs actual, per-measurement
source. Automatic suggestion of a complete session is not part of TRAIN-002.

Recorded so it is not lost; it expands the future scope of `TRAIN-001`,
`TRAIN-002` and `CAL-TRAIN-001` instead of creating a parallel architecture.
No schema is designed here; each slice designs its own when planned.

- **One generic training system for general fitness and Basketball**, with
  sport-specific drill metrics as extensions — never two unrelated engines.
- **Separate concepts:** Exercise / Drill (smallest activity definition) →
  Training Block / Exercise Pack (reusable group) → Workout Template
  (reusable plan) → Planned Workout (a scheduled instance / snapshot) →
  Training Session (what was actually performed).
- **Fast construction:** choose areas or categories (fitness: Abs, Chest,
  Arms, Legs; Basketball: SHOOTING, BALL_HANDLING, FINISHING, PASSING,
  DEFENSE, FOOTWORK, CONDITIONING) and difficulty (Beginner / Intermediate /
  Advanced; later duration, equipment, goal). Ready-made Packs (e.g. Abs —
  Beginner, Mid-Range Shooting — Intermediate, Weak-Hand Control); add a whole
  Pack or some of it, combine Packs, reorder, change sets / reps / time /
  rest, save as a reusable template. The app can propose a complete session
  from compatible Blocks (e.g. Basketball Skills — 45 min: warm-up, ball
  handling, finishing, shooting, cooldown) that the user accepts or edits.
- **Drill descriptions may carry:** distance / range, court spots, attempts,
  made-shot targets, rounds, durations, dominant / weak hand, rest, time
  targets.
- **Live workout mode (Training Session):** exercise list, next / previous,
  sets, reps, durations, distance, rounds, rest / countdown / interval timers,
  completion, skips, actual results (e.g. Spot 1: 7 made / 10 attempts).
- **History safety:** editing a template never changes planned or performed
  sessions; they keep a snapshot / version of what was planned and done.
- **Locked rules preserved:** `CalendarEvent ≠ TrainingSession` (an event may
  link to a planned workout; it never holds execution data); planned workout
  ≠ actual completion; drill results (makes, attempts, %, reps, time,
  distance, sets) are OBJECTIVE and stay separate from the SUBJECTIVE
  Self-Assessment — never one combined Player Score.
- **Future Coach compatibility:** Player-created, Coach-created,
  Coach-assigned, saved and recommended / generated workouts, with provenance
  of who or what created or assigned each. No Coach / cloud behaviour until
  the cloud authorization architecture exists.

### True MVP (approved 2026-10-04)

The True MVP is defined by **capabilities, not by slice numbers**. It
consists of the required product capabilities listed below, plus the
enabling infrastructure required to deliver them safely. Hebrew and English are
first-class MVP requirements (Slice 1.0 rules stay: Hebrew default on a fresh
install, Hebrew RTL, English LTR, all UI strings through i18n).

**A. Required MVP product capabilities** — user-facing portions of these
capabilities are provided in Hebrew and English:

- Player Profile
- Self-Assessment
- Calendar Foundation
- Exercise Model / Exercise Library
- Training Engine
- Usable Calendar UI + Calendar ↔ Training integration
- Basketball Measurements & Shooting
- Quick Training
- Baseline
- Reassessment
- Basic Progress

**B. Required enabling infrastructure:**

- Cloud Foundation (C) — required MVP enabling infrastructure, but not
  itself a user-facing MVP capability.

The current roadmap maps these capabilities primarily to Slices 1.1–3.2, on
top of the verified foundation (0, 0.H, 1.0). Cloud Foundation (C) sits
within this delivery sequence (after TRAIN-002 / 2.1 since 2026-10-06; originally after 1.3, before 2.0) as required MVP
enabling infrastructure, but is not itself a user-facing capability. Slice
numbering does not define MVP scope: moving, splitting or inserting a slice
does not change these lists; only an owner decision does.

Example end-to-end flow: Player → basketball exercise → Quick Training →
5-4-3-2-1 → whistle → timer or shooting → result → edit → save → baseline /
reassessment → history → graph, with training planned around the player's
calendar.
