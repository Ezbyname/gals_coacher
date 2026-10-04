import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DOMINANT_HANDS,
  EXPERIENCE_LEVELS,
  PRIMARY_POSITIONS,
  SECONDARY_POSITIONS,
  WEEKLY_FREQUENCIES,
} from '@/domain/basketball/profile';
import { PlayerDataError, PlayerNotFoundError } from '@/data/local/players/errors';
import type { PlayerProfileInput, SavePlayerResult } from '@/data/local/players/playerRepository';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

import { formValuesToInput, type PlayerFormValues } from './playerFormValues';
import {
  experienceLabel,
  fieldMessages,
  frequencyLabel,
  handLabel,
  positionLabel,
  type PlayerFieldMessages,
} from './playerLabels';

type Props = {
  initialValues: PlayerFormValues;
  /** Validates and persists (createPlayer / updatePlayer). Throws on storage failure. */
  onSave: (input: PlayerProfileInput) => Promise<SavePlayerResult>;
  /** Called once after a successful save (navigates away). */
  onSaved: () => void;
  onCancel: () => void;
};

/** Storage errors on save → localized message; raw details are only logged. */
function saveErrorMessage(e: unknown): TranslationKey {
  if (e instanceof PlayerNotFoundError) return 'players.errors.notFound';
  if (e instanceof PlayerDataError) return 'players.errors.dataInvalid';
  return 'players.errors.saveFailed';
}

/** The one Player Profile form, used for both Add and Edit. */
export function PlayerForm({ initialValues, onSave, onSaved, onCancel }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<PlayerFieldMessages>({});
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second press in the same frame must see the guard immediately.
  const saveInProgress = useRef(false);

  const set =
    <K extends keyof PlayerFormValues>(key: K) =>
    (value: PlayerFormValues[K]) =>
      setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSave(formValuesToInput(values));
      if (result.ok) {
        onSaved(); // stays guarded: the form is leaving
        return;
      }
      setErrors(fieldMessages(t, result.errors));
    } catch (e) {
      console.warn('[players] save failed', e);
      setSaveError(saveErrorMessage(e));
    }
    saveInProgress.current = false;
    setSaving(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TextField
        testID="player-name"
        label={t('players.form.name')}
        value={values.name}
        onChangeText={set('name')}
        error={errors.name}
      />

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('players.form.dateOfBirth')}</Text>
        <View style={styles.dateRow}>
          <TextField
            testID="player-dob-day"
            label={t('players.form.day')}
            value={values.day}
            onChangeText={set('day')}
            keyboardType="number-pad"
            numeric
          />
          <TextField
            testID="player-dob-month"
            label={t('players.form.month')}
            value={values.month}
            onChangeText={set('month')}
            keyboardType="number-pad"
            numeric
          />
          <TextField
            testID="player-dob-year"
            label={t('players.form.year')}
            value={values.year}
            onChangeText={set('year')}
            keyboardType="number-pad"
            numeric
          />
        </View>
        {errors.dateOfBirth ? (
          <Text style={styles.error} testID="player-dob-error">
            {errors.dateOfBirth}
          </Text>
        ) : null}
      </View>

      <TextField
        testID="player-height"
        label={t('players.form.height')}
        value={values.height}
        onChangeText={set('height')}
        keyboardType="numeric"
        unit={t('players.form.heightUnit')}
        numeric
        error={errors.height}
      />

      <ChoiceChips
        testID="player-primary"
        label={t('players.form.primaryPosition')}
        choices={PRIMARY_POSITIONS.map((code) => ({ value: code, label: positionLabel(t, code) }))}
        value={values.primaryPosition}
        onChange={set('primaryPosition')}
        error={errors.primaryPosition}
      />
      <ChoiceChips
        testID="player-secondary"
        label={t('players.form.secondaryPosition')}
        choices={SECONDARY_POSITIONS.map((code) => ({ value: code, label: positionLabel(t, code) }))}
        value={values.secondaryPosition}
        onChange={set('secondaryPosition')}
        error={errors.secondaryPosition}
      />
      <ChoiceChips
        testID="player-hand"
        label={t('players.form.dominantHand')}
        choices={DOMINANT_HANDS.map((code) => ({ value: code, label: handLabel(t, code) }))}
        value={values.dominantHand}
        onChange={set('dominantHand')}
        error={errors.dominantHand}
      />
      <ChoiceChips
        testID="player-experience"
        label={t('players.form.experience')}
        choices={EXPERIENCE_LEVELS.map((code) => ({ value: code, label: experienceLabel(t, code) }))}
        value={values.experience}
        onChange={set('experience')}
        error={errors.experience}
      />
      <ChoiceChips
        testID="player-frequency"
        label={t('players.form.weeklyFrequency')}
        choices={WEEKLY_FREQUENCIES.map((code) => ({ value: code, label: frequencyLabel(t, code) }))}
        value={values.weeklyFrequency}
        onChange={set('weeklyFrequency')}
        error={errors.weeklyFrequency}
      />

      {saveError ? (
        <Text style={styles.saveError} testID="player-save-error">
          {t(saveError)}
        </Text>
      ) : null}

      <BigButton
        testID="player-save"
        label={saving ? t('players.form.saving') : t('players.form.save')}
        onPress={save}
        disabled={saving}
      />
      <BigButton
        testID="player-cancel"
        variant="secondary"
        label={t('players.form.cancel')}
        onPress={onCancel}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.xs },
  groupLabel: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  error: { fontSize: 13, color: colors.danger },
  saveError: { fontSize: 15, color: colors.danger, fontWeight: '600' },
});
