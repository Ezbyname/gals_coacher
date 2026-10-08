import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { semantic, spacing, typography } from './theme';

type Props = {
  /** Already translated. */
  title: string;
  subtitle?: string;
  /** An optional control at the logical end of the header (e.g. a small action). */
  action?: ReactNode;
  testID?: string;
};

/**
 * The heading of a screen section (UX-VISUAL-001A). Announced as a header;
 * title and optional subtitle carry `-title` / `-subtitle` testIDs. Logical
 * layout: the action sits at the end (left in Hebrew, right in English).
 */
export function SectionHeader({ title, subtitle, action, testID }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header" testID={testID ? `${testID}-title` : undefined}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} testID={testID ? `${testID}-subtitle` : undefined}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
  title: { ...typography.heading, color: semantic.textPrimary, textAlign: 'auto' },
  subtitle: { ...typography.caption, color: semantic.textSecondary, textAlign: 'auto' },
});
