/**
 * Decides when the startup splash may go away. Opens exactly once, when the
 * minimum display time has passed AND language/direction are settled AND the
 * app's own initialization has finished. Presentation only: it never decides
 * language, direction or reloads (I18nProvider owns those).
 */
export type StartupGate = {
  markTimeElapsed(): void;
  markI18nReady(): void;
  markAppReady(): void;
  isOpen(): boolean;
};

export function createStartupGate(onOpen: () => void): StartupGate {
  const done = { time: false, i18n: false, app: false };
  let open = false;
  const check = () => {
    if (!open && done.time && done.i18n && done.app) {
      open = true;
      onOpen();
    }
  };
  return {
    markTimeElapsed: () => {
      done.time = true;
      check();
    },
    markI18nReady: () => {
      done.i18n = true;
      check();
    },
    markAppReady: () => {
      done.app = true;
      check();
    },
    isOpen: () => open,
  };
}

/** Minimum time the coach artwork stays up on a cold start. */
export const STARTUP_SPLASH_MIN_MS = 5000;

/** Background behind the artwork; matches the native splash colour (average of the artwork). */
export const STARTUP_SPLASH_BACKGROUND = '#A9886F';
