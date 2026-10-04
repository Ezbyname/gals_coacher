import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, touch } from './theme';

type Props<T extends number> = {
  /** Already translated (e.g. the category name). */
  label: string;
  /** The choices, lowest first (e.g. 1–5). */
  values: readonly T[];
  value: T | null;
  /** Selecting another value replaces the current one; there is no clearing. */
  onChange: (value: T) => void;
  /** Translated anchors shown under the lowest and highest choice only. */
  lowAnchor: string;
  highAnchor: string;
  /** Translated accessibility label of one choice (e.g. "Shooting, 3 of 5"). */
  choiceLabel: (value: T) => string;
  /** Translated note shown when the scale still needs an answer. */
  error?: string;
  testID: string;
};

/**
 * A row of large numeric choices. The numbers are a scale, not text: the row
 * is always laid out left-to-right (`direction: 'ltr'`), lowest on the left,
 * also inside a Hebrew (RTL) screen. The label and anchors stay translated.
 */
export function RatingScale<T extends number>({
  label,
  values,
  value,
  onChange,
  lowAnchor,
  highAnchor,
  choiceLabel,
  error,
  testID,
}: Props<T>) {
  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.scale}
        testID={`${testID}-scale`}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}>
        {values.map((choice) => {
          const selected = choice === value;
          return (
            <Pressable
              key={choice}
              testID={`${testID}-${choice}`}
              accessibilityRole="radio"
              accessibilityLabel={choiceLabel(choice)}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(choice)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                !!error && styles.choiceMissing,
                pressed && { opacity: 0.8 },
              ]}>
              <Text style={[styles.number, selected && styles.numberSelected]}>{String(choice)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.anchors} testID={`${testID}-anchors`}>
        <Text style={[styles.anchor, styles.anchorLow]} testID={`${testID}-anchor-low`}>
          {lowAnchor}
        </Text>
        <Text style={[styles.anchor, styles.anchorHigh]} testID={`${testID}-anchor-high`}>
          {highAnchor}
        </Text>
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
  label: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  // Explicit LTR: the scale never mirrors with the screen direction.
  scale: { flexDirection: 'row', direction: 'ltr', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: touch.buttonMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: { backgroundColor: colors.court, borderColor: colors.courtDark },
  choiceMissing: { borderColor: colors.danger },
  number: { fontSize: 20, fontWeight: '800', color: colors.ink },
  numberSelected: { color: colors.surface },
  // Same explicit LTR, so each anchor stays under its own end of the scale.
  anchors: { flexDirection: 'row', direction: 'ltr', justifyContent: 'space-between', gap: spacing.md },
  anchor: { flex: 1, fontSize: 12, color: colors.inkMuted },
  anchorLow: { textAlign: 'left' },
  anchorHigh: { textAlign: 'right' },
  error: { fontSize: 13, color: colors.danger, textAlign: 'auto' },
});
