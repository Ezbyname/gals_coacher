/**
 * "Startup already completed" for the lifetime of the current JS runtime.
 *
 * Module scope lives exactly as long as the JS runtime:
 * - survives React root remounts — e.g. Android destroying and recreating the
 *   Activity while the app is in the background (process and JS runtime kept),
 *   which remounts RootLayout and StartupSplash from scratch;
 * - is reset by a new process (app killed / swiped away, then opened) and by a
 *   JS reload (`reloadAppAsync()` for a direction change), which both start a
 *   fresh runtime.
 * Nothing is persisted, so a later genuine cold start always gets its splash.
 */
export type StartupRuntime = {
  isComplete(): boolean;
  markComplete(): void;
};

export function createStartupRuntime(): StartupRuntime {
  let complete = false;
  return {
    isComplete: () => complete,
    markComplete: () => {
      complete = true;
    },
  };
}

/** The app's single instance (one per JS runtime). Tests inject their own. */
export const currentStartupRuntime: StartupRuntime = createStartupRuntime();
