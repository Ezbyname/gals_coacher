import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { createCustomActivityType } from '@/data/local/activityTypes/activityTypeRepository';
import { ACTIVITY_TYPE_NAME_MAX_LENGTH, type CustomActivityTypeNameError } from '@/domain/activityType';
import { useApp } from '@/features/AppProvider';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

const NAME_ERRORS: Record<CustomActivityTypeNameError, TranslationKey> = {
  REQUIRED: 'activityTypes.errors.nameRequired',
  TOO_LONG: 'activityTypes.errors.nameTooLong',
  DUPLICATE: 'activityTypes.errors.nameDuplicate',
};

/**
 * Adds a custom Activity Type (active at once). Its name is the user's own
 * text, shown as entered (only trimmed) and never translated. Leaving with a
 * typed name asks first (NAV-DIRTY-001); Save and Cancel return to the list.
 */
export function NewActivityType() {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInProgress = useRef(false);
  // Only a meaningful name is an unsaved change; an untouched or blank field leaves freely.
  const guard = useUnsavedChangesGuard(name.trim().length > 0);

  const save = async () => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setError(null);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const result = await createCustomActivityType(boot.db, name, {
        ids: services.ids,
        clock: services.clock,
      });
      if (result.ok) {
        guard.release(); // saved: leaving is safe
        router.back();
        return; // stays guarded: the screen is leaving
      }
      setError(NAME_ERRORS[result.error]);
    } catch (e) {
      console.warn('[activity types] create failed', e);
      setError('activityTypes.errors.saveFailed');
    }
    saveInProgress.current = false;
    setSaving(false);
  };

  return (
    <KeyboardSafeScrollView
      testID="activity-type-form-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <TextField
        testID="activity-type-name"
        label={t('activityTypes.name')}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        maxLength={Math.max(ACTIVITY_TYPE_NAME_MAX_LENGTH, name.length)}
        error={error ? t(error) : undefined}
      />
      <Text style={styles.hint}>{t('activityTypes.nameHint')}</Text>
      <View style={styles.buttons}>
        <BigButton
          testID="activity-type-save"
          label={saving ? t('activityTypes.saving') : t('activityTypes.save')}
          onPress={() => void save()}
          disabled={saving}
        />
        <BigButton
          testID="activity-type-cancel"
          variant="secondary"
          label={t('activityTypes.cancel')}
          onPress={() => {
            guard.release(); // Cancel discards on purpose (the accepted form behaviour)
            router.back();
          }}
          disabled={saving}
        />
      </View>
    </KeyboardSafeScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  hint: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  buttons: { gap: spacing.sm, marginTop: spacing.md },
});
