import { Pressable, StyleSheet, Text, View } from 'react-native';

import { activeCountUnder, type Taxonomy } from '@/domain/taxonomy/taxonomy';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, spacing, touch } from '@/ui/theme';

import { nodeLabel } from './taxonomyLabels';

/**
 * One training category as a large button: its name and how many active
 * exercises it holds. Screen readers hear both ("Shooting, 8 exercises"); the
 * count is text, never colour. `testID` names the button; the label and the
 * count carry `-label` / `-count`.
 */
export function CategoryButton({
  nodeKey,
  taxonomy,
  activeIds,
  onPress,
  testID,
}: {
  nodeKey: string;
  taxonomy: Taxonomy;
  activeIds: ReadonlySet<string>;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useI18n();
  const label = nodeLabel(t, nodeKey);
  const count = activeCountUnder(taxonomy, nodeKey, activeIds);
  const hasChildren = taxonomy.children(nodeKey).length > 0;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t('taxonomy.nodeA11y', { label, count })}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
      <View style={styles.text}>
        <Text style={styles.label} testID={`${testID}-label`}>
          {label}
        </Text>
        <Text style={styles.count} testID={`${testID}-count`}>
          {t('taxonomy.count', { count })}
        </Text>
      </View>
      {hasChildren ? (
        <Text style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>
          {t('taxonomy.more')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touch.buttonMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  count: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  chevron: { fontSize: 24, color: colors.inkMuted },
});
