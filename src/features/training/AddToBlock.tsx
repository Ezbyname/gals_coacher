import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { getExercise } from '@/data/local/exercises/exerciseRepository';
import {
  addExerciseToBlock,
  listBlocks,
  type BlockErrors,
  type WorkoutBlock,
} from '@/data/local/training/workoutRepository';
import type { Exercise } from '@/domain/exercise/exercise';
import { useApp } from '@/features/AppProvider';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { exerciseName } from '@/features/exercises/exerciseLabels';
import { useI18n } from '@/i18n/I18nProvider';
import { isolate, stripBidi } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { blockPath, newBlockWithExercisePath, trainingErrorMessage } from './trainingLabels';

type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; exercise: Exercise; blocks: WorkoutBlock[] };

const norm = (s: string) => stripBidi(s).normalize('NFC').toLocaleLowerCase().trim();

/**
 * QB-BLOCK-LIBRARY — Exercise Details → Add to block. Pick one of the ACTIVE blocks (searchable) or start a new
 * block with this Exercise. Choosing a block appends the Exercise with its default sets / target and opens the
 * block so the prescription can be adjusted. An inactive Exercise cannot be added (the library says why).
 */
export function AddToBlock({ exerciseId }: { exerciseId: string }) {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      Promise.all([getExercise(boot.db, exerciseId), listBlocks(boot.db)])
        .then(([exercise, blocks]) => {
          if (!active) return;
          setLoaded(exercise === null ? { status: 'error' } : { status: 'ready', exercise, blocks });
        })
        .catch((e: unknown) => {
          console.warn('[training] add-to-block load failed', e);
          if (active) setLoaded({ status: 'error' });
        });
      return () => {
        active = false;
      };
    }, [boot, exerciseId]),
  );

  if (boot.status === 'error' || loaded.status === 'error') {
    return <ErrorScreen testID="add-to-block-error" message="training.errors.notFound" fallback="/exercises" />;
  }
  if (loaded.status === 'loading') return <LoadingScreen />;
  const { exercise } = loaded;
  const name = isolate(exerciseName(exercise, language));

  if (!exercise.active) {
    return (
      <KeyboardSafeScrollView testID="add-to-block-scroll" contentContainerStyle={styles.container}>
        <Text style={styles.error} testID="add-to-block-inactive">
          {t('training.errors.exerciseInactive')}
        </Text>
        <BigButton testID="add-to-block-back" variant="secondary" label={t('training.cancel')} onPress={() => router.back()} />
      </KeyboardSafeScrollView>
    );
  }

  const q = norm(query);
  const blocks = loaded.blocks.filter((b) => b.active && (q === '' || norm(b.name).includes(q)));

  const add = async (block: WorkoutBlock) => {
    if (busy.current || boot.status !== 'ready') return;
    busy.current = true;
    setFailure(null);
    try {
      const result = await addExerciseToBlock(boot.db, block.id, exercise.id, { clock: services.clock });
      if (result.ok) {
        router.replace(blockPath(block.id)); // open the block so the user can adjust the new item
        return;
      }
      setFailure(blockErrorKey(result.errors));
    } catch (e) {
      console.warn('[training] add-to-block failed', e);
      setFailure(trainingErrorMessage(e));
    }
    busy.current = false;
  };

  return (
    <KeyboardSafeScrollView testID="add-to-block-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>{t('training.addToBlockHint', { name })}</Text>
      {failure ? (
        <Text style={styles.error} testID="add-to-block-failed">
          {t(failure)}
        </Text>
      ) : null}
      <BigButton
        testID="add-to-block-new"
        label={t('training.addToBlockNew')}
        onPress={() => router.push(newBlockWithExercisePath(exercise.id))}
      />
      <TextField testID="add-to-block-search" label={t('training.searchLabel')} value={query} onChangeText={setQuery} />
      {loaded.blocks.every((b) => !b.active) ? (
        <Text style={styles.muted} testID="add-to-block-none">
          {t('training.addToBlockNone')}
        </Text>
      ) : blocks.length === 0 ? (
        <Text style={styles.muted} testID="add-to-block-no-matches">
          {t('training.libraryNoMatches')}
        </Text>
      ) : (
        blocks.map((block) => (
          <Pressable
            key={block.id}
            testID={`add-to-block-${block.id}`}
            accessibilityRole="button"
            accessibilityLabel={stripBidi(t('training.rowA11y', { name: block.name, details: t('training.blockSummary', { count: block.items.length }) }))}
            onPress={() => void add(block)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
            <Text style={styles.name}>{block.name}</Text>
            <Text style={styles.muted}>{t('training.blockSummary', { count: block.items.length })}</Text>
          </Pressable>
        ))
      )}
    </KeyboardSafeScrollView>
  );
}

function blockErrorKey(errors: BlockErrors): TranslationKey {
  if (errors.inactiveItems) return 'training.errors.inactiveItems';
  return 'training.errors.changeFailed';
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
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
});
