import { BUILTIN_EXERCISES } from '../../exercise/catalog';
import { GENERAL_ATHLETIC_WORKOUTS, PROFESSIONAL_WORKOUTS } from '../professional';
import {
  elapsedMs,
  formatClock,
  nextPendingSet,
  pauseTimer,
  remainingMs,
  remainingSeconds,
  restTimerSeconds,
  resumeTimer,
  startTimer,
  stopTimer,
  suggestedSeconds,
  tick,
  workTimerSeconds,
  type TimeNow,
  type TimerIdentity,
  type TimerState,
} from '../workoutTimer';

const id: TimerIdentity = { sessionId: 's1', exerciseId: 'e1', exercisePosition: 0, setId: 'set1', setNumber: 1 };
const at = (wall: number, mono = wall): TimeNow => ({ wall, mono });
const T0 = 1_000_000;

describe('eligibility: a WORK countdown only for DURATION with a target above zero (1-3, 38-40)', () => {
  it('1: DURATION with a target is eligible', () => {
    expect(workTimerSeconds('DURATION', 30)).toBe(30);
    expect(workTimerSeconds('DURATION', 45)).toBe(45);
  });
  it('2: DURATION without (or with a non-positive) target is not', () => {
    for (const t of [null, 0, -5, Number.NaN]) expect(workTimerSeconds('DURATION', t)).toBeNull();
  });
  it('3: TIME is never eligible, whatever the target (goal time, completion cap and legacy all are TIME)', () => {
    for (const target of [3, 5, 16, 30]) expect(workTimerSeconds('TIME', target)).toBeNull();
  });
  it('every other measurement type is ineligible', () => {
    for (const type of ['REPETITIONS', 'DISTANCE', 'MADE_ATTEMPTS', 'RATING', 'COMPLETION'] as const) expect(workTimerSeconds(type, 30)).toBeNull();
  });
  it('catalog-wide: exactly the DURATION exercises are eligible, and not one TIME exercise (by type, never by id or semantics)', () => {
    for (const e of BUILTIN_EXERCISES) {
      const eligible = workTimerSeconds(e.measurement.type, 30) !== null;
      expect([e.id, eligible]).toEqual([e.id, e.measurement.type === 'DURATION']);
    }
    // every workout item that carries a time semantics is a TIME item: none of them can be counted down
    const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
    for (const w of [...PROFESSIONAL_WORKOUTS, ...GENERAL_ATHLETIC_WORKOUTS]) {
      for (const s of w.sections) for (const i of s.items) {
        if (i.timeSemantics !== undefined) expect(workTimerSeconds(byId.get(i.exerciseId)!.measurement.type, i.dosage?.target ?? 30)).toBeNull();
      }
    }
  });
  it('rest: only above zero (31, 32)', () => {
    expect(restTimerSeconds(60)).toBe(60);
    expect(restTimerSeconds(0)).toBeNull();
    expect(restTimerSeconds(null)).toBeNull();
  });
});

describe('start / remaining / pause / resume / stop (4-9)', () => {
  it('4: Start creates one running timer from an absolute deadline', () => {
    const t = startTimer('WORK', id, 30, at(T0));
    expect(t).toMatchObject({ phase: 'RUNNING', kind: 'WORK', durationMs: 30_000, deadlineWall: T0 + 30_000 });
  });
  it('6: remaining derives from the deadline, never from ticks', () => {
    const t = startTimer('WORK', id, 30, at(T0));
    expect(remainingMs(t, at(T0))).toBe(30_000);
    expect(remainingMs(t, at(T0 + 12_345))).toBe(17_655);
    expect(remainingMs(t, at(T0 + 99_000))).toBe(0);
    expect(remainingSeconds(200)).toBe(1);
  });
  it('7: pause freezes the remaining time however long it stays paused', () => {
    const t = startTimer('WORK', id, 30, at(T0));
    const p = pauseTimer(t, at(T0 + 10_000)) as Extract<TimerState, { phase: 'PAUSED' }>;
    expect(p.phase).toBe('PAUSED');
    expect(remainingMs(p, at(T0 + 10_000))).toBe(20_000);
    expect(remainingMs(p, at(T0 + 9_999_999))).toBe(20_000);
  });
  it('8: resume continues from the remaining time with a NEW deadline', () => {
    const p = pauseTimer(startTimer('WORK', id, 30, at(T0)), at(T0 + 10_000));
    const r = resumeTimer(p, at(T0 + 500_000)) as Extract<TimerState, { phase: 'RUNNING' }>;
    expect(r.deadlineWall).toBe(T0 + 500_000 + 20_000);
    expect(remainingMs(r, at(T0 + 505_000))).toBe(15_000);
    expect(r.durationMs).toBe(30_000); // the original duration is kept
  });
  it('9: an early Stop keeps the elapsed time as a suggestion (23 of 30 -> 23)', () => {
    const t = startTimer('WORK', id, 30, at(T0));
    const s = stopTimer(t, at(T0 + 23_000));
    expect(s).toMatchObject({ phase: 'STOPPED', elapsedMs: 23_000, durationMs: 30_000 });
    expect(suggestedSeconds(s)).toBe(23);
    expect(elapsedMs(s, at(T0 + 99_999))).toBe(23_000); // frozen
  });
  it('stopping after a pause keeps what was worked before the pause', () => {
    const p = pauseTimer(startTimer('WORK', id, 30, at(T0)), at(T0 + 18_000));
    expect(suggestedSeconds(stopTimer(p, at(T0 + 80_000)))).toBe(18);
  });
  it('a stop that worked under half a second suggests nothing', () => {
    expect(suggestedSeconds(stopTimer(startTimer('WORK', id, 30, at(T0)), at(T0 + 300)))).toBeNull();
  });
  it('a REST timer cannot pause or stop (Skip clears it in the controller)', () => {
    const r = startTimer('REST', id, 60, at(T0));
    expect(pauseTimer(r, at(T0 + 5_000))).toBe(r);
    expect(stopTimer(r, at(T0 + 5_000))).toBe(r);
    expect(suggestedSeconds(r)).toBeNull();
  });
});

describe('expiry fires once (10) and the clock is never trusted blindly (11, 12)', () => {
  it('10: the transition to FINISHED reports expired exactly once', () => {
    const t = startTimer('WORK', id, 30, at(T0));
    const a = tick(t, at(T0 + 30_000));
    expect(a.expired).toBe(true);
    expect(a.state.phase).toBe('FINISHED');
    const b = tick(a.state, at(T0 + 31_000));
    expect(b.expired).toBe(false);
    expect(b.state).toBe(a.state);
    expect(suggestedSeconds(a.state)).toBe(30); // "Record 30 s": a suggestion, written only by the user
  });
  it('final-second ticks are reported once per second (3, 2, 1) and only for WORK', () => {
    let s: TimerState = startTimer('WORK', id, 10, at(T0));
    const got: number[] = [];
    for (let ms = 0; ms <= 10_000; ms += 100) {
      const r = tick(s, at(T0 + ms));
      s = r.state;
      if (r.tickSecond !== null) got.push(r.tickSecond);
    }
    expect(got).toEqual([3, 2, 1]);
    let rest: TimerState = startTimer('REST', id, 10, at(T0));
    for (let ms = 0; ms < 10_000; ms += 100) {
      const r = tick(rest, at(T0 + ms));
      rest = r.state;
      expect(r.tickSecond).toBeNull();
    }
  });
  it('11: the wall clock set BACK cannot give a timer more time (the monotonic floor holds)', () => {
    const t = startTimer('WORK', id, 30, at(T0, 5_000));
    // 20 s really passed (mono), but the wall clock was moved back 1 hour
    expect(remainingMs(t, { wall: T0 + 20_000 - 3_600_000, mono: 5_000 + 20_000 })).toBe(10_000);
    // and never above the original duration
    expect(remainingMs(t, { wall: T0 - 3_600_000, mono: 5_000 })).toBe(30_000);
  });
  it('12: the wall clock jumped FORWARD expires the timer', () => {
    const t = startTimer('WORK', id, 30, at(T0, 5_000));
    expect(remainingMs(t, { wall: T0 + 3_600_000, mono: 5_100 })).toBe(0);
    expect(tick(t, { wall: T0 + 3_600_000, mono: 5_100 }).expired).toBe(true);
  });
  it('sleep: the monotonic clock stood still but the wall clock moved (background / lock) -> the wall clock decides', () => {
    const t = startTimer('REST', id, 60, at(T0, 1_000));
    expect(remainingMs(t, { wall: T0 + 45_000, mono: 1_000 + 2_000 })).toBe(15_000);
    expect(remainingMs(t, { wall: T0 + 61_000, mono: 1_000 + 2_000 })).toBe(0);
  });
});

describe('the next pending set of the SAME exercise (30-35)', () => {
  const sets = (statuses: string[]) => statuses.map((status, i) => ({ id: `x${i + 1}`, setNumber: i + 1, status }));
  it('the next pending set after the saved one', () => {
    expect(nextPendingSet(sets(['DONE', 'PENDING', 'PENDING']), 'x1')!.id).toBe('x2');
  });
  it('33: the last pending set has no next one', () => {
    expect(nextPendingSet(sets(['DONE', 'DONE', 'DONE']), 'x3')).toBeNull();
  });
  it('35: out of order — saving set 3 while set 2 is still pending finds set 2; saving set 1 with 2 skipped finds set 3', () => {
    expect(nextPendingSet(sets(['DONE', 'PENDING', 'DONE']), 'x3')!.id).toBe('x2');
    expect(nextPendingSet(sets(['DONE', 'SKIPPED', 'PENDING']), 'x1')!.id).toBe('x3');
  });
  it('a skipped set is not pending; an unknown set finds nothing', () => {
    expect(nextPendingSet(sets(['DONE', 'SKIPPED', 'DONE']), 'x1')).toBeNull();
    expect(nextPendingSet(sets(['PENDING']), 'nope')).toBeNull();
  });
});

describe('display digits', () => {
  it('formats mm:ss', () => {
    expect([0, 5, 30, 90, 600, 3599].map(formatClock)).toEqual(['00:00', '00:05', '00:30', '01:30', '10:00', '59:59']);
  });
});
