import { Pressable, StyleSheet, Text } from 'react-native';

import { categoryTones, colors, radius, semantic, spacing, touch, typography, type CategoryTone } from './theme';

/** The text mark that says "selected" (colour is never the only signal). */
export const SELECTED_MARK = '✓ ';

type Props = {
  /** Already translated. */
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Optional training-domain tone for the selected fill. */
  tone?: CategoryTone;
  testID?: string;
  /** Overrides what a screen reader hears (default: the label). */
  accessibilityLabel?: string;
};

/**
 * A compact choice (UX-VISUAL-001A) — a filter or a refinement, quieter than
 * a primary action. ≥ 48 dp tall. Selected shows "✓ " in the text and a
 * strong outline; the label's `-label` testID carries the visible text.
 */
export function Pill({ label, onPress, selected = false, disabled = false, tone, testID, accessibilityLabel }: Props) {
  const text = selected ? SELECTED_MARK + label : label;
  const fill = selected ? (tone ? categoryTones[tone].tint : semantic.selected.tint) : semantic.surface;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: fill },
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.label} testID={testID ? `${testID}-label` : undefined}>
        {text}
      </Text>
    </Pressable>
  );
}

type ToggleProps = Omit<Props, 'selected' | 'tone'> & { value: boolean };

/**
 * An on / off switch drawn as a pill (UX-VISUAL-001A): accessibilityRole
 * "switch" with checked state; "on" shows the ✓ mark in text.
 */
export function Toggle({ label, onPress, value, disabled = false, testID, accessibilityLabel }: ToggleProps) {
  const text = value ? SELECTED_MARK + label : label;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: value ? semantic.selected.tint : semantic.surface },
        value && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.label} testID={testID ? `${testID}-label` : undefined}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: touch.minTarget,
    minWidth: touch.minTarget,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { borderColor: semantic.selected.border, borderWidth: 2 },
  disabled: { opacity: semantic.disabled.opacity },
  pressed: { opacity: 0.85 },
  label: { ...typography.label, color: semantic.textPrimary },
});
