import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CalendarDate } from '@/domain/calendarDate';
import { useI18n } from '@/i18n/I18nProvider';
import { calendarDateToLocalNoon, localDateToCalendarDate } from '@/services/clock/localCalendarDate';

import { BigButton } from './BigButton';
import { colors, spacing } from './theme';

/** Icon glyph for the trigger (no icon font in the app). */
const CALENDAR_GLYPH = '📅';

type Props = {
  /** The date the picker opens on (already resolved by the caller). */
  initialDate: CalendarDate;
  /** The latest selectable date: today on this device. */
  maximumDate: CalendarDate;
  /** Called only on a confirmed selection; cancel / dismiss never call it. */
  onSelect: (date: CalendarDate) => void;
  testID?: string;
};

/**
 * A calendar button that opens the platform's native date picker. It only
 * speaks CalendarDate: the native Date is converted at this boundary with
 * local getters (and created at local noon), never via UTC or ISO strings.
 *
 * Android: the native dialog (mounting the picker opens it).
 * iOS: the inline picker in a modal sheet with Cancel / Confirm, because iOS
 * reports every wheel change and has no dialog of its own.
 */
export function DateOfBirthPicker({ initialDate, maximumDate, onSelect, testID = 'dob-picker' }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // iOS only: the pending choice inside the sheet, committed by Confirm.
  const [draft, setDraft] = useState<Date | null>(null);

  const value = calendarDateToLocalNoon(initialDate);
  const max = calendarDateToLocalNoon(maximumDate);

  const show = () => {
    setDraft(value);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setDraft(null);
  };
  const choose = (date: Date) => {
    close();
    onSelect(localDateToCalendarDate(date));
  };

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t('players.form.chooseDateOfBirth')}
        onPress={show}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.7 }]}>
        <Text style={styles.glyph}>{CALENDAR_GLYPH}</Text>
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          testID={`${testID}-native`}
          mode="date"
          value={value}
          maximumDate={max}
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
                  mode="date"
                  display="inline"
                  value={draft}
                  maximumDate={max}
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
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignSelf: 'flex-end',
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  glyph: { fontSize: 22 },
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
