import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { radius, semantic, touch } from './theme';

type Props = {
  /**
   * The glyph to show. The icon family arrives with UX-VISUAL-001B; until then
   * any lightweight node (e.g. a Text) can be passed.
   */
  icon: ReactNode;
  /** Required: an icon has no visible words, so a screen reader must hear what it does. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** For toggling icons (e.g. a favourite); exposed as accessibility "selected". */
  selected?: boolean;
  testID?: string;
};

/**
 * A square icon-only button (UX-VISUAL-001A foundation) — at least 48 × 48 dp
 * whatever the glyph size, with a mandatory accessibility label.
 */
export function IconButton({ icon, accessibilityLabel, onPress, disabled = false, selected, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: touch.minTarget,
    minHeight: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  selected: { borderWidth: 2, borderColor: semantic.selected.border },
  disabled: { opacity: semantic.disabled.opacity },
  pressed: { backgroundColor: semantic.selected.tint },
});
