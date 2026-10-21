import { WorkoutScheduleError } from '@/data/local/calendar/errors';
import { en } from '@/i18n/en';
import { he } from '@/i18n/he';

import { calendarErrorMessage } from '../calendarLabels';

describe('CAL-TRAIN-001: a locked schedule has its own message in both languages', () => {
  it('maps SCHEDULE_LOCKED, and other schedule errors keep their fallback', () => {
    expect(calendarErrorMessage(new WorkoutScheduleError('SCHEDULE_LOCKED', 'p'), 'calendar.errors.saveFailed')).toBe('calendar.errors.scheduleLocked');
    expect(calendarErrorMessage(new WorkoutScheduleError('PLAN_EMPTY', 'p'), 'calendar.errors.saveFailed')).toBe('calendar.errors.saveFailed');
    expect(en.calendar.errors.scheduleLocked.length).toBeGreaterThan(10);
    expect(he.calendar.errors.scheduleLocked).toMatch(/[א-ת]/);
  });
});
