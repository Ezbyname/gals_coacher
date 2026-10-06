import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listCalendarEventsInRange } from '@/data/local/calendar/calendarEventRepository';
import { listPlayers } from '@/data/local/players/playerRepository';
import type { CalendarDate } from '@/domain/calendarDate';
import { CALENDAR_EVENT_TYPES, type CalendarEvent, type CalendarEventType } from '@/domain/calendarEvent';
import {
  NO_FILTER,
  NO_SPORT,
  activeFilterCount,
  addDays,
  addMonths,
  colorMeaning,
  dateKey,
  eventsByDate,
  filterCalendarEvents,
  isFilterActive,
  monthGrid,
  sameDate,
  toggleValue,
  visibleDates,
  weekDates,
  type CalendarFilter,
  type CalendarViewMode,
  type ColorMeaning,
  type SportFilterValue,
} from '@/domain/calendarView';
import { V1_ENABLED_SPORTS, type SportKey } from '@/domain/sport';
import { useApp } from '@/features/AppProvider';
import { stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import {
  calendarDateToLocalNoon,
  eventLocalDates,
  localCalendarDateFromEpoch,
  localDateRange,
} from '@/services/clock/localCalendarDate';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { colors, spacing, touch } from '@/ui/theme';

import { TYPE_COLORS, TYPE_GLYPHS, eventMarker, playerColor, playerInitial } from './calendarColors';
import {
  calendarErrorMessage,
  eventHeading,
  eventName,
  eventSubtitle,
  eventTypeLabel,
  sportLabel,
} from './calendarLabels';
import { eventPath } from './calendarNavigation';
import {
  formatEventDate,
  formatEventWhen,
  formatMonthYear,
  formatShortDate,
  formatWeekdayShort,
} from './formatEventTime';
import { ErrorScreen, LoadingScreen } from './StatusScreen';

type PlayerRef = { id: string; name: string; createdAt: number };

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; rangeKey: string; players: PlayerRef[]; events: CalendarEvent[] }
  | { status: 'error'; message: TranslationKey };

/** At most this many markers in a day cell; the rest is "+N" (the day's list shows them all). */
export const MAX_DAY_MARKERS = 2;

const noon = (date: CalendarDate) => calendarDateToLocalNoon(date).getTime();

/** The visible range as a stable key (reloads happen only when it changes, not on every day tap). */
const rangeToKey = (range: { first: CalendarDate; last: CalendarDate }) =>
  `${dateKey(range.first)}..${dateKey(range.last)}`;
function rangeFromKey(key: string): { first: CalendarDate; last: CalendarDate } {
  const [first, last] = key.split('..').map((part) => {
    const [year, month, day] = part.split('-').map(Number);
    return { year: year!, month: month!, day: day! };
  });
  return { first: first!, last: last! };
}

/**
 * The Full Calendar (CAL-VIEW-001): every Player's events by local date, as a
 * Month grid or a Week strip, with the selected day's events listed below.
 * Read-only: tapping an event opens the existing Event Details. Filters
 * (CAL-FILTER-001) live in screen state only. Colour (CAL-COLOR-001) means
 * the Player when several Players can show, the activity type when one can —
 * always next to text. Reloads on focus (an edit, completion or delete made
 * in Event Details shows on return).
 */
export function FullCalendar() {
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const today = localCalendarDateFromEpoch(services.clock.wallNow());
  const [mode, setMode] = useState<CalendarViewMode>('MONTH');
  const [selected, setSelected] = useState<CalendarDate>(today);
  const [filter, setFilter] = useState<CalendarFilter>(NO_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  const rangeKey = rangeToKey(visibleDates(mode, selected));
  const range = useMemo(() => rangeFromKey(rangeKey), [rangeKey]);

  useFocusEffect(
    useCallback(() => {
      if (boot.status !== 'ready') return;
      let active = true;
      const { first, last } = rangeFromKey(rangeKey);
      const { from, to } = localDateRange(first, last);
      Promise.all([listPlayers(boot.db), listCalendarEventsInRange(boot.db, from, to)])
        .then(([profiles, events]) => {
          if (!active) return;
          const players = profiles.map(({ player }) => ({
            id: player.id as string,
            name: player.name,
            createdAt: player.createdAt,
          }));
          setLoaded({ status: 'ready', rangeKey, players, events });
        })
        .catch((e: unknown) => {
          console.warn('[calendar] full calendar failed', e);
          if (active)
            setLoaded({ status: 'error', message: calendarErrorMessage(e, 'calendar.errors.loadFailed') });
        });
      return () => {
        active = false;
      };
    }, [boot, rangeKey]),
  );

  const ready = loaded.status === 'ready' ? loaded : null;
  const players = useMemo(() => ready?.players ?? [], [ready]);
  const events = useMemo(() => ready?.events ?? [], [ready]);
  const visible = useMemo(() => filterCalendarEvents(events, filter), [events, filter]);
  /** Each local date → the visible events that overlap it ([start, end)), in chronological order. */
  const byDay = useMemo(
    () => eventsByDate(visible, (event) => eventLocalDates(event.startAt, event.endAt), range),
    [visible, range],
  );

  if (boot.status === 'error') {
    return <ErrorScreen testID="calendar-error" message="calendar.errors.loadFailed" fallback="/" />;
  }
  if (loaded.status === 'error') {
    return <ErrorScreen testID="calendar-error" message={loaded.message} fallback="/" />;
  }
  if (loaded.status === 'loading') return <LoadingScreen />;

  const meaning = colorMeaning(
    filter,
    players.map((p) => p.id),
  );
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '';
  const sportOptions: SportKey[] = [
    ...new Set<SportKey>([...V1_ENABLED_SPORTS, ...events.flatMap((e) => (e.sport ? [e.sport] : []))]),
  ];
  const sportName = (value: SportFilterValue) =>
    value === NO_SPORT ? t('calendar.full.noSport') : sportLabel(t, value);
  const filterLabels = [
    ...filter.playerIds.map(playerName),
    ...filter.sports.map(sportName),
    ...filter.types.map((type) => eventTypeLabel(t, type)),
  ];
  const isMonth = mode === 'MONTH';
  const step = (delta: number) =>
    setSelected(isMonth ? addMonths(selected, delta) : addDays(selected, 7 * delta));
  const dayEvents = byDay.get(dateKey(selected)) ?? [];
  const periodTitle = isMonth
    ? formatMonthYear(noon(selected), language)
    : t('calendar.span', {
        start: formatShortDate(noon(range.first), language),
        end: formatShortDate(noon(range.last), language),
      });
  const weeks = isMonth ? monthGrid(selected.year, selected.month) : [weekDates(selected)];

  return (
    <SafeAreaScrollView testID="calendar-scroll" contentContainerStyle={styles.container}>
      <View
        style={styles.modes}
        accessibilityRole="tablist"
        accessibilityLabel={t('calendar.full.viewModes')}>
        {(['MONTH', 'WEEK'] as const).map((value) => {
          const on = value === mode;
          return (
            <Pressable
              key={value}
              testID={`calendar-mode-${value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setMode(value)}
              style={[styles.mode, on && styles.modeSelected]}>
              <Text style={[styles.modeLabel, on && styles.modeLabelSelected]}>
                {t(value === 'MONTH' ? 'calendar.full.month' : 'calendar.full.week')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.period}>
        <NavButton
          testID="calendar-prev"
          glyph={t('calendar.full.prevGlyph')}
          label={t(isMonth ? 'calendar.full.prevMonth' : 'calendar.full.prevWeek')}
          onPress={() => step(-1)}
        />
        <Text style={styles.periodTitle} testID="calendar-period" accessibilityRole="header">
          {periodTitle}
        </Text>
        <NavButton
          testID="calendar-next"
          glyph={t('calendar.full.nextGlyph')}
          label={t(isMonth ? 'calendar.full.nextMonth' : 'calendar.full.nextWeek')}
          onPress={() => step(1)}
        />
      </View>
      <Pressable
        testID="calendar-today"
        accessibilityRole="button"
        onPress={() => setSelected(today)}
        style={styles.todayButton}>
        <Text style={styles.todayLabel}>{t('calendar.full.today')}</Text>
      </Pressable>

      <View style={styles.filterBar}>
        <Pressable
          testID="calendar-filters-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen(!filtersOpen)}
          style={[styles.filterToggle, isFilterActive(filter) && styles.filterToggleActive]}>
          <Text style={styles.filterToggleLabel} testID="calendar-filters-toggle-label">
            {isFilterActive(filter)
              ? t('calendar.full.filtersActive', { count: activeFilterCount(filter) })
              : t('calendar.full.filters')}
          </Text>
        </Pressable>
        {isFilterActive(filter) ? (
          <Pressable
            testID="calendar-filters-clear"
            accessibilityRole="button"
            onPress={() => setFilter(NO_FILTER)}
            style={styles.filterToggle}>
            <Text style={styles.filterToggleLabel}>{t('calendar.full.clearFilters')}</Text>
          </Pressable>
        ) : null}
      </View>
      {isFilterActive(filter) ? (
        <Text style={styles.muted} testID="calendar-filters-summary">
          {t('calendar.full.filteredBy', { list: filterLabels.join(', ') })}
        </Text>
      ) : null}
      {filtersOpen ? (
        <View style={styles.filterPanel} testID="calendar-filters">
          <FilterGroup
            testID="calendar-filter-player"
            label={t('calendar.full.player')}
            options={players.map((p) => ({ value: p.id, label: p.name, color: playerColor(players, p.id) }))}
            selected={filter.playerIds}
            onToggle={(id) => setFilter({ ...filter, playerIds: toggleValue(filter.playerIds, id) })}
            onAll={() => setFilter({ ...filter, playerIds: [] })}
          />
          <FilterGroup<SportFilterValue>
            testID="calendar-filter-sport"
            label={t('calendar.full.sport')}
            options={[...sportOptions, NO_SPORT].map((value) => ({ value, label: sportName(value) }))}
            selected={filter.sports}
            onToggle={(value) => setFilter({ ...filter, sports: toggleValue(filter.sports, value) })}
            onAll={() => setFilter({ ...filter, sports: [] })}
          />
          <FilterGroup<CalendarEventType>
            testID="calendar-filter-type"
            label={t('calendar.full.type')}
            options={CALENDAR_EVENT_TYPES.map((type) => ({
              value: type,
              label: eventTypeLabel(t, type),
              glyph: TYPE_GLYPHS[type],
            }))}
            selected={filter.types}
            onToggle={(type) => setFilter({ ...filter, types: toggleValue(filter.types, type) })}
            onAll={() => setFilter({ ...filter, types: [] })}
          />
        </View>
      ) : null}

      <View style={styles.grid} testID={isMonth ? 'calendar-month' : 'calendar-week'}>
        <View style={styles.row}>
          {weeks[0]!.map((date) => (
            <Text
              key={dateKey(date)}
              style={styles.weekday}
              testID={`calendar-weekday-${date.month}-${date.day}`}>
              {formatWeekdayShort(noon(date), language)}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={dateKey(week[0]!)} style={styles.row}>
            {week.map((date) => (
              <DayCell
                key={dateKey(date)}
                date={date}
                outside={isMonth && date.month !== selected.month}
                isToday={sameDate(date, today)}
                isSelected={sameDate(date, selected)}
                events={byDay.get(dateKey(date)) ?? []}
                meaning={meaning}
                players={players}
                onPress={() => setSelected(date)}
              />
            ))}
          </View>
        ))}
      </View>

      <Legend meaning={meaning} players={players} filter={filter} />

      {ready?.rangeKey !== rangeKey ? null : players.length === 0 ? (
        <Text style={styles.muted} testID="calendar-no-players">
          {t('calendar.full.noPlayers')}
        </Text>
      ) : visible.length === 0 ? (
        isFilterActive(filter) && events.length > 0 ? (
          <Text style={styles.muted} testID="calendar-no-match">
            {t('calendar.full.noMatch')}
          </Text>
        ) : (
          <Text style={styles.muted} testID="calendar-empty-range">
            {t(isMonth ? 'calendar.full.emptyMonth' : 'calendar.full.emptyWeek')}
          </Text>
        )
      ) : null}

      <View style={styles.day} testID="calendar-day-list">
        <Text style={styles.dayHeading} testID="calendar-day-heading" accessibilityRole="header">
          {formatEventDate(noon(selected), language)}
        </Text>
        {dayEvents.length === 0 ? (
          <Text style={styles.muted} testID="calendar-day-empty">
            {t('calendar.full.noEventsDay')}
          </Text>
        ) : (
          dayEvents.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              playerName={playerName(event.playerId)}
              meaning={meaning}
              players={players}
            />
          ))
        )}
      </View>
    </SafeAreaScrollView>
  );
}

function NavButton({
  testID,
  glyph,
  label,
  onPress,
}: {
  testID: string;
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.navButton, pressed && { opacity: 0.7 }]}>
      <Text style={styles.navGlyph}>{glyph}</Text>
    </Pressable>
  );
}

/** One day: its number, up to MAX_DAY_MARKERS markers (colour + text) and "+N"; selecting lists its events. */
function DayCell({
  date,
  outside,
  isToday,
  isSelected,
  events,
  meaning,
  players,
  onPress,
}: {
  date: CalendarDate;
  outside: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
  meaning: ColorMeaning;
  players: PlayerRef[];
  onPress: () => void;
}) {
  const { t, language } = useI18n();
  const id = `calendar-day-${dateKey(date)}`;
  const when = stripBidi(formatEventDate(noon(date), language));
  const count = events.length;
  const base =
    count === 0
      ? t('calendar.full.dayNone', { date: when })
      : count === 1
        ? t('calendar.full.dayOne', { date: when })
        : t('calendar.full.dayMany', { date: when, count });
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={isToday ? t('calendar.full.dayToday', { label: base }) : base}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[styles.cell, isToday && styles.cellToday, isSelected && styles.cellSelected]}>
      <Text
        testID={`${id}-number`}
        style={[
          styles.cellNumber,
          outside && styles.cellOutside,
          (isToday || isSelected) && styles.cellNumberStrong,
        ]}>
        {date.day}
      </Text>
      {events.slice(0, MAX_DAY_MARKERS).map((event, i) => {
        const marker = eventMarker(event, meaning, players);
        return (
          <View
            key={event.id}
            testID={`${id}-marker-${i}`}
            style={[styles.marker, { backgroundColor: marker.color }]}>
            <Text style={styles.markerText} numberOfLines={1}>
              {marker.text}
            </Text>
          </View>
        );
      })}
      {count > MAX_DAY_MARKERS ? (
        <Text style={styles.more} testID={`${id}-more`}>
          {t('calendar.full.more', { count: count - MAX_DAY_MARKERS })}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** What the colours mean right now, with each colour's text. */
function Legend({
  meaning,
  players,
  filter,
}: {
  meaning: ColorMeaning;
  players: PlayerRef[];
  filter: CalendarFilter;
}) {
  const { t } = useI18n();
  const items =
    meaning === 'TYPE'
      ? CALENDAR_EVENT_TYPES.map((type) => ({
          key: type,
          color: TYPE_COLORS[type],
          text: TYPE_GLYPHS[type],
          label: eventTypeLabel(t, type),
        }))
      : players
          .filter((p) => filter.playerIds.length === 0 || filter.playerIds.includes(p.id))
          .map((p) => ({
            key: p.id,
            color: playerColor(players, p.id),
            text: playerInitial(p.name),
            label: p.name,
          }));
  return (
    <View style={styles.legend} testID="calendar-legend">
      <Text style={styles.legendTitle} testID="calendar-legend-title">
        {t(meaning === 'TYPE' ? 'calendar.full.legendTypes' : 'calendar.full.legendPlayers')}
      </Text>
      <View style={styles.legendItems}>
        {items.map((item) => (
          <View key={item.key} style={styles.legendItem} testID={`calendar-legend-${item.key}`}>
            <View style={[styles.marker, { backgroundColor: item.color }]}>
              <Text style={styles.markerText}>{item.text}</Text>
            </View>
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One event of the selected day, readable in full; opens the existing Event Details. */
function EventRow({
  event,
  playerName,
  meaning,
  players,
}: {
  event: CalendarEvent;
  playerName: string;
  meaning: ColorMeaning;
  players: PlayerRef[];
}) {
  const { t, language } = useI18n();
  const id = `calendar-event-${event.id}`;
  const marker = eventMarker(event, meaning, players);
  const subtitle = eventSubtitle(t, event);
  const when = formatEventWhen(t, event, language);
  const label = t('calendar.full.eventA11y', {
    player: playerName,
    event: eventName(t, event),
    when: stripBidi(when),
  });
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={event.completion !== null ? t('calendar.completion.eventA11y', { label }) : label}
      onPress={() => router.push(eventPath(event.playerId, event.id))}
      style={({ pressed }) => [styles.event, pressed && { opacity: 0.8 }]}>
      <View style={[styles.stripe, { backgroundColor: marker.color }]} testID={`${id}-stripe`} />
      <View
        style={[styles.marker, styles.rowMarker, { backgroundColor: marker.color }]}
        testID={`${id}-marker`}>
        <Text style={styles.markerText}>{marker.text}</Text>
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventHeading} testID={`${id}-heading`}>
          {eventHeading(t, event)}
        </Text>
        {subtitle !== null ? (
          <Text style={styles.eventLine} testID={`${id}-type`}>
            {subtitle}
          </Text>
        ) : null}
        <Text style={styles.eventLine} testID={`${id}-when`}>
          {when}
        </Text>
        <Text style={styles.eventMuted} testID={`${id}-player`}>
          {playerName}
        </Text>
        {event.sport !== null ? (
          <Text style={styles.eventMuted} testID={`${id}-sport`}>
            {sportLabel(t, event.sport)}
          </Text>
        ) : null}
        {event.completion !== null ? (
          <Text style={styles.completed} testID={`${id}-completed`}>
            {t('calendar.completion.badge')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type Option<T extends string> = { value: T; label: string; color?: string; glyph?: string };

/** A multi-select chip group: "All" (nothing narrowed) plus one chip per value (OR inside the group). */
function FilterGroup<T extends string>({
  testID,
  label,
  options,
  selected,
  onToggle,
  onAll,
}: {
  testID: string;
  label: string;
  options: Option<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  onAll: () => void;
}) {
  const { t } = useI18n();
  const chip = (key: string, text: string, on: boolean, onPress: () => void, option?: Option<T>) => (
    <Pressable
      key={key}
      testID={`${testID}-${key}`}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipSelected]}>
      {option?.color ? <View style={[styles.chipDot, { backgroundColor: option.color }]} /> : null}
      {option?.glyph ? <Text style={styles.chipGlyph}>{option.glyph}</Text> : null}
      <Text style={[styles.chipLabel, on && styles.chipLabelSelected]} testID={`${testID}-${key}-label`}>
        {on ? t('calendar.full.selectedChip', { label: text }) : text}
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.filterGroup} testID={testID}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chips}>
        {chip('ALL', t('calendar.full.all'), selected.length === 0, onAll)}
        {options.map((option) =>
          chip(
            option.value,
            option.label,
            selected.includes(option.value),
            () => onToggle(option.value),
            option,
          ),
        )}
      </View>
    </View>
  );
}

const CELL_HEIGHT = 64;

const styles = StyleSheet.create({
  container: { padding: spacing.sm, gap: spacing.md },
  modes: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  mode: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  modeSelected: { borderBottomColor: colors.court, backgroundColor: colors.background },
  modeLabel: { fontSize: 16, color: colors.inkMuted },
  modeLabelSelected: { color: colors.ink, fontWeight: '800' },
  period: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  periodTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  navButton: {
    minWidth: touch.buttonMinHeight,
    minHeight: touch.buttonMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  navGlyph: { fontSize: 28, fontWeight: '700', color: colors.ink },
  todayButton: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  todayLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterToggle: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterToggleActive: { borderColor: colors.ink, borderWidth: 2 },
  filterToggleLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  filterPanel: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterGroup: { gap: spacing.xs },
  filterLabel: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.ink, borderWidth: 2, backgroundColor: colors.background },
  chipDot: { width: 12, height: 12, borderRadius: 6 },
  chipGlyph: { fontSize: 14 },
  chipLabel: { fontSize: 15, color: colors.ink },
  chipLabelSelected: { fontWeight: '800' },
  grid: { gap: 2 },
  row: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.inkMuted, textAlign: 'center' },
  cell: {
    flex: 1,
    minHeight: CELL_HEIGHT,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cellToday: { borderColor: colors.court, borderWidth: 2 },
  cellSelected: { borderColor: colors.ink, borderWidth: 3 },
  cellNumber: { fontSize: 14, color: colors.ink },
  cellNumberStrong: { fontWeight: '800' },
  cellOutside: { color: colors.inkMuted, opacity: 0.6 },
  marker: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  more: { fontSize: 11, fontWeight: '700', color: colors.ink },
  legend: { gap: spacing.xs },
  legendTitle: { fontSize: 14, fontWeight: '600', color: colors.inkMuted, textAlign: 'auto' },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendLabel: { fontSize: 14, color: colors.ink },
  muted: { fontSize: 15, color: colors.inkMuted, textAlign: 'auto' },
  day: { gap: spacing.sm },
  dayHeading: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  event: {
    minHeight: touch.buttonMinHeight,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingEnd: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stripe: { width: 6, alignSelf: 'stretch' },
  rowMarker: { marginTop: 2 },
  eventBody: { flex: 1, gap: 2 },
  eventHeading: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  eventLine: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  eventMuted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  completed: { fontSize: 13, fontWeight: '800', color: colors.success, textAlign: 'auto' },
});
