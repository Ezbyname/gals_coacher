import type { AudioCue, AudioCueService } from './AudioCueService';

/**
 * TRAINING-TIMER-001: the expo-audio implementation of the existing AudioCueService. The three cues are short ORIGINAL
 * tones synthesised for this app (assets/sounds, no third-party audio). Cue names keep the interface's vocabulary:
 *   COUNTDOWN_TICK  the final-seconds tick            (timer-tick.wav)
 *   WHISTLE         a work timer ran to zero          (timer-finish.wav)
 *   DOUBLE_WHISTLE  a rest timer ran to zero          (timer-rest.wav)
 * Always wrapped by `withAudioFailureSafety`: a sound problem is reported and swallowed, never blocking a workout.
 * Android: with `playsInSilentMode` the cue still plays when the ringer is silent; the media volume still governs it.
 */
type Player = { play(): void; seekTo(seconds: number): Promise<void>; release(): void };

export function createExpoAudioCueService(): AudioCueService {
  const players = new Map<AudioCue, Player>();
  return {
    preload: async () => {
      // Loaded lazily: the native module is only needed on a device.
      const audio = require('expo-audio') as typeof import('expo-audio');
      await audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
      const sources: Record<AudioCue, number> = {
        COUNTDOWN_TICK: require('../../../assets/sounds/timer-tick.wav'),
        WHISTLE: require('../../../assets/sounds/timer-finish.wav'),
        DOUBLE_WHISTLE: require('../../../assets/sounds/timer-rest.wav'),
      };
      for (const cue of Object.keys(sources) as AudioCue[]) players.set(cue, audio.createAudioPlayer(sources[cue]) as unknown as Player);
    },
    play: (cue) => {
      const player = players.get(cue);
      if (!player) return; // not loaded (yet): training goes on without sound
      void player.seekTo(0).catch(() => {});
      player.play();
    },
    release: () => {
      for (const player of players.values()) player.release();
      players.clear();
    },
  };
}
