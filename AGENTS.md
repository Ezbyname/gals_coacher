# Gals Coacher — agent instructions

Basketball-first family sports training companion. Expo + React Native +
TypeScript + Expo Router, SQLite on device, Supabase in the cloud.

## Read first

- `docs/PRODUCT_SPEC.md` — **controlled**. Never redefine the product.
- `docs/ARCHITECTURE.md` — **controlled**. Propose changes in PROJECT_STATE "Proposals"; never change approved architecture silently.
- `docs/ROADMAP.md` — **controlled**. Do not rewrite after each phase.
- `docs/PROJECT_STATE.md` — **living**. Update after every completed slice.

## Working rules

1. Work one roadmap phase at a time: **Implement → Test → Run → Prove → Update PROJECT_STATE.md → STOP.** Never start the next phase automatically.
2. Proof first. Never report "works". Report counts and evidence (e.g. `Unit tests: 18/18 PASS`, `Android: verified on device`). Say plainly what was *not* verified.
3. **Generic domain, specialized UX.** No sport-specific tables/types in the domain or storage (`basketball_results` is forbidden). Basketball-specific screens are encouraged.
4. **Cross-platform.** Use platform capabilities only through the interfaces in `src/services/`. No Android-only code where a cross-platform option exists.
5. **Local-first.** Training never needs the network. Generate UUIDs on device (via `services.ids` / `IdService`) before the first write. SQLite is the operational source of truth; Supabase is canonical after sync.
6. **Timers** derive elapsed time from timestamps (`Clock`), never from counting intervals.
7. Store `dateOfBirth`, never age. Store `measuredResult`, `finalResult`, `wasEdited`.
8. Do not invent numeric product rules (PB thresholds, minimum shot samples). Make them configurable and flag them for the owner.
9. Children's wellbeing: no body/weight shaming, no calorie features, never compare children to each other.

## Expo has changed — do not trust your training data

This project is on **Expo SDK 57**. Before touching an Expo/EAS/React Native API:

1. Fetch the versioned docs: https://docs.expo.dev/versions/v57.0.0/ (index: https://docs.expo.dev/llms.txt).
2. If the docs are unreachable, use the installed package's type definitions in `node_modules/<pkg>/build/*.d.ts` as the source of truth.

## Commands

```bash
npx expo install <package>  # ALWAYS use instead of npm add — resolves SDK-compatible versions
npm start                   # dev server (Expo Go — limited; prefer the dev client)
npm run start:dev-client    # dev server for the development build
npm run typecheck           # tsc --noEmit
npm run lint                # expo lint
npm test                    # jest
npm run check               # typecheck + lint + tests — run before declaring anything done
npm run doctor              # expo-doctor
npm run build:android:dev   # EAS development build (APK)
npm run build:ios:dev       # EAS iOS development build (device; needs Apple Developer account)
npm run build:ios:sim       # EAS iOS simulator build
```

## Layout

- Routes live in `src/app/` only (every file is a screen; `_layout.tsx` defines navigators). Keep logic out of routes.
- `src/domain` (pure, sport-agnostic) · `src/services` (platform interfaces) · `src/data/local` (SQLite + migrations) · `src/data/remote` (Supabase) · `src/features` · `src/ui`.
- Import with the `@/` alias (`@/domain/measurement`).
- Tests live in `__tests__/` next to the code they cover.

## Native code

`android/` and `ios/` are generated (CNG) and git-ignored. Never create or edit them by hand — configure native behaviour in `app.json` and config plugins. After adding a library with native code, rebuild the development client.

## Database

- Local migrations: append-only in `src/data/local/migrations/index.ts`; versions `1..n`, never edit a shipped migration.
- Supabase migrations: `supabase/migrations/`; every table ships with RLS enabled and policies in the same migration.
