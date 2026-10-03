import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';

/**
 * Layout direction (RTL/LTR) of the native app. React Native reads these flags
 * when it starts, so a change only takes effect after `reload()`.
 */
export interface DirectionService {
  /** Direction the running React instance was started with. */
  isRTL(): boolean;
  /** Stores the direction for the next start (Hebrew → true, English → false). */
  apply(rtl: boolean): void;
  /** Reloads the JS app (works in release builds) so `apply` takes effect. */
  reload(): Promise<void>;
}

export function createNativeDirectionService(): DirectionService {
  return {
    isRTL: () => I18nManager.isRTL,
    apply: (rtl) => {
      if (rtl) {
        I18nManager.allowRTL(true);
        I18nManager.forceRTL(true);
      } else {
        // allowRTL defaults to true; without allowRTL(false) a Hebrew-language
        // phone would still lay English out right-to-left.
        I18nManager.forceRTL(false);
        I18nManager.allowRTL(false);
      }
    },
    reload: () => reloadAppAsync('Apply layout direction'),
  };
}
