/**
 * ActivePlayerContext — WHICH Player a Player-specific training action is for
 * (TRAIN-QUICKBUILD-001A).
 *
 * UX / navigation context only. It never grants or implies authorization:
 * today the app is Coach / Family mode on one device, and a future backend
 * decides access on its own (User != Player; a Coach sees linked Players; an
 * authenticated Player sees only self). There is no Player Mode here.
 *
 * Sources:
 *  - 'route': a Player-specific screen (Players → Daniel → Training). Every
 *    action under that route is for that Player; nobody asks again.
 *  - 'explicit-selection': a global flow (e.g. a future Quick Add) chose the
 *    Player. The flow owns that choice; it ends with the flow.
 * A future authenticated Player resolves as one more source ('auth-self'),
 * added with real Auth — not before.
 *
 * Lifetime: the context exists only inside the screen subtree that provides it.
 * There is no app-wide "current Player", so leaving a Player's area leaves no
 * stale target behind.
 */

export type ActivePlayerSource = 'route' | 'explicit-selection';

export interface ActivePlayerRef {
  readonly id: string;
  readonly name: string;
}

export type ActivePlayerContextValue =
  | {
      readonly status: 'resolved';
      readonly activePlayerId: string;
      readonly activePlayer: ActivePlayerRef;
      readonly source: ActivePlayerSource;
    }
  /** The Player is known by id but not loaded yet: nothing may act for it yet. */
  | { readonly status: 'loading'; readonly activePlayerId: string; readonly source: ActivePlayerSource }
  /** No Player: outside any Player context, unknown id, or the load failed. */
  | { readonly status: 'unresolved'; readonly reason: 'none' | 'not-found' | 'error' };

/** Outside every provider: no Player. Never a default Player. */
export const NO_ACTIVE_PLAYER: ActivePlayerContextValue = { status: 'unresolved', reason: 'none' };

/** A Player-specific training operation was attempted without a resolved Player. */
export class MissingPlayerContextError extends Error {
  constructor(readonly context: ActivePlayerContextValue) {
    super(`A Player-specific training action needs a resolved Player (context: ${context.status}).`);
    this.name = 'MissingPlayerContextError';
  }
}

/**
 * THE guard for Player-specific training operations: returns the Player the
 * action is for, or throws. Call it at the action boundary instead of ad-hoc
 * `if (!playerId)` checks.
 */
export function requireActivePlayer(context: ActivePlayerContextValue): ActivePlayerRef {
  if (context.status !== 'resolved') throw new MissingPlayerContextError(context);
  return context.activePlayer;
}

/**
 * Target of a GLOBAL flow (one not under a Player's route):
 *  - no Players: nothing to target;
 *  - exactly one Player: safe preselection, shown to the Coach as the target;
 *  - several Players: the Coach must choose explicitly — never a guess, never
 *    the Player used last.
 */
export type GlobalPlayerTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'preselected'; readonly player: ActivePlayerRef }
  | { readonly kind: 'choose'; readonly players: readonly ActivePlayerRef[] };

export function resolveGlobalTarget(players: readonly ActivePlayerRef[]): GlobalPlayerTarget {
  if (players.length === 0) return { kind: 'none' };
  if (players.length === 1) return { kind: 'preselected', player: players[0]! };
  return { kind: 'choose', players };
}
