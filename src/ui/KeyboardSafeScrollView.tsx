import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { measureWindowRect, revealOffset } from './keyboardReveal';
import { SafeAreaScrollView } from './SafeAreaScrollView';

type Measurable = Parameters<typeof measureWindowRect>[0];

/** What a field inside a keyboard-safe screen reports: "I am focused" / "I am no longer focused". */
export interface KeyboardReveal {
  focused(field: Measurable): void;
  blurred(field: Measurable): void;
}
export const KeyboardRevealContext = createContext<KeyboardReveal | null>(null);

/**
 * A screen-length scroll view that keeps the FOCUSED field above the software
 * keyboard (PRODUCT_SPEC §74, locked): the keyboard padding shrinks the
 * visible area (the app draws edge-to-edge, so the window itself does not
 * shrink on Android), and whenever a field gains focus, the keyboard opens or
 * the content changes size, the view scrolls just enough to show the field —
 * its bottom first (the typing position). Never hard-coded coordinates.
 *
 * Any TextField inside reports itself through KeyboardRevealContext, so a
 * form gets this by using this view instead of SafeAreaScrollView. The same
 * mechanism as the calendar form (CAL-KEY-001), shared.
 */
export function KeyboardSafeScrollView({
  children,
  testID,
  onScroll,
  onLayout,
  onContentSizeChange,
  ...props
}: ScrollViewProps & { testID?: string; children?: ReactNode }) {
  const root = useRef<View>(null);
  const viewport = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const focused = useRef<Measurable>(null);
  const [topInWindow, setTopInWindow] = useState(0);

  const reveal = useCallback(async () => {
    const field = focused.current;
    if (!field) return;
    const [rect, visible] = await Promise.all([measureWindowRect(field), measureWindowRect(viewport.current)]);
    if (!rect || !visible || focused.current !== field) return;
    const y = revealOffset(rect, visible, offset.current);
    if (y !== null) scroll.current?.scrollTo({ y, animated: true });
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => void reveal());
    return () => subscription.remove();
  }, [reveal]);

  const context = useMemo<KeyboardReveal>(
    () => ({
      focused: (field) => {
        focused.current = field;
        void reveal();
      },
      blurred: (field) => {
        if (focused.current === field) focused.current = null;
      },
    }),
    [reveal],
  );

  return (
    <View
      ref={root}
      style={styles.fill}
      testID={testID ? `${testID}-root` : undefined}
      onLayout={() => void measureWindowRect(root.current).then((rect) => rect && setTopInWindow(rect.top))}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior="padding"
        keyboardVerticalOffset={topInWindow}
        testID={testID ? `${testID}-keyboard` : undefined}>
        <View
          ref={viewport}
          style={styles.fill}
          collapsable={false}
          testID={testID ? `${testID}-viewport` : undefined}>
          <KeyboardRevealContext.Provider value={context}>
            <SafeAreaScrollView
              {...props}
              ref={scroll}
              testID={testID}
              keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
              scrollEventThrottle={props.scrollEventThrottle ?? 16}
              onScroll={(event) => {
                offset.current = event.nativeEvent.contentOffset.y;
                onScroll?.(event);
              }}
              // The visible area shrinks once the keyboard padding applies, and a
              // multiline field grows while typing: keep the focused field shown.
              onLayout={(event) => {
                void reveal();
                onLayout?.(event);
              }}
              onContentSizeChange={(w, h) => {
                void reveal();
                onContentSizeChange?.(w, h);
              }}>
              {children}
            </SafeAreaScrollView>
          </KeyboardRevealContext.Provider>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
