/**
 * Hebrew strings — the source of truth for translation keys. Every key here
 * must exist in en.ts (enforced by the compiler and by parity tests).
 * Technical tokens (SQLite, Supabase, v1, numbers) stay as they are.
 */
export const he = {
  app: {
    name: 'Gals Coacher',
  },
  nav: {
    quickTraining: 'אימון מהיר',
    players: 'שחקנים',
    exercises: 'תרגילים',
    history: 'היסטוריה',
    diagnostics: 'בדיקות מערכת',
    settings: 'הגדרות',
  },
  home: {
    title: '🏀 מוכנים לאימון?',
    subtitle: 'בוחרים שחקן, בוחרים תרגיל, יוצאים לדרך.',
    quickTraining: 'אימון מהיר',
  },
  exercises: {
    libraryTitle: 'ספריית תרגילים',
  },
  common: {
    comingSoon: 'בקרוב',
    unknown: 'לא ידוע',
    cancel: 'ביטול',
    confirm: 'אישור',
  },
  language: {
    he: 'עברית',
    en: 'English',
  },
  settings: {
    language: 'שפה',
    restartTitle: 'החלפת שפה',
    restartBody: 'האפליקציה תופעל מחדש כדי להחיל את השפה ואת כיוון התצוגה.',
  },
  diagnostics: {
    platform: 'פלטפורמה',
    appVersion: 'גרסת אפליקציה',
    sqlite: 'SQLite',
    sqliteReady: 'מוכן · סכמה v{version} (הוחלו בהפעלה זו: {applied})',
    sqliteError: 'שגיאה · {message}',
    sqliteOpening: 'נפתח…',
    supabase: 'Supabase',
    supabaseConfigured: 'מוגדר',
    supabaseOffline: 'לא מוגדר (מצב לא מקוון בלבד)',
    testHaptics: 'בדיקת רטט',
    direction: 'כיוון תצוגה',
    directionValue: 'בפועל: {actual} · צפוי: {expected}',
    directionMismatch: 'אי־התאמה בכיוון התצוגה',
    rtlSample: 'דוגמת מדידות',
    rtlSampleValue: 'קליעות {shots} · אחוז {percent} · ספרינט {sprint} שנ׳ · מנוחה {rest} · מרחק {distance}',
  },
} as const;
