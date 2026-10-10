import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SaveCalendarEventResult } from '@/data/local/calendar/calendarEventRepository';
import { requiresTitle, type ActivityTypeId, type ActivityTypeRef } from '@/domain/activityType';
import {
  CALENDAR_LOCATION_MAX_LENGTH,
  CALENDAR_TITLE_MAX_LENGTH,
  type CalendarEvent,
  type CalendarEventErrors,
  type CalendarEventInput,
} from '@/domain/calendarEvent';
import type { SportKey } from '@/domain/sport';
import { ltr } from '@/i18n/bidi';
import { isFormDirty } from '@/features/navigation/formDirty';
import { useUnsavedChangesGuard } from '@/features/navigation/unsavedChanges';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { calendarDateToLocalNoon, type LocalDateTime } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { DateTimeField } from '@/ui/DateTimeField';
import { measureWindowRect, revealOffset } from '@/ui/keyboardReveal';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

import { activityTypeChoiceLabel, calendarErrorMessage, sportLabel } from './calendarLabels';
import { toEventInput, type CalendarFormValues } from './calendarFormValues';
import { formatEventDate } from './formatEventTime';

/** The sport chip meaning "this event has no sport" (never stored: it saves as null). */
const NO_SPORT = 'NONE';

type FieldErrors = Partial<
  Record<'type' | 'sport' | 'start' | 'end' | 'title' | 'notes' | 'location', TranslationKey>
>;

/** Domain validation codes → which field shows which message. */
function fieldErrors(errors: CalendarEventErrors): FieldErrors {
  const out: FieldErrors = {};
  if (errors.type) out.type = 'calendar.errors.typeRequired';
  if (errors.sport) out.sport = 'calendar.errors.invalidValue';
  if (errors.startAt) out.start = 'calendar.errors.invalidValue';
  if (errors.endAt) {
    out.end =
      errors.endAt === 'NOT_AFTER_START' ? 'calendar.errors.endAfterStart' : 'calendar.errors.invalidValue';
  }
  if (errors.title) {
    out.title =
      errors.title === 'REQUIRED_FOR_OTHER'
        ? 'calendar.errors.titleRequiredForOther'
        : errors.title === 'TOO_LONG'
          ? 'calendar.errors.titleTooLong'
          : 'calendar.errors.invalidValue';
  }
  if (errors.notes) out.notes = 'calendar.errors.invalidValue';
  if (errors.location) {
    out.location = errors.location === 'TOO_LONG' ? 'calendar.errors.locationTooLong' : 'calendar.errors.invalidValue';
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A local wall time as 24-hour `HH:MM`, kept LTR inside Hebrew. */
const timeText = (value: LocalDateTime) => ltr(`${pad(value.hour)}:${pad(value.minute)}`);

type Props = {
  initialValues: CalendarFormValues;
  /** The sports this Player is assigned to; only these can be chosen. */
  sports: readonly SportKey[];
  /**
   * The Activity Types that can be chosen, in order: the active ones, plus an
   * edited event's own type when it is inactive (shown as such, never reactivated).
   */
  types: readonly ActivityTypeRef[];
  /** Persists the input (create or update). Validation problems come back as a result. */
  onSave: (input: CalendarEventInput) => Promise<SaveCalendarEventResult>;
  onSaved: (event: CalendarEvent) => void;
  onCancel: () => void;
};

/**
 * The one form for creating and editing an event. It edits local wall times
 * and raw text; the domain (through the repository) decides what is valid —
 * an invalid Save writes nothing, keeps every value and marks the fields.
 * Navigation is the caller's (onSaved / onCancel).
 */
export function CalendarEventForm({ initialValues, sports, types, onSave, onSaved, onCancel }: Props) {
  const { t, language } = useI18n();
  const [values, setValues] = useState<CalendarFormValues>(initialValues);
  // Leaving with unsaved changes asks first (NAV-DIRTY-001); loaded / default values are clean.
  const guard = useUnsavedChangesGuard(isFormDirty(values, initialValues));
  // New titles stop at the limit; a longer title stored before the limit is shown in full
  // (never cut by the field) and may be kept or shortened (the domain decides on Save).
  const titleMaxLength = Math.max(CALENDAR_TITLE_MAX_LENGTH, initialValues.title.length);
  // The same for a location stored before the limit (CAL-EVENT-LOC-001).
  const locationMaxLength = Math.max(CALENDAR_LOCATION_MAX_LENGTH, initialValues.location.length);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second press in the same frame must see the guard immediately.
  const saveInProgress = useRef(false);
  const formView = useRef<View>(null);
  const [topInWindow, setTopInWindow] = useState(0);

  // Keeping the focused Title / Notes in view while the keyboard is open.
  const scrollView = useRef<ScrollView>(null);
  /** The scroll view's visible area: it shrinks by the keyboard padding. */
  const viewportBox = useRef<View>(null);
  const scrollOffset = useRef(0);
  const titleBox = useRef<View>(null);
  const notesBox = useRef<View>(null);
  const locationBox = useRef<View>(null);
  const focusedField = useRef<'title' | 'notes' | 'location' | null>(null);
  /** Scrolls just enough to show the focused field (its bottom first: the typing position). */
  const revealFocused = useCallback(async () => {
    const focused = focusedField.current;
    const box =
      focused === 'title'
        ? titleBox.current
        : focused === 'notes'
          ? notesBox.current
          : focused === 'location'
            ? locationBox.current
            : null;
    if (!box) return;
    const [field, viewport] = await Promise.all([
      measureWindowRect(box),
      measureWindowRect(viewportBox.current),
    ]);
    if (!field || !viewport) return;
    const y = revealOffset(field, viewport, scrollOffset.current);
    if (y !== null) scrollView.current?.scrollTo({ y, animated: true });
  }, []);
  // The keyboard opening (or changing size) can cover the focused field.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => void revealFocused());
    return () => subscription.remove();
  }, [revealFocused]);
  const onTitleFocus = useCallback(() => {
    focusedField.current = 'title';
    void revealFocused();
  }, [revealFocused]);
  const onNotesFocus = useCallback(() => {
    focusedField.current = 'notes';
    void revealFocused();
  }, [revealFocused]);
  const onLocationFocus = useCallback(() => {
    focusedField.current = 'location';
    void revealFocused();
  }, [revealFocused]);
  const onFieldBlur = useCallback(() => {
    focusedField.current = null;
  }, []);

  const change = <K extends keyof CalendarFormValues>(
    key: K,
    value: CalendarFormValues[K],
    clears: (keyof FieldErrors)[],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of clears) delete next[field];
      return next;
    });
  };

  const save = async () => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const prepared = toEventInput(values);
      if (!prepared.ok) {
        setErrors({
          ...(prepared.errors.start && { start: 'calendar.errors.timeDoesNotExist' }),
          ...(prepared.errors.end && { end: 'calendar.errors.timeDoesNotExist' }),
        });
      } else {
        const result = await onSave(prepared.input);
        if (result.ok) {
          guard.release(); // saved: leaving is safe
          onSaved(result.event); // stays guarded: the screen is leaving
          return;
        }
        setErrors(fieldErrors(result.errors));
      }
    } catch (e) {
      console.warn('[calendar] save failed', e);
      setSaveError(calendarErrorMessage(e, 'calendar.errors.saveFailed'));
    }
    saveInProgress.current = false;
    setSaving(false);
  };

  const dateText = (value: LocalDateTime) =>
    formatEventDate(calendarDateToLocalNoon(value).getTime(), language);
  const message = (key: TranslationKey | undefined) => (key ? t(key) : undefined);

  return (
    // Keeps the focused Title / Notes above the keyboard (CAL-KEY-001). On both
    // platforms the form is padded by the keyboard's overlap: Android draws
    // edge-to-edge, so the window no longer shrinks for the keyboard. The
    // overlap is computed from this view's position in the window (below the
    // header — measured, not hard-coded). The smaller visible area is then
    // scrolled to the focused field (revealFocused).
    <View
      style={styles.keyboard}
      ref={formView}
      testID="event-form-root"
      onLayout={() =>
        void measureWindowRect(formView.current).then((rect) => rect && setTopInWindow(rect.top))
      }>
      <KeyboardAvoidingView
        testID="event-form-keyboard"
        style={styles.keyboard}
        behavior="padding"
        keyboardVerticalOffset={topInWindow}>
        <View ref={viewportBox} style={styles.keyboard} collapsable={false} testID="event-form-viewport">
          <SafeAreaScrollView
            ref={scrollView}
            testID="event-form-scroll"
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(event) => (scrollOffset.current = event.nativeEvent.contentOffset.y)}
            // The visible area shrinks once the keyboard padding applies, and a
            // multiline Notes field grows while typing: keep the focused field shown.
            onLayout={() => void revealFocused()}
            onContentSizeChange={() => void revealFocused()}>
            <ChoiceChips<ActivityTypeId>
              testID="event-type"
              label={t('calendar.field.type')}
              choices={types.map((type) => ({ value: type.id, label: activityTypeChoiceLabel(t, type) }))}
              value={values.type}
              // A type is always required: pressing the chosen chip keeps it.
              onChange={(type) => type !== null && change('type', type, ['type', 'title'])}
              error={message(errors.type)}
            />
            {types.length === 0 ? (
              // Nothing is chosen or invented: the user turns a type on in Settings.
              <Text style={styles.notice} testID="event-type-none">
                {t('calendar.errors.noActiveTypes')}
              </Text>
            ) : null}

            {sports.length === 1 ? (
              // One assignable sport: a single optional chip (off = no sport). Pressing
              // it again clears it; nothing is ever chosen for the user.
              <ChoiceChips<SportKey>
                testID="event-sport"
                label={t('calendar.field.sport')}
                choices={sports.map((sport) => ({ value: sport, label: sportLabel(t, sport) }))}
                value={values.sport}
                onChange={(sport) => change('sport', sport, ['sport'])}
                error={message(errors.sport)}
              />
            ) : null}
            {sports.length > 1 ? (
              <ChoiceChips<string>
                testID="event-sport"
                label={t('calendar.field.sport')}
                choices={[
                  { value: NO_SPORT, label: t('calendar.field.noSport') },
                  ...sports.map((sport) => ({ value: sport, label: sportLabel(t, sport) })),
                ]}
                value={values.sport ?? NO_SPORT}
                onChange={(choice) => {
                  if (choice === null) return;
                  const sport = sports.find((s) => s === choice) ?? null;
                  change('sport', sport, ['sport']);
                }}
                error={message(errors.sport)}
              />
            ) : null}

            <View style={styles.group} testID="event-start">
              <DateTimeField
                testID="event-start-date"
                label={t('calendar.field.date')}
                mode="date"
                value={values.start}
                displayValue={dateText(values.start)}
                onSelect={(start) => change('start', start, ['start', 'end'])}
              />
              <DateTimeField
                testID="event-start-time"
                label={t('calendar.field.startTime')}
                mode="time"
                value={values.start}
                displayValue={timeText(values.start)}
                onSelect={(start) => change('start', start, ['start', 'end'])}
                error={message(errors.start)}
              />
            </View>

            {values.end === null ? (
              <BigButton
                testID="event-add-end"
                variant="secondary"
                label={t('calendar.field.addEnd')}
                // Starts from the start date and time; the user picks the real end.
                onPress={() => change('end', values.start, ['end'])}
              />
            ) : (
              <View style={styles.group} testID="event-end">
                <DateTimeField
                  testID="event-end-date"
                  label={t('calendar.field.endDate')}
                  mode="date"
                  value={values.end}
                  displayValue={dateText(values.end)}
                  onSelect={(end) => change('end', end, ['end'])}
                />
                <DateTimeField
                  testID="event-end-time"
                  label={t('calendar.field.endTime')}
                  mode="time"
                  value={values.end}
                  displayValue={timeText(values.end)}
                  onSelect={(end) => change('end', end, ['end'])}
                  error={message(errors.end)}
                />
                <BigButton
                  testID="event-remove-end"
                  variant="secondary"
                  label={t('calendar.field.removeEnd')}
                  onPress={() => change('end', null, ['end'])}
                />
              </View>
            )}

            <View ref={titleBox} collapsable={false} testID="event-title-box">
              <TextField
                onFocus={onTitleFocus}
                onBlur={onFieldBlur}
                testID="event-title"
                label={
                  values.type !== null && requiresTitle(values.type)
                    ? t('calendar.field.titleRequired')
                    : t('calendar.field.title')
                }
                value={values.title}
                maxLength={titleMaxLength}
                onChangeText={(title) => change('title', title, ['title'])}
                error={message(errors.title)}
              />
            </View>
            <View ref={locationBox} collapsable={false} testID="event-location-box">
              <TextField
                onFocus={onLocationFocus}
                onBlur={onFieldBlur}
                testID="event-location"
                label={t('calendar.field.location')}
                value={values.location}
                maxLength={locationMaxLength}
                onChangeText={(location) => change('location', location, ['location'])}
                error={message(errors.location)}
              />
            </View>
            <View ref={notesBox} collapsable={false} testID="event-notes-box">
              <TextField
                onFocus={onNotesFocus}
                onBlur={onFieldBlur}
                testID="event-notes"
                label={t('calendar.field.notes')}
                value={values.notes}
                onChangeText={(notes) => change('notes', notes, ['notes'])}
                multiline
                // At most four lines visible; longer notes scroll inside the field.
                visibleLines={4}
                error={message(errors.notes)}
              />
            </View>

            {saveError ? (
              <Text style={styles.error} testID="event-save-error">
                {t(saveError)}
              </Text>
            ) : null}

            <BigButton
              testID="event-save"
              label={saving ? t('calendar.saving') : t('calendar.save')}
              onPress={save}
              disabled={saving}
            />
            <BigButton
              testID="event-cancel"
              variant="secondary"
              label={t('calendar.cancel')}
              onPress={() => {
                guard.release(); // Cancel discards on purpose (unchanged behaviour)
                onCancel();
              }}
              // A started save cannot be cancelled: no second navigation while it runs.
              disabled={saving}
            />
          </SafeAreaScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.md },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  notice: { fontSize: 15, color: colors.ink, fontWeight: '600', textAlign: 'auto' },
});
