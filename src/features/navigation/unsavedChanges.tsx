import { useNavigation } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { useI18n } from '@/i18n/I18nProvider';

type Guard = { readonly isBlocking: () => boolean; readonly release: () => void };

type UnsavedChanges = {
  /** Shows the one "leave without saving?" dialog. Resolves true only for Leave. */
  confirmDiscard(): Promise<boolean>;
  /**
   * Before navigating away from the current screen(s): true when nothing is
   * unsaved, or the user chose Leave (the dirty forms are then released, so
   * their own guards do not ask again).
   */
  confirmLeave(): Promise<boolean>;
  register(guard: Guard): () => void;
};

const UnsavedChangesContext = createContext<UnsavedChanges | null>(null);

/**
 * App-wide registry of editable screens with unsaved changes (NAV-DIRTY-001).
 * At most one confirmation dialog is open at a time: a second attempt to
 * leave while it is showing is simply blocked. The safe choice is Stay
 * (also when the dialog is dismissed); nothing is ever saved or discarded
 * without the user's choice.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const guards = useRef(new Set<Guard>());
  const dialogOpen = useRef(false);

  const confirmDiscard = useCallback((): Promise<boolean> => {
    if (dialogOpen.current) return Promise.resolve(false);
    dialogOpen.current = true;
    return new Promise((resolve) => {
      let answered = false;
      const answer = (leave: boolean) => {
        if (answered) return;
        answered = true;
        dialogOpen.current = false;
        resolve(leave);
      };
      Alert.alert(
        t('common.unsaved.title'),
        t('common.unsaved.body'),
        [
          { text: t('common.unsaved.stay'), style: 'cancel', onPress: () => answer(false) },
          { text: t('common.unsaved.leave'), style: 'destructive', onPress: () => answer(true) },
        ],
        { cancelable: true, onDismiss: () => answer(false) },
      );
    });
  }, [t]);

  const value = useMemo<UnsavedChanges>(
    () => ({
      confirmDiscard,
      confirmLeave: async () => {
        const blocking = [...guards.current].filter((guard) => guard.isBlocking());
        if (blocking.length === 0) return true;
        const leave = await confirmDiscard();
        if (leave) blocking.forEach((guard) => guard.release());
        return leave;
      },
      register: (guard) => {
        guards.current.add(guard);
        return () => void guards.current.delete(guard);
      },
    }),
    [confirmDiscard],
  );

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

export function useUnsavedChanges(): UnsavedChanges {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error('useUnsavedChanges must be used inside <UnsavedChangesProvider>.');
  return ctx;
}

/**
 * Protects an editable screen while `isDirty` (the form differs from what it
 * was loaded with). Any way of leaving the screen — header back, Android Back,
 * a back / replace / dismiss from the UI (React Navigation's `beforeRemove`)
 * or a main-navigation tap (`confirmLeave`) — asks first; Stay keeps the
 * screen and every value.
 *
 * `release()` is for leaving on purpose: after a successful Save, or the
 * screen's explicit Cancel (which discards by the user's own choice).
 */
export function useUnsavedChangesGuard(isDirty: boolean): { release: () => void } {
  const navigation = useNavigation();
  const { confirmDiscard, register } = useUnsavedChanges();
  const dirty = useRef(isDirty);
  const released = useRef(false);

  useEffect(() => {
    dirty.current = isDirty;
  }, [isDirty]);

  useEffect(
    () =>
      register({
        isBlocking: () => dirty.current && !released.current,
        release: () => {
          released.current = true;
        },
      }),
    [register],
  );

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!dirty.current || released.current) return;
        event.preventDefault();
        void confirmDiscard().then((leave) => {
          if (!leave) return;
          released.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [navigation, confirmDiscard],
  );

  const release = useCallback(() => {
    released.current = true;
  }, []);
  return { release };
}
