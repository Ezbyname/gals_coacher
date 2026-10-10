# PROJECT STATE

> **Living document.** Updated after every completed slice/phase. Where we are *now*.

## Current status

**TRAIN-QUICKBUILD-001A — ActivePlayerContext (`1707333`, 2026-10-09): IMPLEMENTED = PASS · CODE TESTED = PASS · ANDROID EXPORT = PASS · PYTHON PRODUCT QA = PASS WITH ONE NON-001A PRE-EXISTING RUNTIME CRASH OBSERVED · PHYSICAL QA = NOT RUN.** Accepted by the owner 2026-10-09; the crash is not attributed to 001A. Next: CAL-TEXT-IMPORT-001 read-only design check.

| 001A item | Result | Detail |
|---|---|---|
| Scope | ActivePlayerContext only — no schema change, no Quick Add, no player-owned templates, no Auth, no Player Mode | `domain/training/activePlayer` (context shape route / explicit-selection, `requireActivePlayer` guard, `resolveGlobalTarget`: one Player preselected, several → explicit choice); `features/players/ActivePlayerContext` (scoped provider — no app-wide current Player; a switched id is never served the previous Player; `RequireActivePlayer`, `RoutePlayerScope`, `PlayerTargetLabel` "Training for {name}" / "אימון עבור {name}", bidi-isolated). Training overview / choose / plan / session screens resolve the route Player; writes go through the guard; another Player's plan / session is refused under this Player's route. Future authenticated Player = one more source (`auth-self`), not built. |
| Code gate | **PASS** | `npm run check` exit 0: typecheck PASS; lint 0 errors (1 pre-existing warning); **86 / 86 suites, 1493 / 1493 tests, 0 skipped**, ~63 s Jest (78 s total). Focused: 19 new tests (domain guard / global target, stale-context derivation, route tests HE / EN). |
| Android local export | **PASS** | 3.41 MB Hermes bundle. |
| Python Product QA | **PRECHECK 9/9 · CORE SANITY 7/7 · IMPACTED 18/19 → TS-05 2/2 PASS isolated** | QA harness `6a6edc4` (fingerprint `0774159567994b5a`), 110 min. QB-01…05 5/5 PASS. TS-05: app process died during fixture boot — native SIGSEGV in React Native Fabric (`MountingCoordinator::pullTransaction`), same signature as 6 earlier crashes on baselines without 001A code (incl. `1da4eca`); 3/3 clean cold launches, TS-05 2/2. Evidence `qa_evidence/1707333/`. |
| Open runtime issue | **RN-FABRIC-NATIVE-CRASH — OPEN · PRE-EXISTING · DEBUG DEV-CLIENT / EMULATOR OBSERVED · RELEASE-BUILD IMPACT UNKNOWN** | ~7 occurrences 2026-10-07…09, same SIGSEGV / Fabric signature before 001A. Owner decision 2026-10-09: accepted as a separate issue; no speculative RN / Fabric change; no destructive emulator workflow. **Release-build check deferred to the next APK milestone:** preview APK on the physical phone, bounded cold-launch repetition, crash check, logcat / crash evidence kept. Details: `product_qa/QA_AUTOMATION_STATE.md`. |

**CAL-TEXT-IMPORT-001 (Weekly Training Schedule Import from Text): APPROVED DESIGN 2026-10-09** (ROADMAP order 2026-10-09: after QUICKBUILD-001A, before TRAIN-QUICKBUILD-001B; owner decisions and slices in ROADMAP). Schema: CAL-TEXT-IMPORT-001B takes **v13**; TRAIN-QUICKBUILD-001B moves to **v14**.

| CAL-TEXT-IMPORT slice | Status | Detail |
|---|---|---|
| **001A parser domain** (`da95c72`) | **IMPLEMENTED = PASS · CODE TESTED = PASS · ANDROID EXPORT = PASS (bundle unchanged) · PYTHON QA = N/A (no UI, not reachable)** | `src/domain/calendarImport/`: normalization (direction marks, dashes, geresh / gershayim, emoji ignored); Hebrew weekdays (words, `א׳…ש׳`, `יום / ביום`, chains "שני ורביעי"; a bare weekday only opens a line before a separator — "שני אימונים" is not Monday); times (`-`, `–`, `עד`, `מ-`, `בשעה`, `ב`; start-only keeps NO end); explicit dates (dd/mm, dd.mm, dd-mm, with year; nearest-year inference; never moved); message-wide ("כל האימונים ב…", `מיקום:`, 📍) and per-line locations ("אחרי בית ספר" is not a place); leftover text = details, never a title; type suggestion ("משחק" → GAME) shown, never applied; lines with a day but no time / a time but no day are reported, never guessed. Review model: candidates for the Sun–Sat week, BLOCKING / REVIEW / INFO issues, conservative duplicates (warning only), include / remove / keep-anyway summary. Hermes-safe regexes. |
| 001A tests | **PASS (UNIT / DOMAIN)** | 89 Jest tests (both real WhatsApp messages as permanent fixtures); 4 deliberate mutations all caught. **CTI evidence is DOMAIN TEST = PASS only** for CTI-01…05, 07 (3 *included candidates*, not 3 saved events), 08…14, 16, 25, 27, 28 — **PRODUCT QA = NOT YET RUN** for every CTI (all need the UI and / or a DB write; their stable meaning is kept). `npm run check` exit 0: **88 / 88 suites, 1582 / 1582 tests**, typecheck PASS, lint 0 errors (1 pre-existing warning), ~78 s Jest. |
| 001A device QA | **N/A by evidence** | The parser is imported by nothing yet: the Android export bundle `entry-3e98a3cd…hbc` is byte-identical to `1707333`'s, so device behaviour is unchanged; no CTI device test applies until 001C. |
| **001B data foundation** (`02f9783`, schema **v13**) | **IMPLEMENTED · CODE TESTED · ANDROID EXPORT · MIGRATION PROOF · PYTHON QA = 43/46 PASS + 3 known automation bugs** | Additive migration v13 `calendar_event_import`: `calendar_events.location`, `source`, `import_batch_id` (nullable; no value list for source; batch never without source) + partial `(player_id, import_batch_id)` index; existing rows untouched. Domain: location first-class (80-char input limit), `TEXT_IMPORT` source, provenance rules. Repository: location on create / read / update (omitted on edit = kept); provenance written once; `createCalendarEventBatch` (validate all first, one transaction, one batch id — all or nothing); `listCalendarEventBatch` and `undoCalendarImport` scoped by Player + batch (+ id); undo keeps COMPLETED and EDITED events and reports them. V1 Undo Import stays a success-screen action; long-lived undo is NOT claimed. |
| 001B — UNIT / REPOSITORY TESTS | **PASS** | `npm run check` exit 0: **90 / 90 suites, 1609 / 1609 tests**, typecheck PASS, lint 0 errors (1 pre-existing warning), ~62 s Jest. New: v13 migration suite 12 tests (fresh, realistic v12 upgrade with every table compared, idempotent, same schema as fresh, rollback, CHECKs, fail-closed reads) + batch repository suite 15 tests (atomicity, scoping, undo safety, restart persistence); 5 safety mutations caught. Android export PASS (3.42 MB). |
| 001B — MIGRATION PROOF (device) | **PASS** | MIG-01: a real v12 database built through the v12 UI, migrated by the app itself on `02f9783`: v12 before launch, v13 after; 27 tables row-for-row identical; events and the exactly-PARTIAL session unchanged; new columns NULL; visible in the UI. Closes the long-open migration-preservation gap. |
| 001B — PYTHON PRODUCT QA | **43 / 46 PASS** | MIGRATION GATE + SANITY + IMPACT (not FULL — owner policy for additive migrations): PRECHECK 9/9 · CORE SANITY 7/7 · IMPACTED 27/30; CF-01 / 03 / 04 = known AUTOMATION_BUG (signature matched). No product bug. QA harness `0d43365` (fingerprint `310c09a1434e6665`). |
| CTI status after 001B | — | Parser and data foundation proven; **the WhatsApp import UX does not exist yet.** Repository-level proof (REPOSITORY TEST = PASS, PRODUCT QA = NOT YET RUN) for CTI-07 (exactly N events saved), 17 (owner Player), 19 / 20 (no plan / session created), 21 (restart persistence), 26 (undo only its batch). |
| **001C wizard + preview** (`09079ef`, `00b9135`, `98b976e`; no writes, no schema change) | **ACCEPTED & CLOSED (owner 2026-10-10): IMPLEMENTED = PASS · CODE TESTED = PASS · ANDROID EXPORT = PASS · PYTHON PRODUCT QA = PASS · PHYSICAL PHONE QA = NOT RUN.** Product bugs 0; the 6 non-passing gate results are AUTOMATION_BUG (CF-01/03/04 known signature; CCOLOR-01/02/03 legend helper — fixed, 3/3 on rerun). | Route `children/[id]/schedule/import` (from the Player schedule: "ייבוא אימונים שבועיים"; Player from the route via `RoutePlayerScope`, never asked again). One screen: type (existing Activity Type selector) → week (default next Sun–Sat, arrows, past / current week warning) → paste → Analyze → preview. Every candidate is its own row: READY / NEEDS REVIEW badge, weekday · d/m, time (`16:30–?` when no end), 📍 location, type, details. Inline edit (date, start, end, clear end, location, per-candidate type, title for OTHER, details); Remove → Undo Remove. Date conflicts: "Use <date>" / "Use <date> anyway" / Edit / Remove. Possible duplicates show both sides (imported + existing event, READ only) → Keep anyway / Remove from import. CTA "Continue with N trainings" counts every included candidate, disabled while anything is unresolved; never "Add" (writes = 001D). QA-only `qaText` pre-fill, `__DEV__` only (U+2028 line transport). |
| 001C — owner decision 2026-10-09 (replaces decision 7) | **IMPLEMENTED (`98b976e`)** | **A training may be imported without an end time** (an end may be unknown, e.g. a game): `END_TIME_MISSING` is a REVIEW decision, not a blocker — "השאר ללא שעת סיום" keeps it with NO end (never invented, shown `16:30–?`), or enter an end, or remove. The editor can also clear an end. |
| 001C — UNIT / ROUTE TESTS | **PASS** | `npm run check` exit 0 on `98b976e`: **92 / 92 suites, 1633 / 1633 tests**, typecheck PASS, lint 0 errors (1 pre-existing warning). Focused 113 tests (review model, pure import-review state, route tests HE / EN incl. keep-without-end, clear-end, `__DEV__ = false` ignores `qaText`, zero DB writes). Android export PASS (`entry-9658141c…hbc`, 3.48 MB). |
| 001C — PYTHON PRODUCT QA | **SANITY + IMPACT: 42 / 48 PASS; every failure AUTOMATION_BUG; no product bug** | Product `98b976e`, QA harness `d1c2c0c` (fingerprint `1f02a4e43abad973`), 96 min: PRECHECK 9/9 · CORE SANITY 7/7 · IMPACTED 26/32 (TEXT_IMPORT 17/17, CALENDAR, AT-05/06). CF-01 / 03 / 04 = known AUTOMATION_BUG (signature matched). CCOLOR-01 / 02 / 03 = new AUTOMATION_BUG: the legend helper's fast fling skipped the one-line legend (legend proven present on the device) → helper fixed in QA `624f41b` (fingerprint `b98194eacaac7f72`), consumers rerun **3/3 PASS**. Evidence `qa_evidence/98b976e/runs-gate/`. |
| 001C — evidence provenance | — | Main SANITY+IMPACT gate: QA harness `d1c2c0c`, fingerprint `1f02a4e43abad973`. CCOLOR rerun: QA harness `624f41b`. Final 001C QA harness / docs: fingerprint `b98194eacaac7f72` (`95b2b79`). Screenshots (`qa_evidence/98b976e/runs/20261009-235158/`): example 1 clean `CTI-01/…example-1-preview`; example 2 Tuesday NEEDS REVIEW `CTI-04/…missing-end` and kept without end `CTI-04/…kept-without-end`; Remove `CTI-06/…thursday-removed`; Undo Remove `CTI-09/…restored`; removed invalid candidate unblocks `CTI-08/…unblocked`; Duplicate both sides `CTI-25/…duplicate-both-sides`. |
| CTI matrix after 001C | — | **PRODUCT QA = PASS:** CTI-01, 03, 04, 05, 06, 08, 09, 11, 15, 16, 18, 22, 23, 24, 25, 27, 28. **DOMAIN TEST = PASS, PRODUCT QA = NOT RUN:** CTI-02, 10, 12, 13, 14. **REPOSITORY TEST = PASS, PRODUCT QA = NOT RUN (needs 001D writes):** CTI-07, 17, 19, 20, 21, 26. |
| 001D confirm / import / undo UX | NOT STARTED | |
| 001E consolidated / physical | NOT STARTED | Includes the deferred release-like RN-FABRIC-NATIVE-CRASH check. |

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
**ACTIVITY-001 (configurable Activity Types): IMPLEMENTED + AUTOMATED GATE PASS, PHYSICAL ACCEPTANCE PENDING.** Schema v7.
**TRAIN-001 (Professional Exercise Library — ROADMAP 2.0, owner-directed ahead of Cloud Foundation C): IMPLEMENTED + AUTOMATED GATE PASS, PHYSICAL ACCEPTANCE PENDING.** Schema is now **v8**. **TRAIN-002 (Workout Builder + manual Training Execution + objective results): IMPLEMENTED + AUTOMATED GATE PASS, PHYSICAL ACCEPTANCE PENDING.** Schema is now **v9**. CAL-TRAIN-001: **not started** (awaiting owner go-ahead after TRAIN-002's gate).
**TRAIN-TAXONOMY-001A (training taxonomy — domain / data / migration / curated taxonomy, no UI): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON PRODUCT QA: not executable yet (no taxonomy UI — TX-01…TX-13 belong to 001C–001F); PHYSICAL: not applicable to this sub-slice.** Schema is now **v10**.
**TRAIN-TAXONOMY-001B (professional Basketball content: 17 new built-in drills): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON PRODUCT QA: not executable as taxonomy navigation yet (no UI); the new drills appear in the existing Exercise Library.** Schema is now **v11**.
**TRAIN-TAXONOMY-001C (Exercise Library training-category navigation): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON PRODUCT QA AUTOMATED_PARTIAL (8 TX PASS; TX-07/08 not run, TX-09 not proven); PHYSICAL: pending (001F).** Schema unchanged (v11).
**TRAIN-TAXONOMY-001D (Workout Builder category picker): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS + PYTHON PRODUCT QA PASS (WB-08…11); PHYSICAL pending (001F).** Schema unchanged (v11).
**PERF-FOUNDATION-001 (library sort bottleneck — pre-existing since TRAIN-001): FIXED in `78c5585` (B1); measured on device: sort 1.2–4.5 s → 3–17 ms, tap → first row 0.57–0.87 s.**
**TRAIN-TAXONOMY-001E (Workout Template classification): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS + PYTHON PRODUCT QA PASS (TX-11 on `a0ecfd4`); PHYSICAL pending (001F).**
**KEYBOARD-FORMS fix (`a0ecfd4`, PRODUCT_SPEC §74): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS + PYTHON PRODUCT QA PASS (KB-01…06, WB-11); PHYSICAL pending.**
**EX-GUIDE-001 Wave 1 (19 safety notes): CONTENT DRAFTED + CONTENT COACH-REVIEWED (`aca22d3`).**
**UX-VISUAL-001A (design tokens + shared primitives): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS (`1a8a177`); no screen changes.**
**Milestone APK (`1da4eca`): CLOSED / ACCEPTED (owner, 2026-10-09) — APK BUILT = PASS (EAS preview `b99722a3`, v0.1.0 (1), 113.8 MB); APK INSTALLED = PASS; UPGRADE OVER EXISTING APP = PASS; DATA PRESERVATION = PASS; PHYSICAL SMOKE = PASS; PHYSICAL KEYBOARD = PASS; HE RTL / EN LTR = PASS (owner-reported physical validation).** Schema is now **v12**. 001F, EX-GUIDE-001, UX-VISUAL-001 and CAL-TRAIN-001: **not started** (EX-GUIDE-001 / UX-VISUAL-001 read-only audits approved 2026-10-08).
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
| ACTIVITY-001 (configurable Activity Types) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING**; schema **v7** |
| TRAIN-001 (Exercise Library) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING**; schema **v8** |
| TRAIN-002 (Workout Builder + manual execution) | **IMPLEMENTED + AUTOMATED PASS; PHYSICAL PENDING**; schema **v9** |
| TRAIN-TAXONOMY-001A (training taxonomy: domain / data) | **IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS**; no UI (TX Product QA: future 001C–001F); schema **v10** |
| TRAIN-TAXONOMY-001B (Basketball content) | **IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS**; 124 built-ins; schema **v11** |
| TRAIN-TAXONOMY-001E (template classification) | **IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS + PYTHON QA PASS (TX-11)**; physical pending; schema **v12** |
| KEYBOARD-FORMS fix (§74, six forms) | **FIXED + CODE TESTED + PYTHON QA PASS (KB-01…06)**; physical pending |
| PERF-FOUNDATION-001 (library sort) | **FIXED + MEASURED** (B1, `78c5585`); B2 not needed |
| TRAIN-TAXONOMY-001D (block-form category picker) | **IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS + PYTHON QA PASS (WB-08…11)**; physical pending |
| TRAIN-TAXONOMY-001C (Library category navigation) | **IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON QA AUTOMATED_PARTIAL**; physical pending |
| CAL-TRAIN-001 | **Not started** — awaiting owner go-ahead |
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

## Milestone — UX-VISUAL-001A + EX-GUIDE Wave 1 + preview APK (2026-10-09)

| Gate | Status | Evidence |
|---|---|---|
| EX-GUIDE-001 Wave 1 | **CONTENT DRAFTED + CONTENT COACH-REVIEWED** | `aca22d3` — owner review: 14 approved as drafted, 5 revised (PULL_UP, SLED_PUSH, TIP_DRILL, COMBO_MOVE_SERIES, FLOATERS) to the exact reviewed wording. The no-medical-claims check now matches "cure" as a whole word ("a secure bar" is not a claim). Coverage heuristic (speed / plyometric / power / advanced ⇒ note) documented as conservative, not domain truth. |
| UX-VISUAL-001A | **IMPLEMENTED + CODE TESTED** | `1a8a177` — semantic tokens (text, surface, border, selected, disabled, error / warning / success / neutral), six training-domain tones (basketball orange, strength blue, power amber, speed green, mobility teal, skill purple; strong-on-tint ≥ 4.5:1 tested), radius, typography, elevation, icon sizes, 48 dp minimum target; shared Card, Pill / Toggle, SectionHeader, IconButton (foundation), StatusBadge, EmptyState (logical RTL / LTR layout, a11y roles / states, selected in text, stable testIDs). Existing colours / spacing / button heights unchanged (locked by test) — no screen changes, no icon package, no animation. 45 UI tests. |
| Test infra | `1da4eca` | TEST-FLAKE-001 fixed: explicit 15 s budget for the library's multi-screen UI suite (only the 5 s timeout ever failed). |
| Code gate (`1da4eca`) | **PASS** | `npm run check` 3 / 3 runs: **83 / 83 suites, 1474 / 1474 tests, 0 skipped, ~64–66 s**; typecheck PASS; lint 0 errors (1 pre-existing warning). |
| Android local export | **PASS** | 3.6 MB Hermes bundle (not an APK). |
| Python Product QA (`1da4eca`) | **67 / 71 PASS in the full run, then EL-03 / EL-04 PASS after harness fixes** | PRE 1–8, AT 2–8 & 10, CCOLOR 1–3, CV 1 & 3–7, EL 1–12, KB 1–6, TX 1–9 & 11–13, TS 1–2, WB 1–11 PASS. **CF-01 / 03 / 04 FAIL — AUTOMATION_BUG (open since `71b1d13`, non-blocking).** EL-03: AUTOMATION_BUG — FIXED (the filter-group helper stopped at a group title with every chip off-screen since the library became virtualized). EL-04 re-run: one UIAutomator segfault (ENVIRONMENT_LIMITATION), then cleanup helper made end-aware → PASS. TS-03…13: **NOT RUN** (v9 DB fixture refuses schema v12 — QA_COVERAGE_GAP / TEST_DATA_ISSUE; rebuild pending). **Correction 2026-10-09:** the run's `-k` substring selection also deselected **AT-01, AT-09 and CF-02** (case-insensitive "ts_") — NOT RUN, not PASS. Honest totals: 85 tests; executed 71; PASS 67 (+ EL-03 / EL-04 after harness fixes); FAIL 3 (CF automation); NOT RUN 3 (AT-01, AT-09, CF-02); QA_COVERAGE_GAP 11 (TS-03…13). From the next slice, selection uses markers (`product_qa/QA_TEST_SELECTION.md`). Harness SHA-256 per file next to each run in `qa_evidence/1da4eca/runs-gate/`. |
| APK build | **APK BUILT = PASS** | EAS `b99722a3-bfed-4b86-bf85-e623c0b47bb0`, profile `preview` (internal), source `1da4eca`, version 0.1.0 (1), existing remote keystore (same signing as earlier preview APKs → in-place upgrade), 113.8 MB. Artifact: https://expo.dev/artifacts/eas/QWkBodPAt99kpPaK6oVdv9EkjJzV3sEi-JawGlXkzcQ.apk |
| APK installed on the physical phone | **PASS** (owner, 2026-10-09) | Installed OVER the existing app; upgrade PASS; existing data preserved. |
| Physical smoke / keyboard / RTL | **PASS** (owner-reported) | Smoke, physical keyboard (block, template, session results), HE RTL / EN LTR. Emulator results are not physical results. |
| **Milestone** | **CLOSED / ACCEPTED** | 2026-10-09. |
| TS coverage restored (QA-TS-FIXTURE-V12, QA infra only) | **12 / 13 PASS + 1 AUTOMATION_BUG** | Fixture `V12-ALICE-TEMPLATES-01` (schema v12, built from `1da4eca` through the product UI). New precheck **PRE-09 fixture compatibility: PASS**. PRECHECK 9/9; TS-01…13: 12 PASS, **TS-10 AUTOMATION_BUG** (fixture-restore app launch, PASS 2/2 isolated). No product bug. TS-07 stays in the TRAINING_SESSION impact group (not Core Sanity). Fixtures are commit-bound: rebuild per baseline. |

Known limitations: CF-01 / 03 / 04 automation; TS fixture commit-bound (rebuild per baseline) and TS-10 restore-launch automation bug; migration-preservation test missing; pre-auth visibility is not security; physical keyboard overlap on a real phone unproven until checked.

---

## KEYBOARD-FORMS — focused field above the keyboard in every form: FIXED (`a0ecfd4`, 2026-10-08)

- **Found by device QA (WB-11 on `cdf8d3a`):** the workout block's exercise search sat under the keyboard (field 1568–1690 px, keyboard top 1541). Root cause: only the calendar form (CAL-KEY-001) kept a focused field visible; the block, template, custom exercise, player, activity-type and training-session forms (built before §74 was locked) did not. Slice D's Browse button pushed the search lower and exposed it. **PRODUCT_BUG, pre-existing.**
- **Fix:** shared `KeyboardSafeScrollView` (the calendar's proven mechanism — keyboard padding + scroll just enough to show the focused field, bottom first, no coordinates); `TextField` reports itself on focus, so every field inside the six forms is covered without per-screen wiring. Calendar form unchanged.
- **Also fixed (found by TX-11):** category search in the picker matched only the current language; it now finds a category by its Hebrew OR English name (as exercise search does), shown in the app language. **PRODUCT_BUG — FIXED.**
- **Gate (`a0ecfd4`):** typecheck PASS; lint 0 errors; **Jest 82 / 82 suites, 1447 / 1447 tests**; Android export PASS (3.6 MB). Tests: 6 form-keyboard wiring tests; bilingual category search both directions (HE UI + English query, EN UI + Hebrew query, no duplicates, scoped search unchanged).
- **Python Product QA on `a0ecfd4`:** WB-11, TX-11, TX-05, TX-06 PASS; **KB-01…06 PASS** (block rest field, template name, **session reps / load / made / attempts**, custom-exercise link, player height, activity-type name): focus, field fully above the keyboard, still focused, value visible, value kept after scrolling, Save / Finish reachable. Emulator proof; physical phone: PHYSICAL QA REQUIRED. Harness state recorded with SHA-256 per file next to each run (`qa_evidence/a0ecfd4/runs-gate/*/harness.txt`).

---

## EX-GUIDE-001 Wave 1 — safety notes: CONTENT DRAFTED (2026-10-08)

- 19 higher-risk built-ins had no safety note; each now has a specific HE / EN note (landing, deceleration and run-out, rebound path, ball / athlete spacing, equipment setup, joint alignment) — **CONTENT DRAFTED, NOT CONTENT COACH-REVIEWED; not committed** until the owner's coaching review.
- A coverage test requires a note on every speed / plyometric / power / advanced exercise — a **conservative initial heuristic**, not domain truth; EX-GUIDE-001 will move to an explicit risk level (LOW / MODERATE / ELEVATED).

---

## TRAIN-TAXONOMY-001E — Workout Template classification: IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON PRODUCT QA in progress (2026-10-08)

Commit `cdf8d3a` (local, not pushed). Owner-approved 2026-10-08.

- **Model (locked):** a template carries 0–3 taxonomy categories chosen by the coach, at most one primary (which must be one of them). Explicit coach intent — never derived from the template's exercises. Discovery metadata only: plans, sessions and results keep their own snapshots and never reference it.
- **Schema v12 (additive):** `workout_template_taxonomy(template_id, node_id, position 0..2, is_primary, created_at)`, PK `(template_id, node_id)` (no duplicates), `UNIQUE(template_id, position)` (never a 4th), partial unique index on the primary (one per template), index by node; rows replaced as a set, never rewritten (trigger). No existing table changes.
- **Rules (domain + repository, inside the save transaction):** TOO_MANY / DUPLICATE / PRIMARY_NOT_SELECTED; a NEW category must be selectable now (active, with an active exercise); a category the template already had is kept — never silently removed or rewritten — and shown as "Not available for new selection — kept as it was". Unknown node fails closed. Removing the primary leaves no primary.
- **UI:** template form "Training categories" section — each with its full path ("Basketball › Athletic Development › Agility"), Primary as a radio (state in text), Remove, "Primary category: …" summary, Add disabled at 3 with the reason. Categories are chosen with the SAME shared taxonomy view / picker as the library and the block form (new choose-category mode: "Choose <path>" on the current category, or search category names — every result shown with its full path; an already-chosen category is offered disabled with "Already added").
- **Gate:** typecheck PASS; lint 0 errors (1 pre-existing warning); **Jest 81 / 81 suites, 1440 / 1440 tests** (`--ci --maxWorkers=25%`; the default-parallel `npm run check` hit the known 5 s Jest timeout in 2 existing library tests while the emulator QA loaded the host — TEST-FLAKE-001); **Android export PASS** (3.6 MB). New tests: domain rules 5, repository + schema integrity 8, migration v12 5 (fresh, realistic v11 upgrade with finished training history unchanged, classification never rewrites history, restart, rollback), UI 4 (browse / search / duplicate / primary / save; max 3; edit with inactive kept; Hebrew).
- **Python Product QA:** TX-11 (end-to-end owner scenario incl. inactive, HE RTL, EN LTR, keyboard) **PASS on `a0ecfd4`** (after the two product fixes below).

---

## PERF-FOUNDATION-001 — Exercise list sort: FIXED + MEASURED (2026-10-08)

- **Phase A (measure, scratch instrumentation only):** on a healthy emulator, opening the library: DB 40–117 ms, catalog assembly ≤ 6 ms, taxonomy ≤ 1.5 ms, 2 library renders, 54 rows (virtualized) — and **`filterExercises` 1.2–4.5 s with 19–27 Java GCs**: `localeCompare(…, language)` per comparison (~890 per sort) rebuilt the locale machinery each time. Present in production-mode JS too; pre-existing since TRAIN-001 (not introduced by 001C); also hit every search keystroke.
- **Phase B1 (`78c5585`):** one `Intl.Collator` per language, created once and reused. Same order (tests pin HE / EN, built-in + custom, equal names, search) and a test that the per-comparison path is gone. **Re-measured:** sort 3–17 ms, filter + sort 6–31 ms, 1 GC per open, tap → first row 0.57–0.87 s; search keystroke 6.5–79 ms.
- **Phase B2:** not needed (remaining cost below perception; caching would add stale-data risk). No other optimisation done.

---

## TRAIN-TAXONOMY-001D — Workout Builder category picker: IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON PRODUCT QA in progress (2026-10-08)

Commit `2adcfe3` (local, not pushed).

- The block form gets "Browse by training category": the same category view as the library (one shared implementation in browse / pick mode) opens over the form; Fitness / Basketball → category → sub-category → exercise; the chosen exercise is added by its id (the same id whatever the path); Back goes up one level, Close returns with the form unchanged; the direct search in the form keeps working.
- **Gate:** typecheck PASS; lint 0 errors; Jest 77 / 77 suites, 1411 / 1411 tests; Android export PASS. 6 new UI tests.
- **Python Product QA:** WB-08 **PASS on `78c5585`**; TX-09, WB-09, WB-10 **PASS on `cdf8d3a`**; WB-11 **PASS on `a0ecfd4`**. History kept separate: WB-11 / TX-11 first failed on `cdf8d3a` because the harness closed the keyboard with Escape, which Android treats as "close dialog" in the picker (**AUTOMATION_BUG — FIXED**: Back, as a user does; proven on device that Back hides only the keyboard and a second Back closes the picker). The re-run then found two product defects (**PRODUCT_BUG — FIXED IN `a0ecfd4`**, below).

---

## TRAIN-TAXONOMY-001C — Exercise Library training categories: IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS; PYTHON PRODUCT QA AUTOMATED_PARTIAL (2026-10-08)

Commit `eaf83fd` (local, not pushed). Owner-approved 2026-10-07 / FAST GATE 2026-10-08.

- **Library home:** "Add exercise" moved to the top (never only after the list). A "Training categories" section offers the visible domains (Fitness, Basketball) with their counts. Searching on the home always searches ALL exercises and hides the categories (Search All bypasses the hierarchy). The list is virtualized (FlatList).
- **Category screen** (`/exercises/categories/<KEY>`): breadcrumb ("Basketball › Shooting › Free Throws", spoken "You are in: …"), sub-categories with counts — Fitness keeps "By body area" and "By training goal" as separate sections — and the node's exercises (own + active descendants', each once). A domain shows categories only. Search inside a category is scoped to it; one tap ("Search all exercises", a switch with its state in text) searches everything. Inactive / empty categories are never offered; reached directly they say "not available".
- **Accessibility:** category buttons are 56 dp, spoken as "Shooting, 8 exercises"; breadcrumb read as one phrase; scope state in text, not colour.
- **Gate:** typecheck PASS; lint 0 errors (1 pre-existing warning); **Jest 76 / 76 suites, 1405 / 1405 tests** (`--maxWorkers=25%`; at 50 % one existing library test hits the 5 s Jest timeout under parallel load — TEST-FLAKE-001; it passes alone and the library tests got faster); 10 new UI tests (`src/app/__tests__/trainingCategories.test.tsx`); library tests adapted to the virtualized list; **Android export PASS** (3.5 MB).
- **Python Product QA (real app, QA baseline moved to `eaf83fd`, schema v11; device data upgraded v9 → v11 without error):** TX-01, TX-02, TX-03, TX-04, TX-05, TX-06, TX-12, TX-13 **PASS** on `eaf83fd`. TX-05 / TX-06 include the keyboard check (focused search field focused, value visible, fully above the keyboard — emulator; real phone: PHYSICAL QA REQUIRED). **TX-09: NOT PROVEN** (setup timed out opening the library on a degraded emulator — not a product failure; the hide / restore behaviour itself is covered by TX-12). **TX-07 (HE RTL) / TX-08 (EN LTR): NOT RUN** (device instability: repeated ADB reconnects, one blank-screen bundle reload). TX-10 / TX-11 belong to 001E / 001F. Pending TX tests run later either on `eaf83fd` or reported against the newer baseline they actually ran on.
- **Library-open performance check (bounded, 2026-10-08):** 3 opens 9.1 / 13.9 / 9.4 s incl. tap + ~3 s UI dumps (median 9.4 s; dump 2.9–3.0 s, emulator load ~3). Opening Exercises causes 17–19 Java GCs over ~4–5 s (Players: 0) — consistent with the list rendering row batches after first paint; no skipped-frame / ANR evidence; the taxonomy read itself is tiny. No comparable pre-001C measurement exists on this device (the v11 database cannot run the v9 build). **Classification: PERFORMANCE_NOT_PROVEN** (inconclusive under a degraded environment) — to re-measure on a healthy emulator / physical phone in 001F; FlatList window tuning is the first candidate if a regression is confirmed.

---

## TRAIN-TAXONOMY-001B — Professional Basketball content: IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS (2026-10-08)

Owner-approved 2026-10-07 (purpose before count). **17 new built-in Basketball drills** (catalog 107 → **124**, Basketball 17 → 34), each placed where a skills coach would look for it; **every previously empty taxonomy node now has content (0 empty nodes)**.

- **Ball handling:** Crossover Dribble, Between-the-Legs Dribble, Behind-the-Back Dribble (clean moves in 30 s — REPETITIONS), Hesitation Drive, Change-of-Pace Dribble, Combination Move Series (drills, not ranked).
- **Finishing (makes / attempts):** Reverse Layups, Contact Finishes (controlled contact from a coach / adult only — safety note), Floaters, Power Layups (two-foot jump stop).
- **Shooting on the move:** Relocation Shooting (makes / attempts; also Catch & Shoot).
- **Passing:** One-Hand Push Pass (clean passes in 30 s), Passing on the Move (full court, no dribble / travel).
- **Footwork:** Jump Stop & Pivots, Jab Step Series (from the triple threat).
- **Defense:** Defensive Recovery Drill, Zig-Zag Defensive Slides (also Basketball › Athletic › Agility).
- **Schema v11 (additive, rows only):** seeds the 17 stable ids into `exercises` (active state only; content in code), the v8 pattern. No schema change; existing user data and history untouched (upgrade tests: every existing row unchanged, only the 17 seed rows added — `src/test-support/migrationSeeds.ts`).
- **Tests:** all catalog quality gates (bilingual names, Hebrew script, instructions in both languages, no medical claims, measurement rules) and taxonomy coherence rules apply to the new drills; empty-node test now expects none and the hide-when-empty mechanism is covered with inactive drills. Existing migration tests now expect v11.
- **Gate (2026-10-08):** typecheck PASS; lint 0 errors (1 pre-existing warning); **Jest 75 / 75 suites, 1395 / 1395 tests PASS** (`--maxWorkers=50%`, see TEST-FLAKE-001 note in 001A); **Android local export PASS** (3.5 MB).
- **Product QA note:** the frozen QA baseline is still `71b1d13` (107 built-ins). When it moves past 001B, EL-01's expected built-in count becomes 124.

## TRAIN-TAXONOMY-001A — Training taxonomy (domain / data): IMPLEMENTED + CODE TESTED + ANDROID EXPORT PASS (2026-10-08)

Owner-approved 2026-10-07 (architecture review + decisions); sub-slice A of TRAIN-TAXONOMY-001 (ROADMAP 2.1c). **No taxonomy UI** — it arrives in 001C / 001D.

- **Model (`src/domain/taxonomy`):** a curated, many-to-many DISCOVERY / NAVIGATION tree over the exercise library (ARCHITECTURE §16, PRODUCT_SPEC §73). `nodes.ts`: 71 built-in nodes under stable keys — **Fitness 22** (7 by body area: Chest, Back, Shoulders, Arms, Core [Stability, Rotation / Flexion], Legs [Squat & Lunge, Hinge & Posterior Chain, Single-Leg & Balance, Calves & Ankles], Full Body; 8 by training goal: Strength, Power & Plyometrics, Speed, Agility, Conditioning, Mobility, Warm-Up, Cool-Down & Recovery) and **Basketball 49** (Shooting 8, Finishing 6, Ball Handling 10, Passing 4, Defense 4, Footwork 4, Rebounding, Athletic Development 4). `memberships.ts`: 208 curated links (Fitness 168, Basketball 40) covering all 107 built-ins; 78 exercises sit in ≥ 2 nodes (e.g. DEADLIFT: Back, Legs › Hinge, Full Body, Strength; PULL_UP_JUMPER: Shooting › Mid-Range, Pull-Up, Off the Dribble); 6 general exercises explicitly cross-listed under Basketball › Athletic Development. `taxonomy.ts`: pure helpers (build with fail-closed structure checks, children / path / shelf / nodes-of-exercise, active counts, visibility: inactive or empty → hidden). HE / EN labels (`taxonomy.node.*`, `taxonomy.group.*`).
- **Empty nodes (curated ahead of content, hidden from users):** 16 Basketball nodes — Shooting on the Move; Reverse Layup, Contact Finish, Floater, Power Finish; Hesitation, Change of Pace, Combination Moves; One-Hand Pass, Passing on the Move; Defensive Recovery; Footwork (Jump Stop, Pivot, Jab Step, Triple Threat). Filling them is TRAIN-TAXONOMY-001B (content). No Fitness node is empty.
- **Schema v10 (additive):** `taxonomy_nodes` (one seeded row per built-in key, active state only; parent / family / name / sort-order columns reserved for future family-owned nodes, NULL for built-ins by CHECK) + `exercise_taxonomy` (custom-exercise memberships only); indexes `taxonomy_nodes_by_parent`, `exercise_taxonomy_by_node`; triggers: nodes never deleted, built-in exercises never stored as members (curated only), memberships never updated in place. No existing table changes; plan / session snapshots carry no taxonomy.
- **Repository (`src/data/local/taxonomy`):** `readTaxonomy` (fails closed: missing / unknown / custom node rows, built-in membership rows), `setTaxonomyNodeActive` (idempotent, stamped, memberships untouched), `setCustomExerciseTaxonomy` (refuses built-in exercises, unknown exercise / node, a NEW inactive node; keeps an existing membership in a node that became inactive).
- **Tests (38 new):** domain / coherence 22 (structure, arbitrary depth, stable order, approved trees, HE / EN labels, migration seeding, membership integrity, coverage of all built-ins, many-to-many, coaching coherence with muscles / areas / movement patterns / training categories / sport, visibility); repository 11 (real SQLite); migration v10 5 (fresh install, realistic v9 upgrade with finished training history — every pre-v10 table unchanged, same schema as fresh, taxonomy writes never change training history, restart / idempotency, rollback). Mutation check: 3 deliberate content mistakes each killed (non-hinge in Hinge; general sprint under Free Throws; missing node seed). Existing migration tests updated for the new latest version (v10) only.
- **Gate (owner repo `main` @ `71b1d13` + uncommitted Slice A changes, 2026-10-08):** typecheck PASS; lint 0 errors (1 pre-existing warning, `fullCalendar.test.tsx`); **Jest 75 / 75 suites, 1377 / 1377 tests PASS** (twice, `--maxWorkers=50%`). The default fully parallel run on the same machine (QA emulator running) hit 5 s timeouts in UI suites — 1 test in each of two runs, the TEST-FLAKE-001 Exercise Library test; a pristine `71b1d13` copy under the same conditions also failed 1–2 UI tests by timeout only (no assertion failure) → pre-existing environment flakiness, not a Slice A regression. **Android local export PASS** (3.5 MB Hermes bundle).
- **Not done here (by design):** taxonomy UI, Basketball content, Workout Builder picker, template classification, EX-GUIDE-001, Calendar ↔ Training, timers, camera, cloud. **Python Product QA:** TX-01…TX-13 NOT YET EXECUTABLE (future sub-slices). **Physical QA:** not applicable to a no-UI sub-slice.

## TRAIN-002 — Workout Builder + Training Execution: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-06)

Built to the approved model (PRODUCT_SPEC §72, ARCHITECTURE §15), before Cloud Foundation C (ROADMAP revision 2026-10-06). No timer / countdown / audio / whistle (→ 2.1b), no cloud / auth / sync / RLS.

- **Builder (Family-owned, reusable, editable, never deleted):** Workout Blocks = a name + ordered exercises, each with its prescription (sets, target in the measurement's unit, load only when the exercise uses one, rest); Workout Templates = a name + ordered blocks (a block may repeat). Make inactive asks (Keep active is the default). Names: trimmed, ≤ 35 (the approved Title limit), no duplicate per kind. A block follows its exercise's *current* definition: a target / load that no longer applies after the exercise was edited is dropped on read (structural corruption still fails closed); plans never use this.
- **Planned Workout (frozen):** planning a template for a Player writes a snapshot — per item: block name, exercise id + HE/EN name + measurement (type, comparison, load / distance), prescription. SQL triggers refuse any UPDATE / DELETE of a plan or its items, and new items once it was started. The template id is provenance only.
- **Training Session (separate):** Start now (plan + session in one transaction) or Plan for later → Start. Purpose TRAINING. Status IN_PROGRESS → COMPLETED (every planned set performed) / PARTIAL (finished with planned sets not performed; extra sets never make up) / ABANDONED (Stop asks; Keep training is the default). Nothing performed → cannot finish. One session per plan; one in progress per Player. A finished session is read-only (repository and SQL triggers). Session exercises carry their own snapshot; each set copies its planned target / load (none for an extra set).
- **Planned vs actual:** each set keeps its plan beside its actual values — Bench 3 × 10 @ 50 kg performed 10 @ 50 · 10 @ 50 · 7 @ 50 stays 7. Inputs are never pre-filled from the plan (a load input starts from the previous set's *actual* load). Skip / add an extra set.
- **Measurement (per value):** kind (reps, seconds, time, metres, made, attempts, load kg, rating, completion), measured / final / edited (the first entry is measured; a later different value changes final and marks it edited — shown as "corrected from"), **source** MANUAL (CAMERA / DEVICE / SENSOR accepted by the schema, never produced), **confidence** NULL for manual (0–1 otherwise; CHECKed). One set may mix sources.
- **Schema v9 (additive):** `workout_blocks`, `workout_block_items`, `workout_templates`, `workout_template_blocks` (family_id), `planned_workouts`, `planned_workout_items`, `training_sessions`, `session_exercises`, `session_sets`, `set_measurements` (player_id / parent ids); client UUIDs, created_at / updated_at; 4 indexes (two partial UNIQUE: one session per plan, one in progress per player); 18 history / snapshot triggers.
- **UI:** Exercises → *Workouts and blocks* (templates, blocks, builders with library search, reorder, unsaved-changes guard). Player screen → *Training* section (Start a workout / Continue the workout / Planned workouts and history) → choose template (Start now / Plan for later) → plan view (frozen note) → session (per set: planned, actual, inputs, Save / Update / Skip, Add a set; Finish / Stop; read-only when finished). Hebrew / English; made / attempts forced left-to-right (`8/10`).
- **Open product decision (flagged, not invented):** the RATING scale is a placeholder 1–10 bound (no built-in exercise uses RATING). Minor UX: counts are not pluralised ("1 blocks").

**Automated evidence (authoring environment):** `npm run check` exit 0 — **72/72 suites, 1339/1339 tests** (lint: 0 errors; the 1 pre-existing `fullCalendar.test.tsx` warning). Android bundle export (`npx expo export --platform android`) exit 0. Focused: domain 7/7, v9 migration 5/5 (fresh, realistic v8 upgrade with every row unchanged, rollback, v10 refused, constraints), repository 20/20, UI HE / EN 11/11; existing migration suites updated to v9. Negative proof **11/11 mutants killed** (extra set ≠ planned set, correction marked edited, MANUAL source, per-set plan copied, frozen-plan trigger, one in-progress session, block follows exercise, made ≤ attempts, no pre-fill from the plan, Stop asks first — this one first SURVIVED and exposed a test gap, fixed —, finished session read-only).

**Physical (next batched Preview APK) — all PENDING:**
WB-01 Exercises → Workouts and blocks (HE RTL / EN LTR) · WB-02 create a block from library search, defaults shown, reorder / remove · WB-03 prescription validation messages · WB-04 load field only for load exercises · WB-05 create a template from blocks (repeat / reorder / remove) · WB-06 edit block / template; unsaved-changes guard · WB-07 make inactive (asks) / active; inactive template not offered to Start.
TS-01 Player → Training section → Start a workout → Start now · TS-02 planned vs actual per set (enter 10 / 10 / 7 at 50 kg; 7 stays) · TS-03 load carries from the previous actual set, never from the plan · TS-04 made / attempts validation; `8/10` reads left-to-right in Hebrew · TS-05 skip a set; add an extra set (marked not planned) · TS-06 correct a set → "corrected from" · TS-07 Finish → Completed / Partial; nothing recorded → message · TS-08 Stop asks (Keep training default) → Stopped · TS-09 finished workout is read-only; history lists status + sets performed · TS-10 Plan for later → frozen plan unchanged after editing the block / template / exercise → Start · TS-11 Continue the workout after leaving / app restart (persistence) · TS-12 install over the previous APK: Diagnostics schema v9; exercises, calendar, self-assessments unchanged · TS-13 TalkBack reads set rows and buttons.

## TRAIN-001 — Professional Exercise Library: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-06)

Owner-directed (2026-10-06) ahead of Cloud Foundation C; library size per the owner's instruction (see Proposal 3 — PRODUCT_SPEC §15 still says "small").

- **Model (sport-neutral, `src/domain/exercise`):** an Exercise has 1..n training categories (18: warm-up, mobility, flexibility, strength, hypertrophy, power, plyometric, speed, agility, conditioning, cardio, HIIT, core, stability, cooldown, basketball skill / shooting / conditioning), primary + secondary muscles (16 groups), body areas derived from muscles (upper body, core, lower body, full body; *posterior chain* only when ≥ 2 primary muscles are in the chain), movement patterns (13), difficulty (Beginner / Intermediate / Advanced), 0..n sports (none = general), equipment, measurement, defaults (sets / target / rest), instructions, coaching cues, common mistakes, safety note, optional tutorial URL. Measurement keeps the approved `MeasurementType` set (no new types): load (kg) and distance are *set conditions* (`usesLoad`, `distanceM`), not new types; DURATION / DISTANCE declare their comparison; drill reps / work periods are NOT_RANKED. No medical claims (test-enforced word list).
- **Equipment model:** 31 items. Requirements are *options*: options are alternatives (OR), items inside an option are all needed (AND), no option = bodyweight. "Equipment I have" shows exactly what is doable with the selected kit (bodyweight always fits); "No equipment at all" shows bodyweight only.
- **Catalog:** 107 built-in exercises, Hebrew + English names (unique per language), every one with instructions (test-enforced, both languages); coaching cues, common mistakes and a safety note where relevant. Coverage: strength 33, warm-up 16, stability 16, hypertrophy 13, conditioning 13, core 12, power 11, agility 9, basketball skill 9, plyometric 8, speed 7, mobility 7, basketball shooting 7, cardio 6, cooldown 5, HIIT 5, flexibility 4, basketball conditioning 4 (multi-category). Difficulty: 71 beginner / 29 intermediate / 7 advanced. 39 bodyweight-doable, 17 basketball, 32 with load. Measurement: 65 reps, 21 duration, 12 time, 7 made/attempts, 2 distance. Tutorial URLs: none curated (no unverified links shipped).
- **Schema v8 (additive):** `exercises (id, builtin, active, name?, difficulty?, measurement_type?, comparison_policy?, uses_load?, instructions?, tutorial_url?, created_at, updated_at)` + child tables `exercise_categories`, `exercise_muscles (role)`, `exercise_equipment (option_index)`, `exercise_sports`. Built-ins: a row per stable catalog id (frozen list in the migration; test-enforced that every catalog id is seeded) holding only the active state — curated content lives in code, so an app update can improve content and never overwrites user data. Custom exercises: client UUID, content in the row + child tables. CHECKs separate the two kinds; a trigger refuses DELETE (inactive instead). Reads fail closed (unknown code, catalog id without row, row the catalog does not know).
- **UI:** Exercises tab = the library: search (Hebrew / English, accent / niqqud-insensitive), filter panel (equipment I have, bodyweight only, show inactive, category, body area, muscle, difficulty, sport; selected chips carry ✓ text, not colour alone), count, rows with categories / difficulty / equipment / measurement style. Details: everything above; built-ins are read-only; custom → Edit. Make inactive asks (safe default Keep active); Make active does not. Add / edit custom exercise: name, categories, difficulty, muscles, sports, equipment (needed + an alternative), measurement (+ comparison / load only when they apply), instructions, tutorial URL; unsaved-changes guard; custom names are the user's text in both languages (not translated).

**Automated evidence (authoring environment):** `npm run check` exit 0 — 68/68 suites, **1296/1296 tests** (lint: 0 errors, 1 pre-existing warning in `fullCalendar.test.tsx`, untouched). Android bundle export (`npx expo export --platform android`) exit 0. Focused: catalog 136/136, domain 28/28, v8 migration 11/11 (fresh, realistic v7 upgrade, rollback, v9 refused, constraints), repository 11/11, UI HE / EN 12/12; negative proof **10/10 mutants killed** (equipment AND/OR, bodyweight, posterior chain, inactive hidden, Hebrew search, duplicate name, built-in read-only, missing seeded row, no-delete trigger, deactivate confirmation).

**Physical (next batched Preview APK) — all PENDING:** EX-01 Exercises tab opens the library (HE RTL / EN LTR) · EX-02 search Hebrew / English · EX-03 "Equipment I have" + "No equipment at all" · EX-04 category / area / muscle / difficulty / sport filters + clear · EX-05 details (cues, mistakes, safety, equipment options) HE / EN · EX-06 add custom exercise + validation · EX-07 edit custom exercise; built-in has no Edit · EX-08 make inactive (asks) / active; inactive hidden unless shown · EX-09 unsaved-changes guard on the form · EX-10 restart persistence + install over the previous APK (Diagnostics schema v8; Activity Types, Calendar and Sports unchanged) · EX-11 TalkBack reads rows and selected filters.

## ACTIVITY-001 — Configurable Activity Types: IMPLEMENTED + AUTOMATED PASS, PHYSICAL PENDING (2026-10-06)

- **Schema v7 (additive):** `activity_types (id, builtin, name, active, created_at, updated_at)`; the six built-ins are seeded with `id` = the code existing events already store, so no event row changes and `calendar_events.type` stays the one source of an event's type. Custom types: client UUID + the user's name (built-ins: name NULL, i18n label). A trigger refuses any DELETE (types are never deleted, only made inactive). `calendar_events` is not rebuilt (a foreign key would make an upgrade fail on any legacy unknown code); the repository checks the reference on every write and reads fail closed.
- **Rules:** a NEW event may use only an ACTIVE type; an existing event keeps its type even when inactive (editable without forced change, never reactivated); OTHER keeps its title rule. Making a type inactive / active changes only that catalog row (idempotent, same id) — never an event, a completion or a sport. Custom name: trimmed, non-blank, ≤ 35 (the approved Title limit — owner may change), no duplicate custom name (re-enable instead).
- **UI:** Settings → Activity types: Active / Inactive sections, state in words, Make inactive (asks; safe default Keep active) / Make active; Add activity type (own screen, unsaved-changes guard). The event form offers active types (+ the event's own inactive type, marked); zero active → a message, nothing chosen. Full Calendar filter lists every type (inactive marked); single-Player colours: built-ins unchanged, custom = stable hash of the id (never the name), marker = name initial.

**Automated evidence (authoring environment):** `npm run check` exit 0 — 63/63 suites, 1098/1098 tests; Android bundle export exit 0. Focused: v7 migration 13/13, catalog + calendar/history/sport-independence repository 25/25, domain 14/14, colours 5/5, UI (HE / EN) 12/12; negative proof 14/14 mutants killed.

**Physical (next batched Preview APK) — all PENDING:** AT-01 Settings Activity Types list · AT-02 add custom type HE / EN · AT-03 disable / re-enable · AT-04 inactive type hidden from a new event · AT-05 historical inactive type preserved (Schedule, Details, Full Calendar) · AT-06 edit an event keeping its inactive type · AT-07 Full Calendar filter with custom / inactive types · AT-08 custom type colour + accessibility (TalkBack) · AT-09 restart persistence · AT-10 Sport vs Activity Type independence. Also: install over the previous APK — Diagnostics shows schema v7 and every earlier event keeps its type.

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
3. **APPROVED 2026-10-06 and applied** (PRODUCT_SPEC §15 / §16: a substantial curated starter library — quality over a fixed count; baseline 107). Original proposal: **PRODUCT_SPEC §15 library size (proposed 2026-10-06):** §15 asks for a small library (~15 basketball exercises; "not 200 before we know people use 15"). The owner's 2026-10-06 instruction asked for a professional library for general fitness **and** Basketball; TRAIN-001 ships 107. Proposed: update §15 (and §16 for categories / muscles / equipment / active state) to describe the implemented library — **awaiting owner approval**.
4. **APPROVED 2026-10-06 and applied** (ARCHITECTURE §7 v8, §9 exercise model). Original proposal: **ARCHITECTURE §7 Exercise model alignment (proposed 2026-10-06):** §7 shows `Exercise (category, measurementType, comparisonPolicy?, defaults, tutorialUrl, isCustom)`. Implemented: multi-category, muscles / areas / patterns, equipment options, `active` instead of deletion, built-in content in code with a seeded id row, measurement conditions (`usesLoad`, `distanceM`) — the approved `MeasurementType` set is unchanged. Proposed: record schema v8 and this model in §7 — **awaiting owner approval**.
5. **APPROVED 2026-10-06 with refinements and applied** (ROADMAP: TRAIN-002 before C, 2.1 re-scoped, timer → 2.1b, slice 5 absorbed; PRODUCT_SPEC §72; ARCHITECTURE §13 / §14 / §15: statuses incl. PARTIAL, source + confidence per measurement, frozen snapshots, family / player ownership). Original proposal: **TRAIN-002 / CAL-TRAIN-001 design (proposed 2026-10-06; NOT started — blocking decisions):**
   - *Conflicts with controlled docs:* (a) ROADMAP orders Cloud Foundation C before 2.x and §5 rules sync order `Session → Exercise entry → Set → Attempt`; session tables created before C must already fit that (client UUIDs, no server ids) — feasible, but the owner must confirm TRAIN-002 goes ahead of C. (b) ROADMAP 2.1 is the timer engine (countdown 5-4-3-2-1, audio, whistle, timestamp timer, measured / final / edited); the owner's TRAIN-002 is a Workout Builder + manual execution — scope must be chosen (proposal: builder + manual execution now; timer / audio as TRAIN-002b, using the same Set rows). (c) ARCHITECTURE §7 has `WorkoutTemplate ── TemplateItem` and `WorkoutSession (player, sport, purpose, template?, startedAt, endedAt) → SessionExercise → Set → Attempt → Result`; the request adds Training Blocks, a Planned Workout snapshot, session statuses, and measurement `source` (MANUAL now; CAMERA / DEVICE / SENSOR later) / confidence — new architecture needing approval.
   - *Proposed model (local, client UUIDs, append-only migration v9):* `training_blocks` + `block_items` (reusable packs) → `workout_templates` + `template_items` (block or exercise, order, sets / target / rest / load) → `planned_workouts` (player, optional template id + **frozen JSON snapshot** of items with exercise id + name/measurement at plan time; editing a template never changes it) → `training_sessions` (player, sport?, purpose TRAINING, planned_workout_id?, status IN_PROGRESS / COMPLETED / ABANDONED (a planned-but-not-started workout is the planned_workout, never a session), startedAt / endedAt from `Clock`) → `session_exercises` (snapshot of planned target) → `session_sets` (planned target vs actual: measuredResult / finalResult / wasEdited, load, distance, skipped, `source` = MANUAL, `confidence` NULL until a non-manual source exists). Objective results only; Self-Assessment untouched; no combined score.
   - *CAL-TRAIN-001:* `calendar_events.planned_workout_id` (nullable, additive) — the event links to a planned workout and opens the session; the event never stores execution data; completion of the event stays the explicit manual action of CAL-COMP-001.
   - **Awaiting owner approval** of (a)–(c) and the model before any TRAIN-002 code.
- `expo-system-ui` to enforce the light theme on Android — **DEFERRED — decide during UI/theme work.** Theme behaviour (light only / dark / system) is not decided; no dependency added.
