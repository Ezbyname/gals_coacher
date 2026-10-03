import type { Messages } from './types';

/** English strings. Must have exactly the keys of he.ts. */
export const en = {
  app: {
    name: 'Gals Coacher',
  },
  nav: {
    quickTraining: 'Quick Training',
    players: 'Players',
    exercises: 'Exercises',
    history: 'History',
    diagnostics: 'Diagnostics',
    settings: 'Settings',
  },
  home: {
    title: '🏀 Ready to train?',
    subtitle: 'Pick a player, pick a drill, go.',
    quickTraining: 'QUICK TRAINING',
  },
  exercises: {
    libraryTitle: 'Exercise Library',
  },
  common: {
    comingSoon: 'Coming soon',
    unknown: 'unknown',
    cancel: 'Cancel',
    confirm: 'OK',
  },
  language: {
    he: 'עברית',
    en: 'English',
  },
  settings: {
    language: 'Language',
    restartTitle: 'Change language',
    restartBody: 'The app will restart to apply the language and layout direction.',
  },
  diagnostics: {
    platform: 'Platform',
    appVersion: 'App version',
    sqlite: 'SQLite',
    sqliteReady: 'ready · schema v{version} (applied this launch: {applied})',
    sqliteError: 'ERROR · {message}',
    sqliteOpening: 'opening…',
    supabase: 'Supabase',
    supabaseConfigured: 'configured',
    supabaseOffline: 'not configured (offline only)',
    testHaptics: 'Test haptics',
    direction: 'Layout direction',
    directionValue: 'actual: {actual} · expected: {expected}',
    directionMismatch: 'Layout direction mismatch',
    rtlSample: 'Measurement sample',
    rtlSampleValue: 'shots {shots} · percent {percent} · sprint {sprint} s · rest {rest} · distance {distance}',
  },
} satisfies Messages;
