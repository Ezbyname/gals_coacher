import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { asyncStoragePreferenceStore, type PreferenceStore } from '@/preferences/store';
import { colors } from '@/ui/theme';

import { consumeLanguageSwitch } from './languageSwitchMarker';
import { hideNativeSplash } from './nativeSplash';
import { createStartupGate, STARTUP_SPLASH_BACKGROUND, STARTUP_SPLASH_MIN_MS } from './startupGate';
import { currentStartupRuntime, type StartupRuntime } from './startupRuntime';

const artwork = require('../../../assets/images/splash-coach.png');

type StartupSignals = { markI18nReady(): void; markAppReady(): void };
const StartupContext = createContext<StartupSignals | null>(null);

type Props = {
  children: ReactNode;
  minDurationMs?: number;
  /** Injected in tests. */
  store?: PreferenceStore;
  now?: () => number;
  runtime?: StartupRuntime;
};

/**
 * App-level startup splash: the full coach artwork over the app until the
 * startup gate opens. The app renders underneath (hidden), so Home is never
 * shown before language/direction are settled. Completion is remembered for
 * the JS runtime (startupRuntime.ts), so background → foreground — including an
 * Android Activity recreation that remounts this component — never replays it. The ~5 s minimum applies to cold
 * starts (including a first-launch RTL correction); the reload after an
 * explicit language change shows the artwork only until the app is ready.
 *
 * Native splash handoff: the native splash (same background colour) is hidden
 * only once this surface is laid out AND language/direction are settled, so a
 * first-launch direction reload stays behind the native splash.
 */
export function StartupSplash({
  children,
  minDurationMs = STARTUP_SPLASH_MIN_MS,
  store = asyncStoragePreferenceStore,
  now = Date.now,
  runtime = currentStartupRuntime,
}: Props) {
  // A remount after startup already completed in this JS runtime (e.g. Android
  // recreated the Activity on return from background) must not replay the splash.
  const [alreadyStarted] = useState(() => runtime.isComplete());
  const [visible, setVisible] = useState(!alreadyStarted);
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const [imageOpacity] = useState(() => new Animated.Value(0));
  // Native-splash handoff: hide it once this surface is laid out AND i18n is settled.
  const handoff = useMemo(() => {
    const state = { laidOut: false, i18nReady: false, hidden: false };
    const check = () => {
      if (!state.hidden && state.laidOut && state.i18nReady) {
        state.hidden = true;
        hideNativeSplash();
      }
    };
    return {
      laidOut: () => {
        state.laidOut = true;
        check();
      },
      i18nReady: () => {
        state.i18nReady = true;
        check();
      },
    };
  }, []);

  const gate = useMemo(
    () =>
      createStartupGate(() => {
        runtime.markComplete();
        hideNativeSplash(); // idempotent safety net
        try {
          Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() =>
            setVisible(false),
          );
        } catch (e) {
          console.warn('[splash] fade-out failed', e);
          setVisible(false);
        }
      }),
    [overlayOpacity, runtime],
  );

  useEffect(() => {
    if (!alreadyStarted) return;
    // Resumed into an already-started runtime: no splash, no timer, no marker read.
    hideNativeSplash();
  }, [alreadyStarted]);

  useEffect(() => {
    if (alreadyStarted) return;
    // Cold start: the minimum display time applies. A reload caused by an explicit
    // language change (fresh marker from Settings) skips it; the gate still waits
    // for language/direction and app readiness.
    let cancelled = false;
    const timer = setTimeout(() => gate.markTimeElapsed(), minDurationMs);
    consumeLanguageSwitch(now(), store).then((languageSwitch) => {
      if (languageSwitch && !cancelled) gate.markTimeElapsed();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [alreadyStarted, gate, minDurationMs, now, store]);

  const signals = useMemo<StartupSignals>(
    () => ({
      markI18nReady: () => {
        handoff.i18nReady();
        gate.markI18nReady();
      },
      markAppReady: () => gate.markAppReady(),
    }),
    [gate, handoff],
  );

  return (
    <StartupContext.Provider value={signals}>
      <View style={styles.root}>
        {children}
        {visible && (
          <Animated.View
            testID="startup-splash"
            style={[styles.overlay, { opacity: overlayOpacity }]}
            onLayout={handoff.laidOut}
            pointerEvents="auto"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden>
            <Animated.Image
              source={artwork}
              resizeMode="cover"
              style={[styles.artwork, { opacity: imageOpacity }]}
              onLoad={() => {
                try {
                  Animated.timing(imageOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
                } catch {
                  imageOpacity.setValue(1);
                }
              }}
              onError={() => imageOpacity.setValue(1)}
            />
          </Animated.View>
        )}
      </View>
    </StartupContext.Provider>
  );
}

/** Reports readiness to the startup splash. Render it where i18n and app state are available. */
export function useStartupSignals(): StartupSignals {
  const ctx = useContext(StartupContext);
  if (!ctx) throw new Error('useStartupSignals must be used inside <StartupSplash>.');
  return ctx;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: STARTUP_SPLASH_BACKGROUND },
  // Width/height fill the screen; "cover" keeps the aspect ratio and crops evenly.
  // No transform: the artwork is never mirrored in RTL.
  artwork: { width: '100%', height: '100%' },
});
