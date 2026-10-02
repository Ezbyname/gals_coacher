# ROADMAP

> **Status: CONTROLLED.** Where the project is going. Not rewritten after every
> phase — progress is tracked in [PROJECT_STATE.md](./PROJECT_STATE.md).

Every phase: **Implement → Test → Run → Prove → Update PROJECT_STATE.md → STOP.**
No automatic transition to the next phase.

| # | Phase | Scope | Gate |
|---|---|---|---|
| 0 | Foundation | Expo, RN, TypeScript strict, Expo Router, Supabase, SQLite, testing, lint, env config, architecture, Android dev build, iOS build configuration | App opens. Navigation works. TypeScript passes. Tests run. Android build works. iOS build path documented. |
| 1 | Family + Children | Parent, Family, Child, DOB, calculated age, basketball assignment | Create child. Edit child. Reload. Data persists. RLS verified. |
| 2 | Basketball Exercise Model | Small exercise library (Shooting, Sprint, Ball Handling, Conditioning), measurement types | Create / edit exercise. Predefined exercises load. Custom exercise works. |
| 3 | Training Engine | Countdown, audio preload, start whistle, timer, STOP, manual edit, save, SQLite persistence | Noam → 20m Sprint → START → 5-4-3-2-1 → 📣 → 4.38 → Edit → 4.35 → Save → restart app → 4.35 still exists. **iOS dev build verification.** |
| 4 | Basketball Shooting | Made, Miss, Attempts, Percentage, Sets, Total | 10 shots, 8 made → shows 8/10, 80%. |
| 5 | Quick Training | Home → Quick Training → Child → Exercise → Train | Closed app to active training in minimal taps. |
| 6 | History + Basic Progress | Workout history, exercise history, personal records, first graph | Free Throw history shows correct trend. Sprint history shows correct lower-is-better trend. |
| 7 | Rest + Full Session Flow | Sets, rest timer, next set, next exercise, double whistle, automatic sequence | — |
| 8 | Workout Builder | Create / reuse workout, reorder, sets / rest / targets | — |
| 9 | Coach Engine | Deterministic humorous coaching from measured events. No LLM. | — |
| 10 | iOS Validation Gate | Build iOS; verify navigation, SQLite, timer, audio, whistle, haptics, training flow, shooting, sync. Fix platform issues now. | — |
| 11 | Child Mode Foundation | Anonymous auth, pairing, permissions, child device | — |
| 12 | Calendar + Notifications | Recurring practice, games, morning reminders, pre-training notifications | Android + iPhone validation. |
| 13 | Sleep / Recovery / Habits | Sleep, hydration, recovery, readiness. No calorie/weight features for children. | — |
| 14 | Advanced Progress | Multiple charts, filters, trends, Progress Index | — |
| 15 | AI Coach | Only after real data exists. Designed separately. | — |

**True MVP** = Phases 0–6: Child → Basketball exercise → Quick Training →
5-4-3-2-1 → whistle → timer or shooting → result → edit → save → history → graph.
