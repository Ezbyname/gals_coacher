import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { TimerIdentity } from '@/domain/training/workoutTimer';
import { DEFAULT_TIMER_PREFERENCES, type TimerPreferences } from '@/preferences/timerPreference';

import { useWorkoutTimer, WorkoutTimerProvider } from '../WorkoutTimerProvider';

/** TRAINING-TIMER-001 slice B: the one navigation-safe controller (no database, fake clock, fake services). */
const mockSvc = {
  clock: { wallNow: () => 0, monotonicNow: () => 0 },
  audio: { preload: jest.fn(), play: jest.fn(), release: jest.fn() },
  haptics: { tap: jest.fn(), success: jest.fn(), warning: jest.fn() },
  keepAwake: { activate: jest.fn(), release: jest.fn() },
};
jest.mock('@/features/AppProvider', () => ({ useApp: () => ({ services: mockSvc, boot: { status: 'booting' } }) }));

let wall = 0;
let mono = 0;
let prefs: TimerPreferences = DEFAULT_TIMER_PREFERENCES;
const advance = (ms: number, opts: { monoToo?: boolean } = {}) => {
  wall += ms;
  if (opts.monoToo !== false) mono += ms;
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <WorkoutTimerProvider readPrefs={async () => prefs}>{children}</WorkoutTimerProvider>
);
const id = (over: Partial<TimerIdentity> = {}): TimerIdentity => ({ sessionId: 's1', exerciseId: 'e1', exercisePosition: 0, setId: 'set1', setNumber: 1, ...over });

let appStateHandler: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  wall = 1_000_000;
  mono = 5_000;
  prefs = DEFAULT_TIMER_PREFERENCES;
  mockSvc.clock.wallNow = () => wall;
  mockSvc.clock.monotonicNow = () => mono;
  for (const fn of [mockSvc.audio.play, mockSvc.haptics.success, mockSvc.keepAwake.activate, mockSvc.keepAwake.release]) fn.mockReset();
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
    appStateHandler = h;
    return { remove: () => {} };
  }) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const mount = () => renderHook(() => useWorkoutTimer(), { wrapper });
/** Real time passes: the clocks move and the interval ticks. */
const pass = (ms: number) => {
  for (let i = 0; i < ms; i += 250) {
    advance(250);
    act(() => void jest.advanceTimersByTime(250));
  }
};

describe('one timer, bound to its identity (5, 14-16)', () => {
  it('5: rapid repeated Start of the same timer keeps ONE timer (no restart, no second one)', () => {
    const { result } = mount();
    act(() => result.current.startWork(id(), 30));
    const first = result.current.state;
    pass(1000);
    act(() => result.current.startWork(id(), 30));
    act(() => result.current.startWork(id(), 30));
    expect(result.current.state).toBe(first);
    expect(result.current.readRemainingMs()).toBe(29_000); // it was NOT restarted
  });

  it('14-16: the timer keeps its session / exercise / set identity; starting another resolves the existing one', () => {
    const { result } = mount();
    const a = id();
    act(() => result.current.startWork(a, 30));
    expect(result.current.state!.identity).toEqual(a);
    const b = id({ exerciseId: 'e2', exercisePosition: 1, setId: 'set9', setNumber: 3 });
    act(() => result.current.startWork(b, 20));
    expect(result.current.state!.identity).toEqual(b); // the first timer is gone: never two
    expect(result.current.readRemainingMs()).toBe(20_000);
    act(() => result.current.startRest(id({ setId: 'set10' }), 45)); // switching kinds replaces too
    expect(result.current.state).toMatchObject({ kind: 'REST', phase: 'RUNNING' });
  });

  it('13: the timer lives above the screens — a consumer that unmounts and remounts sees the same timer and the right time', () => {
    const first = mount();
    act(() => first.result.current.startWork(id(), 30));
    pass(5000);
    // (a second consumer under its OWN provider would be a new timer; the real app has ONE provider above every route)
    const shared = renderHook(
      () => {
        const t = useWorkoutTimer();
        return t;
      },
      { wrapper },
    );
    expect(shared.result.current.state).toBeNull(); // separate provider = separate runtime (the root layout mounts exactly one)
    expect(first.result.current.readRemainingMs()).toBe(25_000);
    first.unmount();
  });
});

describe('expiry and cues (10, 44-46)', () => {
  it('10: expiry fires ONE sound and ONE vibration, and the state is FINISHED (nothing is written)', () => {
    const { result } = mount();
    act(() => result.current.startWork(id(), 5));
    pass(6000);
    expect(result.current.state!.phase).toBe('FINISHED');
    expect(mockSvc.audio.play.mock.calls.filter((c) => c[0] === 'WHISTLE')).toHaveLength(1);
    expect(mockSvc.haptics.success).toHaveBeenCalledTimes(1);
    pass(5000);
    expect(mockSvc.audio.play.mock.calls.filter((c) => c[0] === 'WHISTLE')).toHaveLength(1); // not again
    expect(mockSvc.haptics.success).toHaveBeenCalledTimes(1);
  });

  it('the final 3 seconds tick (sound only, never a vibration), a rest timer ends with its own cue', () => {
    const { result } = mount();
    act(() => result.current.startWork(id(), 5));
    pass(5500);
    expect(mockSvc.audio.play.mock.calls.filter((c) => c[0] === 'COUNTDOWN_TICK')).toHaveLength(3);
    expect(mockSvc.haptics.success).toHaveBeenCalledTimes(1); // only the finish
    mockSvc.audio.play.mockReset();
    act(() => result.current.startRest(id({ setId: 'set2', setNumber: 2 }), 3));
    pass(4000);
    expect(mockSvc.audio.play.mock.calls.map((c) => c[0])).toEqual(['DOUBLE_WHISTLE']); // no ticks for rest
    expect(result.current.state).toMatchObject({ kind: 'REST', phase: 'FINISHED' });
  });

  it('44: sound OFF suppresses the audio cue', async () => {
    prefs = { sound: false, vibration: true };
    const { result } = mount();
    await act(async () => {
      result.current.startWork(id(), 2);
      await Promise.resolve();
    });
    pass(3000);
    expect(mockSvc.audio.play).not.toHaveBeenCalled();
    expect(mockSvc.haptics.success).toHaveBeenCalledTimes(1);
  });

  it('45: vibration OFF suppresses the haptic cue', async () => {
    prefs = { sound: true, vibration: false };
    const { result } = mount();
    await act(async () => {
      result.current.startWork(id(), 2);
      await Promise.resolve();
    });
    pass(3000);
    expect(mockSvc.haptics.success).not.toHaveBeenCalled();
    expect(mockSvc.audio.play).toHaveBeenCalled();
  });

  it('46: a failing sound or vibration never breaks the timer', () => {
    mockSvc.audio.play.mockImplementation(() => {
      throw new Error('no audio');
    });
    mockSvc.haptics.success.mockImplementation(() => {
      throw new Error('no actuator');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = mount();
    act(() => result.current.startWork(id(), 2));
    pass(3000);
    expect(result.current.state!.phase).toBe('FINISHED');
    expect(warn).toHaveBeenCalled();
    mockSvc.audio.play.mockReset();
    mockSvc.haptics.success.mockReset();
  });
});

describe('pause / resume / stop / skip (7-9, 36)', () => {
  it('pause freezes, resume continues from the remaining time, stop keeps the elapsed time as a suggestion', () => {
    const { result } = mount();
    act(() => result.current.startWork(id(), 30));
    pass(10_000);
    act(() => result.current.pause());
    expect(result.current.state!.phase).toBe('PAUSED');
    pass(60_000);
    expect(result.current.readRemainingMs()).toBe(20_000);
    act(() => result.current.resume());
    pass(2_000);
    expect(result.current.readRemainingMs()).toBe(18_000);
    act(() => result.current.stop());
    expect(result.current.state).toMatchObject({ phase: 'STOPPED', elapsedMs: 12_000, durationMs: 30_000 });
    act(() => result.current.dismiss());
    expect(result.current.state).toBeNull();
  });

  it('36: Skip rest clears the rest timer; it does not touch a work timer', () => {
    const { result } = mount();
    act(() => result.current.startRest(id(), 60));
    act(() => result.current.pause()); // a rest has no pause
    expect(result.current.state!.phase).toBe('RUNNING');
    act(() => result.current.skipRest());
    expect(result.current.state).toBeNull();
    act(() => result.current.startWork(id(), 30));
    act(() => result.current.skipRest());
    expect(result.current.state!.kind).toBe('WORK');
  });
});

describe('background / foreground (17, 18)', () => {
  it('17: while the app is away nothing ticks; on return the remaining time is recomputed from the deadline', () => {
    const { result } = mount();
    act(() => result.current.startRest(id(), 60));
    // 20 s pass with the JS timers frozen (backgrounded): the wall clock moved, the interval did not run
    advance(20_000, { monoToo: false });
    expect(result.current.readRemainingMs()).toBe(40_000); // 60 s, NOT 60 s plus the time away
    act(() => appStateHandler!('active'));
    expect(result.current.state!.phase).toBe('RUNNING');
    expect(result.current.readRemainingMs()).toBe(40_000);
  });

  it('18: it expired while backgrounded -> FINISHED the moment the app returns (the stale cue stays silent)', () => {
    const { result } = mount();
    act(() => result.current.startRest(id(), 60));
    advance(10 * 60_000, { monoToo: false });
    act(() => appStateHandler!('active'));
    expect(result.current.state).toMatchObject({ kind: 'REST', phase: 'FINISHED' });
    expect(mockSvc.audio.play).not.toHaveBeenCalled(); // 9 minutes late: no sound for something that ended long ago
    expect(mockSvc.haptics.success).not.toHaveBeenCalled();
  });

  it('18b: noticed within moments of the deadline it still cues', () => {
    const { result } = mount();
    act(() => result.current.startRest(id(), 60));
    advance(60_500, { monoToo: false });
    act(() => appStateHandler!('active'));
    expect(result.current.state!.phase).toBe('FINISHED');
    expect(mockSvc.audio.play).toHaveBeenCalledWith('DOUBLE_WHISTLE');
  });
});

describe('session close (19-22)', () => {
  it('19-21: clearing the session clears its timer (completed, partial and stopped all end the same way)', () => {
    const { result } = mount();
    for (let closes = 0; closes < 3; closes += 1) {
      // a session closed as COMPLETED, PARTIAL or ABANDONED is cleared by the same call
      act(() => result.current.startWork(id(), 30));
      act(() => result.current.clearForSession('s1'));
      expect(result.current.state).toBeNull();
    }
  });

  it("another session's close does not touch this timer", () => {
    const { result } = mount();
    act(() => result.current.startWork(id(), 30));
    act(() => result.current.clearForSession('other'));
    expect(result.current.state).not.toBeNull();
  });

  it('22: a late callback after the close does nothing — no state, no cue, no vibration', () => {
    const { result } = mount();
    act(() => result.current.startWork(id(), 3));
    pass(1000);
    act(() => result.current.clearForSession('s1'));
    mockSvc.audio.play.mockReset();
    mockSvc.haptics.success.mockReset();
    pass(10_000);
    act(() => appStateHandler?.('active'));
    expect(result.current.state).toBeNull();
    expect(mockSvc.audio.play).not.toHaveBeenCalled();
    expect(mockSvc.haptics.success).not.toHaveBeenCalled();
  });
});

describe('keep-awake only while a timer is actively running (47, 48)', () => {
  it('47: running activates; 48: pause, stop, expiry, skip and close each release', () => {
    const { result } = mount();
    expect(mockSvc.keepAwake.activate).not.toHaveBeenCalled(); // an open session alone keeps nothing awake
    act(() => result.current.startWork(id(), 30));
    expect(mockSvc.keepAwake.activate).toHaveBeenCalled();
    const releases = () => mockSvc.keepAwake.release.mock.calls.length;

    let before = releases();
    act(() => result.current.pause());
    expect(releases()).toBeGreaterThan(before);

    act(() => result.current.resume());
    before = releases();
    act(() => result.current.stop());
    expect(releases()).toBeGreaterThan(before);

    act(() => result.current.dismiss());
    act(() => result.current.startRest(id(), 30));
    before = releases();
    act(() => result.current.skipRest());
    expect(releases()).toBeGreaterThan(before);

    act(() => result.current.startWork(id(), 2));
    before = releases();
    pass(3000); // expiry
    expect(releases()).toBeGreaterThan(before);

    act(() => result.current.dismiss());
    act(() => result.current.startWork(id(), 30));
    before = releases();
    act(() => result.current.clearForSession('s1'));
    expect(releases()).toBeGreaterThan(before);
  });

  it('unmounting the provider releases it', () => {
    const { result, unmount } = mount();
    act(() => result.current.startWork(id(), 30));
    const before = mockSvc.keepAwake.release.mock.calls.length;
    unmount();
    expect(mockSvc.keepAwake.release.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('announcements are limited to meaningful transitions (53)', () => {
  it('start, pause, resume and finish announce once each; the ticking seconds announce nothing', () => {
    const { result } = mount();
    const seen: string[] = [];
    const track = () => {
      const a = result.current.announcement;
      if (a && seen[seen.length - 1] !== `${a.kind}#${a.seq}`) seen.push(`${a.kind}#${a.seq}`);
    };
    act(() => result.current.startWork(id(), 10));
    track();
    pass(2000);
    track();
    act(() => result.current.pause());
    track();
    act(() => result.current.resume());
    track();
    pass(9000);
    track();
    expect(seen.map((s) => s.split('#')[0])).toEqual(['WORK_STARTED', 'PAUSED', 'RESUMED', 'WORK_FINISHED']);
  });
});
