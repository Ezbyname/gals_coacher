/**
 * Time source for the training engine. Timers derive elapsed time from
 * timestamps (start vs. now) — never by counting setInterval ticks — so a
 * stalled JS thread cannot change a measured result. See ARCHITECTURE.md §Timer.
 */
export interface Clock {
  /** Monotonic milliseconds, unaffected by wall-clock changes. */
  monotonicNow(): number;
  /** Wall-clock epoch milliseconds, for persisting when something happened. */
  wallNow(): number;
}

export const systemClock: Clock = {
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
};
