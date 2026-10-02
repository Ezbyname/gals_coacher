import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/ui/BigButton';
import { colors, spacing } from '@/ui/theme';

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🏀 Ready to train?</Text>
      <Text style={styles.subtitle}>Pick a player, pick a drill, go.</Text>

      <BigButton
        testID="home-quick-training"
        label="QUICK TRAINING"
        onPress={() => router.push('/quick-training')}
      />

      <View style={styles.grid}>
        <BigButton variant="secondary" label="Players" onPress={() => router.push('/children')} />
        <BigButton variant="secondary" label="Exercises" onPress={() => router.push('/exercises')} />
        <BigButton variant="secondary" label="History" onPress={() => router.push('/history')} />
        <BigButton
          testID="home-diagnostics"
          variant="secondary"
          label="Diagnostics"
          onPress={() => router.push('/diagnostics')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 16, color: colors.inkMuted, marginBottom: spacing.sm },
  grid: { gap: spacing.sm, marginTop: spacing.md },
});
