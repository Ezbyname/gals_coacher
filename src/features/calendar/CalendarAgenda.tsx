import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listCalendarEvents } from '@/data/local/calendar/calendarEventRepository';
import { getPlayer } from '@/data/local/players/playerRepository';
import { splitAgenda, type CalendarEvent } from '@/domain/calendarEvent';
import { useApp } from '@/features/AppProvider';
import { stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { BigButton } from '@/ui/BigButton';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing, touch } from '@/ui/theme';

import { calendarErrorMessage, eventHeading, eventName, eventSubtitle, sportLabel } from './calendarLabels';
import { eventPath, newEventPath } from './calendarNavigation';
import { eventTimeLines, formatEventWhen, isInProgress } from './formatEventTime';
import { ErrorScreen, LoadingScreen } from './StatusScreen';

type AgendaState =
  | { status: 'loading' }
  | {
      status: 'ready';
      playerName: string;
      now: number;
      currentOrUpcoming: CalendarEvent[];
      past: CalendarEvent[];
    }
  | { status: 'error'; message: TranslationKey };

/**
 * One Player's schedule: Current & upcoming, then Past. Sectioning and order
 * come from the domain's splitAgenda at `clock.wallNow()` — nothing here
 * sorts or classifies. Reloads on focus, so a saved, edited or deleted event
 * shows on return. Corrupt stored data fails as a whole (safe message).
 */
export function CalendarAgenda({ playerId }: { playerId: string }) {
  const { boot, services } = useApp();
  const { t } = useI18n();
  const [loaded, setState] = useState<AgendaState>({ status: 'loading' });
  const state: AgendaState =
    boot.status === 'error' ? { status: 'error', message: 'calendar.errors.loadFailed' } : loaded;

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      (async (): Promise<AgendaState> => {
        const profile = await getPlayer(boot.db, playerId);
        if (profile === null) return { status: 'error', message: 'calendar.errors.playerNotFound' };
        const events = await listCalendarEvents(boot.db, playerId);
        const now = services.clock.wallNow();
        return { status: 'ready', playerName: profile.player.name, now, ...splitAgenda(events, now) };
      })()
        .then((next) => {
          if (active) setState(next);
        })
        .catch((e: unknown) => {
          console.warn('[calendar] agenda failed', e);
          if (active)
            setState({ status: 'error', message: calendarErrorMessage(e, 'calendar.errors.loadFailed') });
        });
      return () => {
        active = false;
      };
    }, [boot, playerId, services]),
  );

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') {
    return <ErrorScreen testID="schedule-error" message={state.message} fallback={`/children/${playerId}`} />;
  }

  const { currentOrUpcoming, past, now } = state;
  const isEmpty = currentOrUpcoming.length === 0 && past.length === 0;
  const card = (event: CalendarEvent) => (
    <EventCard key={event.id} event={event} now={now} playerId={playerId} />
  );

  return (
    <SafeAreaScrollView testID="schedule-scroll" contentContainerStyle={styles.container}>
      <Text style={styles.name}>{state.playerName}</Text>
      <BigButton
        testID="schedule-add"
        label={t('calendar.add')}
        onPress={() => router.push(newEventPath(playerId))}
      />

      {isEmpty ? (
        <View style={styles.empty} testID="schedule-empty">
          <Text style={styles.heading}>{t('calendar.empty')}</Text>
          <Text style={styles.muted}>{t('calendar.emptyHint')}</Text>
        </View>
      ) : (
        <View style={styles.section} testID="schedule-upcoming">
          <Text style={styles.heading} accessibilityRole="header">
            {t('calendar.upcoming')}
          </Text>
          {currentOrUpcoming.length === 0 ? (
            <Text style={styles.muted} testID="schedule-no-upcoming">
              {t('calendar.noUpcoming')}
            </Text>
          ) : (
            currentOrUpcoming.map(card)
          )}
        </View>
      )}

      {past.length > 0 ? (
        <View style={styles.section} testID="schedule-past">
          <Text style={styles.heading} accessibilityRole="header">
            {t('calendar.past')}
          </Text>
          {past.map(card)}
        </View>
      ) : null}
    </SafeAreaScrollView>
  );
}

/**
 * One event in the list: a button that opens its details. Only fields that are
 * set are shown; the type is shown under a title unless it is OTHER; every
 * time sits next to its own date.
 */
function EventCard({ event, now, playerId }: { event: CalendarEvent; now: number; playerId: string }) {
  const { t, language } = useI18n();
  const id = `schedule-event-${event.id}`;
  const inProgress = isInProgress(event, now);
  const subtitle = eventSubtitle(t, event);
  const lines = eventTimeLines(event, language);
  const label = t(inProgress ? 'calendar.eventA11yInProgress' : 'calendar.eventA11y', {
    event: eventName(t, event),
    when: stripBidi(formatEventWhen(t, event, language)),
  });
  // Completion is shown, never used to move the card: sections stay schedule-based.
  const completed = event.completion !== null;
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={completed ? t('calendar.completion.eventA11y', { label }) : label}
      onPress={() => router.push(eventPath(playerId, event.id))}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardHeading} testID={`${id}-heading`}>
          {eventHeading(t, event)}
        </Text>
        {inProgress ? (
          <Text style={styles.now} testID={`${id}-now`}>
            {t('calendar.inProgress')}
          </Text>
        ) : null}
        {completed ? (
          <Text style={styles.completed} testID={`${id}-completed`}>
            {t('calendar.completion.badge')}
          </Text>
        ) : null}
      </View>
      {subtitle !== null ? (
        <Text style={styles.cardLine} testID={`${id}-type`}>
          {subtitle}
        </Text>
      ) : null}
      {lines.kind === 'day' ? (
        <Text style={styles.cardLine} testID={`${id}-when`}>
          {lines.text}
        </Text>
      ) : (
        <>
          <Text style={styles.cardLine} testID={`${id}-start`}>
            {t('calendar.startRow', { when: lines.start })}
          </Text>
          <Text style={styles.cardLine} testID={`${id}-end`}>
            {t('calendar.endRow', { when: lines.end })}
          </Text>
        </>
      )}
      {event.sport !== null ? (
        <Text style={styles.cardMuted} testID={`${id}-sport`}>
          {sportLabel(t, event.sport)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  name: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  heading: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 15, color: colors.inkMuted, textAlign: 'auto' },
  empty: { gap: spacing.xs },
  section: { gap: spacing.sm },
  card: {
    minHeight: touch.buttonMinHeight,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardHeading: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  now: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: colors.court,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  completed: { fontSize: 13, fontWeight: '800', color: colors.success },
  cardLine: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  cardMuted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
});
