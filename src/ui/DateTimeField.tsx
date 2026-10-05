import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import {
  calendarDateToLocalNoon,
  epochToLocalDateTime,
  localDateTimeToEpoch,
  type LocalDateTime,
} from '@/services/clock/localCalendarDate';

import { BigButton } from './BigButton';
import { colors, spacing, touch } from './theme';

/** Day-first locales for both app languages (iOS picker only; Android follows the device). */
const LOCALES = { he: 'he-IL', en: 'en-GB' } as const;

type Props = {
  /** Already translated (e.g. "Start time"). */
  label: string;
  /** `date` changes the year / month / day of `value`; `time` changes its hour / minute. */
  mode: 'date' | 'time';
  /** The local wall time the picker opens on. */
  value: LocalDateTime;
  /** `value` formatted for the active language (shown on the field). */
  displayValue: string;
  /** Called only on a confirmed selection; cancel / dismiss never call it. */
  onSelect: (value: LocalDateTime) => void;
  /** Translated error shown under the field. */
  error?: string;
  testID: string;
};

/**
 * A labelled field that opens the platform's native date or time picker. It
 * only speaks LocalDateTime: the native Date is created with the LOCAL
 * constructor and read back with local getters — never via UTC or ISO
 * strings. Times are 24-hour.
 *
 * Android: the native dialog (mounting the picker opens it).
 * iOS: the picker in a modal sheet with Cancel / Confirm.
 */
export function DateTimeField({ label, mode, value, displayValue, onSelect, error, testID }: Props) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  // iOS only: the pending choice inside the sheet, committed by Confirm.
  const [draft, setDraft] = useState<Date | null>(null);

  const pickerValue =
    mode === 'date'
      ? calendarDateToLocalNoon(value)
      : new Date(localDateTimeToEpoch(value) ?? calendarDateToLocalNoon(value).getTime());

  const show = () => {
    setDraft(pickerValue);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setDraft(null);
  };
  const choose = (date: Date) => {
    close();
    const picked = epochToLocalDateTime(date.getTime());
    onSelect(
      mode === 'date'
        ? { ...value, year: picked.year, month: picked.month, day: picked.day }
        : { ...value, hour: picked.hour, minute: picked.minute },
    );
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t('calendar.field.pickerA11y', { field: label, value: stripBidi(displayValue) })}
        onPress={show}
        style={({ pressed }) => [styles.box, !!error && styles.boxError, pressed && { opacity: 0.7 }]}>
        <Text style={styles.value} testID={`${testID}-value`}>
          {displayValue}
        </Text>
      </Pressable>
      {error ? (
        <Text style={styles.error} testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          testID={`${testID}-native`}
          mode={mode}
          value={pickerValue}
          is24Hour
          onValueChange={(_event, date) => choose(date)}
          onDismiss={close}
        />
      ) : null}

      {Platform.OS !== 'android' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
          <View style={styles.backdrop}>
            <View style={styles.sheet} testID={`${testID}-sheet`}>
              {open && draft ? (
                <DateTimePicker
                  testID={`${testID}-native`}
                  mode={mode}
                  display={mode === 'date' ? 'inline' : 'spinner'}
                  locale={LOCALES[language]}
                  value={draft}
                  onValueChange={(_event, date) => setDraft(date)}
                />
              ) : null}
              <View style={styles.actions}>
                <View style={styles.action}>
                  <BigButton
                    testID={`${testID}-cancel`}
                    variant="secondary"
                    label={t('common.cancel')}
                    onPress={close}
                  />
                </View>
                <View style={styles.action}>
                  <BigButton
                    testID={`${testID}-confirm`}
                    label={t('common.confirm')}
                    onPress={() => (draft ? choose(draft) : close())}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  box: {
    minHeight: touch.buttonMinHeight,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  boxError: { borderColor: colors.danger },
  value: { fontSize: 17, color: colors.ink, textAlign: 'auto' },
  error: { fontSize: 13, color: colors.danger, textAlign: 'auto' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
