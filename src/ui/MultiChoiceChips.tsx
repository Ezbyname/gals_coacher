import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

export type MultiChoice<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Already translated. */
  label: string;
  choices: readonly MultiChoice<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** Already translated "✓ {label}" for a selected chip (state shown in words, not colour alone). */
  selectedLabel: (label: string) => string;
  /** Translated error shown under the chips. */
  error?: string;
  testID: string;
};

/** Several choices from a list (each chip toggles). Chips flow from the start edge, so they mirror in RTL. */
export function MultiChoiceChips<T extends string>({
  label,
  choices,
  selected,
  onToggle,
  selectedLabel,
  error,
  testID,
}: Props<T>) {
  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {choices.map((choice) => {
          const on = selected.includes(choice.value);
          return (
            <Pressable
              key={choice.value}
              testID={`${testID}-${choice.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onToggle(choice.value)}
              style={[styles.chip, on && styles.chipSelected]}>
              <Text
                style={[styles.chipLabel, on && styles.chipLabelSelected]}
                testID={`${testID}-${choice.value}-label`}>
                {on ? selectedLabel(choice.label) : choice.label}
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
  chipSelected: { borderColor: colors.ink, borderWidth: 2, backgroundColor: colors.background },
  chipLabel: { fontSize: 15, color: colors.ink },
  chipLabelSelected: { fontWeight: '800' },
  error: { fontSize: 13, color: colors.danger },
});
