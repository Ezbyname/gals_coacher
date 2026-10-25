import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Exercise } from '@/domain/exercise/exercise';
import type { Difficulty } from '@/domain/exercise/taxonomy';
import { allItems, audienceOf, categoryOf, WORKOUT_CATEGORIES, type ProfessionalWorkout, type WorkoutCategory } from '@/domain/training/professional';
import type { SportKey } from '@/domain/sport';
import { sportLabel } from '@/features/calendar/calendarLabels';
import { difficultyLabel } from '@/features/exercises/exerciseLabels';
import { useI18n } from '@/i18n/I18nProvider';
import { stripBidi } from '@/i18n/bidi';
import { BigButton } from '@/ui/BigButton';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { Sheet } from './Sheet';

const LEVELS: Difficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const norm = (s: string) => stripBidi(s).normalize('NFC').toLocaleLowerCase().trim();

/**
 * WORKOUT-TEMPLATES-001 — the built-in Workout Template library, shown over the Builder: browse (category / level / search), PREVIEW
 * (reads only), then Import. Nothing is written here: the Builder adds the template to its local draft, and only the normal Save writes.
 * Only categories that have at least one template are offered, so a Player never meets an empty category.
 */
export function TemplateLibrary(props: {
  visible: boolean;
  templates: readonly ProfessionalWorkout[];
  exercises: readonly Exercise[];
  onImport: (workout: ProfessionalWorkout) => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WorkoutCategory | null>(null);
  const [level, setLevel] = useState<Difficulty | null>(null);
  const [selected, setSelected] = useState<ProfessionalWorkout | null>(null);
  const categories = useMemo(() => WORKOUT_CATEGORIES.filter((c) => props.templates.some((w) => categoryOf(w) === c)), [props.templates]);
  const q = norm(query);
  const shown = props.templates.filter(
    (w) => (category === null || categoryOf(w) === category) && (level === null || w.difficulty === level) && (q === '' || norm(w.name[language === 'he' ? 0 : 1]).includes(q)),
  );
  const close = () => {
    setSelected(null);
    props.onClose();
  };
  const name = (w: ProfessionalWorkout) => w.name[language === 'he' ? 0 : 1];
  const categoryText = (w: ProfessionalWorkout) => {
    const c = categoryOf(w);
    return c === null ? '' : t(`training.tpl.category.${c}`);
  };

  if (selected) {
    const w = selected;
    const byId = new Map(props.exercises.map((e) => [e.id, e]));
    const unavailable = allItems(w).some((i) => !byId.get(i.exerciseId)?.active);
    return (
      <Sheet visible={props.visible} testID="tpl-preview" title={name(w)} closeTestID="tpl-preview-close" onClose={close}>
        <Text style={styles.muted} testID="tpl-preview-meta">
          {t('training.tpl.card', { category: categoryText(w), level: difficultyLabel(t, w.difficulty) })}
        </Text>
        <Text style={styles.muted} testID="tpl-preview-scope">
          {[w.sport === null ? t('training.tpl.scopeGeneral') : sportLabel(t, w.sport as SportKey), t('training.tpl.count', { count: allItems(w).length }), t('training.tpl.minutes', { min: w.minutes[0], max: w.minutes[1] })].join(' · ')}
        </Text>
        {audienceOf(w) === 'EXPERIENCED_OR_SUPERVISED' ? (
          <Text style={styles.warning} testID="tpl-preview-audience">
            {t('training.tpl.audienceExperienced')}
          </Text>
        ) : null}
        <Text style={styles.heading} accessibilityRole="header">
          {t('training.tpl.structure')}
        </Text>
        {w.sections.map((s, n) => (
          <View key={`${n}-${s.role ?? 'x'}`} style={styles.section} testID={`tpl-preview-section-${n}`}>
            <Text style={styles.itemName}>{s.role ? t(`training.tpl.role.${s.role}`) : s.name[language === 'he' ? 0 : 1]}</Text>
            {s.items.map((i, m) => (
              <Text key={`${i.exerciseId}-${m}`} style={styles.muted} testID={`tpl-preview-section-${n}-item-${m}`}>
                {byId.get(i.exerciseId)?.name[language] ?? i.exerciseId}
              </Text>
            ))}
          </View>
        ))}
        <Text style={styles.muted}>{t('training.tpl.importNote')}</Text>
        {unavailable ? (
          <Text style={styles.error} testID="tpl-preview-unavailable">
            {t('training.tpl.unavailable')}
          </Text>
        ) : null}
        <BigButton
          testID="tpl-import"
          label={t('training.tpl.import')}
          disabled={unavailable}
          onPress={() => {
            setSelected(null);
            props.onImport(w);
          }}
        />
        <BigButton testID="tpl-back" variant="secondary" label={t('training.tpl.back')} onPress={() => setSelected(null)} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={props.visible} testID="tpl-library" title={t('training.tpl.libraryTitle')} closeTestID="tpl-library-close" onClose={close}>
      <TextField testID="tpl-search" label={t('training.tpl.search')} value={query} onChangeText={setQuery} />
      <Text style={styles.heading} accessibilityRole="header">
        {t('training.tpl.categoryTitle')}
      </Text>
      <View style={styles.chips}>
        <Chip testID="tpl-category-all" label={t('training.tpl.all')} selected={category === null} onPress={() => setCategory(null)} />
        {categories.map((c) => (
          <Chip key={c} testID={`tpl-category-${c}`} label={t(`training.tpl.category.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Text style={styles.heading} accessibilityRole="header">
        {t('training.tpl.levelTitle')}
      </Text>
      <View style={styles.chips}>
        <Chip testID="tpl-level-all" label={t('training.tpl.all')} selected={level === null} onPress={() => setLevel(null)} />
        {LEVELS.map((l) => (
          <Chip key={l} testID={`tpl-level-${l}`} label={difficultyLabel(t, l)} selected={level === l} onPress={() => setLevel(l)} />
        ))}
      </View>
      {shown.length === 0 ? (
        <Text style={styles.muted} testID="tpl-none">
          {t('training.tpl.none')}
        </Text>
      ) : (
        shown.map((w) => (
          <Pressable
            key={w.id}
            testID={`tpl-option-${w.id}`}
            accessibilityRole="button"
            accessibilityLabel={stripBidi(`${name(w)}. ${categoryText(w)}, ${difficultyLabel(t, w.difficulty)}`)}
            onPress={() => setSelected(w)}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}>
            <Text style={styles.itemName}>{name(w)}</Text>
            <Text style={styles.muted}>
              {[t('training.tpl.card', { category: categoryText(w), level: difficultyLabel(t, w.difficulty) }), t('training.tpl.count', { count: allItems(w).length })].join(' · ')}
            </Text>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

function Chip({ testID, label, selected, onPress }: { testID: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  warning: { fontSize: 15, color: colors.danger, fontWeight: '700', textAlign: 'auto' },
  heading: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  itemName: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  section: { gap: 4, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.courtDark, borderColor: colors.courtDark },
  chipLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  chipLabelSelected: { color: colors.surface },
  option: { minHeight: touch.buttonMinHeight, justifyContent: 'center', gap: 2, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
