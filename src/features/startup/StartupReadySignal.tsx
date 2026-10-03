import { useEffect } from 'react';

import { useApp } from '@/features/AppProvider';

import { useStartupSignals } from './StartupSplash';

/**
 * Renders nothing. Mounted inside I18nProvider (which only renders children once
 * language and direction are settled) and AppProvider, it tells the startup
 * splash when each part of initialization is ready.
 */
export function StartupReadySignal() {
  const { markI18nReady, markAppReady } = useStartupSignals();
  const { boot } = useApp();

  useEffect(() => {
    markI18nReady();
  }, [markI18nReady]);

  useEffect(() => {
    // SQLite opened (or failed and is reported on Diagnostics): either way startup is settled.
    if (boot.status !== 'booting') markAppReady();
  }, [boot.status, markAppReady]);

  return null;
}
