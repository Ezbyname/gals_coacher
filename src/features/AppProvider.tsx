import type { SQLiteDatabase } from 'expo-sqlite';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { openLocalDatabase } from '@/data/local/database';
import type { MigrationResult } from '@/data/local/migrations/runMigrations';
import { createServices, type Services } from '@/services';

export type BootState =
  | { status: 'booting' }
  | { status: 'ready'; db: SQLiteDatabase; migration: MigrationResult }
  | { status: 'error'; error: Error };

type AppContextValue = { boot: BootState; services: Services };

const AppContext = createContext<AppContextValue | null>(null);

type AppProviderProps = {
  children: ReactNode;
  /** Injected in tests; the app uses the real platform services. */
  services?: Services;
};

export function AppProvider({ children, services: injected }: AppProviderProps) {
  const services = useMemo(() => injected ?? createServices(), [injected]);
  const [boot, setBoot] = useState<BootState>({ status: 'booting' });

  useEffect(() => {
    let cancelled = false;
    openLocalDatabase()
      .then(({ db, migration }) => {
        if (!cancelled) setBoot({ status: 'ready', db, migration });
      })
      .catch((e: unknown) => {
        if (!cancelled) setBoot({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
      });
    // Audio is optional: a failed preload is reported and never blocks boot.
    Promise.resolve()
      .then(() => services.audio.preload())
      .catch((e: unknown) => console.warn('[audio] preload failed; continuing without sound.', e));
    return () => {
      cancelled = true;
      try {
        services.audio.release();
      } catch (e) {
        console.warn('[audio] release failed', e);
      }
    };
  }, [services]);

  const value = useMemo(() => ({ boot, services }), [boot, services]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>.');
  return ctx;
}
