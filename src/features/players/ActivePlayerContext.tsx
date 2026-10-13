import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { getPlayer } from '@/data/local/players/playerRepository';
import {
  NO_ACTIVE_PLAYER,
  type ActivePlayerContextValue,
  type ActivePlayerSource,
} from '@/domain/training/activePlayer';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { stripBidi } from '@/i18n/bidi';
import { colors } from '@/ui/theme';

/**
 * React side of ActivePlayerContext (see domain/training/activePlayer.ts).
 * UX context only — never authorization.
 *
 * The default value is "no Player": a screen outside every provider (Home,
 * Workouts, Exercises, Quick Training…) cannot act for a Player by accident.
 */
const Context = createContext<ActivePlayerContextValue>(NO_ACTIVE_PLAYER);

export type Loaded = { forId: string; value: ActivePlayerContextValue };

/**
 * Provides the Player that the screens below act for. Scoped to the subtree:
 * it disappears with the screen, and a different `playerId` is never served
 * the previous Player's value (it is 'loading' until its own Player loads).
 */
export function ActivePlayerProvider({
  playerId,
  source,
  history = false,
  children,
}: {
  playerId: string;
  source: ActivePlayerSource;
  /** A read-only history screen: an archived Player still resolves, flagged `archived`. */
  history?: boolean;
  children: ReactNode;
}) {
  const { boot } = useApp();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // On focus, so a name edited elsewhere is current when the Coach comes back.
  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      getPlayer(boot.db, playerId)
        .then((profile) => {
          if (!active) return;
          setLoaded({
            forId: playerId,
            // An archived Player is never acted for: nothing new may be created for them.
            // A history screen still shows their past, read-only (flagged `archived`).
            value:
              profile?.player.archivedAt != null && !history
                ? { status: 'unresolved', reason: 'archived' }
                : profile
                  ? {
                      status: 'resolved',
                      activePlayerId: playerId,
                      activePlayer: { id: profile.player.id, name: profile.player.name },
                      source,
                      ...(profile.player.archivedAt != null ? { archived: true as const } : {}),
                    }
                  : { status: 'unresolved', reason: 'not-found' },
          });
        })
        .catch((e: unknown) => {
          console.warn('[players] active player load failed', e);
          if (active) setLoaded({ forId: playerId, value: { status: 'unresolved', reason: 'error' } });
        });
      return () => {
        active = false;
      };
    }, [boot, playerId, source, history]),
  );

  const value = deriveActivePlayer(playerId, source, boot.status === 'error', loaded);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * The provider's value. A load is only ever used for the id it was made for:
 * after a switch (Daniel → Maya) the context is 'loading' for Maya until Maya
 * loads — never Daniel's value under Maya's id.
 */
export function deriveActivePlayer(
  playerId: string,
  source: ActivePlayerSource,
  bootFailed: boolean,
  loaded: Loaded | null,
): ActivePlayerContextValue {
  if (!playerId) return NO_ACTIVE_PLAYER;
  if (bootFailed) return { status: 'unresolved', reason: 'error' };
  if (loaded?.forId === playerId) return loaded.value;
  return { status: 'loading', activePlayerId: playerId, source };
}

/** The Player this screen acts for ("no Player" outside a provider). */
export function useActivePlayer(): ActivePlayerContextValue {
  return useContext(Context);
}

/**
 * Renders `children` only for a resolved Player. A Player-specific training
 * screen without one shows why instead of offering actions.
 */
export function RequireActivePlayer({ children }: { children: ReactNode }) {
  const context = useActivePlayer();
  if (context.status === 'loading') return <LoadingScreen />;
  if (context.status === 'unresolved') {
    return (
      <ErrorScreen
        testID="active-player-missing"
        // An archived Player is off the roster: say so, rather than "no Player" (PLAYER-ARCHIVE-001).
        message={context.reason === 'archived' ? 'players.archive.archived' : 'training.errors.playerRequired'}
        fallback="/children"
      />
    );
  }
  return <>{children}</>;
}

/**
 * A Player-specific screen under `/children/[id]/…`: the route's Player is the
 * active Player (source 'route') and the screen renders only once it resolved.
 */
export function RoutePlayerScope({
  playerId,
  history = false,
  children,
}: {
  playerId: string;
  /** Read-only history (e.g. a training session): an archived Player's past stays readable. */
  history?: boolean;
  children: ReactNode;
}) {
  return (
    <ActivePlayerProvider playerId={playerId} source="route" history={history}>
      <RequireActivePlayer>{children}</RequireActivePlayer>
    </ActivePlayerProvider>
  );
}

/**
 * "Training for Daniel" — a plain sentence (readable by screen readers, not
 * colour or position alone). The name is inserted in a bidi isolate by `t`,
 * so a Latin name in Hebrew (or a Hebrew name in English) keeps its order.
 */
export function PlayerTargetLabel() {
  const { t } = useI18n();
  const context = useActivePlayer();
  if (context.status !== 'resolved') return null;
  const label = t('training.targetFor', { name: context.activePlayer.name });
  return (
    <Text style={styles.target} testID="active-player-target" accessibilityLabel={stripBidi(label)}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  target: { fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
});
