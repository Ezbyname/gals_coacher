# ROADMAP

> **Status: CONTROLLED.** Where the project is going. Not rewritten after every
> phase — progress is tracked in [PROJECT_STATE.md](./PROJECT_STATE.md).

Every phase: **Implement → Test → Run → Prove → Update PROJECT_STATE.md → STOP.**
No automatic transition to the next phase.

The slices below are the owner-approved product slices (2026-10-02); they
replace the original numbered phases 1–15 (the former phase each slice
absorbs is noted). The position of Cloud Foundation (C) is **RECOMMENDED /
PENDING PRODUCT OWNER APPROVAL**.

| Slice | Name | Scope | Gate |
|---|---|---|---|
| 0 | Foundation | Expo, RN, TypeScript strict, Expo Router, Supabase client, SQLite, testing, lint, env config, architecture, Android build, iOS build configuration | **CLOSED / VERIFIED** on a physical Android device (see PROJECT_STATE). |
| 0.H | Phase 0 Hardening | Result comparison policy (measurement type ≠ comparison), injectable `IdService`, safe audio preload, meaningful SQLite tests, offline/sync + Child Mode architecture docs, document governance. No features. | Patch reviewed; `npm run check` green; Android preview APK re-verified (launch, Diagnostics, SQLite restart, haptics). |
| 1.0 | Localization / RTL | Hebrew default, English, RTL Hebrew / LTR English, language preference persistence, direction handling (reload acceptable), all existing strings localized, measurement display safety | Fresh install opens in Hebrew RTL; switch to English LTR; choice survives restart; `18/20`, `80%`, `4.38` read correctly in Hebrew. **Physical Android device.** |
| 1.1 | Player Profile | Local-first. Local Family (UUID) + Player: name, DOB → age, primary/secondary position, dominant hand, experience, weekly frequency, height, basketball assignment. Create / edit / view, SQLite persistence. **No weight.** (former Phase 1, local part) | Create, edit, restart, data persists, both languages, on device. |
| 1.2 | Self-Assessment | 5–6 basketball categories, 1–5 rating, persisted locally, repeatable over time, separate from objective results | Take twice; both kept with dates; nothing written to result tables. |
| C | Cloud Foundation — **RECOMMENDED / PENDING PRODUCT OWNER APPROVAL** (position) | Small by design: parent authentication, Family, Player ownership, cloud representation of SelfAssessment, RLS, RLS tests, first idempotent upload / attachment of the existing local family data. **Not included:** generic bidirectional sync, multi-device conflicts, Child Mode, full training-history sync, background sync framework. Local-first training stays a requirement. | RLS verified by tests (family A cannot read family B); local family data attached once, re-upload creates no duplicates; app still works offline after first sign-in. |
| 2.0 | Exercise Model | Generic measurement types + comparison policy, small basketball-first library, custom exercise foundation (former Phase 2) | Predefined exercises load; create / edit custom exercise. |
| 2.1 | Training Engine | Countdown 5-4-3-2-1, audio cue, whistle, timestamp timer, STOP, manual correction (measured / final / edited), sets, attempts, session `purpose`, local persistence (former Phase 3) | Player → 20m Sprint → START → 5-4-3-2-1 → 📣 → 4.38 → Edit → 4.35 → Save → restart → 4.35 still exists. **Early iOS dev-build gate:** core runtime path verified on iOS. |
| 2.2 | Basketball Shooting | MADE / MISS, attempts, percentage, sets, totals (former Phase 4) | 10 shots, 8 made → 8/10, 80%. |
| 2.3 | Quick Training | Player → Exercise → Start, minimal taps; creates an ordinary `TRAINING` session (entry mode, not a purpose) (former Phase 5) | Closed app to active training in minimal taps. |
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
| 9 | Calendar + Notifications | Recurring practice, games, morning reminders, pre-training notifications (former Phase 12) | Android + iPhone validation. |
| 10 | Sleep / Recovery / Habits | Sleep, hydration, recovery, readiness. No calorie/weight features for children. (former Phase 13) | — |
| 11 | Advanced Progress | Multiple charts, filters, trends, Progress Index (former Phase 14) | — |
| 12 | AI Coach | Only after real data exists. Designed separately. (former Phase 15) | — |

### Notes

- **Cloud Foundation (C) position after 1.2 and before 2.0 is
  RECOMMENDED / PENDING PRODUCT OWNER APPROVAL** — before high-volume
  session / set / attempt / result data exists, because ownership and RLS
  shape those tables. Not yet explicitly approved by the product owner. The
  local model is cloud-ready from Slice 1.1 (client UUIDs, local
  `family_id` on every player).
- **iOS:** early dev-build gate in 2.1; full validation in slice 7; no iOS
  build has been run yet.
- **Dependency to watch:** Slice 3.0 runs several exercises in sequence,
  which needs at least a minimal multi-exercise session flow. Either 3.0
  includes that minimal sequencing on the Training Engine, or part of slice
  4 (Rest + Full Session Flow) moves before 3.0. Decide when 3.0 is planned.

**True MVP** = the functional outcome of Slices 0 → 3.2: Player → basketball
exercise → Quick Training → 5-4-3-2-1 → whistle → timer or shooting → result
→ edit → save → baseline / reassessment → history → graph, in Hebrew and
English. Whether Cloud Foundation (C) is inserted after 1.2 is pending
product owner approval.
