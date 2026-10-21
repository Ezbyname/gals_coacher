import { hasSessionState, isStartableState, workoutEventState, type WorkoutEventStateInput } from '../workoutEventState';

const NOW = new Date(2026, 9, 20, 12, 0, 30).getTime();
const H = 3_600_000;
const ev = (over: Partial<WorkoutEventStateInput> = {}): WorkoutEventStateInput => ({
  startAt: NOW + H,
  endAt: null,
  completion: null,
  sessionStatus: null,
  ...over,
});

describe('workoutEventState (CAL-TRAIN-001, derived, never stored)', () => {
  it('1: a future unstarted workout is UPCOMING', () => expect(workoutEventState(ev(), NOW)).toBe('UPCOMING'));
  it('2: a past unstarted workout is OVERDUE', () => expect(workoutEventState(ev({ startAt: NOW - H }), NOW)).toBe('OVERDUE'));
  it('uses the agenda rule: a running event (end in the future) is not overdue; the instant after its end it is', () => {
    expect(workoutEventState(ev({ startAt: NOW - H, endAt: NOW + 1 }), NOW)).toBe('UPCOMING');
    expect(workoutEventState(ev({ startAt: NOW - H, endAt: NOW - 1 }), NOW)).toBe('OVERDUE');
    expect(workoutEventState(ev({ startAt: NOW }), NOW)).toBe('UPCOMING'); // start == now is not past yet
  });
  it('3: time passing changes only the presentation, and the input is not modified', () => {
    const e = Object.freeze(ev());
    expect(workoutEventState(e, NOW)).toBe('UPCOMING');
    expect(workoutEventState(e, NOW + 2 * H)).toBe('OVERDUE');
    expect(e).toEqual(ev());
  });
  it('4-7: every session status maps to its own state, whatever the time', () => {
    for (const t of [NOW - 5 * H, NOW + 5 * H]) {
      expect(workoutEventState(ev({ startAt: t, sessionStatus: 'IN_PROGRESS' }), NOW)).toBe('IN_PROGRESS');
      expect(workoutEventState(ev({ startAt: t, sessionStatus: 'COMPLETED' }), NOW)).toBe('COMPLETED');
      expect(workoutEventState(ev({ startAt: t, sessionStatus: 'PARTIAL' }), NOW)).toBe('PARTIAL');
      expect(workoutEventState(ev({ startAt: t, sessionStatus: 'ABANDONED' }), NOW)).toBe('ABANDONED');
    }
  });
  it('8: a completed workout never becomes overdue, however late', () => {
    const done = ev({ startAt: NOW - H, sessionStatus: 'COMPLETED' });
    expect(workoutEventState(done, NOW)).toBe('COMPLETED');
    expect(workoutEventState(done, NOW + 400 * 24 * H)).toBe('COMPLETED');
  });
  it('PARTIAL and ABANDONED are never overdue', () => {
    for (const s of ['PARTIAL', 'ABANDONED'] as const) {
      expect(workoutEventState(ev({ startAt: NOW - 9 * H, sessionStatus: s }), NOW + 99 * H)).toBe(s);
    }
  });
  it('legacy: a manual completion with no session stays COMPLETED (even when future); a session wins over it', () => {
    const mark = { completedAt: 1, source: 'LOCAL_USER' };
    expect(workoutEventState(ev({ completion: mark }), NOW)).toBe('COMPLETED');
    expect(workoutEventState(ev({ completion: mark, startAt: NOW - H }), NOW)).toBe('COMPLETED');
    expect(workoutEventState(ev({ completion: mark, sessionStatus: 'ABANDONED' }), NOW)).toBe('ABANDONED');
  });
  it('9: moving an overdue unstarted workout into the future makes it UPCOMING again', () => {
    expect(workoutEventState(ev({ startAt: NOW - H }), NOW)).toBe('OVERDUE');
    expect(workoutEventState(ev({ startAt: NOW + H }), NOW)).toBe('UPCOMING');
  });
  it('helpers: startable = no session; the other four have one', () => {
    expect(isStartableState('UPCOMING') && isStartableState('OVERDUE')).toBe(true);
    for (const s of ['IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'ABANDONED'] as const) {
      expect(isStartableState(s)).toBe(false);
      expect(hasSessionState(s)).toBe(true);
    }
    expect(hasSessionState('UPCOMING') || hasSessionState('OVERDUE')).toBe(false);
  });
});
