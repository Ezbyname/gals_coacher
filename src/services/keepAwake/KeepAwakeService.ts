/**
 * TRAINING-TIMER-001. Keeps the screen on ONLY while a workout timer is actively running. Best-effort: a failure here can
 * never affect a workout. Idempotent: activating twice or releasing without activating is harmless.
 */
export interface KeepAwakeService {
  activate(): void;
  release(): void;
}

export const TIMER_KEEP_AWAKE_TAG = 'gals-coacher-workout-timer';

export function createExpoKeepAwakeService(): KeepAwakeService {
  let active = false;
  // Loaded lazily so a missing native module (tests, web) never breaks start-up.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require('expo-keep-awake') as typeof import('expo-keep-awake');
  return {
    activate: () => {
      if (active) return;
      active = true;
      try {
        void load()
          .activateKeepAwakeAsync(TIMER_KEEP_AWAKE_TAG)
          .catch((e: unknown) => console.warn('[timer] keep-awake activate failed', e));
      } catch (e) {
        console.warn('[timer] keep-awake unavailable', e);
      }
    },
    release: () => {
      if (!active) return;
      active = false;
      try {
        void load()
          .deactivateKeepAwake(TIMER_KEEP_AWAKE_TAG)
          .catch((e: unknown) => console.warn('[timer] keep-awake release failed', e));
      } catch (e) {
        console.warn('[timer] keep-awake unavailable', e);
      }
    },
  };
}

export function createSilentKeepAwakeService(): KeepAwakeService {
  return { activate: () => {}, release: () => {} };
}
