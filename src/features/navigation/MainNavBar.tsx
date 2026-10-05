import { router, usePathname, useRootNavigationState } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n/I18nProvider';
import { colors, spacing, touch } from '@/ui/theme';

import { MAIN_DESTINATIONS, activeDestination, screenStack, type MainDestination } from './mainDestinations';
import { useUnsavedChanges } from './unsavedChanges';

/**
 * Leaves for a main destination without growing the history: back to it when
 * it is already in the stack; otherwise back to Home, then the destination on
 * top (so Back from any destination returns Home, and Home is the root).
 */
function goTo(destination: MainDestination, routes: readonly string[]) {
  if (routes.includes(destination.route)) {
    router.dismissTo(destination.href);
    return;
  }
  if (routes.includes('index')) router.dismissTo('/');
  else {
    // Opened from a deep link: Home was never under it.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  }
  if (destination.key !== 'home') router.push(destination.href);
}

/**
 * The persistent main navigation (NAV-001): Home, Players, Exercises,
 * Settings — icon + label, the current one marked by weight, an indicator
 * and its selected state (never by color alone). Leaving a screen with
 * unsaved changes asks first (NAV-DIRTY-001). It sits at the bottom and keeps
 * clear of the device's system area itself.
 */
export function MainNavBar() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const { confirmLeave } = useUnsavedChanges();
  const active = activeDestination(pathname);

  const open = async (destination: MainDestination) => {
    const { routes, current } = screenStack(rootState);
    if (current === destination.route) return;
    if (!(await confirmLeave())) return;
    goTo(destination, routes);
  };

  return (
    <View
      testID="main-nav"
      accessibilityRole="tablist"
      accessibilityLabel={t('nav.main')}
      style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {MAIN_DESTINATIONS.map((destination) => {
        const selected = destination.key === active;
        const label = t(destination.label);
        return (
          <Pressable
            key={destination.key}
            testID={`main-nav-${destination.key}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => void open(destination)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
            <View style={[styles.indicator, selected && styles.indicatorSelected]} />
            <Text style={styles.glyph}>{destination.glyph}</Text>
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
              testID={`main-nav-${destination.key}-label`}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    minHeight: touch.buttonMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
    gap: 2,
  },
  indicator: { alignSelf: 'stretch', height: 3, marginBottom: spacing.xs, backgroundColor: 'transparent' },
  indicatorSelected: { backgroundColor: colors.court },
  glyph: { fontSize: 20 },
  label: { fontSize: 12, color: colors.inkMuted },
  labelSelected: { color: colors.ink, fontWeight: '800' },
});
