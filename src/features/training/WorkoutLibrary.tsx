import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  listBlocks,
  listTemplates,
  type WorkoutBlock,
  type WorkoutTemplate,
} from '@/data/local/training/workoutRepository';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { stripBidi } from '@/i18n/bidi';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing, touch } from '@/ui/theme';

import { blockPath, newBlockPath, newTemplatePath, templatePath } from './trainingLabels';

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; templates: WorkoutTemplate[]; blocks: WorkoutBlock[] }
  | { status: 'error' };

/** Active first, then inactive; each in creation order. */
const activeFirst = <T extends { active: boolean }>(list: T[]) => [
  ...list.filter((x) => x.active),
  ...list.filter((x) => !x.active),
];

/**
 * The workout builder's home (TRAIN-002): reusable workout templates and the
 * blocks they are built from. Reloads on focus.
 */
export function WorkoutLibrary() {
  const { boot } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      Promise.all([listTemplates(boot.db), listBlocks(boot.db)])
        .then(([templates, blocks]) => active && setLoaded({ status: 'ready', templates, blocks }))
        .catch((e: unknown) => {
          console.warn('[training] library failed', e);
          if (active) setLoaded({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot]),
  );

  if (boot.status === 'error' || loaded.status === 'error') {
    return <ErrorScreen testID="workouts-error" message="training.errors.loadFailed" fallback="/exercises" />;
  }
  if (loaded.status === 'loading') return <LoadingScreen />;

  return (
    <SafeAreaScrollView testID="workouts-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted}>{t('training.about')}</Text>

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.templates')}
      </Text>
      {loaded.templates.length === 0 ? (
        <Text style={styles.muted} testID="workouts-no-templates">
          {t('training.noTemplates')}
        </Text>
      ) : (
        activeFirst(loaded.templates).map((template) => (
          <Row
            key={template.id}
            testID={`workout-template-${template.id}`}
            name={template.name}
            details={t('training.templateSummary', {
              blocks: template.blocks.length,
              exercises: template.blocks.reduce((n, b) => n + b.items.length, 0),
            })}
            active={template.active}
            onPress={() => router.push(templatePath(template.id))}
          />
        ))
      )}
      <BigButton
        testID="workouts-new-template"
        variant="secondary"
        label={t('training.newTemplate')}
        onPress={() => router.push(newTemplatePath)}
      />

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.blocks')}
      </Text>
      {loaded.blocks.length === 0 ? (
        <Text style={styles.muted} testID="workouts-no-blocks">
          {t('training.noBlocks')}
        </Text>
      ) : (
        activeFirst(loaded.blocks).map((block) => (
          <Row
            key={block.id}
            testID={`workout-block-${block.id}`}
            name={block.name}
            details={t('training.blockSummary', { count: block.items.length })}
            active={block.active}
            onPress={() => router.push(blockPath(block.id))}
          />
        ))
      )}
      <BigButton
        testID="workouts-new-block"
        variant="secondary"
        label={t('training.newBlock')}
        onPress={() => router.push(newBlockPath)}
      />
    </SafeAreaScrollView>
  );
}

function Row(props: { testID: string; name: string; details: string; active: boolean; onPress: () => void }) {
  const { t } = useI18n();
  const details = props.active ? props.details : `${props.details}, ${t('training.inactive')}`;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={stripBidi(t('training.rowA11y', { name: props.name, details }))}
      onPress={props.onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <Text style={styles.name} testID={`${props.testID}-name`}>
        {props.name}
      </Text>
      <Text style={styles.muted} testID={`${props.testID}-details`}>
        {props.details}
      </Text>
      {!props.active ? (
        <Text style={styles.inactive} testID={`${props.testID}-inactive`}>
          {t('training.inactive')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto', marginTop: spacing.sm },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  row: {
    minHeight: touch.buttonMinHeight,
    gap: 2,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  inactive: { fontSize: 13, fontWeight: '800', color: colors.inkMuted, textAlign: 'auto' },
});
