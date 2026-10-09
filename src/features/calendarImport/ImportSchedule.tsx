import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listActivityTypes } from '@/data/local/activityTypes/activityTypeRepository';
import { listCalendarEvents } from '@/data/local/calendar/calendarEventRepository';
import { getPlayer } from '@/data/local/players/playerRepository';
import { requiresTitle, selectableActivityTypes, type ActivityTypeId, type ActivityTypeRef } from '@/domain/activityType';
import type { CalendarDate } from '@/domain/calendarDate';
import {
  dateInWeek,
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
import { sportsOf } from '@/features/calendar/calendarFormValues';
import { ErrorScreen, LoadingScreen } from '@/features/calendar/StatusScreen';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { PlayerTargetLabel, useActivePlayer } from '@/features/players/ActivePlayerContext';
import { stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { epochToLocalDateTime, localCalendarDateFromEpoch } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { DateTimeField } from '@/ui/DateTimeField';
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { StatusBadge } from '@/ui/StatusBadge';
import { TextField } from '@/ui/TextField';
import { colors, semantic, spacing, touch } from '@/ui/theme';

import { clock, dayLine, shortDate, timeRange, weekdayName } from './importFormat';
import {
  acknowledge,
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
 * READS existing calendar events (duplicate review) and NEVER writes: the
 * CTA ends in a "review complete" state; saving the reviewed batch is 001D.
 */
type Loaded = { types: ActivityTypeRef[]; sports: SportKey[] };
type Phase = 'input' | 'review' | 'complete';

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
  useUnsavedChangesGuard(text.trim().length > 0 || review !== null);

  useEffect(() => {
    if (boot.status !== 'ready') return;
    let active = true;
    Promise.all([listActivityTypes(boot.db), getPlayer(boot.db, player.id)])
      .then(([catalog, profile]) => {
        if (!active) return;
        const sports = profile ? sportsOf(profile) : [];
        setLoaded({ types: selectableActivityTypes(catalog), sports });
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
  }, [boot, player.id]);

  if (boot.status === 'error' || loaded === 'error') {
    return <ErrorScreen testID="import-error" message="calendarImport.loadFailed" fallback="/children" />;
  }
  if (loaded === null) return <LoadingScreen />;
  const { types, sports } = loaded;
  const typeLabelOf = (id: ActivityTypeId) => {
    const type = types.find((x) => x.id === id);
    return type ? activityTypeLabel(t, type) : id;
  };

  const analyze = async () => {
    if (typeId === null) return setInputError('type');
    if (text.trim().length === 0) return setInputError('text');
    if (busy || boot.status !== 'ready') return;
    setBusy(true);
    setInputError(null);
    try {
      // READ ONLY: this Player's events, for the conservative duplicate review.
      const events = await listCalendarEvents(boot.db, player.id);
      setReview(analyzeSchedule(text, week, typeId, events.map(toSlot)));
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

  if (phase === 'complete' && review) {
    const batch = reviewedBatch(review);
    return (
      <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container}>
        {header}
        <Card testID="import-complete">
          <Text style={styles.heading}>{t('calendarImport.completeTitle')}</Text>
          <Text style={styles.body} testID="import-complete-body">
            {t('calendarImport.completeBody')}
          </Text>
          {batch.map((c) => (
            <Text key={c.key} style={styles.body} testID={`import-complete-${c.key}`}>
              {t('calendarImport.completeLine', { day: dayLine(c.date, language), time: timeRange(c.start, c.end), type: typeLabelOf(c.type) })}
            </Text>
          ))}
        </Card>
        <BigButton
          testID="import-back-to-review"
          variant="secondary"
          label={t('calendarImport.backToReview')}
          onPress={() => setPhase('review')}
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
          {t('calendarImport.header', {
            type: typeId ? typeLabelOf(typeId) : '',
            week: t('calendarImport.weekRange', { start: shortDate(week.start), end: shortDate(week.end) }),
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
        {blocked > 0 ? (
          <Text style={styles.warning} testID="import-blocked">
            {blocked === 1 ? t('calendarImport.blockedOne') : t('calendarImport.blockedMany', { count: blocked })}
          </Text>
        ) : null}
        {/* 001C: "Continue", never "Add" — nothing is saved until 001D. */}
        <BigButton
          testID="import-continue"
          label={included === 1 ? t('calendarImport.continueOne') : t('calendarImport.continueMany', { count: included })}
          disabled={!view.summary.canConfirm}
          onPress={() => view.summary.canConfirm && setPhase('complete')}
        />
      </KeyboardSafeScrollView>
    );
  }

  return (
    <KeyboardSafeScrollView testID="import-scroll" contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {header}
      <Text style={styles.heading}>{t('calendarImport.stepType')}</Text>
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
        />
      )}
      {inputError === 'type' ? (
        <Text style={styles.warning} testID="import-type-error">
          {t('calendar.errors.typeRequired')}
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

      <Text style={styles.heading}>{t('calendarImport.stepWeek')}</Text>
      <View style={styles.weekRow}>
        <WeekButton
          testID="import-week-prev"
          label={language === 'he' ? '›' : '‹'}
          a11y={t('calendarImport.previousWeekA11y')}
          onPress={() => setWeek(shiftImportWeek(week, -1))}
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
          {weekTiming === 'PAST' ? t('calendarImport.weekPast') : t('calendarImport.weekStarted')}
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
        }}
        multiline
        visibleLines={8}
        error={inputError === 'text' ? t('calendarImport.textRequired') : undefined}
      />
      <BigButton testID="import-analyze" label={t('calendarImport.analyze')} onPress={() => void analyze()} />
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

function WeekButton({ testID, label, a11y, onPress }: { testID: string; label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.weekButton, pressed && { opacity: 0.7 }]}>
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
  week: ImportWeek;
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
        if (code === 'END_TIME_MISSING' || code === 'END_NOT_AFTER_START' || code === 'TITLE_REQUIRED') {
          return (
            <Text key={code} style={styles.warning} testID={`${id}-issue-${code}`}>
              {t(`calendarImport.issue.${code}`)}
            </Text>
          );
        }
        if (code === 'WEEKDAY_DATE_MISMATCH') {
          const written = c.textWeekday === null ? '' : weekdayName(dateInWeek(props.week, c.textWeekday), language);
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
});
