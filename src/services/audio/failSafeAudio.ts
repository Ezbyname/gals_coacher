import type { AudioCueService } from './AudioCueService';

export type AudioErrorReporter = (operation: 'preload' | 'play' | 'release', error: unknown) => void;

const warn: AudioErrorReporter = (operation, error) => {
  console.warn(`[audio] ${operation} failed; continuing without sound.`, error);
};

/**
 * Wraps an AudioCueService so audio problems can never break training: a
 * failed preload resolves instead of rejecting, and a failed play or release
 * is reported and swallowed. Timers and results never depend on sound.
 */
export function withAudioFailureSafety(
  inner: AudioCueService,
  report: AudioErrorReporter = warn,
): AudioCueService {
  return {
    preload: async () => {
      try {
        await inner.preload();
      } catch (error) {
        report('preload', error);
      }
    },
    play: (cue) => {
      try {
        inner.play(cue);
      } catch (error) {
        report('play', error);
      }
    },
    release: () => {
      try {
        inner.release();
      } catch (error) {
        report('release', error);
      }
    },
  };
}
