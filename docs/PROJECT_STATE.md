# PROJECT STATE

> **Living document.** Updated after every completed slice/phase. Where we are *now*.

## Current status

**Phase 0 — Foundation: IMPLEMENTED, gate PARTIALLY PROVEN.**
JavaScript and native-config checks pass in CI-like conditions. **The Android
device build and on-device launch have not been run yet** (no Android SDK or
Expo account in the authoring environment). Phase 1 must not start until the
owner completes the open gate items below.

---

## Phase 0 report — 2026-10-02

### Gate checklist

| Gate | Result | Evidence |
|---|---|---|
| App opens | ⚠️ Proven in test renderer only | `navigation.test.tsx` renders the real root layout + Home. On-device: **not yet verified**. |
| Navigation works | ✅ (test) | Home → Quick Training and Home → Diagnostics asserted via `expo-router/testing-library`. |
| TypeScript passes | ✅ | `npx tsc --noEmit` → exit 0 (strict, `noUncheckedIndexedAccess`). |
| Tests run | ✅ | `npx jest --ci` → **4/4 suites, 18/18 tests PASS**. |
| Lint | ✅ | `npx expo lint` → exit 0, 0 problems. |
| Android build works | ⚠️ JS + native config only | `expo export --platform android` → Hermes bundle produced. `expo prebuild` → `android/` generated, `applicationId com.ezbyname.galscoacher`. **Gradle/EAS build not run.** |
| iOS build path documented | ✅ | `expo export --platform ios` → Hermes bundle produced. `expo prebuild` → `ios/` generated, bundle id `com.ezbyname.galscoacher`. EAS `development` / `development-simulator` profiles + ARCHITECTURE §10. |

### Open gate items for the owner (Windows machine)

1. `npm install`
2. `npx eas-cli@latest login` then `npx eas-cli@latest init` (links the EAS project; adds `extra.eas.projectId` to app config — commit it).
3. `npm run build:android:dev` → install the APK on an Android phone.
4. `npm run start:dev-client` → open the app → Home appears → tap **Diagnostics** → expect `SQLite: ready · schema v1 (applied this launch: 1)`. Close and reopen → expect `applied this launch: 0` (proves the DB persisted and migrations are idempotent).
5. Tap **Test haptics** → the phone vibrates.
6. Record the results here.

### Files

- App config: `app.json`, `eas.json`, `package.json`, `tsconfig.json`, `eslint.config.js`, `jest.config.js`, `jest.setup.ts`, `.env.example`, `.gitignore`
- Routes: `src/app/_layout.tsx`, `index.tsx`, `quick-training.tsx`, `children.tsx`, `exercises.tsx`, `history.tsx`, `diagnostics.tsx`
- Domain: `src/domain/{measurement,sport,ids,index}.ts`
- Services: `src/services/{audio,haptics,clock,ids}/*`, `src/services/index.ts`
- Data: `src/data/local/database.ts`, `src/data/local/migrations/{index,runMigrations,types}.ts`, `src/data/remote/supabase.ts`
- Config: `src/config/env.ts`
- UI: `src/ui/{theme.ts,BigButton.tsx,PlaceholderScreen.tsx}`, `src/features/AppProvider.tsx`
- Docs: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/{PRODUCT_SPEC,ARCHITECTURE,ROADMAP,PROJECT_STATE}.md`, `supabase/README.md`

### DB changes

- Local SQLite v1: `app_meta (key TEXT PK, value TEXT)`. Versioned via `PRAGMA user_version`.
- Supabase: none (no project linked yet).

### Tests

| Suite | Tests |
|---|---|
| `domain/__tests__/measurement.test.ts` | 6 |
| `config/__tests__/env.test.ts` | 4 |
| `data/local/migrations/__tests__/runMigrations.test.ts` | 6 |
| `app/__tests__/navigation.test.tsx` | 2 |
| **Total** | **18 / 18 PASS** |

### Commands run

```
npx tsc --noEmit                                   → exit 0
npx expo lint                                      → exit 0
npx jest --ci                                      → 18/18 PASS
npx expo export --platform android --platform ios  → both Hermes bundles produced
npx expo prebuild --no-install --clean (scratch copy) → android/ + ios/ generated
npx expo-doctor                                    → 19/21; the 2 failures are network-only (schema + RN Directory fetch blocked in the authoring sandbox)
```

### iOS impact

None platform-specific. All native modules used (`expo-sqlite`, `expo-audio`,
`expo-haptics`, `expo-crypto`, `expo-router`) are cross-platform Expo modules.

### Known limitations

- No on-device run yet (see open gate items).
- `AudioCueService` is a silent stub; whistle assets and `expo-audio` implementation come in Phase 3.
- Supabase client is wired but no project, schema or RLS exists yet (Phase 1).
- Placeholder screens for Players / Exercises / Quick Training / History.
- Light theme only.

### Decisions taken in Phase 0

- **Expo SDK 57** (current stable) instead of 56: `expo-doctor` flags a Hermes V1 memory regression in SDK 56 that is fixed in SDK 57.
- App identifiers `com.ezbyname.galscoacher`, URL scheme `galscoacher` — change before the first store submission if desired.
- Jest 29 (`jest-expo` 57 is built on Jest 29).

### Next proposed phase

**Phase 1 — Family + Children**, after the open gate items above are recorded as passing.

---

## Proposals (architecture changes awaiting owner approval)

_None._
