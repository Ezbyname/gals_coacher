import { useContext, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { KeyboardRevealContext } from './KeyboardSafeScrollView';
import { colors, spacing } from './theme';

type Props = {
  /** Already translated. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Translated error shown under the field. */
  error?: string;
  /** Translated unit shown inside the field, after the value (e.g. cm). Display only. */
  unit?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Numbers stay left-to-right inside Hebrew screens. */
  numeric?: boolean;
  /** Several lines of free text (e.g. notes). */
  multiline?: boolean;
  /**
   * Multiline only: the field shows at most this many lines and scrolls inside
   * itself (the text is never cut); when it loses focus it shows its first
   * line again.
   */
  visibleLines?: number;
  /** The most characters that can be typed (UTF-16 code units, as React Native counts). */
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
};

/** Labelled text input (single-line unless `multiline`). Layout uses logical start/end, so it mirrors in RTL. */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  unit,
  keyboardType,
  numeric,
  multiline,
  visibleLines,
  maxLength,
  onFocus,
  onBlur,
  testID,
}: Props) {
  // A bounded multiline field is re-created on blur: a fresh native input
  // starts at its first line. The value is untouched (it is the prop).
  const [instance, setInstance] = useState(0);
  const bounded = multiline && visibleLines !== undefined;
  // Inside a KeyboardSafeScrollView, the focused field (label + box) is kept above the keyboard.
  const keyboard = useContext(KeyboardRevealContext);
  const box = useRef<View>(null);
  const handleFocus = () => {
    onFocus?.();
    keyboard?.focused(box.current);
  };
  const handleBlur = () => {
    onBlur?.();
    keyboard?.blurred(box.current);
    if (bounded) setInstance((n) => n + 1);
  };
  return (
    <View style={styles.field} ref={box} collapsable={false} testID={testID ? `${testID}-field` : undefined}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, !!error && styles.boxError]}>
        <TextInput
          key={instance}
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          numberOfLines={bounded ? visibleLines : undefined}
          scrollEnabled={multiline ? true : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[
            styles.input,
            numeric && styles.numeric,
            multiline && styles.multiline,
            bounded && { height: visibleLines * LINE_HEIGHT + 2 * spacing.sm, minHeight: 0 },
          ]}
        />
        {unit ? (
          <Text style={styles.unit} testID={testID ? `${testID}-unit` : undefined}>
            {unit}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** One text line of a multiline field (fontSize 17). */
const LINE_HEIGHT = 22;

const styles = StyleSheet.create({
  field: { flex: 1, gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  // The input and its unit share one bordered box, so the unit reads as a suffix.
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  boxError: { borderColor: colors.danger },
  input: { flex: 1, minHeight: 46, fontSize: 17, color: colors.ink },
  numeric: { writingDirection: 'ltr', textAlign: 'center' },
  multiline: {
    minHeight: 96,
    lineHeight: LINE_HEIGHT,
    textAlignVertical: 'top',
    paddingVertical: spacing.sm,
  },
  unit: { fontSize: 15, color: colors.inkMuted },
  error: { fontSize: 13, color: colors.danger },
});
