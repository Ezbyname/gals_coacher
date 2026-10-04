# ROADMAP

> **Status: CONTROLLED.** Where the project is going. Not rewritten after every
> phase — progress is tracked in [PROJECT_STATE.md](./PROJECT_STATE.md).

Every phase: **Implement → Test → Run → Prove → Update PROJECT_STATE.md → STOP.**
No automatic transition to the next phase.

The slices below are the owner-approved product slices (2026-10-02,
revised 2026-10-04: Player Profile contract, Calendar Foundation added,
Calendar UI moved after the Training Engine, Shooting renamed, Quick
Training renumbered); they replace the original numbered phases 1–15 (the
former phase each slice absorbs is noted). Cloud Foundation (C) is
**approved (2026-10-04)** to sit after 1.3 Calendar Foundation and before
2.0.

| Slice | Name | Scope | Gate |
|---|---|---|---|
| 0 | Foundation | Expo, RN, TypeScript strict, Expo Router, Supabase client, SQLite, testing, lint, env config, architecture, Android build, iOS build configuration | **CLOSED / VERIFIED** on a physical Android device (see PROJECT_STATE). |
| 0.H | Phase 0 Hardening | Result comparison policy (measurement type ≠ comparison), injectable `IdService`, safe audio preload, meaningful SQLite tests, offline/sync + Child Mode architecture docs, document governance. No features. | Patch reviewed; `npm run check` green; Android preview APK re-verified (launch, Diagnostics, SQLite restart, haptics). |
| 1.0 | Localization / RTL | Hebrew default, English, RTL Hebrew / LTR English, language preference persistence, direction handling (reload acceptable), all existing strings localized, measurement display safety | Fresh install opens in Hebrew RTL; switch to English LTR; choice survives restart; `18/20`, `80%`, `4.38` read correctly in Hebrew. **Physical Android device.** |
| 1.1 | Player Profile | Local-first. Local Family (UUID) + generic Player: name, DOB (manual day/month/year + native date picker) → age, optional height. **Optional** sport assignment (Basketball the only selectable sport; may be added later; not removable in 1.1). Basketball profile only when Basketball is selected: primary / secondary position (None), dominant hand. Experience and weekly frequency not collected (stored values preserved). Create / edit / view, SQLite persistence. **No weight.** (former Phase 1, local part; contract revised 2026-10-04) | Create with and without Basketball, add Basketball later, edit, restart, data persists, both languages, manual + picker DOB, on device. |
| 1.2 | Self-Assessment | 5–6 basketball categories, 1–5 rating, persisted locally, repeatable over time, separate from objective results | Take twice; both kept with dates; nothing written to result tables. |
| 1.3 | Calendar Foundation | Data model and contracts only, no calendar UI: event types (team training, personal training, game, school, unavailable, other), recurrence, exceptions (cancel one occurrence, change future occurrences), `CalendarEvent ≠ TrainingSession`. No recommendations, no AI. (calendar data part of former Phase 12; added 2026-10-04) | No user-facing UI gate. Minimum: domain / persistence automated tests; recurrence / exception invariants where applicable; rollback / corruption protection; backward compatibility with existing data; **if** the slice changes the SQLite schema, migration + upgrade + idempotency proof; physical Android smoke (app launches, existing data readable, expected schema reported, no startup / runtime regression). Detailed criteria finalized when 1.3 enters planning. |
| C | Cloud Foundation (position approved 2026-10-04: after 1.3, before 2.0) | Small by design: parent authentication, Family, Player ownership, cloud representation of SelfAssessment, RLS, RLS tests, first idempotent upload / attachment of the existing local family data. **Not included:** generic bidirectional sync, multi-device conflicts, Child Mode, full training-history sync, background sync framework. Local-first training stays a requirement. | RLS verified by tests (family A cannot read family B); local family data attached once, re-upload creates no duplicates; app still works offline after first sign-in. |
| 2.0 | Exercise Model + Exercise Library | Generic `Exercise` + `ExerciseSport` association (one exercise may serve several sports), generic measurement types + comparison policy, small basketball-first library, custom exercise foundation (former Phase 2) | Predefined exercises load; create / edit custom exercise. |
| 2.1 | Training Engine | Countdown 5-4-3-2-1, audio cue, whistle, timestamp timer, STOP, manual correction (measured / final / edited), sets, attempts, session `purpose`, local persistence (former Phase 3) | Player → 20m Sprint → START → 5-4-3-2-1 → 📣 → 4.38 → Edit → 4.35 → Save → restart → 4.35 still exists. **Early iOS dev-build gate:** core runtime path verified on iOS. |
| 2.2 | Calendar UI + Calendar ↔ Training | Day / week / month views, recurring team practices, games, school / unavailable time; starting training from a planned event; planned + completed, planned + skipped, unplanned + completed (calendar UI part of former Phase 12; added 2026-10-04) | User-facing: automated tests **and** full physical-device acceptance. Expected categories: day / week / month UI, event times, recurrence, occurrence exceptions / cancellation, RTL / LTR, timezone / DST, Calendar → Training flow, persistence after restart, background / foreground. Exact checklist finalized when 2.2 enters planning. |
| 2.3 | Basketball Measurements & Shooting | MADE / MISS, attempts, percentage, sets, totals (former 2.2 Basketball Shooting, renamed 2026-10-04; former Phase 4) | 10 shots, 8 made → 8/10, 80%. |
| 2.4 | Quick Training | Player → Exercise → Start, minimal taps; creates an ordinary `TRAINING` session (entry mode, not a purpose) (former 2.3; former Phase 5) | Closed app to active training in minimal taps. |
| 3.0 | Baseline Template | Smallest useful basketball baseline as a `WorkoutTemplate` (purpose BASELINE) on the **existing** Training Engine; coaching order jump → sprint → agility → ball handling → shooting; may span sessions. **No new measurement storage.** | Baseline run produces ordinary sessions/results tagged BASELINE. |
| 3.1 | Reassessment / Baseline Comparison | Repeat the same baseline, original preserved, comparison foundation (player vs own baseline) | Second baseline run does not alter the first; both visible. |
| 3.2 | Basic Progress | Exercise performance over time with baseline marker, training progression and reassessment marker; workout / exercise history and personal records (former Phase 6) | Free-throw trend correct; sprint trend correct as lower-is-better; baseline + reassessment markers from the same result stream. |

Then, in order:

| Slice | Name | Scope | Gate |
|---|---|---|---|
| 4 | Rest + Full Session Flow | Sets, rest timer, next set, next exercise, double whistle, automatic sequence (former Phase 7) | — |
| 5 | Workout Builder | Create / reuse workout, reorder, sets / rest / targets (former Phase 8) | — |
| 6 | Coach Engine | Deterministic humorous coaching from measured events. No LLM. (former Phase 9) | — |
| 7 | iOS Validation Gate | **Full iOS validation** of the accumulated product. Build iOS; verify navigation, SQLite, timer, audio, whistle, haptics, training flow, shooting, RTL, sync. Fix platform issues now. (former Phase 10) | — |
| 8 | Child Mode Foundation | Anonymous auth, server-controlled pairing, permissions, child device (former Phase 11) | — |
| 9 | Notifications | Morning reminders, pre-training notifications driven by Calendar events (notification part of former Phase 12; calendar data moved to 1.3 and calendar UI to 2.2 on 2026-10-04) | Android + iPhone validation. |
| 10 | Sleep / Recovery / Habits | Sleep, hydration, recovery, readiness. No calorie/weight features for children. (former Phase 13) | — |
| 11 | Advanced Progress | Multiple charts, filters, trends, Progress Index (former Phase 14) | — |
| 12 | AI Coach | Only after real data exists. Designed separately. (former Phase 15) | — |

### Notes

- **Cloud Foundation (C) sits after 1.3 and before 2.0 — APPROVED
  (2026-10-04).** The first three domains (Player, Self-Assessment,
  Calendar) are defined before their cloud representation, and C still
  comes before high-volume session / set / attempt / result data exists,
  because ownership and RLS shape those tables. The local model is
  cloud-ready from Slice 1.1 (client UUIDs, local `family_id` on every
  player).
- **iOS:** early dev-build gate in 2.1; full validation in slice 7; no iOS
  build has been run yet.
- **Dependency to watch:** Slice 3.0 runs several exercises in sequence,
  which needs at least a minimal multi-exercise session flow. Either 3.0
  includes that minimal sequencing on the Training Engine, or part of slice
  4 (Rest + Full Session Flow) moves before 3.0. Decide when 3.0 is planned.

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
within this delivery sequence (after 1.3, before 2.0) as required MVP
enabling infrastructure, but is not itself a user-facing capability. Slice
numbering does not define MVP scope: moving, splitting or inserting a slice
does not change these lists; only an owner decision does.

Example end-to-end flow: Player → basketball exercise → Quick Training →
5-4-3-2-1 → whistle → timer or shooting → result → edit → save → baseline /
reassessment → history → graph, with training planned around the player's
calendar.
