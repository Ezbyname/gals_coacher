import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

import { createCalendarEvent } from '@/data/local/calendar/calendarEventRepository';
import { listActivityTypes } from '@/data/local/activityTypes/activityTypeRepository';
import { getPlayer } from '@/data/local/players/playerRepository';
import { selectableActivityTypes, type ActivityTypeRef } from '@/domain/activityType';
import type { SportKey } from '@/domain/sport';
import { useApp } from '@/features/AppProvider';
import type { TranslationKey } from '@/i18n/types';

import { CalendarEventForm } from './CalendarEventForm';
import { calendarErrorMessage } from './calendarLabels';
import { newEventValues, sportsOf, type CalendarFormValues } from './calendarFormValues';
import { SCHEDULE_ROUTE, leaveTo, schedulePath } from './calendarNavigation';
import { ErrorScreen, LoadingScreen } from './StatusScreen';

type FormState =
  | { status: 'loading' }
  | { status: 'ready'; initialValues: CalendarFormValues; sports: SportKey[]; types: ActivityTypeRef[] }
  | { status: 'error'; message: TranslationKey };

/** Adds an event to this Player's schedule; Save and Cancel both return to the schedule. */
export function NewCalendarEvent({ playerId }: { playerId: string }) {
  const { boot, services } = useApp();
  const navigation = useNavigation();
  const [loaded, setState] = useState<FormState>({ status: 'loading' });
  const state: FormState =
    boot.status === 'error' ? { status: 'error', message: 'calendar.errors.loadFailed' } : loaded;

  useEffect(() => {
    if (boot.status !== 'ready') return;
    let active = true;
    Promise.all([getPlayer(boot.db, playerId), listActivityTypes(boot.db)])
      .then(([profile, catalog]) => {
        if (!active) return;
        setState(
          profile && profile.player.archivedAt === null
            ? {
                status: 'ready',
                initialValues: newEventValues(services.clock.wallNow()),
                sports: sportsOf(profile),
                // A new event offers only ACTIVE types (none chosen for the user).
                types: selectableActivityTypes(catalog),
              }
            : { status: 'error', message: profile ? 'players.archive.archived' : 'calendar.errors.playerNotFound' },
        );
      })
      .catch((e: unknown) => {
        console.warn('[calendar] player load failed', e);
        if (active)
          setState({ status: 'error', message: calendarErrorMessage(e, 'calendar.errors.loadFailed') });
      });
    return () => {
      active = false;
    };
  }, [boot, playerId, services]);

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') {
    return (
      <ErrorScreen testID="event-form-error" message={state.message} fallback={schedulePath(playerId)} />
    );
  }

  // Back to this Player's schedule: one step back in the normal flow, else replace.
  const back = () =>
    leaveTo(navigation, { route: SCHEDULE_ROUTE, params: { id: playerId }, path: schedulePath(playerId) });
  const db = boot.status === 'ready' ? boot.db : null;
  return (
    <CalendarEventForm
      initialValues={state.initialValues}
      sports={state.sports}
      types={state.types}
      onSave={(input) => {
        if (!db) throw new Error('database not ready');
        return createCalendarEvent(db, playerId, input, { ids: services.ids, clock: services.clock });
      }}
      onSaved={back}
      onCancel={back}
    />
  );
}
