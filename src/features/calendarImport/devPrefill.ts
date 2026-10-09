/**
 * QA / DEVELOPMENT-ONLY pre-fill of the import text (CAL-TEXT-IMPORT-001C).
 *
 * Python Product QA cannot type Hebrew, emoji or line breaks through
 * `adb input text`, so a development build accepts the text as the route
 * parameter `qaText` (URL-encoded), e.g.
 *   galscoacher://children/<playerId>/schedule/import?qaText=<encoded text>
 *
 * Gate: the value is used ONLY when `isDev` is true — the screen passes React
 * Native's `__DEV__`, which is false in every release / preview build, so a
 * production app ignores the parameter entirely (proven by Jest). No fixture
 * text ships in the app; the test sends it. Physical QA (001E) pastes for real.
 */
export function devPrefillText(param: unknown, isDev: boolean): string | null {
  if (!isDev) return null;
  const value = Array.isArray(param) ? param[0] : param;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
