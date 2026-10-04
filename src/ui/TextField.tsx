import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, spacing } from './theme';

type Props = {
  /** Already translated. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Translated error shown under the field. */
  error?: string;
  /** Translated unit shown after the input (e.g. cm). */
  unit?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Numbers stay left-to-right inside Hebrew screens. */
  numeric?: boolean;
  testID?: string;
};

/** Labelled single-line input. Layout uses logical start/end, so it mirrors in RTL. */
export function TextField({ label, value, onChangeText, error, unit, keyboardType, numeric, testID }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          style={[styles.input, numeric && styles.numeric, !!error && styles.inputError]}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.ink,
  },
  numeric: { writingDirection: 'ltr', textAlign: 'center' },
  inputError: { borderColor: colors.danger },
  unit: { fontSize: 15, color: colors.inkMuted },
  error: { fontSize: 13, color: colors.danger },
});
