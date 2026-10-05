import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ageOn, type CalendarDate } from '@/domain/calendarDate';
import { PlayerDataError } from '@/data/local/players/errors';
import { isSportActive, listPlayers, type PlayerProfile } from '@/data/local/players/playerRepository';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { localCalendarDateFromEpoch } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

import { positionLabel } from './playerLabels';

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; players: PlayerWithAge[] }
  | { status: 'error'; reason: 'data' | 'load' };

type PlayerWithAge = PlayerProfile & { age: number };

/**
 * Ages are derived before the list is shown, never during render: ageOn
 * rejects a date of birth after today, and a stored one (a valid date, but in
 * the future) is invalid stored data — the whole list fails with the data
 * message instead of crashing or rendering partially.
 */
function withAges(players: PlayerProfile[], today: CalendarDate): PlayerWithAge[] {
  return players.map((profile) => {
    try {
      return { ...profile, age: ageOn(profile.player.dateOfBirth, today) };
    } catch {
      throw new PlayerDataError('dateOfBirth', 'INVALID_VALUE', profile.player.id);
    }
  });
}

/** Players list. Reloads every time the screen gains focus (e.g. back from Add/Edit). */
export function PlayerList() {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [loaded, setState] = useState<ListState>({ status: 'loading' });
  const state: ListState = boot.status === 'error' ? { status: 'error', reason: 'load' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      // The previous list stays visible while reloading (no flicker).
      listPlayers(boot.db)
        .then((players) => {
          const ready = withAges(players, localCalendarDateFromEpoch(services.clock.wallNow()));
          if (active) setState({ status: 'ready', players: ready });
        })
        .catch((e: unknown) => {
          console.warn('[players] list failed', e);
          if (active) setState({ status: 'error', reason: e instanceof PlayerDataError ? 'data' : 'load' });
        });
      return () => {
        active = false;
      };
    }, [boot, services.clock]),
  );

  const addButton = (
    <BigButton
      testID="players-add"
      label={t('players.list.add')}
      onPress={() => router.push('/children/new')}
    />
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('players.list.loading')}</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} testID="players-error">
          {t(state.reason === 'data' ? 'players.errors.dataInvalid' : 'players.errors.loadFailed')}
        </Text>
      </View>
    );
  }

  if (state.players.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('players.list.empty')}</Text>
        <Text style={styles.muted}>{t('players.list.emptyHint')}</Text>
        <View style={styles.emptyAction}>{addButton}</View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {state.players.map(({ player, basketball, sports, age }) => (
        <Pressable
          key={player.id}
          testID={`player-row-${player.id}`}
          accessibilityRole="button"
          onPress={() => router.push(`/children/${player.id}`)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
          <Text style={styles.name}>{player.name}</Text>
          <View style={styles.details}>
            <Text style={styles.detail} testID={`player-age-${player.id}`}>
              {t('players.list.age', { age })}
            </Text>
            {/* A position is shown only while Basketball is the Player's active sport. */}
            {basketball?.primaryPosition && isSportActive({ sports }, 'BASKETBALL') ? (
              <Text style={styles.detail} testID={`player-position-${player.id}`}>
                {positionLabel(t, basketball.primaryPosition)}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      {addButton}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyAction: { alignSelf: 'stretch', marginTop: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  muted: { fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detail: { fontSize: 15, color: colors.inkMuted },
});
