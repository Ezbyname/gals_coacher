import { StyleSheet, Text, View } from 'react-native';

import { radius, semantic, spacing, typography } from './theme';

export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral';

type Props = {
  /** Already translated — the status IS this text (e.g. "Completed", "Inactive"); colour only supports it. */
  label: string;
  tone?: BadgeTone;
  testID?: string;
};

/**
 * A small status word on a quiet background (UX-VISUAL-001A). Not
 * interactive. The meaning is always in the text, so it reads the same in
 * grayscale and to a screen reader.
 */
export function StatusBadge({ label, tone = 'neutral', testID }: Props) {
  const colours = semantic[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: colours.tint, borderColor: colours.base }]}
      testID={testID}
      accessible
      accessibilityLabel={label}>
      <Text style={[styles.label, { color: colours.strong }]} testID={testID ? `${testID}-label` : undefined}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  label: { ...typography.caption, fontWeight: '700' },
});
