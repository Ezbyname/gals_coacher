import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { listExercises } from '@/data/local/exercises/exerciseRepository';
import { readTaxonomy } from '@/data/local/taxonomy/taxonomyRepository';
import type { Exercise } from '@/domain/exercise/exercise';
import type { Taxonomy } from '@/domain/taxonomy/taxonomy';
import { useApp } from '@/features/AppProvider';

export type LibraryData =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      exercises: readonly Exercise[];
      taxonomy: Taxonomy;
      /** Ids of the ACTIVE exercises — the ones a category may offer for new selection. */
      activeIds: ReadonlySet<string>;
    };

/**
 * The exercise library and the training taxonomy, read together and again on
 * every focus (a new, changed or deactivated exercise shows on return). Either
 * read failing is an error: the library never shows a half-loaded state.
 */
export function useExerciseLibrary(): LibraryData {
  const { boot } = useApp();
  const [loaded, setLoaded] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; exercises: Exercise[]; taxonomy: Taxonomy }
  >({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      Promise.all([listExercises(boot.db), readTaxonomy(boot.db)])
        .then(([exercises, taxonomy]) => active && setLoaded({ status: 'ready', exercises, taxonomy }))
        .catch((e: unknown) => {
          console.warn('[exercises] load failed', e);
          if (active) setLoaded({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot]),
  );

  return useMemo((): LibraryData => {
    if (boot.status === 'error' || loaded.status === 'error') return { status: 'error' };
    if (loaded.status === 'loading') return loaded;
    const activeIds = new Set(loaded.exercises.filter((e) => e.active).map((e) => e.id));
    return { ...loaded, activeIds };
  }, [boot.status, loaded]);
}
