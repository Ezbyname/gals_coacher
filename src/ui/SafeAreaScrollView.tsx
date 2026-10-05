import type { Ref } from 'react';
import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The bottom padding the caller asked for (padding → paddingVertical → paddingBottom, last wins). */
function callerBottomPadding(style: ScrollViewProps['contentContainerStyle']): number {
  const flat = StyleSheet.flatten(style) ?? {};
  const bottom = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding;
  return typeof bottom === 'number' ? bottom : 0;
}

/**
 * A ScrollView whose content can scroll clear of the system navigation area.
 * The app draws edge-to-edge on Android, so the last controls of a long
 * screen would otherwise sit under the navigation bar.
 *
 * Adds the device's real bottom safe-area inset to the caller's own bottom
 * padding; every other content style (horizontal / top padding, gap, …) is
 * kept as given. Only the bottom edge is handled: the header covers the top.
 * A `ref` reaches the inner ScrollView (e.g. to scroll a field into view).
 */
export function SafeAreaScrollView({
  contentContainerStyle,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[
        contentContainerStyle,
        { paddingBottom: callerBottomPadding(contentContainerStyle) + insets.bottom },
      ]}
    />
  );
}
