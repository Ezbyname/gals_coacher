# Gals Coacher 🏀

A digital training companion for parents coaching their kids — basketball
first, built on a multi-sport core. Android first, iPhone ready.

- Product: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Current state: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md)

## Getting started (Windows / macOS / Linux)

Requirements: Node.js 22 LTS (22.13 or newer — tests use the built-in `node:sqlite`), npm, an Android phone (or emulator), a free Expo account.

```bash
git clone https://github.com/Ezbyname/gals_coacher.git
cd gals_coacher
npm install
copy .env.example .env        # macOS/Linux: cp .env.example .env  (optional — leave empty for offline-only)
npm run check                 # typecheck + lint + tests
```

### Run on Android (development build)

The app uses native modules (SQLite, audio, haptics), so use a development build rather than Expo Go:

```bash
npx eas-cli@latest login
npx eas-cli@latest init       # first time only — links the EAS project
npm run build:android:dev     # builds an APK in the cloud; install it on your phone
npm run start:dev-client      # then open the installed app
```

With Android Studio installed you can build locally instead: `npm run android`.

### iOS

No Mac needed — EAS builds in the cloud:

- Simulator build: `npm run build:ios:sim`
- Device build: `npm run build:ios:dev` (requires an Apple Developer account)
