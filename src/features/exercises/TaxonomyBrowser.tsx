import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NO_EXERCISE_FILTER, filterExercises, type Exercise } from '@/domain/exercise/exercise';
import { TAXONOMY_GROUPS, type TaxonomyGroup } from '@/domain/taxonomy/nodes';
import { isVisible, visibleChildren, type TaxonomyNode } from '@/domain/taxonomy/taxonomy';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaFlatList } from '@/ui/SafeAreaFlatList';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

import { CategoryButton } from './CategoryButton';
import { ExerciseRow } from './ExerciseLibrary';
import { categoryPath, groupLabel, nodeLabel, pathLabel } from './taxonomyLabels';
import { useExerciseLibrary } from './useExerciseLibrary';

const LIBRARY_PATH = '/exercises';

/**
 * One training category (TRAIN-TAXONOMY-001C, PRODUCT_SPEC §73): where you are
 * (breadcrumb), its sub-categories with their counts (Fitness keeps "by body
 * area" and "by training goal" as separate sections), and its exercises: its
 * own and every sub-category's, each listed once. A domain (the top level)
 * shows categories only. The search here looks inside this category; one tap
 * switches it to all exercises, so Search All is never more than a tap away.
 * Only active exercises and visible categories are offered; a category that is
 * inactive or empty is never shown, and reached directly it says so.
 */
export function TaxonomyBrowser({ nodeKey }: { nodeKey: string }) {
  const { t, language } = useI18n();
  const data = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [searchAll, setSearchAll] = useState(false);

  const node = data.status === 'ready' ? data.taxonomy.node(nodeKey) : null;
  const visible =
    data.status === 'ready' && node !== null && isVisible(data.taxonomy, nodeKey, data.activeIds);

  const shelf = useMemo((): readonly Exercise[] => {
    if (data.status !== 'ready' || !visible) return [];
    const under = data.taxonomy.exerciseIdsUnder(nodeKey);
    return data.exercises.filter((e) => e.active && under.has(e.id));
  }, [data, nodeKey, visible]);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching || data.status !== 'ready') return [];
    return filterExercises(searchAll ? data.exercises : shelf, { ...NO_EXERCISE_FILTER, query }, language);
  }, [data, searchAll, searching, shelf, query, language]);

  if (data.status === 'error') {
    return <ErrorScreen testID="taxonomy-error" message="exercises.loadFailed" fallback={LIBRARY_PATH} />;
  }
  if (data.status === 'loading') return <LoadingScreen />;

  if (node === null || !visible) {
    return (
      <View style={styles.unavailable} testID="taxonomy-unavailable">
        <Stack.Screen options={{ title: t('taxonomy.title') }} />
        <Text style={styles.message}>{t('taxonomy.unavailable')}</Text>
        <BigButton
          testID="taxonomy-unavailable-back"
          label={t('taxonomy.backToLibrary')}
          onPress={() => router.dismissTo(LIBRARY_PATH)}
        />
      </View>
    );
  }

  const label = nodeLabel(t, nodeKey);
  const path = pathLabel(
    t,
    data.taxonomy.path(nodeKey).map((n) => n.key),
  );
  const sections = sectionsOf(visibleChildren(data.taxonomy, nodeKey, data.activeIds));
  const hasChildren = sections.length > 0;
  const isDomain = node.depth === 0;
  const showList = searching || !isDomain;
  const listed = searching ? results : isDomain ? [] : shelf;
  const listTitle = searching
    ? t('taxonomy.results')
    : hasChildren
      ? t('taxonomy.allIn', { label })
      : t('taxonomy.exercises');
  const searchAllLabel = t('taxonomy.searchAll');

  const header = (
    <View style={styles.header}>
      <Stack.Screen options={{ title: label }} />
      <Text
        style={styles.breadcrumb}
        testID="taxonomy-breadcrumb"
        accessibilityLabel={t('taxonomy.breadcrumbA11y', { path })}>
        {path}
      </Text>
      <TextField
        testID="taxonomy-search"
        label={searchAll ? searchAllLabel : t('taxonomy.searchIn', { label })}
        value={query}
        onChangeText={setQuery}
      />
      <View style={styles.scopeRow}>
        <Pressable
          testID="taxonomy-search-all"
          accessibilityRole="switch"
          accessibilityState={{ checked: searchAll }}
          accessibilityLabel={searchAllLabel}
          onPress={() => setSearchAll(!searchAll)}
          style={[styles.pill, searchAll && styles.pillActive]}>
          <Text style={styles.pillLabel} testID="taxonomy-search-all-label">
            {searchAll ? t('exercises.selectedChip', { label: searchAllLabel }) : searchAllLabel}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.hint} testID="taxonomy-search-scope">
        {searchAll ? t('taxonomy.scopeAll') : t('taxonomy.scopeNode', { label })}
      </Text>

      {!searching
        ? sections.map(({ group, nodes }) => (
            <View
              key={group ?? 'categories'}
              style={styles.section}
              testID={group ? `taxonomy-group-${group}` : 'taxonomy-children'}>
              {group ? (
                <Text style={styles.heading} accessibilityRole="header" testID={`taxonomy-group-${group}-title`}>
                  {groupLabel(t, group)}
                </Text>
              ) : null}
              {nodes.map((child) => (
                <CategoryButton
                  key={child.key}
                  testID={`taxonomy-node-${child.key}`}
                  nodeKey={child.key}
                  taxonomy={data.taxonomy}
                  activeIds={data.activeIds}
                  onPress={() => router.push(categoryPath(child.key))}
                />
              ))}
            </View>
          ))
        : null}

      {showList ? (
        <Text style={styles.heading} accessibilityRole="header" testID="taxonomy-exercises-title">
          {listTitle}
        </Text>
      ) : null}
      {showList ? (
        <Text style={styles.count} testID="taxonomy-count">
          {t('taxonomy.count', { count: listed.length })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaFlatList<Exercise>
      testID="taxonomy-scroll"
      data={listed}
      keyExtractor={(exercise) => exercise.id}
      renderItem={({ item }) => <ExerciseRow exercise={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        searching ? (
          <Text style={styles.hint} testID="taxonomy-none">
            {t('exercises.none')}
          </Text>
        ) : null
      }
      ItemSeparatorComponent={Separator}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    />
  );
}

/** Sub-categories in display order, split by group (Fitness: body area / training goal), never mixed. */
function sectionsOf(
  children: readonly TaxonomyNode[],
): { group: TaxonomyGroup | null; nodes: readonly TaxonomyNode[] }[] {
  const ungrouped = children.filter((c) => c.group === null);
  const grouped = TAXONOMY_GROUPS.map((group) => ({ group, nodes: children.filter((c) => c.group === group) }));
  return [
    ...(ungrouped.length > 0 ? [{ group: null, nodes: ungrouped }] : []),
    ...grouped.filter((s) => s.nodes.length > 0),
  ];
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  section: { gap: spacing.sm },
  separator: { height: spacing.md },
  breadcrumb: { fontSize: 15, fontWeight: '700', color: colors.inkMuted, textAlign: 'auto' },
  heading: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  hint: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  count: { fontSize: 14, fontWeight: '700', color: colors.inkMuted, textAlign: 'auto' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { borderColor: colors.ink, borderWidth: 2 },
  pillLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  unavailable: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  message: { fontSize: 17, color: colors.ink, textAlign: 'center' },
});
