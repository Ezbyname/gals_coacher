import { BUILTIN_EXERCISES } from '../../exercise/catalog';
import { GENERAL_ATHLETIC_WORKOUTS, PROFESSIONAL_WORKOUTS } from '../professional';
import {
  formatStopwatch,
  startStopwatch,
  stopStopwatch,
  stopwatchElapsedMs,
  stopwatchEligible,
  suggestedTimeSeconds,
} from '../workoutStopwatch';
import { workTimerSeconds, type TimerIdentity } from '../workoutTimer';

const id: TimerIdentity = { sessionId: 's1', exerciseId: 'e1', exercisePosition: 0, setId: 'set1', setNumber: 1 };
const at = (wall: number, mono = wall) => ({ wall, mono });
const T0 = 2_000_000;

describe('eligibility: TIME -> Stopwatch, DURATION -> Countdown, never both', () => {
  it('every TIME exercise is eligible (goal, cap and legacy alike) and no other measurement is', () => {
    for (const e of BUILTIN_EXERCISES) {
      expect([e.id, stopwatchEligible(e.measurement.type)]).toEqual([e.id, e.measurement.type === 'TIME']);
    }
  });
  it('a TIME exercise never gets a countdown and a DURATION exercise never gets a stopwatch', () => {
    for (const e of BUILTIN_EXERCISES) {
      const countdown = workTimerSeconds(e.measurement.type, 30) !== null;
      const stopwatch = stopwatchEligible(e.measurement.type);
      expect(countdown && stopwatch).toBe(false);
    }
  });
  it('every workout item that carries a time semantics (goal / cap) is stopwatch-eligible; the semantics never decide it', () => {
    const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
    let capped = 0;
    for (const w of [...PROFESSIONAL_WORKOUTS, ...GENERAL_ATHLETIC_WORKOUTS]) {
      for (const s of w.sections) for (const i of s.items) {
        const type = byId.get(i.exerciseId)!.measurement.type;
        if (i.timeSemantics === 'COMPLETION_TIME_CAP') capped += 1;
        if (type === 'TIME') expect(stopwatchEligible(type)).toBe(true); // with or without a semantics, with or without a target
      }
    }
    expect(capped).toBeGreaterThan(0);
  });
  it('the 12 built-in TIME exercises include the cap drills, the legacy drills and the load-bearing sled push', () => {
    const time = BUILTIN_EXERCISES.filter((e) => e.measurement.type === 'TIME').map((e) => e.id);
    expect(time).toHaveLength(12);
    for (const x of ['SPRINT_10M', 'T_DRILL', 'PRO_AGILITY_5_10_5', 'CONE_DRIBBLE_SLALOM', 'SLED_PUSH']) expect(time).toContain(x);
  });
});

describe('start, elapsed, stop', () => {
  it('elapsed grows with the clock and is frozen on Stop', () => {
    const r = startStopwatch(id, at(T0));
    expect(r).toMatchObject({ kind: 'STOPWATCH', phase: 'RUNNING', identity: id });
    expect(stopwatchElapsedMs(r, at(T0))).toBe(0);
    expect(stopwatchElapsedMs(r, at(T0 + 5_373))).toBe(5_373);
    const s = stopStopwatch(r, at(T0 + 5_373));
    expect(s).toMatchObject({ phase: 'STOPPED', elapsedMs: 5_373 });
    expect(stopwatchElapsedMs(s, at(T0 + 999_999))).toBe(5_373); // frozen
    expect(stopStopwatch(s, at(T0 + 10))).toBe(s); // stopping again changes nothing
  });
  it('a stopwatch with no cap and no goal measures exactly the same (the plan is not an input)', () => {
    const r = startStopwatch(id, at(T0));
    expect(Object.keys(r).sort()).toEqual(['identity', 'kind', 'phase', 'startMono', 'startWall']); // no target / semantics held
  });
});

describe('precision: suggested = stored = displayed (0.01 s)', () => {
  const stopped = (ms: number) => stopStopwatch(startStopwatch(id, at(T0)), at(T0 + ms));
  it('rounds to hundredths', () => {
    expect(suggestedTimeSeconds(stopped(5_373))).toBe(5.37);
    expect(suggestedTimeSeconds(stopped(5_375))).toBe(5.38);
    expect(suggestedTimeSeconds(stopped(5_000))).toBe(5);
    expect(suggestedTimeSeconds(stopped(23_004))).toBe(23);
    expect(suggestedTimeSeconds(stopped(61_237))).toBe(61.24);
  });
  it('what is displayed on Stop is exactly what would be recorded', () => {
    for (const ms of [5_373, 5_375, 5_999, 61_237, 1_234, 12_005]) {
      const s = stopped(ms);
      const shown = Number(formatStopwatch(s.elapsedMs, 'hundredths').replace(/^(\d+):(\d+)\./, (_, m, sec) => `${Number(m) * 60 + Number(sec)}.`));
      expect(suggestedTimeSeconds(s)).toBe(shown);
    }
  });
  it('nothing is suggested while running, or when the time rounds to 0.00', () => {
    expect(suggestedTimeSeconds(startStopwatch(id, at(T0)))).toBeNull();
    expect(suggestedTimeSeconds(stopped(4))).toBeNull(); // 0.004 s
    expect(suggestedTimeSeconds(stopped(5))).toBe(0.01);
  });
  it('display: tenths while running, hundredths when stopped, minutes from 60 s', () => {
    expect(formatStopwatch(5_373, 'tenths')).toBe('5.3');
    expect(formatStopwatch(5_999, 'tenths')).toBe('5.9'); // floored: never ahead of the real time
    expect(formatStopwatch(5_373, 'hundredths')).toBe('5.37');
    expect(formatStopwatch(0, 'tenths')).toBe('0.0');
    expect(formatStopwatch(0, 'hundredths')).toBe('0.00');
    expect(formatStopwatch(65_300, 'tenths')).toBe('1:05.3');
    expect(formatStopwatch(65_370, 'hundredths')).toBe('1:05.37');
    expect(formatStopwatch(-50, 'tenths')).toBe('0.0');
  });
});

describe('clock safety', () => {
  it('background / lock: the monotonic clock stood still but the wall clock moved -> the wall clock counts', () => {
    const r = startStopwatch(id, at(T0, 1_000));
    expect(stopwatchElapsedMs(r, { wall: T0 + 45_000, mono: 1_000 + 2_000 })).toBe(45_000);
  });
  it('the wall clock set BACK can never shorten the measurement (the monotonic floor holds)', () => {
    const r = startStopwatch(id, at(T0, 1_000));
    expect(stopwatchElapsedMs(r, { wall: T0 - 3_600_000, mono: 1_000 + 6_000 })).toBe(6_000);
  });
  it('never negative', () => {
    const r = startStopwatch(id, at(T0, 1_000));
    expect(stopwatchElapsedMs(r, { wall: T0 - 5_000, mono: 900 })).toBe(0);
  });
  it('documented limit: a wall clock jumped FORWARD while it runs counts as elapsed time', () => {
    const r = startStopwatch(id, at(T0, 1_000));
    expect(stopwatchElapsedMs(r, { wall: T0 + 3_600_000, mono: 1_100 })).toBe(3_600_000);
  });
});
