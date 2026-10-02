import * as Haptics from 'expo-haptics';

/** Platform-neutral haptic feedback used by training controls (MADE/MISS/STOP). */
export interface HapticsService {
  tap(): void;
  success(): void;
  warning(): void;
}

export function createExpoHapticsService(): HapticsService {
  // Haptics are best-effort: a missing actuator must never break a workout.
  const ignore = () => {};
  return {
    tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignore),
    success: () =>
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
    warning: () =>
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignore),
  };
}
