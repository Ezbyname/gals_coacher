/**
 * Platform-neutral audio cues for the training engine. Screens and the engine
 * depend on this interface only — never on expo-audio or a platform player.
 * If iOS/Android ever need different behaviour, add AudioCueService.ios.ts /
 * .android.ts implementations behind the same interface.
 */
export type AudioCue = 'WHISTLE' | 'DOUBLE_WHISTLE' | 'COUNTDOWN_TICK';

export interface AudioCueService {
  /** Load all cue assets from the local bundle. Must finish before a workout starts. */
  preload(): Promise<void>;
  play(cue: AudioCue): void;
  release(): void;
}

/**
 * Phase 0 placeholder: the whistle assets and the expo-audio implementation
 * arrive in Phase 3 (Training Engine). Keeps callers compiling and testable.
 */
export function createSilentAudioCueService(): AudioCueService {
  return {
    preload: async () => {},
    play: () => {},
    release: () => {},
  };
}
