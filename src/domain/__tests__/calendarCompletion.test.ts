import {
  CALENDAR_COMPLETION_SOURCES,
  agendaSection,
  isCalendarCompletionSource,
  splitAgenda,
  type CalendarCompletion,
} from '../calendarEvent';

/** CAL-COMP-001: completion is shown, never used to classify or order the agenda. */
const NOW = new Date(2026, 9, 6, 18, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DONE: CalendarCompletion = { completedAt: NOW - 5 * HOUR, source: 'LOCAL_USER' };

type Item = { id: string; startAt: number; endAt: number | null; completion: CalendarCompletion | null };
const ev = (
  id: string,
  startAt: number,
  endAt: number | null,
  completion: CalendarCompletion | null = null,
) => ({ id, startAt, endAt, completion }) satisfies Item;

describe('completion source codes', () => {
  it('this version knows exactly LOCAL_USER (an explicit action on this device)', () => {
    expect(CALENDAR_COMPLETION_SOURCES).toEqual(['LOCAL_USER']);
    expect(isCalendarCompletionSource('LOCAL_USER')).toBe(true);
  });

  it.each(['COACH', 'SYSTEM', 'local_user', '', ' LOCAL_USER', null, undefined, 1])('rejects %p', (value) => {
    expect(isCalendarCompletionSource(value)).toBe(false);
  });
});

describe('the agenda stays schedule-based whatever the completion', () => {
  it('a future event marked completed stays in Current & upcoming', () => {
    const future = ev('future', NOW + HOUR, NOW + 2 * HOUR, DONE);
    expect(agendaSection(future, NOW)).toBe('CURRENT_OR_UPCOMING');
    expect(splitAgenda([future], NOW)).toEqual({ currentOrUpcoming: [future], past: [] });
  });

  it('an in-progress event marked completed stays current', () => {
    const running = ev('running', NOW - HOUR, NOW + HOUR, DONE);
    expect(splitAgenda([running], NOW)).toEqual({ currentOrUpcoming: [running], past: [] });
  });

  it('a past event NOT marked completed stays in Past and stays not completed', () => {
    const past = ev('past', NOW - 3 * HOUR, NOW - 2 * HOUR);
    const split = splitAgenda([past], NOW);
    expect(split).toEqual({ currentOrUpcoming: [], past: [past] });
    expect(split.past[0]!.completion).toBeNull(); // time passing infers nothing
  });

  it('a past completed event stays in Past', () => {
    const past = ev('past', NOW - 3 * HOUR, null, DONE);
    expect(splitAgenda([past], NOW)).toEqual({ currentOrUpcoming: [], past: [past] });
  });

  it('marking or undoing any event never moves or reorders anything', () => {
    const base = [
      ev('c', NOW + 2 * HOUR, null),
      ev('past-b', NOW - 3 * HOUR, NOW - 2 * HOUR),
      ev('a', NOW + HOUR, null),
      ev('past-a', NOW - 3 * HOUR, NOW - 2 * HOUR),
      ev('running', NOW - HOUR, NOW + HOUR),
      ev('b', NOW + HOUR, null),
      ev('past-c', NOW - HOUR, null),
    ];
    const ids = (split: ReturnType<typeof splitAgenda<Item>>) => ({
      currentOrUpcoming: split.currentOrUpcoming.map((e) => e.id),
      past: split.past.map((e) => e.id),
    });
    const expected = {
      currentOrUpcoming: ['running', 'a', 'b', 'c'],
      past: ['past-c', 'past-b', 'past-a'],
    };
    expect(ids(splitAgenda(base, NOW))).toEqual(expected);
    // Every subset of events completed (2^7 combinations): same sections, same order.
    for (let mask = 0; mask < 1 << base.length; mask++) {
      const marked = base.map((e, i) => ({ ...e, completion: mask & (1 << i) ? DONE : null }));
      expect(ids(splitAgenda(marked, NOW))).toEqual(expected);
    }
  });
});
