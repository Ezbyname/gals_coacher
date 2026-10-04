import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DOMINANT_HANDS,
  PRIMARY_POSITIONS,
  SECONDARY_POSITIONS,
  type PrimaryPosition,
  type SecondaryPosition,
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
  fieldMessages,
  handLabel,
  isSpecificPosition,
  positionLabel,
  type PlayerFieldMessages,
} from './playerLabels';

/** UI-only chip value for "no secondary position"; mapped to null, never persisted. */
const NO_SECONDARY = 'none';
/** The only selectable sport today. */
const BASKETBALL = 'BASKETBALL';

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

/**
 * The one Player Profile form, used for both Add and Edit: personal
 * information, sport selection, and Basketball details (only while Basketball
 * is selected). A Basketball that is already saved is shown locked: removing
 * a sport is not supported in Slice 1.1.
 */
export function PlayerForm({ initialValues, onSave, onSaved, onCancel }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<PlayerFieldMessages>({});
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second press in the same frame must see the guard immediately.
  const saveInProgress = useRef(false);

  const basketballLocked = initialValues.basketballSelected;

  const set =
    <K extends keyof PlayerFormValues>(key: K) =>
    (value: PlayerFormValues[K]) =>
      setValues((current) => ({ ...current, [key]: value }));

  // A secondary position only exists next to a concrete primary (PG–C); the
  // domain stays authoritative, this just keeps the form consistent.
  const setPrimary = (primaryPosition: PrimaryPosition | null) =>
    setValues((current) => ({
      ...current,
      primaryPosition,
      secondaryPosition: isSpecificPosition(primaryPosition) ? current.secondaryPosition : null,
    }));
  const setSecondary = (choice: SecondaryPosition | typeof NO_SECONDARY | null) =>
    setValues((current) => ({
      ...current,
      secondaryPosition: choice === NO_SECONDARY ? null : choice,
    }));

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
      <View style={styles.section} testID="player-section-personal">
        <Text style={styles.sectionTitle}>{t('players.form.personalSection')}</Text>
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
          keyboardType="number-pad"
          unit={t('players.form.heightUnit')}
          numeric
          error={errors.height}
        />
      </View>

      <View style={styles.section} testID="player-section-sport">
        <ChoiceChips
          testID="player-sport"
          label={t('players.form.sportSection')}
          choices={[{ value: BASKETBALL, label: t('basketball.sportName') }]}
          value={values.basketballSelected ? BASKETBALL : null}
          onChange={(sport) => set('basketballSelected')(sport !== null)}
          locked={basketballLocked}
        />
      </View>

      {values.basketballSelected ? (
        <View style={styles.section} testID="player-section-basketball">
          <Text style={styles.sectionTitle}>{t('players.form.basketballSection')}</Text>
          <Text style={styles.hint}>{t('players.form.detailsLaterHint')}</Text>
          <ChoiceChips
            testID="player-primary"
            label={t('players.form.primaryPosition')}
            choices={PRIMARY_POSITIONS.map((code) => ({ value: code, label: positionLabel(t, code) }))}
            value={values.primaryPosition}
            onChange={setPrimary}
            error={errors.primaryPosition}
          />
          {isSpecificPosition(values.primaryPosition) ? (
            <ChoiceChips
              testID="player-secondary"
              label={t('players.form.secondaryPosition')}
              choices={[
                { value: NO_SECONDARY, label: t('basketball.secondaryNone') },
                ...SECONDARY_POSITIONS.map((code) => ({ value: code, label: positionLabel(t, code) })),
              ]}
              value={values.secondaryPosition ?? NO_SECONDARY}
              onChange={setSecondary}
              error={errors.secondaryPosition}
            />
          ) : null}
          <ChoiceChips
            testID="player-hand"
            label={t('players.form.dominantHand')}
            choices={DOMINANT_HANDS.map((code) => ({ value: code, label: handLabel(t, code) }))}
            value={values.dominantHand}
            onChange={set('dominantHand')}
            error={errors.dominantHand}
          />
        </View>
      ) : null}

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
  container: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.lg },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  hint: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto', marginTop: -spacing.md },
  group: { gap: spacing.xs },
  groupLabel: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  error: { fontSize: 13, color: colors.danger },
  saveError: { fontSize: 15, color: colors.danger, fontWeight: '600' },
});
