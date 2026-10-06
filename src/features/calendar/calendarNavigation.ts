import { router, type Href } from 'expo-router';

export const schedulePath = (playerId: string) => `/children/${playerId}/schedule` as const;
export const newEventPath = (playerId: string) => `/children/${playerId}/schedule/new` as const;
export const eventPath = (playerId: string, eventId: string) =>
  `/children/${playerId}/schedule/${eventId}` as const;
export const editEventPath = (playerId: string, eventId: string) =>
  `/children/${playerId}/schedule/${eventId}/edit` as const;

/** Route names in the root stack (src/app/children/[id]/schedule/…). */
export const SCHEDULE_ROUTE = 'children/[id]/schedule/index';
export const EVENT_ROUTE = 'children/[id]/schedule/[eventId]/index';
/** The Full Calendar (src/app/calendar.tsx). */
export const FULL_CALENDAR_ROUTE = 'calendar';

type StackState = { index: number; routes: { name: string; params?: object }[] };
type Navigation = { getState(): unknown };

/**
 * Leaves the current screen for `target`. When that exact screen is directly
 * underneath (the normal flow), this is one plain step back — the same action
 * as the header / Android back button, so no duplicate stack entry is made.
 * Otherwise (e.g. a deep link) the target replaces the current screen.
 * `orBackTo` names other screens that are just as good to return to when
 * they are directly underneath (e.g. the Full Calendar an event was opened from).
 */
export function leaveTo(
  navigation: Navigation,
  target: { route: string; params: Record<string, string>; path: Href },
  orBackTo: readonly string[] = [],
): void {
  const state = navigation.getState() as StackState | undefined;
  const below = state?.routes[state.index - 1];
  const params = (below?.params ?? {}) as Record<string, unknown>;
  const matches =
    below?.name === target.route &&
    Object.entries(target.params).every(([key, value]) => params[key] === value);
  if (matches || (below !== undefined && orBackTo.includes(below.name))) router.back();
  else router.replace(target.path);
}
