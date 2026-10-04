import { StyleSheet, Text, View } from 'react-native';

import { createPlayer } from '@/data/local/players/playerRepository';
import { useApp } from '@/features/AppProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, spacing } from '@/ui/theme';

import { backToPlayers } from './EditPlayer';
import { PlayerForm } from './PlayerForm';
import { EMPTY_FORM_VALUES } from './playerFormValues';

/** The shared form, empty, saving through createPlayer. */
export function CreatePlayer() {
  const { boot, services } = useApp();
  const { t } = useI18n();

  if (boot.status !== 'ready') {
    return (
      <View style={styles.centered}>
        <Text style={boot.status === 'error' ? styles.error : styles.muted} testID="player-load-error">
          {t(boot.status === 'error' ? 'players.errors.loadFailed' : 'players.list.loading')}
        </Text>
      </View>
    );
  }

  return (
    <PlayerForm
      initialValues={EMPTY_FORM_VALUES}
      onSave={(input) => createPlayer(boot.db, input, { ids: services.ids, clock: services.clock })}
      onSaved={backToPlayers}
      onCancel={backToPlayers}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  muted: { fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
});
