import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, touch } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  testID?: string;
};

export function BigButton({ label, onPress, variant = 'primary', disabled, testID }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}>
      <Text style={[styles.label, primary ? styles.labelPrimary : styles.labelSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.buttonMinHeight,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.court },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 18, fontWeight: '700' },
  labelPrimary: { color: '#fff' },
  labelSecondary: { color: colors.ink },
});
