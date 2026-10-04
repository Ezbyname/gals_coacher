import { render, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SafeAreaScrollView } from '../SafeAreaScrollView';

const FRAME = { x: 0, y: 0, width: 360, height: 800 };

function renderWithBottomInset(bottom: number, element: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: FRAME, insets: { top: 24, left: 0, right: 0, bottom } }}>
      {element}
    </SafeAreaProvider>,
  );
}

/** The content style the native ScrollView finally receives. */
const contentStyle = () =>
  StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle);

describe('SafeAreaScrollView', () => {
  it('keeps the caller padding when the bottom inset is 0', () => {
    renderWithBottomInset(0, <SafeAreaScrollView contentContainerStyle={{ padding: 24 }} />);
    expect(contentStyle()).toMatchObject({ padding: 24, paddingBottom: 24 });
  });

  it.each([48, 16, 0.5])('adds the real bottom inset (%p) to the caller bottom padding', (bottom) => {
    renderWithBottomInset(bottom, <SafeAreaScrollView contentContainerStyle={{ padding: 24 }} />);
    expect(contentStyle().paddingBottom).toBe(24 + bottom);
  });

  it('preserves every other caller content style (horizontal, top, gap, flexGrow, start/end)', () => {
    const caller = StyleSheet.create({
      a: { paddingHorizontal: 12, paddingTop: 8, paddingStart: 3, gap: 32, flexGrow: 1 },
    });
    renderWithBottomInset(48, <SafeAreaScrollView contentContainerStyle={[caller.a, { paddingEnd: 5 }]} />);
    expect(contentStyle()).toEqual({
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingStart: 3,
      paddingEnd: 5,
      gap: 32,
      flexGrow: 1,
      paddingBottom: 48,
    });
  });

  it('uses the most specific caller bottom padding (paddingBottom > paddingVertical > padding)', () => {
    renderWithBottomInset(
      10,
      <SafeAreaScrollView contentContainerStyle={{ padding: 24, paddingVertical: 6, paddingBottom: 2 }} />,
    );
    expect(contentStyle().paddingBottom).toBe(12);
  });

  it('works without a caller content style', () => {
    renderWithBottomInset(30, <SafeAreaScrollView />);
    expect(contentStyle()).toEqual({ paddingBottom: 30 });
  });

  it('passes ScrollView props and children through, and adds no top inset', () => {
    renderWithBottomInset(
      48,
      <SafeAreaScrollView
        testID="scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 4 }}>
        <Text>child</Text>
      </SafeAreaScrollView>,
    );
    const props = screen.UNSAFE_getByType(ScrollView).props;
    expect(props.testID).toBe('scroll');
    expect(props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByText('child')).toBeTruthy();
    expect(contentStyle()).toMatchObject({ padding: 4, paddingBottom: 52 });
    expect(contentStyle().paddingTop).toBeUndefined();
  });
});
