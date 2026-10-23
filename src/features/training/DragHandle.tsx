import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';

import { colors, touch } from '@/ui/theme';

/** A drag shorter than this is a tap / a shaky press, never a reorder. */
const DRAG_THRESHOLD_PX = 8;

/**
 * The grab handle of a reorderable row. ONLY the handle starts a drag, so the row's own fields and its Edit / Remove
 * buttons never move by accident. A drag reports the live offset (for the row to follow the finger) and, on release, the
 * final offset; the parent turns it into a drop position. The same reorder is available WITHOUT a gesture: the handle
 * exposes "move up" / "move down" accessibility actions that call `onStep`, exactly like the visible Move buttons.
 *
 * Built on React Native's PanResponder (no gesture library is installed and none was added). It does not scroll the list
 * while a drag is in progress; a drag that would need scrolling is done with the Move buttons.
 */
export function DragHandle(props: {
  testID: string;
  label: string;
  hint: string;
  moveUpLabel: string;
  moveDownLabel: string;
  onDrag: (dy: number | null) => void;
  onDrop: (dy: number) => void;
  onStep: (by: -1 | 1) => void;
}) {
  const latest = useRef(props);
  latest.current = props;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false, // the scroll view must not take the drag away
        onPanResponderMove: (_event, g) => latest.current.onDrag(Math.abs(g.dy) >= DRAG_THRESHOLD_PX ? g.dy : 0),
        onPanResponderRelease: (_event, g) => {
          latest.current.onDrag(null);
          if (Math.abs(g.dy) >= DRAG_THRESHOLD_PX) latest.current.onDrop(g.dy);
        },
        onPanResponderTerminate: () => latest.current.onDrag(null),
      }),
    [],
  );
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'moveUp') props.onStep(-1);
    if (event.nativeEvent.actionName === 'moveDown') props.onStep(1);
  };
  return (
    <View
      {...responder.panHandlers}
      testID={props.testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityActions={[
        { name: 'moveUp', label: props.moveUpLabel },
        { name: 'moveDown', label: props.moveDownLabel },
      ]}
      onAccessibilityAction={onAction}
      style={styles.handle}>
      <Text style={styles.glyph} importantForAccessibility="no">
        ⋮⋮
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  handle: { minWidth: touch.buttonMinHeight, minHeight: touch.buttonMinHeight, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 22, fontWeight: '800', color: colors.inkMuted },
});
