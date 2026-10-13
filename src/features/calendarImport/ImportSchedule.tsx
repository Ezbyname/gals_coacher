import { useNavigation } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { listActivityTypes } from '@/data/local/activityTypes/activityTypeRepository';
import {
  createCalendarEventBatch,
  listCalendarEvents,
  undoCalendarImport,
  type UndoCalendarImportResult,
} from '@/data/local/calendar/calendarEventRepository';
import { getPlayer, setPlayerTeamName } from '@/data/local/players/playerRepository';
import type { CalendarEventSource } from '@/domain/calendarEvent';
import { fixtureCandidates, readFixtureText } from '@/domain/scheduleImport';
import { requiresTitle, selectableActivityTypes, type ActivityTypeId, type ActivityTypeRef } from '@/domain/activityType';
import type { CalendarDate } from '@/domain/calendarDate';
import {
  canShowPreviousWeek,
  dateInWeek,
  importWeekContaining,
  importWeekTiming,
  nextImportWeek,
  shiftImportWeek,
  type DuplicateMatch,
  type ExistingSlot,
  type ImportCandidate,
  type ImportIssueCode,
  type ImportWeek,
} from '@/domain/calendarImport';
import { requireActivePlayer } from '@/domain/training/activePlayer';
import type { SportKey } from '@/domain/sport';
import { useApp } from '@/features/AppProvider';
import { activityTypeChoiceLabel, activityTypeLabel, sportLabel } from '@/features/calendar/calendarLabels';
import { leaveTo, SCHEDULE_ROUTE, schedulePath } from '@/features/calendar/calendarNavigation';
import { sportsOf } from '@/features/calendar/calendarFormValues';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { PlayerTargetLabel, useActivePlayer } from '@/features/players/ActivePlayerContext';
import { isolate, stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { epochToLocalDateTime, localCalendarDateFromEpoch } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { DateTimeField } from '@/ui/DateTimeField';
import { KeyboardRevealContext, KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { StatusBadge } from '@/ui/StatusBadge';
import { TextField } from '@/ui/TextField';
import { colors, semantic, spacing, touch } from '@/ui/theme';

import { ExcelSourcePanel, fixtureSelection, TeamChooser, type ExcelSelection } from './ExcelSource';
import { prepareImport } from './importConfirm';
import { clock, dayLine, shortDate, timeRange, weekdayName } from './importFormat';
import {
  acknowledge,
  acknowledgeAll,
  reviewFromCandidates,
  analyzeSchedule,
  editCandidate,
  removeCandidate,
  restoreCandidate,
  reviewedBatch,
  viewOf,
  type CandidateEdit,
  type ImportReviewState,
} from './importReview';

/**
 * CAL-TEXT-IMPORT-001C — Import weekly trainings from text, for the route's
 * Player (ActivePlayerContext; never asked again). One screen: Training type
 * → Week → Paste → Analyze → Preview (edit / remove / undo / decisions).
 *
 * READS existing calendar events (duplicate review). 001D: Continue → Confirm
 * ("Add N trainings") writes the REVIEWED candidates as ONE import batch of
 * CalendarEvents for this Player (all or nothing; never re-parsed) → Done
 * (View calendar / Undo import) → Undone.
 */
type Loaded = { types: ActivityTypeRef[]; sports: SportKey[]; name: string; teamName: string | null };
/** Where the schedule comes from (CAL-SCHEDULE-IMPORT-002B): pasted text or an Excel fixture file. */
type SourceMode = 'text' | 'excel';
type Phase = 'input' | 'review' | 'confirm' | 'done' | 'undone';
type Saved = { importBatchId: string; candidates: ImportCandidate[] };

export function ImportScheduleScreen({ prefill }: { prefill: string | null }) {
  const player = requireActivePlayer(useActivePlayer());
  const { boot, services } = useApp();
  const { t, language } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | 'error' | null>(null);
  const [typeId, setTypeId] = useState<ActivityTypeId | null>(null);
  const [sport, setSport] = useState<SportKey | null>(null);
  const today = useMemo(() => localCalendarDateFromEpoch(services.clock.wallNow()), [services.clock]);
  const [week, setWeek] = useState<ImportWeek>(() => nextImportWeek(today));
  const [text, setText] = useState(prefill ?? '');
  const [phase, setPhase] = useState<Phase>('input');
  const [review, setReview] = useState<ImportReviewState | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputError, setInputError] = useState<'type' | 'text' | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzedFor, setAnalyzedFor] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<'failed' | 'invalid' | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [undone, setUndone] = useState<UndoCalendarImportResult | null>(null);
  const [undoError, setUndoError] = useState(false);
  const [mode, setMode] = useState<SourceMode>('text');
  const [excel, setExcel] = useState<ExcelSelection | null>(null);
  const [teamError, setTeamError] = useState(false);
  /** 002C: the pasted text read as a SEASON FIXTURE LIST (its team still to choose / confirm). */
  const [season, setSeason] = useState<ExcelSelection | null>(null);
  /** 002C: the text MIGHT be a fixture list — the user decides how to read it. */
  const [askKind, setAskKind] = useState(false);
  /** Set at Analyze: what the reviewed batch will be written as, and each fixture's side. */
  const [reviewed, setReviewed] = useState<{ source: CalendarEventSource; teamName: string | null; sides: Map<string, 'HOME' | 'AWAY' | null> }>(
    { source: 'TEXT_IMPORT', teamName: null, sides: new Map() },
  );
  const navigation = useNavigation();
  // Once the batch is saved there is nothing left to lose by leaving.
  useUnsavedChangesGuard(
    phase !== 'done' && phase !== 'undone' && (text.trim().length > 0 || review !== null || excel !== null),
  );

  useEffect(() => {
    if (boot.status !== 'ready') return;
    let active = true;
    Promise.all([listActivityTypes(boot.db), getPlayer(boot.db, player.id)])
      .then(([catalog, profile]) => {
        if (!active) return;
        const sports = profile ? sportsOf(profile) : [];
        setLoaded({
          types: selectableActivityTypes(catalog),
          sports,
          name: profile?.player.name ?? player.name,
          teamName: profile?.player.teamName ?? null,
        });
        // Smart default: preselect the sport only when the Player has exactly one active sport.
        setSport(sports.length === 1 ? sports[0]! : null);
      })
      .catch((e: unknown) => {
        console.warn('[calendarImport] load failed', e);
        if (active) setLoaded('error');
      });
    return () => {
      active = false;
    };
  }, [boot, player.id, player.name]);

  if (boot.status === 'error' || loaded === 'error') {
    return <ErrorScreen testID="import-error" message="calendarImport.loadFailed" fallback="/children" />;
  }
  if (loaded === null) return <LoadingScreen />;
  const { types, sports } = loaded;
  const typeLabelOf = (id: ActivityTypeId) => {
    const type = types.find((x) => x.id === id);
    return type ? activityTypeLabel(t, type) : id;
  };

  const analyze = async (textKind: 'auto' | 'fixture' | 'weekly' = 'auto') => {
    if (typeId === null) {
      setInputError('type');
      AccessibilityInfo.announceForAccessibility(t('calendarImport.typeRequired'));
      return;
    }
    if (mode === 'excel') {
      if (excel === null) return; // nothing read yet (the panel shows why)
      if (excel.team === null) return setTeamError(true);
    } else if (text.trim().length === 0) return setInputError('text');
    // 002C: a season / league fixture list is read with explicit dates and the Player's team — never as a week.
    let fixtureText: ExcelSelection | null = null;
    if (mode === 'text' && textKind !== 'weekly') {
      if (season !== null) {
        if (season.team === null) return setTeamError(true);
        fixtureText = season;
      } else {
        const read = readFixtureText(text);
        if (read.confidence === 'HIGH' || (read.confidence !== 'NONE' && textKind === 'fixture')) {
          const selection = fixtureSelection(null, read.fixtures, read.rejected, loaded.teamName);
          setAskKind(false);
          setSeason(selection);
          if (selection.team === null) return; // choose the Player's team first (the panel shows the teams)
          fixtureText = selection;
        } else if (read.confidence === 'LOW') {
          return setAskKind(true); // unsure: ask, never silently pick the wrong mode
        }
      }
    }
    if (busy || boot.status !== 'ready') return;
    setBusy(true);
    setInputError(null);
    setTeamError(false);
    try {
      // READ ONLY: this Player's events, for the conservative duplicate review.
      const events = await listCalendarEvents(boot.db, player.id);
      const now = localCalendarDateFromEpoch(services.clock.wallNow());
      const fixtures = mode === 'excel' ? excel : fixtureText;
      if (fixtures !== null && fixtures.team !== null) {
        // Only the Player's TEAM's games (code or exact name — never "contains"); explicit dates, no week.
        // One path for an Excel file (002B) and a pasted season list (002C).
        const games = fixtureCandidates(fixtures.fixtures, fixtures.team, typeId);
        const state = reviewFromCandidates(games, events.map(toSlot), now);
        setReview({
          ...state,
          unparsed: fixtures.rejected.map((r) => ({ line: r.line ?? 0, text: `${r.ref} — ${r.text}`, reason: 'ROW_UNREADABLE' as const })),
        });
        setReviewed({
          source: mode === 'excel' ? 'XLSX_IMPORT' : 'TEXT_IMPORT',
          teamName: fixtures.team.name,
          sides: new Map(games.map((g) => [g.key, g.matchup?.side ?? null])),
        });
        if (fixtures.saveTeam) {
          // Explicit choice only; a failure here never blocks the import.
          await setPlayerTeamName(boot.db, player.id, fixtures.team.name, { clock: services.clock }).catch((e: unknown) =>
            console.warn('[calendarImport] could not save the team name', e),
          );
          setLoaded({ ...loaded, teamName: fixtures.team.name });
        }
      } else {
        setReview(analyzeSchedule(text, week, typeId, events.map(toSlot), now));
        setReviewed({ source: 'TEXT_IMPORT', teamName: null, sides: new Map() });
      }
      setAnalyzedFor(player.id);
      setEditing(null);
      setPhase('review');
    } catch (e) {
      console.warn('[calendarImport] analyze failed', e);
      setLoaded('error');
    }
    setBusy(false);
  };

  const weekTiming = importWeekTiming(week, today);
  const header = (
    <>
      <PlayerTargetLabel />
      <Text style={styles.title} accessibilityRole="header">
        {t('calendarImport.title')}
      </Text>
    </>
  );

  const viewCalendar = () =>
    leaveTo(navigation, { route: SCHEDULE_ROUTE, params: { id: player.id }, path: schedulePath(player.id) });

  /** Writes exactly the reviewed batch (001D). Any problem → nothing is written. */
  const addTrainings = async () => {
    if (busy || review === null || boot.status !== 'ready') return;
    const prepared = prepareImport(review, {
      playerId: player.id,
      analyzedFor: analyzedFor ?? '',
      activeTypes: new Set(types.map((x) => x.id)),
      sports,
      sport,
      today: localCalendarDateFromEpoch(services.clock.wallNow()),
    });
    if (!prepared.ok) return setSaveError('invalid');
    setBusy(true);
    setSaveError(null);
    try {
      const result = await createCalendarEventBatch(
        boot.db,
        player.id,
        { events: prepared.inputs, source: reviewed.source },
        { ids: services.ids, clock: services.clock },
      );
      if (result.ok) {
        setSaved({ importBatchId: result.importBatchId, candidates: reviewedBatch(review) });
        setPhase('done');
      } else setSaveError('invalid');
    } catch (e) {
      console.warn('[calendarImport] save failed', e);
      setSaveError('failed'); // the transaction wrote nothing
    }
    setBusy(false);
  };

  const undoImport = async () => {
    if (busy || saved === null || boot.status !== 'ready') return;
    setBusy(true);
    setUndoError(false);
    try {
      // Only this Player's events of THIS batch (playerId + importBatchId) — never by date / type / title.
      setUndone(await undoCalendarImport(boot.db, player.id, saved.importBatchId));
      setPhase('undone');
    } catch (e) {
      console.warn('[calendarImport] undo failed', e);
      setUndoError(true);
    }
    setBusy(false);
  };

  const batchLines = (batch: readonly ImportCandidate[], prefix: string) =>
    batch.map((c) => (
      <View key={c.key} style={styles.gap} testID={`${prefix}-${c.key}`}>
        <Text style={styles.body} testID={`${prefix}-${c.key}-line`}>
          {t('calendarImport.completeLine', { day: dayLine(c.date, language), time: timeRange(c.start, c.end), type: typeLabelOf(c.type) })}
        </Text>
        {c.location !== null ? (
          <Text style={styles.muted} testID={`${prefix}-${c.key}-location`}>
            {t('calendarImport.locationLine', { place: c.location })}
          </Text>
        ) : null}
      </View>
    ));
  const name = isolate(loaded.name);

  if (phase === 'undone' && undone) {
    const partial = undone.kept.length > 0;
    return (
      <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container}>
        {header}
        <Card testID="import-undone">
          <Text style={styles.heading} testID="import-undone-title">
            {partial ? t('calendarImport.undonePartialTitle') : t('calendarImport.undoneTitle')}
          </Text>
          <Text style={styles.body} testID="import-undone-body">
            {partial
              ? t('calendarImport.undonePartialBody', { removed: undone.deletedIds.length, kept: undone.kept.length })
              : t('calendarImport.undoneBody')}
          </Text>
        </Card>
        <BigButton testID="import-view-calendar" label={t('calendarImport.viewCalendar')} onPress={viewCalendar} />
      </KeyboardSafeScrollView>
    );
  }

  if (phase === 'done' && saved) {
    const count = saved.candidates.length;
    return (
      <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container}>
        {header}
        <Card testID="import-done">
          <Text style={styles.heading} testID="import-done-title">
            {count === 1 ? t('calendarImport.doneOne', { name }) : t('calendarImport.doneMany', { count, name })}
          </Text>
          {batchLines(saved.candidates, 'import-done')}
        </Card>
        <BigButton testID="import-view-calendar" label={t('calendarImport.viewCalendar')} onPress={viewCalendar} />
        <BigButton
          testID="import-undo"
          variant="secondary"
          label={t('calendarImport.undoImport')}
          disabled={busy}
          onPress={() => void undoImport()}
        />
        {undoError ? (
          <Text style={styles.warning} testID="import-undo-error">
            {t('calendarImport.undoFailed')}
          </Text>
        ) : null}
      </KeyboardSafeScrollView>
    );
  }

  if (phase === 'confirm' && review) {
    const batch = reviewedBatch(review);
    return (
      <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container}>
        {header}
        <Card testID="import-confirm">
          <Text style={styles.heading} testID="import-confirm-title">
            {t('calendarImport.confirmTitle', { name })}
          </Text>
          <Text style={styles.muted} testID="import-confirm-body">
            {t('calendarImport.confirmBody')}
          </Text>
          {batchLines(batch, 'import-confirm')}
        </Card>
        {saveError !== null ? (
          <Text style={styles.warning} testID="import-save-error">
            {saveError === 'invalid' ? t('calendarImport.saveInvalid') : t('calendarImport.saveFailed')}
          </Text>
        ) : null}
        <BigButton
          testID="import-add"
          label={batch.length === 1 ? t('calendarImport.addOne') : t('calendarImport.addMany', { count: batch.length })}
          disabled={busy || batch.length === 0}
          onPress={() => void addTrainings()}
        />
        <BigButton
          testID="import-back-to-review"
          variant="secondary"
          label={t('calendarImport.backToReview')}
          disabled={busy}
          onPress={() => {
            setSaveError(null);
            setPhase('review');
          }}
        />
      </KeyboardSafeScrollView>
    );
  }

  if (phase === 'review' && review) {
    const view = viewOf(review);
    const included = view.summary.includedKeys.length;
    const blocked = view.summary.needsReview.size;
    return (
      <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {header}
        <Text style={styles.muted} testID="import-review-header">
          {review.week === null
            ? t('calendarImport.excel.header', {
                type: typeId ? typeLabelOf(typeId) : '',
                count: review.candidates.length,
                team: isolate(reviewed.teamName ?? ''),
              })
            : t('calendarImport.header', {
                type: typeId ? typeLabelOf(typeId) : '',
                week: t('calendarImport.weekRange', { start: shortDate(review.week.start), end: shortDate(review.week.end) }),
              })}
        </Text>
        <BigButton
          testID="import-edit-text"
          variant="secondary"
          label={t('calendarImport.editText')}
          onPress={() => setPhase('input')}
        />
        {review.candidates.length === 0 ? (
          <Text style={styles.body} testID="import-none-found">
            {t('calendarImport.noneFound')}
          </Text>
        ) : null}
        {review.candidates.map((c) => (
          <CandidateRow
            key={c.key}
            candidate={c}
            week={review.week}
            side={reviewed.sides.get(c.key) ?? null}
            removed={review.removed.has(c.key)}
            issues={view.issues.get(c.key) ?? []}
            open={view.open.get(c.key) ?? []}
            acknowledged={review.acknowledged.get(c.key)}
            duplicate={view.duplicates.get(c.key)}
            otherOf={(key) => review.candidates.find((x) => x.key === key)}
            types={types}
            typeLabelOf={typeLabelOf}
            editing={editing === c.key}
            onEdit={() => setEditing(c.key)}
            onEditDone={(edit) => {
              setReview(editCandidate(review, c.key, edit));
              setEditing(null);
            }}
            onEditCancel={() => setEditing(null)}
            onRemove={() => {
              setReview(removeCandidate(review, c.key));
              if (editing === c.key) setEditing(null);
            }}
            onRestore={() => setReview(restoreCandidate(review, c.key))}
            onAcknowledge={(code) => setReview(acknowledge(review, c.key, code))}
          />
        ))}
        {review.unparsed.length > 0 ? (
          <View style={styles.gap} testID="import-unparsed">
            <Text style={styles.muted}>{t('calendarImport.notUnderstood')}</Text>
            {review.unparsed.map((u) => (
              <Text key={`${u.line}`} style={styles.muted} testID={`import-unparsed-${u.line}`}>
                {u.text}
              </Text>
            ))}
          </View>
        ) : null}
        {included === 0 && review.candidates.length > 0 ? (
          <Text style={styles.warning} testID="import-none-included">
            {t('calendarImport.noneIncluded')}
          </Text>
        ) : null}
        {(() => {
          // One explicit decision for many start-only games (their end stays NULL — never invented).
          const noEnd = view.summary.includedKeys.filter((k) => (view.open.get(k) ?? []).includes('END_TIME_MISSING')).length;
          return noEnd >= 2 ? (
            <BigButton
              testID="import-keep-all-no-end"
              variant="secondary"
              label={t('calendarImport.keepAllWithoutEnd', { count: noEnd })}
              onPress={() => setReview(acknowledgeAll(review, 'END_TIME_MISSING'))}
            />
          ) : null;
        })()}
        {blocked > 0 ? (
          <Text style={styles.warning} testID="import-blocked">
            {blocked === 1 ? t('calendarImport.blockedOne') : t('calendarImport.blockedMany', { count: blocked })}
          </Text>
        ) : null}
        {/* "Continue" reviews; the write happens only on the Confirm step ("Add N trainings"). */}
        <BigButton
          testID="import-continue"
          label={included === 1 ? t('calendarImport.continueOne') : t('calendarImport.continueMany', { count: included })}
          disabled={!view.summary.canConfirm}
          onPress={() => {
            if (!view.summary.canConfirm) return;
            setSaveError(null);
            setPhase('confirm');
          }}
        />
      </KeyboardSafeScrollView>
    );
  }

  return (
    <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {header}
      <Text style={styles.heading}>{t('calendarImport.stepType')}</Text>
      <RevealWhen active={inputError === 'type'}>
        {types.length === 0 ? (
          <Text style={styles.warning} testID="import-type-none">
            {t('calendar.errors.noActiveTypes')}
          </Text>
        ) : (
          <ChoiceChips<ActivityTypeId>
            testID="import-type"
            label={t('calendarImport.field.type')}
            choices={types.map((type) => ({ value: type.id, label: activityTypeChoiceLabel(t, type) }))}
            value={typeId}
            onChange={(value) => {
              if (value !== null) setTypeId(value);
              setInputError(null);
            }}
            // CTI-31: the error stays next to the type (testID import-type-error) until one is chosen.
            error={inputError === 'type' ? t('calendarImport.typeRequired') : undefined}
          />
        )}
      </RevealWhen>
      {(mode === 'excel' || season !== null) && typeId !== 'GAME' && types.some((x) => x.id === 'GAME') ? (
        // A league fixture file suggests GAME — shown, never applied for the user.
        <Text style={styles.muted} testID="import-type-suggestion">
          {t('calendarImport.excel.suggestGame')}
        </Text>
      ) : null}
      {sports.length > 0 ? (
        <ChoiceChips<SportKey>
          testID="import-sport"
          label={t('calendar.field.sport')}
          choices={sports.map((s) => ({ value: s, label: sportLabel(t, s) }))}
          value={sport}
          onChange={setSport}
        />
      ) : null}

      <ChoiceChips<SourceMode>
        testID="import-source"
        label={t('calendarImport.source.label')}
        choices={[
          { value: 'text', label: t('calendarImport.source.text') },
          { value: 'excel', label: t('calendarImport.source.excel') },
        ]}
        value={mode}
        onChange={(v) => v !== null && setMode(v)}
      />
      {mode === 'excel' ? (
        <>
          <Text style={styles.heading}>{t('calendarImport.excel.step')}</Text>
          <ExcelSourcePanel
            playerName={loaded.name}
            playerTeam={loaded.teamName}
            value={excel}
            onChange={(v) => {
              setExcel(v);
              setTeamError(false);
            }}
            teamError={teamError}
          />
          <BigButton testID="import-analyze" label={t('calendarImport.excel.analyze')} onPress={() => void analyze()} />
        </>
      ) : (
      <>
      <Text style={styles.heading}>{t('calendarImport.stepWeek')}</Text>
      <View style={styles.weekRow}>
        <WeekButton
          testID="import-week-prev"
          label={language === 'he' ? '›' : '‹'}
          a11y={t('calendarImport.previousWeekA11y')}
          // Only today and later can be imported: no week before the current one (CTI-32).
          disabled={!canShowPreviousWeek(week, today)}
          onPress={() => canShowPreviousWeek(week, today) && setWeek(shiftImportWeek(week, -1))}
        />
        <Text style={styles.weekLabel} testID="import-week-label">
          {t('calendarImport.weekRange', {
            start: `${weekdayName(week.start, language)} ${shortDate(week.start)}`,
            end: `${weekdayName(week.end, language)} ${shortDate(week.end)}`,
          })}
        </Text>
        <WeekButton
          testID="import-week-next"
          label={language === 'he' ? '‹' : '›'}
          a11y={t('calendarImport.nextWeekA11y')}
          onPress={() => setWeek(shiftImportWeek(week, 1))}
        />
      </View>
      {weekTiming !== 'FUTURE' ? (
        <Text style={styles.warning} testID="import-week-warning">
          {weekTiming === 'PAST' ? t('calendarImport.weekPastBlocked') : t('calendarImport.weekStartedFromToday')}
        </Text>
      ) : null}

      <Text style={styles.heading}>{t('calendarImport.stepText')}</Text>
      <Text style={styles.muted}>{t('calendarImport.textHint')}</Text>
      <TextField
        testID="import-text"
        label={t('calendarImport.textLabel')}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setInputError(null);
          // Another text: read it again (fixture list or weekly) at the next Analyze.
          setSeason(null);
          setAskKind(false);
          setTeamError(false);
        }}
        multiline
        visibleLines={8}
        error={inputError === 'text' ? t('calendarImport.textRequired') : undefined}
      />
      {askKind ? (
        <View style={styles.gap} testID="import-season-ask">
          <Text style={styles.body}>{t('calendarImport.season.ask')}</Text>
          <BigButton testID="import-season-as-fixture" label={t('calendarImport.season.asFixture')} onPress={() => void analyze('fixture')} />
          <BigButton testID="import-season-as-weekly" variant="secondary" label={t('calendarImport.season.asWeekly')} onPress={() => void analyze('weekly')} />
        </View>
      ) : null}
      {season !== null ? (
        <View style={styles.gap} testID="import-season">
          <Text style={styles.muted} testID="import-season-detected">
            {t('calendarImport.season.detected', { count: season.fixtures.length })}
          </Text>
          <TeamChooser
            idPrefix="import-fixture"
            playerName={loaded.name}
            playerTeam={loaded.teamName}
            value={season}
            onChange={(v) => {
              setSeason(v);
              setTeamError(false);
            }}
            teamError={teamError}
          />
        </View>
      ) : null}
      <BigButton testID="import-analyze" label={t('calendarImport.analyze')} onPress={() => void analyze()} />
      </>
      )}
    </KeyboardSafeScrollView>
  );
}

/** A stored event as local wall-clock values (an end on another local day counts as no end). */
function toSlot(e: { id: string; title: string | null; type: string; startAt: number; endAt: number | null }): ExistingSlot {
  const s = epochToLocalDateTime(e.startAt);
  const end = e.endAt === null ? null : epochToLocalDateTime(e.endAt);
  const sameDay = end !== null && end.year === s.year && end.month === s.month && end.day === s.day;
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    date: { year: s.year, month: s.month, day: s.day },
    start: { hour: s.hour, minute: s.minute },
    end: sameDay ? { hour: end.hour, minute: end.minute } : null,
  };
}

/** Scrolls its content into view when `active` turns on (e.g. a validation error above the fold). */
function RevealWhen({ active, children }: { active: boolean; children: ReactNode }) {
  const reveal = useContext(KeyboardRevealContext);
  const box = useRef<View>(null);
  useEffect(() => {
    if (active && box.current) reveal?.focused(box.current);
  }, [active, reveal]);
  return (
    <View ref={box} collapsable={false} style={styles.gap}>
      {children}
    </View>
  );
}

function WeekButton({
  testID,
  label,
  a11y,
  disabled = false,
  onPress,
}: {
  testID: string;
  label: string;
  a11y: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.weekButton, disabled && styles.disabled, pressed && { opacity: 0.7 }]}>
      <Text style={styles.weekButtonText}>{label}</Text>
    </Pressable>
  );
}

function RowAction({ testID, label, a11y, onPress }: { testID: string; label: string; a11y?: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={stripBidi(a11y ?? label)}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <Text style={styles.actionText} testID={`${testID}-label`}>
        {label}
      </Text>
    </Pressable>
  );
}

type RowProps = {
  candidate: ImportCandidate;
  /** null for a fixture source (no week). */
  week: ImportWeek | null;
  /** The Player's side in a fixture (derived presentation; never ownership). */
  side: 'HOME' | 'AWAY' | null;
  removed: boolean;
  issues: readonly ImportIssueCode[];
  open: readonly ImportIssueCode[];
  acknowledged: ReadonlySet<ImportIssueCode> | undefined;
  duplicate: DuplicateMatch | undefined;
  otherOf: (key: string) => ImportCandidate | undefined;
  types: ActivityTypeRef[];
  typeLabelOf: (id: ActivityTypeId) => string;
  editing: boolean;
  onEdit: () => void;
  onEditDone: (edit: CandidateEdit) => void;
  onEditCancel: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onAcknowledge: (code: ImportIssueCode) => void;
};

function CandidateRow(props: RowProps) {
  const { candidate: c, removed, issues, open, acknowledged, duplicate } = props;
  const { t, language } = useI18n();
  const id = `import-row-${c.key}`;
  const day = weekdayName(c.date, language);
  const time = clock(c.start);

  if (removed) {
    return (
      <Card testID={id} style={styles.removedRow}>
        <Text style={styles.muted} testID={`${id}-removed`}>
          {t('calendarImport.removedRow', { day })}
        </Text>
        <RowAction
          testID={`${id}-undo`}
          label={t('calendarImport.undoRemove')}
          a11y={t('calendarImport.undoRemoveA11y', { day, time })}
          onPress={props.onRestore}
        />
      </Card>
    );
  }

  const ready = open.length === 0;
  const date = shortDate(c.date);
  const resolved = (code: ImportIssueCode) => acknowledged?.has(code) ?? false;
  return (
    <Card testID={id} style={!ready && styles.reviewRow}>
      <StatusBadge
        testID={`${id}-status`}
        tone={ready ? 'success' : 'warning'}
        label={ready ? t('calendarImport.ready') : t('calendarImport.needsReview')}
      />
      <Text style={styles.name} testID={`${id}-when`}>
        {dayLine(c.date, language)}
      </Text>
      <Text style={styles.body} testID={`${id}-time`}>
        {timeRange(c.start, c.end)}
      </Text>
      {props.side !== null ? (
        <Text style={styles.muted} testID={`${id}-side`}>
          {t(`calendarImport.side.${props.side}`)}
        </Text>
      ) : null}
      {c.location !== null ? (
        <Text style={styles.body} testID={`${id}-location`}>
          {t('calendarImport.locationLine', { place: c.location })}
        </Text>
      ) : null}
      <Text style={styles.body} testID={`${id}-type`}>
        {props.typeLabelOf(c.type)}
      </Text>
      {c.title !== null ? (
        <Text style={styles.body} testID={`${id}-title`}>
          {c.title}
        </Text>
      ) : null}
      {c.details !== null ? (
        <Text style={styles.muted} testID={`${id}-details`}>
          {c.details}
        </Text>
      ) : null}

      {issues.map((code) => {
        if (code === 'END_TIME_MISSING') {
          // An end may be unknown (e.g. a game): the user keeps it without one, enters one, or removes it.
          return (
            <View key={code} style={styles.gap} testID={`${id}-issue-${code}`}>
              <Text style={styles.warning} testID={`${id}-issue-${code}-text`}>
                {t('calendarImport.issue.END_TIME_MISSING')}
              </Text>
              {resolved(code) ? (
                <Text style={styles.muted} testID={`${id}-resolved-${code}`}>
                  {t('calendarImport.resolvedByYou')}
                </Text>
              ) : (
                <RowAction
                  testID={`${id}-keep-no-end`}
                  label={t('calendarImport.keepWithoutEnd')}
                  onPress={() => props.onAcknowledge(code)}
                />
              )}
            </View>
          );
        }
        if (code === 'END_NOT_AFTER_START' || code === 'TITLE_REQUIRED') {
          return (
            <Text key={code} style={styles.warning} testID={`${id}-issue-${code}`}>
              {t(`calendarImport.issue.${code}`)}
            </Text>
          );
        }
        if (code === 'DATE_IN_PAST') {
          // Never "keep anyway": change the date or remove the training (CTI-32).
          return (
            <View key={code} style={styles.gap} testID={`${id}-issue-${code}`}>
              <Text style={styles.warning} testID={`${id}-past`}>
                {t('calendarImport.datePast', { date })}
              </Text>
              <View style={styles.actions}>
                <RowAction testID={`${id}-past-edit-date`} label={t('calendarImport.editDate')} onPress={props.onEdit} />
                <RowAction testID={`${id}-past-remove`} label={t('calendarImport.remove')} onPress={props.onRemove} />
              </View>
            </View>
          );
        }
        if (code === 'WEEKDAY_DATE_MISMATCH') {
          // The weekday the source wrote (a fixture list has no week: any date on that weekday names it).
          const written =
            c.textWeekday === null ? '' : weekdayName(dateInWeek(props.week ?? importWeekContaining(c.date), c.textWeekday), language);
          return (
            <View key={code} style={styles.gap} testID={`${id}-issue-${code}`}>
              <Text style={styles.warning}>{t('calendarImport.dateMismatch')}</Text>
              <Text style={styles.body} testID={`${id}-mismatch-detail`}>
                {t('calendarImport.dateMismatchDetail', { written, date, actual: day })}
              </Text>
              {resolved(code) ? (
                <Text style={styles.muted} testID={`${id}-resolved-${code}`}>
                  {t('calendarImport.resolvedByYou')}
                </Text>
              ) : (
                <RowAction testID={`${id}-use-date`} label={t('calendarImport.useDate', { date })} onPress={() => props.onAcknowledge(code)} />
              )}
            </View>
          );
        }
        if (code === 'DATE_OUTSIDE_WEEK') {
          return (
            <View key={code} style={styles.gap} testID={`${id}-issue-${code}`}>
              <Text style={styles.warning} testID={`${id}-outside-week`}>
                {t('calendarImport.outsideWeek', { date })}
              </Text>
              {resolved(code) ? (
                <Text style={styles.muted} testID={`${id}-resolved-${code}`}>
                  {t('calendarImport.resolvedByYou')}
                </Text>
              ) : (
                <RowAction
                  testID={`${id}-use-date-anyway`}
                  label={t('calendarImport.useDateAnyway', { date })}
                  onPress={() => props.onAcknowledge(code)}
                />
              )}
            </View>
          );
        }
        if (code === 'POSSIBLE_DUPLICATE' && duplicate) {
          const other = duplicate.kind === 'IN_IMPORT' ? props.otherOf(duplicate.otherKey) : undefined;
          const existingWhen =
            duplicate.kind === 'EXISTING'
              ? `${timeRange(duplicate.event.start, duplicate.event.end)} · ${props.typeLabelOf(duplicate.event.type)}${duplicate.event.title ? ` · ${duplicate.event.title}` : ''}`
              : other
                ? `${dayLine(other.date, language)} · ${timeRange(other.start, other.end)}`
                : '';
          return (
            <View key={code} style={styles.gap} testID={`${id}-issue-${code}`}>
              <Text style={styles.body} testID={`${id}-duplicate-imported`}>
                {t('calendarImport.duplicateImported', { when: `${timeRange(c.start, c.end)} · ${props.typeLabelOf(c.type)}` })}
              </Text>
              <Text style={styles.body} testID={`${id}-duplicate-existing`}>
                {duplicate.kind === 'EXISTING'
                  ? t('calendarImport.duplicateExisting', { when: existingWhen })
                  : t('calendarImport.duplicateInImport', { when: existingWhen })}
              </Text>
              <Text style={styles.warning}>{t('calendarImport.duplicate')}</Text>
              {resolved(code) ? (
                <Text style={styles.muted} testID={`${id}-resolved-${code}`}>
                  {t('calendarImport.resolvedByYou')}
                </Text>
              ) : (
                <View style={styles.actions}>
                  <RowAction
                    testID={`${id}-keep`}
                    label={t('calendarImport.keepAnyway')}
                    a11y={t('calendarImport.keepAnywayA11y', { day, time })}
                    onPress={() => props.onAcknowledge(code)}
                  />
                  <RowAction testID={`${id}-remove-duplicate`} label={t('calendarImport.removeFromImport')} onPress={props.onRemove} />
                </View>
              )}
            </View>
          );
        }
        if (code === 'SUGGESTED_TYPE_DIFFERS' && c.suggestedType !== null) {
          return (
            <Text key={code} style={styles.muted} testID={`${id}-suggestion`}>
              {t('calendarImport.suggestion', { suggested: props.typeLabelOf(c.suggestedType), current: props.typeLabelOf(c.type) })}
            </Text>
          );
        }
        return null;
      })}

      {props.editing ? (
        <CandidateEditor
          id={id}
          candidate={c}
          types={props.types}
          onDone={props.onEditDone}
          onCancel={props.onEditCancel}
        />
      ) : (
        <View style={styles.actions}>
          <RowAction testID={`${id}-edit`} label={t('calendarImport.edit')} a11y={t('calendarImport.editA11y', { day, time })} onPress={props.onEdit} />
          <RowAction testID={`${id}-remove`} label={t('calendarImport.remove')} a11y={t('calendarImport.removeA11y', { day, time })} onPress={props.onRemove} />
        </View>
      )}
    </Card>
  );
}

/** The inline editor: the candidate's values, re-checked by the review rules when Done. */
function CandidateEditor({
  id,
  candidate: c,
  types,
  onDone,
  onCancel,
}: {
  id: string;
  candidate: ImportCandidate;
  types: ActivityTypeRef[];
  onDone: (edit: CandidateEdit) => void;
  onCancel: () => void;
}) {
  const { t, language } = useI18n();
  const [date, setDate] = useState<CalendarDate>(c.date);
  const [start, setStart] = useState(c.start);
  const [end, setEnd] = useState(c.end);
  const [location, setLocation] = useState(c.location ?? '');
  const [type, setType] = useState<ActivityTypeId>(c.type);
  const [details, setDetails] = useState(c.details ?? '');
  const [title, setTitle] = useState(c.title ?? '');
  const at = (time: { hour: number; minute: number }) => ({ ...date, ...time });

  return (
    <View style={styles.editor} testID={`${id}-editor`}>
      <DateTimeField
        testID={`${id}-edit-date`}
        label={t('calendarImport.field.date')}
        mode="date"
        value={at(start)}
        displayValue={dayLine(date, language)}
        onSelect={(v) => setDate({ year: v.year, month: v.month, day: v.day })}
      />
      <View style={styles.actions}>
        <DateTimeField
          testID={`${id}-edit-start`}
          label={t('calendarImport.field.start')}
          mode="time"
          value={at(start)}
          displayValue={clock(start)}
          onSelect={(v) => setStart({ hour: v.hour, minute: v.minute })}
        />
        <DateTimeField
          testID={`${id}-edit-end`}
          label={t('calendarImport.field.end')}
          mode="time"
          value={at(end ?? start)}
          displayValue={end === null ? t('calendarImport.field.endNotSet') : clock(end)}
          onSelect={(v) => setEnd({ hour: v.hour, minute: v.minute })}
        />
      </View>
      {end !== null ? (
        <RowAction testID={`${id}-edit-clear-end`} label={t('calendarImport.clearEnd')} onPress={() => setEnd(null)} />
      ) : null}
      <TextField testID={`${id}-edit-location`} label={t('calendarImport.field.location')} value={location} onChangeText={setLocation} />
      <ChoiceChips<ActivityTypeId>
        testID={`${id}-edit-type`}
        label={t('calendarImport.field.type')}
        choices={types.map((x) => ({ value: x.id, label: activityTypeChoiceLabel(t, x) }))}
        value={type}
        onChange={(v) => v !== null && setType(v)}
      />
      {requiresTitle(type) ? (
        <TextField testID={`${id}-edit-title`} label={t('calendarImport.field.title')} value={title} onChangeText={setTitle} />
      ) : null}
      <TextField testID={`${id}-edit-details`} label={t('calendarImport.field.details')} value={details} onChangeText={setDetails} />
      <View style={styles.actions}>
        <RowAction
          testID={`${id}-edit-done`}
          label={t('calendarImport.editDone')}
          onPress={() => onDone({ date, start, end, location, type, details, title: requiresTitle(type) ? title : null })}
        />
        <RowAction testID={`${id}-edit-cancel`} label={t('calendarImport.editCancel')} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  gap: { gap: spacing.xs },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  heading: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'auto', marginTop: spacing.sm },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  body: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  warning: { fontSize: 15, color: '#7A5200', fontWeight: '600', textAlign: 'auto' },
  reviewRow: { borderColor: '#D08A00', borderWidth: 2 },
  removedRow: { backgroundColor: semantic.background },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    minHeight: touch.minTarget,
    minWidth: touch.minTarget,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  editor: { gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  weekButton: {
    minHeight: touch.minTarget,
    minWidth: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  weekButtonText: { fontSize: 22, fontWeight: '800', color: colors.ink },
  disabled: { opacity: 0.35 },
});
