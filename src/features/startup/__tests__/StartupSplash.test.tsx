import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Animated, AppState, Text } from 'react-native';

import { I18nProvider } from '@/i18n/I18nProvider';
import { PREFERENCE_KEYS } from '@/preferences/keys';
import type { PreferenceStore } from '@/preferences/store';
import { createFakeDirectionService } from '@/test-support/fakeDirection';

import { LANGUAGE_SWITCH_MARKER_KEY, LANGUAGE_SWITCH_MARKER_TTL_MS } from '../languageSwitchMarker';
import { StartupSplash, useStartupSignals } from '../StartupSplash';
import { createStartupRuntime, type StartupRuntime } from '../startupRuntime';

const memoryStore = (initial: Record<string, string> = {}): PreferenceStore & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
};

/** Stand-in for StartupReadySignal with manual control of app readiness. */
function Signals({ appReady }: { appReady: boolean }) {
  const { markI18nReady, markAppReady } = useStartupSignals();
  markI18nReady();
  if (appReady) markAppReady();
  return <Text testID="home">Home</Text>;
}

// The splash is hidden from accessibility on purpose, so queries must include hidden elements.
const splash = () => screen.queryByTestId('startup-splash', { includeHiddenElements: true });
const layoutSplash = () =>
  fireEvent(splash()!, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });

async function flush(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Each test starts as a fresh JS runtime (a new app process). */
let runtime: StartupRuntime;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  runtime = createStartupRuntime();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('StartupSplash', () => {
  it('shows the coach artwork immediately and keeps it for the minimum time', async () => {
    render(
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <Signals appReady />
      </StartupSplash>,
    );
    expect(splash()).not.toBeNull();
    await flush(4900);
    expect(splash()).not.toBeNull();
    await flush(100 + 400); // minimum reached + fade-out
    expect(splash()).toBeNull();
  });

  it('stays up past the minimum while the app is not ready, then dismisses once ready', async () => {
    const { rerender } = render(
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <Signals appReady={false} />
      </StartupSplash>,
    );
    await flush(8000);
    expect(splash()).not.toBeNull();
    rerender(
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <Signals appReady />
      </StartupSplash>,
    );
    await flush(400);
    expect(splash()).toBeNull();
  });

  it('hides the native splash only after its own surface is laid out and i18n is ready', async () => {
    render(
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <Signals appReady />
      </StartupSplash>,
    );
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    layoutSplash();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it('6. while direction is unresolved (reload pending) Home never renders and the splash stays', async () => {
    const direction = createFakeDirectionService(false, () => new Promise<void>(() => {})); // reload never returns
    render(
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <I18nProvider direction={direction} store={memoryStore()}>
          <Signals appReady />
        </I18nProvider>
      </StartupSplash>,
    );
    layoutSplash();
    await flush(10000);
    expect(direction.calls).toEqual(['apply:rtl', 'reload']);
    expect(screen.queryByTestId('home')).toBeNull();
    expect(splash()).not.toBeNull();
    // The native splash keeps covering the direction reload.
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  it('a completed startup is not replayed when the same tree re-renders', async () => {
    const addListener = jest.spyOn(AppState, 'addEventListener');
    const ui = (
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <Signals appReady />
      </StartupSplash>
    );
    const { rerender } = render(ui);
    await flush(5500);
    expect(splash()).toBeNull();
    // Returning to the foreground re-renders the same tree; nothing restarts the splash.
    rerender(ui);
    await flush(10000);
    expect(splash()).toBeNull();
    expect(addListener).not.toHaveBeenCalled();
  });

  it('still dismisses if the fade-out animation throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Animated, 'timing').mockImplementation(() => {
      throw new Error('animation unavailable');
    });
    render(
      <StartupSplash runtime={runtime} minDurationMs={5000}>
        <Signals appReady />
      </StartupSplash>,
    );
    await flush(5000);
    expect(splash()).toBeNull();
    expect(screen.getByTestId('home')).toBeTruthy();
    warn.mockRestore();
  });

  it('never mirrors the artwork and draws no text over it', () => {
    render(
      <StartupSplash runtime={runtime}>
        <Signals appReady={false} />
      </StartupSplash>,
    );
    const overlay = splash()!;
    expect(JSON.stringify(overlay.props.style)).not.toMatch(/scaleX|transform/);
    // Animated.Image → Image → native image: every layer of the one artwork.
    const images = overlay.findAll((n) => n.props.resizeMode !== undefined);
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.props.resizeMode).toBe('cover');
      expect(JSON.stringify(img.props.style)).not.toMatch(/scaleX|transform/);
    }
    expect(overlay.findAll((n) => typeof n.props.children === 'string')).toHaveLength(0);
  });

  describe('cold start vs. language-change reload', () => {
    const NOW = 1_000_000;

    it('1. cold start: minimum not reached + app ready → splash remains', async () => {
      render(
        <StartupSplash runtime={runtime} minDurationMs={5000} store={memoryStore()} now={() => NOW}>
          <Signals appReady />
        </StartupSplash>,
      );
      await flush(4000);
      expect(splash()).not.toBeNull();
    });

    it('2. cold start: minimum reached + app ready → splash dismisses', async () => {
      render(
        <StartupSplash runtime={runtime} minDurationMs={5000} store={memoryStore()} now={() => NOW}>
          <Signals appReady />
        </StartupSplash>,
      );
      await flush(5000 + 400);
      expect(splash()).toBeNull();
    });

    it('3. language-change reload: dismisses as soon as the app is ready, no 5 s minimum', async () => {
      const store = memoryStore({ [LANGUAGE_SWITCH_MARKER_KEY]: String(NOW - 1500) });
      render(
        <StartupSplash runtime={runtime} minDurationMs={5000} store={store} now={() => NOW}>
          <Signals appReady />
        </StartupSplash>,
      );
      await flush(0); // marker read settles (async storage)
      await flush(400); // fade-out only — far below the 5 s minimum
      expect(splash()).toBeNull();
      expect(store.data.has(LANGUAGE_SWITCH_MARKER_KEY)).toBe(false); // consumed
    });

    it('3b. language-change reload still waits for direction/app readiness', async () => {
      const store = memoryStore({ [LANGUAGE_SWITCH_MARKER_KEY]: String(NOW - 1500) });
      render(
        <StartupSplash runtime={runtime} minDurationMs={5000} store={store} now={() => NOW}>
          <Signals appReady={false} />
        </StartupSplash>,
      );
      await flush(10000);
      expect(splash()).not.toBeNull();
    });

    it('5. a stale marker does not shorten a later genuine cold start', async () => {
      const store = memoryStore({
        [LANGUAGE_SWITCH_MARKER_KEY]: String(NOW - LANGUAGE_SWITCH_MARKER_TTL_MS - 1),
      });
      render(
        <StartupSplash runtime={runtime} minDurationMs={5000} store={store} now={() => NOW}>
          <Signals appReady />
        </StartupSplash>,
      );
      await flush(0); // marker read settles (async storage)
      await flush(4000);
      expect(splash()).not.toBeNull();
      expect(store.data.has(LANGUAGE_SWITCH_MARKER_KEY)).toBe(false);
    });

    it('6. the automatic first-launch RTL correction keeps the cold-start minimum', async () => {
      // After the first-launch reload only the RTL reload guard is present — no language-switch marker.
      const store = memoryStore({ [PREFERENCE_KEYS.rtlReloadTarget]: 'rtl' });
      render(
        <StartupSplash runtime={runtime} minDurationMs={5000} store={store} now={() => NOW}>
          <I18nProvider direction={createFakeDirectionService(true)} store={store}>
            <Signals appReady />
          </I18nProvider>
        </StartupSplash>,
      );
      layoutSplash();
      await flush(4000);
      expect(screen.getByTestId('home')).toBeTruthy(); // settled underneath
      expect(splash()).not.toBeNull(); // but the cold-start splash is still up
      await flush(1000 + 400);
      expect(splash()).toBeNull();
    });
  });

  describe('background → foreground (same JS runtime)', () => {
    const app = () => (
      <StartupSplash runtime={runtime} minDurationMs={5000} store={memoryStore()}>
        <Signals appReady />
      </StartupSplash>
    );

    async function completeColdStart() {
      const first = render(app());
      await flush(5000 + 400);
      expect(splash()).toBeNull();
      return first;
    }

    it('4. resume does not restart the startup timer', async () => {
      const first = await completeColdStart();
      first.unmount(); // Android destroyed the Activity while in background
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      render(app()); // Activity recreated on return, same JS runtime
      const startupTimers = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === 5000);
      expect(startupTimers).toHaveLength(0); // no 5 s startup timer scheduled
    });

    it('5. resume does not remount/replay the startup splash', async () => {
      const first = await completeColdStart();
      first.unmount();
      render(app());
      expect(splash()).toBeNull();
      expect(screen.getByTestId('home')).toBeTruthy(); // app shown immediately
      expect(SplashScreen.hide).toHaveBeenCalled(); // native splash released at once
    });

    it('6. multiple background/foreground cycles never replay it', async () => {
      let current = await completeColdStart();
      for (let cycle = 0; cycle < 3; cycle++) {
        current.unmount();
        current = render(app());
        expect(splash()).toBeNull();
        await flush(10000);
        expect(splash()).toBeNull();
      }
    });

    it('7. a genuine later cold start (new process/runtime) gets the 5 s splash again', async () => {
      const first = await completeColdStart();
      first.unmount();
      runtime = createStartupRuntime(); // app killed and reopened: fresh JS runtime
      render(app());
      expect(splash()).not.toBeNull();
      await flush(4000);
      expect(splash()).not.toBeNull();
      await flush(1000 + 400);
      expect(splash()).toBeNull();
    });

    it('8. first-launch RTL correction: reload happens without waiting, then one 5 s cold-start splash', async () => {
      const store = memoryStore();
      // Runtime A: fresh install on an LTR (English) phone → Hebrew needs RTL → reload.
      const direction = createFakeDirectionService(false);
      const runtimeA = runtime;
      const a = render(
        <StartupSplash runtime={runtimeA} minDurationMs={5000} store={store} now={() => 1_000}>
          <I18nProvider direction={direction} store={store}>
            <Signals appReady />
          </I18nProvider>
        </StartupSplash>,
      );
      await flush(0);
      expect(direction.calls).toEqual(['apply:rtl', 'reload']); // immediately, no 5 s wait first
      expect(runtimeA.isComplete()).toBe(false);
      a.unmount();
      // Runtime B: after reloadAppAsync — a new JS runtime, direction now RTL.
      const runtimeB = createStartupRuntime();
      render(
        <StartupSplash runtime={runtimeB} minDurationMs={5000} store={store} now={() => 2_000}>
          <I18nProvider direction={createFakeDirectionService(true)} store={store}>
            <Signals appReady />
          </I18nProvider>
        </StartupSplash>,
      );
      await flush(4000);
      expect(splash()).not.toBeNull(); // the one cold-start splash
      await flush(1000 + 400);
      expect(splash()).toBeNull();
      expect(runtimeB.isComplete()).toBe(true);
    });
  });
});
