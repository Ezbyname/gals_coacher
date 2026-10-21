import type { AudioCueService } from './audio/AudioCueService';
import { createExpoAudioCueService } from './audio/ExpoAudioCueService';
import { withAudioFailureSafety } from './audio/failSafeAudio';
import { systemClock, type Clock } from './clock/Clock';
import { createNativeDirectionService, type DirectionService } from './direction/DirectionService';
import { createExpoHapticsService, type HapticsService } from './haptics/HapticsService';
import { createExpoIdService, type IdService } from './ids/IdService';
import { createExpoKeepAwakeService, type KeepAwakeService } from './keepAwake/KeepAwakeService';

export type Services = {
  audio: AudioCueService;
  haptics: HapticsService;
  clock: Clock;
  ids: IdService;
  direction: DirectionService;
  keepAwake: KeepAwakeService;
};

/** Composition root for platform services. Tests build their own Services. */
export function createServices(): Services {
  return {
    audio: withAudioFailureSafety(createExpoAudioCueService()),
    haptics: createExpoHapticsService(),
    clock: systemClock,
    ids: createExpoIdService(),
    direction: createNativeDirectionService(),
    keepAwake: createExpoKeepAwakeService(),
  };
}
