import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SaveCalendarEventResult } from '@/data/local/calendar/calendarEventRepository';
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEvent,
  type CalendarEventErrors,
  type CalendarEventInput,
  type CalendarEventType,
} from '@/domain/calendarEvent';
import type { SportKey } from '@/domain/sport';
import { ltr } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/types';
import { calendarDateToLocalNoon, type LocalDateTime } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { DateTimeField } from '@/ui/DateTimeField';
import { SafeAreaScrollView } from '@/ui/SafeAreaScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing } from '@/ui/theme';

import { calendarErrorMessage, eventTypeLabel, sportLabel } from './calendarLabels';
import { toEventInput, type CalendarFormValues } from './calendarFormValues';
import { formatEventDate } from './formatEventTime';

/** The sport chip meaning "this event has no sport" (never stored: it saves as null). */
const NO_SPORT = 'NONE';

type FieldErrors = Partial<Record<'type' | 'sport' | 'start' | 'end' | 'title' | 'notes', TranslationKey>>;

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
        : 'calendar.errors.invalidValue';
  }
  if (errors.notes) out.notes = 'calendar.errors.invalidValue';
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A local wall time as 24-hour `HH:MM`, kept LTR inside Hebrew. */
const timeText = (value: LocalDateTime) => ltr(`${pad(value.hour)}:${pad(value.minute)}`);

type Props = {
  initialValues: CalendarFormValues;
  /** The sports this Player is assigned to; only these can be chosen. */
  sports: readonly SportKey[];
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
export function CalendarEventForm({ initialValues, sports, onSave, onSaved, onCancel }: Props) {
  const { t, language } = useI18n();
  const [values, setValues] = useState<CalendarFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second press in the same frame must see the guard immediately.
  const saveInProgress = useRef(false);

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
    <SafeAreaScrollView
      testID="event-form-scroll"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <ChoiceChips<CalendarEventType>
        testID="event-type"
        label={t('calendar.field.type')}
        choices={CALENDAR_EVENT_TYPES.map((type) => ({ value: type, label: eventTypeLabel(t, type) }))}
        value={values.type}
        // A type is always required: pressing the chosen chip keeps it.
        onChange={(type) => type !== null && change('type', type, ['type', 'title'])}
        error={message(errors.type)}
      />

      {sports.length > 0 ? (
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

      <TextField
        testID="event-title"
        label={values.type === 'OTHER' ? t('calendar.field.titleRequired') : t('calendar.field.title')}
        value={values.title}
        onChangeText={(title) => change('title', title, ['title'])}
        error={message(errors.title)}
      />
      <TextField
        testID="event-notes"
        label={t('calendar.field.notes')}
        value={values.notes}
        onChangeText={(notes) => change('notes', notes, ['notes'])}
        multiline
        error={message(errors.notes)}
      />

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
        onPress={onCancel}
        // A started save cannot be cancelled: no second navigation while it runs.
        disabled={saving}
      />
    </SafeAreaScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.md },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
