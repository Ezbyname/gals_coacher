import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

/** Stand-in for a route whose feature arrives in a later slice. Text is already translated. */
export function PlaceholderScreen({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
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
