import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

import { getCalendarEvent, getEventWorkout, updateCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { listActivityTypes } from '@/data/local/activityTypes/activityTypeRepository';
import { getPlayer } from '@/data/local/players/playerRepository';
import { selectableActivityTypes, type ActivityTypeRef } from '@/domain/activityType';
import type { SportKey } from '@/domain/sport';
import { useApp } from '@/features/AppProvider';
import type { TranslationKey } from '@/i18n/types';

import { CalendarEventForm } from './CalendarEventForm';
import { calendarErrorMessage } from './calendarLabels';
import { sportsOf, valuesFromEvent, type CalendarFormValues } from './calendarFormValues';
import { EVENT_ROUTE, eventPath, leaveTo } from './calendarNavigation';
import { ErrorScreen, LoadingScreen } from './StatusScreen';

type FormState =
  | { status: 'loading' }
  | { status: 'ready'; initialValues: CalendarFormValues; sports: SportKey[]; types: ActivityTypeRef[]; lockedTitle: string | null }
  | { status: 'error'; message: TranslationKey };

/**
 * Edits one saved event with the same form as New. The repository keeps its
 * id, Player and createdAt and sets updatedAt. Save and Cancel both return
 * to the event's details.
 */
export function EditCalendarEvent({ playerId, eventId }: { playerId: string; eventId: string }) {
  const { boot, services } = useApp();
  const navigation = useNavigation();
  const [loaded, setState] = useState<FormState>({ status: 'loading' });
  const state: FormState =
    boot.status === 'error' ? { status: 'error', message: 'calendar.errors.loadFailed' } : loaded;

  useEffect(() => {
    if (boot.status !== 'ready') return;
    let active = true;
    (async (): Promise<FormState> => {
      const profile = await getPlayer(boot.db, playerId);
      if (profile === null) return { status: 'error', message: 'calendar.errors.playerNotFound' };
      const event = await getCalendarEvent(boot.db, playerId, eventId);
      if (event === null) return { status: 'error', message: 'calendar.errors.eventNotFound' };
      const catalog = await listActivityTypes(boot.db);
      const workout = await getEventWorkout(boot.db, eventId); // QB-WORKOUT-BUILDER-001D
      return {
        status: 'ready',
        lockedTitle: workout !== null ? workout.name : null,
        initialValues: valuesFromEvent(event),
        sports: sportsOf(profile, event.sport),
        // Active types, plus this event's own type even when it is now inactive.
        types: selectableActivityTypes(catalog, event.type),
      };
    })()
      .then((next) => {
        if (active) setState(next);
      })
      .catch((e: unknown) => {
        console.warn('[calendar] event load failed', e);
        if (active)
          setState({ status: 'error', message: calendarErrorMessage(e, 'calendar.errors.loadFailed') });
      });
    return () => {
      active = false;
    };
  }, [boot, playerId, eventId]);

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') {
    return (
      <ErrorScreen
        testID="event-form-error"
        message={state.message}
        fallback={eventPath(playerId, eventId)}
      />
    );
  }

  // Back to this event's details: one step back in the normal flow, else replace.
  const back = () =>
    leaveTo(navigation, {
      route: EVENT_ROUTE,
      params: { id: playerId, eventId },
      path: eventPath(playerId, eventId),
    });
  const db = boot.status === 'ready' ? boot.db : null;
  return (
    <CalendarEventForm
      initialValues={state.initialValues}
      sports={state.sports}
      types={state.types}
      lockedTitle={state.lockedTitle}
      onSave={(input) => {
        if (!db) throw new Error('database not ready');
        return updateCalendarEvent(db, playerId, eventId, input, { clock: services.clock });
      }}
      onSaved={back}
      onCancel={back}
    />
  );
}
