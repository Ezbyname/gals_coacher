import type { Href } from 'expo-router';

import type { TranslationKey } from '@/i18n/types';

export type MainDestinationKey = 'home' | 'players' | 'exercises' | 'settings';

export type MainDestination = {
  readonly key: MainDestinationKey;
  readonly href: Href;
  /** The destination's screen in the root stack. */
  readonly route: string;
  readonly label: TranslationKey;
  /** Icon glyph (the app has no icon font); always shown with its label. */
  readonly glyph: string;
};

/** The main navigation (NAV-001), in reading order (it mirrors in Hebrew RTL). */
export const MAIN_DESTINATIONS: readonly MainDestination[] = [
  { key: 'home', href: '/', route: 'index', label: 'nav.home', glyph: '🏠' },
  { key: 'players', href: '/children', route: 'children/index', label: 'nav.players', glyph: '👥' },
  { key: 'exercises', href: '/exercises', route: 'exercises', label: 'nav.exercises', glyph: '🏋️' },
  { key: 'settings', href: '/settings', route: 'settings', label: 'nav.settings', glyph: '⚙️' },
];

/**
 * Which main destination the current path belongs to: Players covers every
 * player screen (edit, self-assessment, schedule…); Home also covers the
 * pages opened from it (Quick Training, History, Diagnostics).
 */
export function activeDestination(pathname: string): MainDestinationKey {
  if (pathname === '/children' || pathname.startsWith('/children/')) return 'players';
  if (pathname === '/exercises') return 'exercises';
  if (pathname === '/settings') return 'settings';
  return 'home';
}

type NavState = { readonly index?: number; readonly routes: readonly { name: string; state?: unknown }[] };

/**
 * The app's screen stack (bottom to top) from the router's root state. Expo
 * Router wraps the root layout's Stack in a single `__root` route; the
 * screens are its nested state.
 */
export function screenStack(rootState: unknown): { routes: string[]; current: string | undefined } {
  let state = rootState as NavState | undefined;
  while (state && state.routes.length === 1 && state.routes[0]!.name === '__root' && state.routes[0]!.state) {
    state = state.routes[0]!.state as NavState;
  }
  const routes = (state?.routes ?? []).map((route) => route.name);
  return { routes, current: routes[state?.index ?? routes.length - 1] };
}
