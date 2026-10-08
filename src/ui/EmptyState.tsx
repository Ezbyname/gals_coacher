import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from './BigButton';
import { semantic, spacing, typography } from './theme';

type Props = {
  /** Already translated, e.g. "No workouts yet". */
  title: string;
  /** One short sentence: why it is empty or what to do. */
  message?: string;
  /** The one action that fixes the empty state, e.g. "Create workout". */
  action?: { label: string; onPress: () => void; testID?: string };
  /** A small icon or illustration (lightweight; never loaded media). Arrives with 001B / 001E. */
  illustration?: ReactNode;
  testID?: string;
};

/**
 * An intentional empty state (UX-VISUAL-001A foundation): title, a short
 * explanation and, when there is one, the action that fills it. The title is
 * announced as a header; testIDs `-title`, `-message`.
 */
export function EmptyState({ title, message, action, illustration, testID }: Props) {
  return (
    <View style={styles.box} testID={testID}>
      {illustration ?? null}
      <Text style={styles.title} accessibilityRole="header" testID={testID ? `${testID}-title` : undefined}>
        {title}
      </Text>
      {message ? (
        <Text style={styles.message} testID={testID ? `${testID}-message` : undefined}>
          {message}
        </Text>
      ) : null}
      {action ? <BigButton testID={action.testID} label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'stretch', gap: spacing.md, paddingVertical: spacing.lg },
  title: { ...typography.heading, color: semantic.textPrimary, textAlign: 'center' },
  message: { ...typography.body, color: semantic.textSecondary, textAlign: 'center' },
});
