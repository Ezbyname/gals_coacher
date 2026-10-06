import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { listActivityTypes, setActivityTypeActive } from '@/data/local/activityTypes/activityTypeRepository';
import type { ActivityType } from '@/domain/activityType';
import { useApp } from '@/features/AppProvider';
import { activityTypeLabel } from '@/features/calendar/calendarLabels';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing, touch } from '@/ui/theme';

type State =
  | { status: 'loading' }
  | { status: 'ready'; types: ActivityType[] }
  | { status: 'error'; message: TranslationKey };

export const NEW_ACTIVITY_TYPE_PATH = '/settings/activity-types/new';

/**
 * Settings → Activity types (ACTIVITY-001): the catalog in two sections,
 * Active and Inactive, each row with its state written out. Making a type
 * inactive asks first (safe default: keep it active) and never touches an
 * event; making it active again does not ask and reuses the same type.
 * Reloads on focus (a type added on the next screen shows on return).
 */
export function ActivityTypeList() {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<State>({ status: 'loading' });
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<TranslationKey | null>(null);
  const changeInProgress = useRef(false);
  const state: State =
    boot.status === 'error' ? { status: 'error', message: 'activityTypes.errors.loadFailed' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      listActivityTypes(boot.db)
        .then((types) => active && setLoaded({ status: 'ready', types }))
        .catch((e: unknown) => {
          console.warn('[activity types] load failed', e);
          if (active) setLoaded({ status: 'error', message: 'activityTypes.errors.loadFailed' });
        });
      return () => {
        active = false;
      };
    }, [boot]),
  );

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') {
    return <ErrorScreen testID="activity-types-error" message={state.message} fallback="/settings" />;
  }

  /** Writes the new state; the list shows only what storage returned. */
  const setActive = async (type: ActivityType, active: boolean) => {
    if (changeInProgress.current) return;
    changeInProgress.current = true;
    setChanging(true);
    setChangeError(null);
    try {
      if (boot.status !== 'ready') throw new Error('database not ready');
      const saved = await setActivityTypeActive(boot.db, type.id, active, { clock: services.clock });
      setLoaded({
        status: 'ready',
        types: state.types.map((candidate) => (candidate.id === saved.id ? saved : candidate)),
      });
    } catch (e) {
      console.warn('[activity types] change failed', e);
      setChangeError('activityTypes.errors.changeFailed');
    }
    changeInProgress.current = false;
    setChanging(false);
  };

  const toggle = (type: ActivityType) => {
    if (!type.active) {
      void setActive(type, true);
      return;
    }
    // Not a deletion: the safe choice (cancel) keeps it active.
    Alert.alert(
      t('activityTypes.deactivate.title', { name: activityTypeLabel(t, type) }),
      t('activityTypes.deactivate.body'),
      [
        { text: t('activityTypes.deactivate.keep'), style: 'cancel' },
        { text: t('activityTypes.deactivate.confirm'), onPress: () => void setActive(type, false) },
      ],
    );
  };

  const section = (active: boolean) => {
    const rows = state.types.filter((type) => type.active === active);
    return (
      <View style={styles.section} testID={active ? 'activity-types-active' : 'activity-types-inactive'}>
        <Text style={styles.heading} accessibilityRole="header">
          {t(active ? 'activityTypes.active' : 'activityTypes.inactive')}
        </Text>
        {rows.length === 0 ? (
          <Text
            style={styles.muted}
            testID={active ? 'activity-types-none-active' : 'activity-types-none-inactive'}>
            {t(active ? 'activityTypes.noneActive' : 'activityTypes.noneInactive')}
          </Text>
        ) : (
          rows.map((type) => (
            <Row key={type.id} type={type} disabled={changing} onToggle={() => toggle(type)} />
          ))
        )}
      </View>
    );
  };

  return (
    <SafeAreaScrollView testID="activity-types-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.muted}>{t('activityTypes.about')}</Text>
      {changeError ? (
        <Text style={styles.error} testID="activity-types-change-error">
          {t(changeError)}
        </Text>
      ) : null}
      {section(true)}
      {section(false)}
      <BigButton
        testID="activity-types-add"
        label={t('activityTypes.add')}
        onPress={() => router.push(NEW_ACTIVITY_TYPE_PATH)}
        disabled={changing}
      />
    </SafeAreaScrollView>
  );
}

function Row({ type, disabled, onToggle }: { type: ActivityType; disabled: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const id = `activity-type-${type.id}`;
  const name = activityTypeLabel(t, type);
  const status = t(type.active ? 'activityTypes.statusActive' : 'activityTypes.statusInactive');
  const action = t(type.active ? 'activityTypes.makeInactive' : 'activityTypes.makeActive');
  return (
    <View
      style={styles.row}
      testID={id}
      accessible
      accessibilityLabel={t('activityTypes.rowA11y', { name, status })}>
      <View style={styles.rowText}>
        <Text style={styles.name} testID={`${id}-name`}>
          {name}
        </Text>
        {/* The state in words (not colour or opacity alone). */}
        <Text style={[styles.status, !type.active && styles.statusInactive]} testID={`${id}-status`}>
          {status}
        </Text>
        {type.builtin === null ? (
          <Text style={styles.muted} testID={`${id}-custom`}>
            {t('activityTypes.custom')}
          </Text>
        ) : null}
      </View>
      <Pressable
        testID={`${id}-toggle`}
        accessibilityRole="button"
        accessibilityLabel={t('activityTypes.toggleA11y', { action, name })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.8 }, disabled && { opacity: 0.4 }]}>
        <Text style={styles.toggleLabel}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  heading: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  status: { fontSize: 14, fontWeight: '700', color: colors.success, textAlign: 'auto' },
  statusInactive: { color: colors.inkMuted },
  toggle: {
    minHeight: touch.buttonMinHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
