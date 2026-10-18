import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  listBlocks,
  listTemplates,
  setBlockActive,
  setTemplateActive,
  type WorkoutBlock,
  type WorkoutTemplate,
} from '@/data/local/training/workoutRepository';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate, stripBidi } from '@/i18n/bidi';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { blockPath, newBlockPath, newTemplatePath, professionalListPath, templatePath } from './trainingLabels';

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; templates: WorkoutTemplate[]; blocks: WorkoutBlock[] }
  | { status: 'error' };

/** Case-insensitive, bidi-free comparison text ("shoot" finds "Shooting"; Hebrew works the same way). */
const norm = (s: string) => stripBidi(s).normalize('NFC').toLocaleLowerCase().trim();

/**
 * The block library (TRAIN-002, QB-BLOCK-LIBRARY): the user's reusable blocks and the workout templates built
 * from them. One search box filters both by name. Hidden items never clutter the normal lists: they sit behind
 * "Hidden (N)" where each can be restored. Hiding is never a deletion. Reloads on focus.
 */
export function WorkoutLibrary() {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [hiddenBlocksOpen, setHiddenBlocksOpen] = useState(false);
  const [hiddenTemplatesOpen, setHiddenTemplatesOpen] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

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

  const restore = (kind: 'block' | 'template', id: string) => {
    if (boot.status !== 'ready') return;
    setRestoreFailed(false);
    const done =
      kind === 'block'
        ? setBlockActive(boot.db, id, true, { clock: services.clock }).then((b) =>
            setLoaded((l) => (l.status === 'ready' ? { ...l, blocks: l.blocks.map((x) => (x.id === id ? b : x)) } : l)),
          )
        : setTemplateActive(boot.db, id, true, { clock: services.clock }).then((x) =>
            setLoaded((l) => (l.status === 'ready' ? { ...l, templates: l.templates.map((y) => (y.id === id ? x : y)) } : l)),
          );
    done.catch((e: unknown) => {
      console.warn('[training] restore failed', e);
      setRestoreFailed(true);
    });
  };

  const q = norm(query);
  const matching = <T extends { name: string }>(list: T[]) => (q === '' ? list : list.filter((x) => norm(x.name).includes(q)));
  const activeBlocks = matching(loaded.blocks.filter((b) => b.active));
  const hiddenBlocks = loaded.blocks.filter((b) => !b.active);
  const activeTemplates = matching(loaded.templates.filter((x) => x.active));
  const hiddenTemplates = loaded.templates.filter((x) => !x.active);

  return (
    <KeyboardSafeScrollView testID="workouts-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>{t('training.about')}</Text>
      <BigButton testID="workouts-professional" variant="secondary" label={t('training.professional.open')} onPress={() => router.push(professionalListPath)} />
      <TextField testID="workouts-search" label={t('training.searchLabel')} value={query} onChangeText={setQuery} />
      {restoreFailed ? (
        <Text style={styles.error} testID="workouts-restore-failed">
          {t('training.errors.changeFailed')}
        </Text>
      ) : null}

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.blocks')}
      </Text>
      {loaded.blocks.length === 0 ? (
        <Text style={styles.muted} testID="workouts-no-blocks">
          {t('training.noBlocks')}
        </Text>
      ) : activeBlocks.length === 0 ? (
        <Text style={styles.muted} testID={q === '' ? 'workouts-no-blocks' : 'workouts-no-matches-blocks'}>
          {q === '' ? t('training.noBlocks') : t('training.libraryNoMatches')}
        </Text>
      ) : (
        activeBlocks.map((block) => (
          <Row
            key={block.id}
            testID={`workout-block-${block.id}`}
            name={block.name}
            details={t('training.blockSummary', { count: block.items.length })}
            active
            onPress={() => router.push(blockPath(block.id))}
          />
        ))
      )}
      <BigButton testID="workouts-new-block" variant="secondary" label={t('training.newBlock')} onPress={() => router.push(newBlockPath)} />
      {hiddenBlocks.length > 0 ? (
        <HiddenSection
          testID="workouts-hidden-blocks"
          label={t('training.hiddenBlocks', { count: hiddenBlocks.length })}
          open={hiddenBlocksOpen}
          onToggle={() => setHiddenBlocksOpen(!hiddenBlocksOpen)}>
          {matching(hiddenBlocks).map((block) => (
            <Row
              key={block.id}
              testID={`workout-block-${block.id}`}
              name={block.name}
              details={t('training.blockSummary', { count: block.items.length })}
              active={false}
              onPress={() => router.push(blockPath(block.id))}
              onRestore={() => restore('block', block.id)}
            />
          ))}
        </HiddenSection>
      ) : null}

      <Text style={styles.heading} accessibilityRole="header">
        {t('training.templates')}
      </Text>
      {loaded.templates.length === 0 ? (
        <Text style={styles.muted} testID="workouts-no-templates">
          {t('training.noTemplates')}
        </Text>
      ) : activeTemplates.length === 0 ? (
        <Text style={styles.muted} testID={q === '' ? 'workouts-no-templates' : 'workouts-no-matches-templates'}>
          {q === '' ? t('training.noTemplates') : t('training.libraryNoMatches')}
        </Text>
      ) : (
        activeTemplates.map((template) => (
          <Row
            key={template.id}
            testID={`workout-template-${template.id}`}
            name={template.name}
            details={t('training.templateSummary', {
              blocks: template.blocks.length,
              exercises: template.blocks.reduce((n, b) => n + b.items.length, 0),
            })}
            active
            onPress={() => router.push(templatePath(template.id))}
          />
        ))
      )}
      <BigButton testID="workouts-new-template" variant="secondary" label={t('training.newTemplate')} onPress={() => router.push(newTemplatePath)} />
      {hiddenTemplates.length > 0 ? (
        <HiddenSection
          testID="workouts-hidden-templates"
          label={t('training.hiddenTemplates', { count: hiddenTemplates.length })}
          open={hiddenTemplatesOpen}
          onToggle={() => setHiddenTemplatesOpen(!hiddenTemplatesOpen)}>
          {matching(hiddenTemplates).map((template) => (
            <Row
              key={template.id}
              testID={`workout-template-${template.id}`}
              name={template.name}
              details={t('training.templateSummary', {
                blocks: template.blocks.length,
                exercises: template.blocks.reduce((n, b) => n + b.items.length, 0),
              })}
              active={false}
              onPress={() => router.push(templatePath(template.id))}
              onRestore={() => restore('template', template.id)}
            />
          ))}
        </HiddenSection>
      ) : null}
    </KeyboardSafeScrollView>
  );
}

/** "Hidden (3) ›": collapsed by default; the hidden rows (each with Restore) appear only when opened. */
function HiddenSection(props: { testID: string; label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.hiddenSection}>
      <Pressable
        testID={`${props.testID}-toggle`}
        accessibilityRole="button"
        accessibilityState={{ expanded: props.open }}
        accessibilityLabel={stripBidi(props.label)}
        onPress={props.onToggle}
        style={({ pressed }) => [styles.hiddenToggle, pressed && { opacity: 0.8 }]}>
        <Text style={styles.hiddenLabel}>{props.label}</Text>
        <Text style={styles.hiddenLabel}>{props.open ? '⌄' : '›'}</Text>
      </Pressable>
      {props.open ? <View style={styles.hiddenList}>{props.children}</View> : null}
    </View>
  );
}

function Row(props: {
  testID: string;
  name: string;
  details: string;
  active: boolean;
  onPress: () => void;
  onRestore?: () => void;
}) {
  const { t } = useI18n();
  const details = props.active ? props.details : `${props.details}, ${t('training.inactive')}`;
  return (
    <View style={styles.rowWrap}>
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
      {props.onRestore ? (
        <BigButton
          testID={`${props.testID}-restore`}
          variant="secondary"
          label={t('training.restoreA11y', { name: isolate(props.name) })}
          onPress={props.onRestore}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto', marginTop: spacing.sm },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  rowWrap: { gap: spacing.sm },
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
  hiddenSection: { gap: spacing.sm },
  hiddenToggle: {
    minHeight: touch.buttonMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  hiddenLabel: { fontSize: 15, fontWeight: '700', color: colors.inkMuted, textAlign: 'auto' },
  hiddenList: { gap: spacing.md },
});
