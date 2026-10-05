import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, spacing } from './theme';

type Props = {
  /** Already translated. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Translated error shown under the field. */
  error?: string;
  /** Translated unit shown inside the field, after the value (e.g. cm). Display only. */
  unit?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Numbers stay left-to-right inside Hebrew screens. */
  numeric?: boolean;
  /** Several lines of free text (e.g. notes). */
  multiline?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
};

/** Labelled text input (single-line unless `multiline`). Layout uses logical start/end, so it mirrors in RTL. */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  unit,
  keyboardType,
  numeric,
  multiline,
  onFocus,
  onBlur,
  testID,
}: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, !!error && styles.boxError]}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={multiline}
          onFocus={onFocus}
          onBlur={onBlur}
          style={[styles.input, numeric && styles.numeric, multiline && styles.multiline]}
        />
        {unit ? (
          <Text style={styles.unit} testID={testID ? `${testID}-unit` : undefined}>
            {unit}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  // The input and its unit share one bordered box, so the unit reads as a suffix.
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  boxError: { borderColor: colors.danger },
  input: { flex: 1, minHeight: 46, fontSize: 17, color: colors.ink },
  numeric: { writingDirection: 'ltr', textAlign: 'center' },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingVertical: spacing.sm },
  unit: { fontSize: 15, color: colors.inkMuted },
  error: { fontSize: 13, color: colors.danger },
});
