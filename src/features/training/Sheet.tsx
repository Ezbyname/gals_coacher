import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n/I18nProvider';
import { BottomInsetHandledContext } from '@/ui/bottomInset';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { colors, spacing, touch } from '@/ui/theme';

/** A full-screen sheet over the Builder (the draft stays mounted underneath: nothing typed there is lost). */
export function Sheet(props: { visible: boolean; testID: string; title: string; closeTestID: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <BottomInsetHandledContext.Provider value={false}>
        <View style={[styles.sheet, { paddingTop: insets.top }]} testID={props.testID}>
          <View style={styles.sheetBar}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {props.title}
            </Text>
            <Pressable testID={props.closeTestID} accessibilityRole="button" accessibilityLabel={t('training.builder.close')} onPress={props.onClose} style={styles.sheetClose}>
              <Text style={styles.sheetCloseLabel}>{t('training.builder.close')}</Text>
            </Pressable>
          </View>
          <KeyboardSafeScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {props.children}
          </KeyboardSafeScrollView>
        </View>
      </BottomInsetHandledContext.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: touch.buttonMinHeight },
  sheetTitle: { flexShrink: 1, fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  sheetClose: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md },
  sheetCloseLabel: { fontSize: 16, fontWeight: '700', color: colors.courtDark },
});
