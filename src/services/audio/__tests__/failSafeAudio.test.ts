import { createServices } from '@/services';

import type { AudioCueService } from '../AudioCueService';
import { withAudioFailureSafety } from '../failSafeAudio';

function brokenAudio(): AudioCueService {
  return {
    preload: () => Promise.reject(new Error('asset missing')),
    play: () => {
      throw new Error('player gone');
    },
    release: () => {
      throw new Error('already released');
    },
  };
}

describe('withAudioFailureSafety', () => {
  it('resolves (never rejects) when preload fails, and reports it', async () => {
    const report = jest.fn();
    const audio = withAudioFailureSafety(brokenAudio(), report);
    await expect(audio.preload()).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith('preload', expect.objectContaining({ message: 'asset missing' }));
  });

  it('handles a preload that throws synchronously', async () => {
    const report = jest.fn();
    const audio = withAudioFailureSafety(
      {
        ...brokenAudio(),
        preload: () => {
          throw new Error('sync boom');
        },
      },
      report,
    );
    await expect(audio.preload()).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith('preload', expect.any(Error));
  });

  it('swallows play and release failures so training continues', () => {
    const report = jest.fn();
    const audio = withAudioFailureSafety(brokenAudio(), report);
    expect(() => audio.play('WHISTLE')).not.toThrow();
    expect(() => audio.release()).not.toThrow();
    expect(report.mock.calls.map((c) => c[0])).toEqual(['play', 'release']);
  });

  it('logs with console.warn by default', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await withAudioFailureSafety(brokenAudio()).preload();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[audio] preload failed'), expect.any(Error));
    spy.mockRestore();
  });

  it('passes calls through when audio works', async () => {
    const inner = { preload: jest.fn(async () => {}), play: jest.fn(), release: jest.fn() };
    const audio = withAudioFailureSafety(inner, jest.fn());
    await audio.preload();
    audio.play('DOUBLE_WHISTLE');
    audio.release();
    expect(inner.preload).toHaveBeenCalledTimes(1);
    expect(inner.play).toHaveBeenCalledWith('DOUBLE_WHISTLE');
    expect(inner.release).toHaveBeenCalledTimes(1);
  });

  it('the app composition root wires the fail-safe audio and an id service', async () => {
    const services = createServices();
    await expect(services.audio.preload()).resolves.toBeUndefined();
    expect(typeof services.ids.newUuid()).toBe('string');
  });
});
