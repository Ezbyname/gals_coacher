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

export function AppProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => createServices(), []);
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
    void services.audio.preload();
    return () => {
      cancelled = true;
      services.audio.release();
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
