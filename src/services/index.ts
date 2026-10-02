import { createSilentAudioCueService, type AudioCueService } from './audio/AudioCueService';
import { systemClock, type Clock } from './clock/Clock';
import { createExpoHapticsService, type HapticsService } from './haptics/HapticsService';

export type Services = {
  audio: AudioCueService;
  haptics: HapticsService;
  clock: Clock;
};

/** Composition root for platform services. Tests build their own Services. */
export function createServices(): Services {
  return {
    audio: createSilentAudioCueService(),
    haptics: createExpoHapticsService(),
    clock: systemClock,
  };
}
