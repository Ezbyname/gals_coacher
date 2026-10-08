import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { categoryTones, colors, elevation, radius, semantic, spacing, touch, type CategoryTone } from './theme';

type Props = {
  children: ReactNode;
  testID?: string;
  /** Makes the whole card one button (≥ 48 dp); without it the card is a plain container. */
  onPress?: () => void;
  /** Read by screen readers for a pressable card (say what it is and what it holds). */
  accessibilityLabel?: string;
  /** A training-domain accent on the leading edge (logical start: right in Hebrew, left in English). */
  tone?: CategoryTone;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A surface that groups related content (UX-VISUAL-001A). Pressable when it
 * has `onPress`; its selected / disabled state is exposed to accessibility
 * and drawn with an outline / reduced opacity — the content itself must also
 * say the state in text (colour never alone).
 */
export function Card({ children, testID, onPress, accessibilityLabel, tone, selected, disabled, style }: Props) {
  const look = [
    styles.card,
    tone ? { borderStartWidth: 4, borderStartColor: categoryTones[tone].base } : null,
    selected ? styles.selected : null,
    disabled ? styles.disabled : null,
    style,
  ];
  if (!onPress) {
    return (
      <View testID={testID} style={look} accessibilityState={{ selected: !!selected, disabled: !!disabled }}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [look, styles.pressable, pressed && !disabled && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: semantic.surface,
    ...elevation.card,
  },
  pressable: { minHeight: touch.minTarget },
  pressed: { opacity: 0.85 },
  selected: { borderColor: semantic.selected.border, borderWidth: 2 },
  disabled: { opacity: semantic.disabled.opacity },
});
