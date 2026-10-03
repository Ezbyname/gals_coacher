import * as SplashScreen from 'expo-splash-screen';

/**
 * Native splash control. Every call is best-effort: a failure here must never
 * block language loading, direction setup, SQLite or navigation.
 */
export function keepNativeSplash(): void {
  try {
    SplashScreen.preventAutoHideAsync().catch((e: unknown) => console.warn('[splash] preventAutoHide failed', e));
  } catch (e) {
    console.warn('[splash] preventAutoHide failed', e);
  }
}

export function hideNativeSplash(): void {
  try {
    SplashScreen.hide();
  } catch (e) {
    console.warn('[splash] hide failed', e);
  }
}
