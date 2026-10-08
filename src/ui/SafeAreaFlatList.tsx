import { useContext, type Ref } from 'react';
import { FlatList, StyleSheet, type FlatListProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomInsetHandledContext } from './bottomInset';

/**
 * A virtualized list (only the rows near the screen are rendered) whose
 * content can scroll clear of the system navigation area — the FlatList
 * counterpart of SafeAreaScrollView, for long lists such as the exercise
 * library. Adds the device's real bottom safe-area inset to the caller's own
 * bottom padding, unless the main navigation bar already keeps clear of it.
 */
export function SafeAreaFlatList<T>({
  contentContainerStyle,
  ...props
}: FlatListProps<T> & { ref?: Ref<FlatList<T>> }) {
  const insets = useSafeAreaInsets();
  const bottomHandled = useContext(BottomInsetHandledContext);
  const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
  const bottom = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding;
  return (
    <FlatList<T>
      {...props}
      contentContainerStyle={[
        contentContainerStyle,
        { paddingBottom: (typeof bottom === 'number' ? bottom : 0) + (bottomHandled ? 0 : insets.bottom) },
      ]}
    />
  );
}
