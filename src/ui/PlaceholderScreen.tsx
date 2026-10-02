import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

/** Stand-in for a route whose feature belongs to a later roadmap phase. */
export function PlaceholderScreen({ title, phase }: { title: string; phase: number }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>Arrives in Phase {phase}. See docs/ROADMAP.md.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  body: { fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
});
