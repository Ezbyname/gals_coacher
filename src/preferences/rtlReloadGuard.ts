import type { Direction } from '@/i18n/languages';

import { PREFERENCE_KEYS } from './keys';
import { asyncStoragePreferenceStore, type PreferenceStore } from './store';

/**
 * Reload-loop guard. Before a direction reload the target is recorded; after
 * the reload a matching direction clears it, and a still-wrong direction for
 * the same target means "do not reload again". Cleanup rules:
 * - cleared on every boot where the direction matches;
 * - cleared after a failed attempt is detected (no second reload);
 * - cleared when the reload call itself fails.
 *
 * Read errors propagate so the caller can fail safe (no reload).
 */
export async function readReloadTarget(
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<Direction | null> {
  const value = await store.getItem(PREFERENCE_KEYS.rtlReloadTarget);
  return value === 'rtl' || value === 'ltr' ? value : null;
}

export async function markReloadTarget(
  target: Direction,
  store: PreferenceStore = asyncStoragePreferenceStore,
): Promise<void> {
  await store.setItem(PREFERENCE_KEYS.rtlReloadTarget, target);
}

/** Best effort: never throws. */
export async function clearReloadTarget(store: PreferenceStore = asyncStoragePreferenceStore): Promise<void> {
  try {
    await store.removeItem(PREFERENCE_KEYS.rtlReloadTarget);
  } catch (e) {
    console.warn('[i18n] could not clear the reload guard.', e);
  }
}
