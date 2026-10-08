import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Exercise } from '@/domain/exercise/exercise';
import { useI18n } from '@/i18n/I18nProvider';
import { BottomInsetHandledContext } from '@/ui/bottomInset';
import { colors, spacing } from '@/ui/theme';

import { TaxonomyView, categoryAvailable, type CategoryChoice, type TaxonomyData } from './TaxonomyBrowser';

/**
 * Choose an exercise by training category (TRAIN-TAXONOMY-001D): the SAME
 * category view as the Exercise Library, in pick mode, over the form that
 * opened it. Top level → domain → category → sub-category → exercise; the
 * chosen exercise is handed back (one exercise, the same id whatever the
 * path) and the picker closes. Back (button or system back) goes up one
 * level; Close returns to the form unchanged — the form stays mounted
 * underneath, so nothing typed there is lost.
 */
export function ExercisePicker({
  visible,
  data,
  onPick,
  onClose,
}: {
  visible: boolean;
  data: TaxonomyData;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  return <TaxonomyPicker visible={visible} data={data} mode={{ kind: 'exercise', onPick }} onClose={onClose} />;
}

/**
 * Choose a training CATEGORY (TRAIN-TAXONOMY-001E: template classification)
 * with the same picker: navigate to it and tap "Choose …", or search category
 * names. `unavailable` says why one cannot be chosen (e.g. already added).
 */
export function CategoryPicker({
  visible,
  data,
  choose,
  onClose,
}: {
  visible: boolean;
  data: TaxonomyData;
  choose: CategoryChoice;
  onClose: () => void;
}) {
  return <TaxonomyPicker visible={visible} data={data} mode={{ kind: 'category', choose }} onClose={onClose} />;
}

type PickerMode =
  | { kind: 'exercise'; onPick: (exercise: Exercise) => void }
  | { kind: 'category'; choose: CategoryChoice };

/** The one picker implementation behind ExercisePicker and CategoryPicker. */
function TaxonomyPicker({
  visible,
  data,
  mode,
  onClose,
}: {
  visible: boolean;
  data: TaxonomyData;
  mode: PickerMode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [stack, setStack] = useState<string[]>([]);
  const current = stack.length > 0 ? stack[stack.length - 1]! : null;
  const nodeKey = categoryAvailable(data, current) ? current : null;

  const close = () => {
    setStack([]);
    onClose();
  };
  const back = () => (stack.length > 0 ? setStack(stack.slice(0, -1)) : close());

  const top = (
    <View style={styles.bar}>
      {stack.length > 0 ? (
        <Pressable
          testID="taxonomy-back"
          accessibilityRole="button"
          accessibilityLabel={t('taxonomy.back')}
          onPress={back}
          style={styles.barButton}>
          <Text style={styles.barLabel}>{t('taxonomy.back')}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title} accessibilityRole="header" testID="taxonomy-picker-title">
        {t(mode.kind === 'category' ? 'taxonomy.categoryPickerTitle' : 'taxonomy.pickerTitle')}
      </Text>
      <Pressable
        testID="taxonomy-picker-close"
        accessibilityRole="button"
        accessibilityLabel={t('taxonomy.close')}
        onPress={close}
        style={styles.barButton}>
        <Text style={styles.barLabel}>{t('taxonomy.close')}</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      <BottomInsetHandledContext.Provider value={false}>
        <View style={[styles.screen, { paddingTop: insets.top }]} testID="taxonomy-picker">
          <TaxonomyView
            key={nodeKey ?? 'top'}
            data={data}
            nodeKey={nodeKey}
            onOpenNode={(key) => setStack([...stack, key])}
            onPick={
              mode.kind === 'exercise'
                ? (exercise) => {
                    setStack([]);
                    mode.onPick(exercise);
                  }
                : undefined
            }
            choose={
              mode.kind === 'category'
                ? {
                    unavailable: mode.choose.unavailable,
                    onChoose: (key) => {
                      setStack([]);
                      mode.choose.onChoose(key);
                    },
                  }
                : undefined
            }
            top={top}
          />
        </View>
      </BottomInsetHandledContext.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  barButton: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  barLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
