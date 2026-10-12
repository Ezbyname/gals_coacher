import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { PlayerDataError } from '@/data/local/players/errors';
import {
  archivePlayer,
  getPlayer,
  isSportActive,
  updatePlayer,
  type PlayerProfile,
} from '@/data/local/players/playerRepository';
import { useApp } from '@/features/AppProvider';
import { isolate } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

import { ScheduleSection } from '@/features/calendar/ScheduleSection';
import { SelfAssessmentSection } from '@/features/selfAssessment/SelfAssessmentSection';
import { TrainingSection } from '@/features/training/PlayerTraining';

import { PlayerForm } from './PlayerForm';
import { formValuesFromProfile } from './playerFormValues';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; profile: PlayerProfile }
  | { status: 'error'; message: TranslationKey };

export const backToPlayers = () => router.dismissTo('/children');

/** Loads one player and shows the shared form prefilled; unknown ids get a safe message. */
export function EditPlayer({ playerId }: { playerId: string }) {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [loaded, setState] = useState<LoadState>({ status: 'loading' });
  const state: LoadState =
    boot.status === 'error' ? { status: 'error', message: 'players.errors.loadFailed' } : loaded;

  useEffect(() => {
    if (boot.status !== 'ready') return;
    let active = true;
    getPlayer(boot.db, playerId)
      .then((profile) => {
        if (!active) return;
        setState(
          profile ? { status: 'ready', profile } : { status: 'error', message: 'players.errors.notFound' },
        );
      })
      .catch((e: unknown) => {
        console.warn('[players] load failed', e);
        if (!active) return;
        setState({
          status: 'error',
          message: e instanceof PlayerDataError ? 'players.errors.dataInvalid' : 'players.errors.loadFailed',
        });
      });
    return () => {
      active = false;
    };
  }, [boot, playerId]);

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
        <Text style={styles.error} testID="player-load-error">
          {t(state.message)}
        </Text>
        <BigButton
          testID="player-back"
          variant="secondary"
          label={t('players.form.backToList')}
          onPress={backToPlayers}
        />
      </View>
    );
  }

  if (state.profile.player.archivedAt !== null) {
    // Off the roster: no editing, no new activity (PLAYER-ARCHIVE-001). History stays stored.
    return (
      <View style={styles.centered}>
        <Text style={styles.muted} testID="player-archived">
          {t('players.archive.archived')}
        </Text>
        <BigButton testID="player-back" variant="secondary" label={t('players.form.backToList')} onPress={backToPlayers} />
      </View>
    );
  }

  const db = boot.status === 'ready' ? boot.db : null;
  return (
    <PlayerForm
      initialValues={formValuesFromProfile(state.profile)}
      onSave={(input) => {
        if (!db) throw new Error('database not ready');
        return updatePlayer(db, playerId, input, { clock: services.clock });
      }}
      onSaved={backToPlayers}
      onCancel={backToPlayers}
      // PLAYER-ARCHIVE-001: always asks first; Cancel is the safe default. Nothing is deleted.
      onArchive={async () => {
        if (!db) throw new Error('database not ready');
        const name = isolate(state.profile.player.name);
        const confirmed = await new Promise<boolean>((done) =>
          Alert.alert(
            t('players.archive.title', { name }),
            t('players.archive.body'),
            [
              { text: t('players.archive.cancel'), style: 'cancel', onPress: () => done(false) },
              { text: t('players.archive.confirm'), style: 'destructive', onPress: () => done(true) },
            ],
            { cancelable: true, onDismiss: () => done(false) },
          ),
        );
        if (!confirmed) return 'kept';
        await archivePlayer(db, playerId, { clock: services.clock });
        return 'archived';
      }}
      onArchived={backToPlayers}
      // Separate from the profile fields: Self-assessment for players with
      // Basketball (history only while it is inactive), then the Schedule and
      // Training for every player.
      footer={
        <>
          {state.profile.basketball !== null ? (
            <SelfAssessmentSection playerId={playerId} active={isSportActive(state.profile, 'BASKETBALL')} />
          ) : null}
          <ScheduleSection playerId={playerId} />
          <TrainingSection playerId={playerId} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  muted: { fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
});
