import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

export type Choice<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Already translated. */
  label: string;
  choices: readonly Choice<T>[];
  value: T | null;
  /** Pressing the selected chip clears it (every chip set here is optional). */
  onChange: (value: T | null) => void;
  /** Translated error shown under the chips. */
  error?: string;
  /** The current choice is fixed: chips show it but cannot be pressed. */
  locked?: boolean;
  testID: string;
};

/** Single choice from a short list. Chips flow from the start edge, so they mirror in RTL. */
export function ChoiceChips<T extends string>({
  label,
  choices,
  value,
  onChange,
  error,
  locked = false,
  testID,
}: Props<T>) {
  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              testID={`${testID}-${choice.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: locked }}
              disabled={locked}
              onPress={() => onChange(selected ? null : choice.value)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelSelected]}
                testID={`${testID}-${choice.value}-label`}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.error} testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.court, borderColor: colors.court },
  chipLabel: { fontSize: 15, color: colors.ink },
  chipLabelSelected: { color: '#fff', fontWeight: '700' },
  error: { fontSize: 13, color: colors.danger },
});
