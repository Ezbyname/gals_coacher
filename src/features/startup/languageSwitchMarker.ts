import { asyncStoragePreferenceStore, type PreferenceStore } from '@/preferences/store';

/**
 * Transient marker that tells the startup splash "this start is the reload of
 * an explicit language change", so the cold-start minimum is not applied.
 * Presentation only: it never decides language or direction.
 *
 * - Written only by the Settings language-change path, right before the reload.
 * - Consumed (removed) on the next start, whether it is used or not.
 * - Honoured only if fresh: a marker left behind by a crash or a cancelled
 *   reload cannot make a later genuine cold start skip its splash.
 */
export const LANGUAGE_SWITCH_MARKER_KEY = '@gals-coacher/startup.languageSwitchAt';

/** A language-change reload normally restarts within a few seconds. */
export const LANGUAGE_SWITCH_MARKER_TTL_MS = 30_000;

export async function markLanguageSwitch(
  now: number = Date.now(),
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<void> {
  await store.setItem(LANGUAGE_SWITCH_MARKER_KEY, String(now));
}

/** Best effort: never throws. */
export async function clearLanguageSwitch(store: PreferenceStore = asyncStoragePreferenceStore): Promise<void> {
  try {
    await store.removeItem(LANGUAGE_SWITCH_MARKER_KEY);
  } catch (e) {
    console.warn('[splash] could not clear the language-switch marker.', e);
  }
}

/**
 * Reads and removes the marker. True only for a fresh marker. Any failure
 * means "genuine cold start" (the minimum splash applies).
 */
export async function consumeLanguageSwitch(
  now: number = Date.now(),
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = await store.getItem(LANGUAGE_SWITCH_MARKER_KEY);
  } catch (e) {
    console.warn('[splash] could not read the language-switch marker.', e);
    return false;
  }
  if (raw === null) return false;
  await clearLanguageSwitch(store);
  const at = Number(raw);
  return Number.isFinite(at) && at <= now && now - at <= LANGUAGE_SWITCH_MARKER_TTL_MS;
}
