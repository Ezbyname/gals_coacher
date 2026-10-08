import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NO_EXERCISE_FILTER, filterExercises, searchKey, type Exercise } from '@/domain/exercise/exercise';
import { TAXONOMY_GROUPS, type TaxonomyGroup } from '@/domain/taxonomy/nodes';
import { isVisible, visibleChildren, type Taxonomy, type TaxonomyNode } from '@/domain/taxonomy/taxonomy';
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

/** What a category view needs: the library and the taxonomy, read together. */
export type TaxonomyData = {
  readonly exercises: readonly Exercise[];
  readonly taxonomy: Taxonomy;
  /** Ids of the ACTIVE exercises: the only ones a category offers for new selection. */
  readonly activeIds: ReadonlySet<string>;
};

/** Whether `nodeKey` (null = the domains) can be shown for new selection right now. */
export const categoryAvailable = (data: TaxonomyData, nodeKey: string | null) =>
  nodeKey === null || (data.taxonomy.node(nodeKey) !== null && isVisible(data.taxonomy, nodeKey, data.activeIds));

/**
 * One training category (TRAIN-TAXONOMY-001C, PRODUCT_SPEC §73), as a route of
 * the Exercise Library. The view itself is shared with the Workout Builder
 * picker (001D), so there is one browsing implementation.
 */
export function TaxonomyBrowser({ nodeKey }: { nodeKey: string }) {
  const { t } = useI18n();
  const data = useExerciseLibrary();

  if (data.status === 'error') {
    return <ErrorScreen testID="taxonomy-error" message="exercises.loadFailed" fallback={LIBRARY_PATH} />;
  }
  if (data.status === 'loading') return <LoadingScreen />;
  if (!categoryAvailable(data, nodeKey)) {
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
  return (
    <>
      <Stack.Screen options={{ title: nodeLabel(t, nodeKey) }} />
      <TaxonomyView data={data} nodeKey={nodeKey} onOpenNode={(key) => router.push(categoryPath(key))} />
    </>
  );
}

/**
 * The category view (shared): where you are (breadcrumb), the sub-categories
 * with their counts (Fitness keeps "by body area" and "by training goal" as
 * separate sections), and the exercises: the node's own and every
 * sub-category's, each listed once. `nodeKey` null shows the domains (Fitness,
 * Basketball…). A domain or the top level shows categories only. The search
 * looks inside the current category; one tap switches it to all exercises,
 * so Search All is never more than a tap away (at the top level it IS all).
 *
 * Browse mode opens an exercise's details; pick mode (`onPick`) hands the
 * chosen exercise back — the same exercise id whatever the path. Choose mode
 * (`choose`, 001E) picks a CATEGORY: the current one ("Choose …"), or one
 * found by searching category names, each shown with its full path.
 */
export function TaxonomyView({
  data,
  nodeKey,
  onOpenNode,
  onPick,
  choose,
  top,
}: {
  data: TaxonomyData;
  nodeKey: string | null;
  onOpenNode: (key: string) => void;
  onPick?: (exercise: Exercise) => void;
  choose?: CategoryChoice;
  /** Extra controls above the breadcrumb (the picker's Close / Back). */
  top?: React.ReactNode;
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const allScope = searchAll || nodeKey === null;

  const shelf = useMemo((): readonly Exercise[] => {
    if (nodeKey === null) return data.exercises.filter((e) => e.active);
    const under = data.taxonomy.exerciseIdsUnder(nodeKey);
    return data.exercises.filter((e) => e.active && under.has(e.id));
  }, [data, nodeKey]);

  const searching = query.trim().length > 0;
  const results = useMemo(
    () =>
      searching && !choose
        ? filterExercises(allScope ? data.exercises : shelf, { ...NO_EXERCISE_FILTER, query }, language)
        : [],
    [data, allScope, searching, shelf, query, language, choose],
  );
  // Choose mode: search category names (full path, current language) in scope.
  const categoryResults = useMemo(() => {
    if (!choose || !searching) return [];
    const wanted = searchKey(query);
    return data.taxonomy.nodes
      .filter((n) => n.depth > 0 && isVisible(data.taxonomy, n.key, data.activeIds))
      .filter((n) => allScope || data.taxonomy.path(n.key).some((a) => a.key === nodeKey))
      .map((n) => ({ key: n.key, path: pathLabel(t, data.taxonomy.path(n.key).map((a) => a.key)) }))
      .filter((n) => searchKey(n.path).includes(wanted));
  }, [choose, searching, query, data, allScope, nodeKey, t]);

  const label = nodeKey === null ? t('taxonomy.home') : nodeLabel(t, nodeKey);
  const path =
    nodeKey === null
      ? label
      : pathLabel(
          t,
          data.taxonomy.path(nodeKey).map((n) => n.key),
        );
  const sections = sectionsOf(visibleChildren(data.taxonomy, nodeKey, data.activeIds));
  const hasChildren = sections.length > 0;
  const isTop = nodeKey === null || data.taxonomy.node(nodeKey)?.depth === 0;
  const showList = !choose && (searching || !isTop);
  const listed = searching ? results : isTop ? [] : shelf;
  const listTitle = searching
    ? t('taxonomy.results')
    : hasChildren
      ? t('taxonomy.allIn', { label })
      : t('taxonomy.exercises');
  const searchAllLabel = t('taxonomy.searchAll');

  const header = (
    <View style={styles.header}>
      {top}
      <Text
        style={styles.breadcrumb}
        testID="taxonomy-breadcrumb"
        accessibilityLabel={t('taxonomy.breadcrumbA11y', { path })}>
        {path}
      </Text>
      <TextField
        testID="taxonomy-search"
        label={allScope ? searchAllLabel : t('taxonomy.searchIn', { label })}
        value={query}
        onChangeText={setQuery}
      />
      {nodeKey !== null ? (
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
      ) : null}
      <Text style={styles.hint} testID="taxonomy-search-scope">
        {allScope ? t('taxonomy.scopeAll') : t('taxonomy.scopeNode', { label })}
      </Text>

      {choose && nodeKey !== null && !isTop && !searching ? (
        <ChooseButton testID="taxonomy-choose" nodeKey={nodeKey} path={path} choose={choose} current />
      ) : null}
      {choose && searching ? (
        <View style={styles.section} testID="taxonomy-category-results">
          {categoryResults.length === 0 ? (
            <Text style={styles.hint} testID="taxonomy-none">
              {t('taxonomy.noCategories')}
            </Text>
          ) : (
            categoryResults.map((r) => (
              <ChooseButton key={r.key} testID={`taxonomy-choose-${r.key}`} nodeKey={r.key} path={r.path} choose={choose} />
            ))
          )}
        </View>
      ) : null}

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
                  onPress={() => onOpenNode(child.key)}
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
      renderItem={({ item }) => <ExerciseRow exercise={item} onPress={onPick && (() => onPick(item))} />}
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

/** Choose mode (TRAIN-TAXONOMY-001E): what to do with a chosen category, and why one cannot be chosen. */
export type CategoryChoice = {
  onChoose: (key: string) => void;
  /** Translated reason (e.g. "Already added"), or null when it can be chosen. */
  unavailable: (key: string) => string | null;
};

/** "Choose Basketball › Shooting" — the full path, so similar names are never ambiguous. */
function ChooseButton({
  nodeKey,
  path,
  choose,
  current,
  testID,
}: {
  nodeKey: string;
  path: string;
  choose: CategoryChoice;
  current?: boolean;
  testID: string;
}) {
  const { t } = useI18n();
  const reason = choose.unavailable(nodeKey);
  const label = current ? t('taxonomy.chooseThis', { path }) : path;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: reason !== null }}
      accessibilityLabel={reason ? `${label}, ${reason}` : label}
      disabled={reason !== null}
      onPress={() => choose.onChoose(nodeKey)}
      style={({ pressed }) => [
        styles.choose,
        current && styles.chooseCurrent,
        reason !== null && styles.chooseDisabled,
        pressed && { opacity: 0.8 },
      ]}>
      <Text style={[styles.chooseLabel, current && styles.chooseLabelCurrent]} testID={`${testID}-label`}>
        {label}
      </Text>
      {reason ? (
        <Text style={styles.hint} testID={`${testID}-reason`}>
          {reason}
        </Text>
      ) : null}
    </Pressable>
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
  choose: {
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chooseCurrent: { backgroundColor: colors.ink, borderColor: colors.ink },
  chooseDisabled: { opacity: 0.55 },
  chooseLabel: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  chooseLabelCurrent: { color: colors.background },
  unavailable: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  message: { fontSize: 17, color: colors.ink, textAlign: 'center' },
});
