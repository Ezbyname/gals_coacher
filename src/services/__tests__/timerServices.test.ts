import { withAudioFailureSafety } from '../audio/failSafeAudio';
import { createExpoAudioCueService } from '../audio/ExpoAudioCueService';
import { createExpoKeepAwakeService, TIMER_KEEP_AWAKE_TAG } from '../keepAwake/KeepAwakeService';

const mockPlayers: { play: jest.Mock; seekTo: jest.Mock; release: jest.Mock }[] = [];
const mockSetMode = jest.fn(() => Promise.resolve());
const mockCreate = jest.fn(() => {
  const p = { play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), release: jest.fn() };
  mockPlayers.push(p);
  return p;
});
jest.mock('expo-audio', () => ({
  setAudioModeAsync: (...a: unknown[]) => mockSetMode(...(a as [])),
  createAudioPlayer: (...a: unknown[]) => mockCreate(...(a as [])),
}));
const mockActivate = jest.fn(() => Promise.resolve());
const mockDeactivate = jest.fn(() => Promise.resolve());
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: (...a: unknown[]) => mockActivate(...(a as [])),
  deactivateKeepAwake: (...a: unknown[]) => mockDeactivate(...(a as [])),
}));

beforeEach(() => {
  mockPlayers.length = 0;
  for (const m of [mockSetMode, mockCreate, mockActivate, mockDeactivate]) m.mockClear();
});

describe('AudioCueService (expo-audio)', () => {
  it('preloads the three original tones, plays a cue from the start, and releases everything', async () => {
    const audio = createExpoAudioCueService();
    await audio.preload();
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockSetMode).toHaveBeenCalledWith({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
    audio.play('COUNTDOWN_TICK');
    audio.play('WHISTLE');
    audio.play('DOUBLE_WHISTLE');
    for (const p of mockPlayers) {
      expect(p.seekTo).toHaveBeenCalledWith(0);
      expect(p.play).toHaveBeenCalledTimes(1);
    }
    audio.release();
    for (const p of mockPlayers) expect(p.release).toHaveBeenCalledTimes(1);
    audio.play('WHISTLE'); // after release: silent, no throw
    expect(mockPlayers[1]!.play).toHaveBeenCalledTimes(1);
  });

  it('a cue before preload is silent, and a failing native module never throws through the safety wrapper', async () => {
    const audio = createExpoAudioCueService();
    expect(() => audio.play('WHISTLE')).not.toThrow();
    mockSetMode.mockImplementationOnce(() => Promise.reject(new Error('no audio device')));
    const safe = withAudioFailureSafety(createExpoAudioCueService(), () => {});
    await expect(safe.preload()).resolves.toBeUndefined();
    expect(() => safe.play('WHISTLE')).not.toThrow();
  });
});

describe('KeepAwakeService', () => {
  it('activates once, releases once, and releasing without activating does nothing', () => {
    const k = createExpoKeepAwakeService();
    k.release();
    expect(mockDeactivate).not.toHaveBeenCalled();
    k.activate();
    k.activate();
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockActivate).toHaveBeenCalledWith(TIMER_KEEP_AWAKE_TAG);
    k.release();
    k.release();
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockDeactivate).toHaveBeenCalledWith(TIMER_KEEP_AWAKE_TAG);
  });

  it('a failing native call is swallowed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockActivate.mockImplementationOnce(() => Promise.reject(new Error('nope')));
    const k = createExpoKeepAwakeService();
    expect(() => k.activate()).not.toThrow();
    await Promise.resolve();
    warn.mockRestore();
  });
});
