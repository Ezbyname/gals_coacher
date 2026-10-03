import { createSilentAudioCueService, type AudioCueService } from './audio/AudioCueService';
import { withAudioFailureSafety } from './audio/failSafeAudio';
import { systemClock, type Clock } from './clock/Clock';
import { createNativeDirectionService, type DirectionService } from './direction/DirectionService';
import { createExpoHapticsService, type HapticsService } from './haptics/HapticsService';
import { createExpoIdService, type IdService } from './ids/IdService';

export type Services = {
  audio: AudioCueService;
  haptics: HapticsService;
  clock: Clock;
  ids: IdService;
  direction: DirectionService;
};

/** Composition root for platform services. Tests build their own Services. */
export function createServices(): Services {
  return {
    audio: withAudioFailureSafety(createSilentAudioCueService()),
    haptics: createExpoHapticsService(),
    clock: systemClock,
    ids: createExpoIdService(),
    direction: createNativeDirectionService(),
  };
}
