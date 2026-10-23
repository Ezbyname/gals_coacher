import type { MeasurementType } from '../measurement';

import type { TimeNow, TimerIdentity } from './workoutTimer';

/**
 * TRAINING-STOPWATCH-001 — the pure Stopwatch engine. A stopwatch COUNTS UP and measures a performance (TIME exercises:
 * sprints, agility drills); a countdown (DURATION exercises) counts down work. They are different concepts and share no
 * logic — only the identity (which set it belongs to) and the clock pair.
 *
 * Like every execution aid it never writes training data: stopping only produces a SUGGESTED actual time; the user
 * records it explicitly through the existing record path. An actual above a cap or goal is valid data (no pass / fail).
 *
 * Elapsed time is derived from timestamps, never counted in ticks: the wall clock covers time away (background, lock);
 * the monotonic clock is a floor, so a wall clock set BACK can never shorten what was measured. (A wall clock set
 * FORWARD while a stopwatch runs cannot be told apart from real time; that limit is accepted and documented.)
 */

/** A stopwatch measures a TIME exercise — every TIME variant (goal, cap, legacy), planned target or not. Nothing else. */
export function stopwatchEligible(measurementType: MeasurementType): boolean {
  return measurementType === 'TIME';
}

export interface RunningStopwatch {
  readonly kind: 'STOPWATCH';
  readonly phase: 'RUNNING';
  readonly identity: TimerIdentity;
  readonly startWall: number;
  readonly startMono: number;
}
/** Stopped: the elapsed time is frozen as a suggestion. Nothing was written. */
export interface StoppedStopwatch {
  readonly kind: 'STOPWATCH';
  readonly phase: 'STOPPED';
  readonly identity: TimerIdentity;
  readonly elapsedMs: number;
}
export type StopwatchState = RunningStopwatch | StoppedStopwatch;

export function startStopwatch(identity: TimerIdentity, now: TimeNow): RunningStopwatch {
  return { kind: 'STOPWATCH', phase: 'RUNNING', identity, startWall: now.wall, startMono: now.mono };
}

/** Elapsed milliseconds: wall time (covers sleep), never less than the monotonic time (survives a clock set back). */
export function stopwatchElapsedMs(state: StopwatchState, now: TimeNow): number {
  if (state.phase === 'STOPPED') return state.elapsedMs;
  return Math.max(0, now.wall - state.startWall, now.mono - state.startMono);
}

/** Stops a running stopwatch, freezing the elapsed time. A stopped one is returned unchanged. */
export function stopStopwatch(state: StopwatchState, now: TimeNow): StoppedStopwatch {
  if (state.phase === 'STOPPED') return state;
  return { kind: 'STOPWATCH', phase: 'STOPPED', identity: state.identity, elapsedMs: stopwatchElapsedMs(state, now) };
}

/**
 * The actual time a stopped stopwatch suggests, in seconds ROUNDED to 0.01 s — exactly what is displayed, so no hidden
 * precision is ever stored. null while running, or when it rounds to 0.00 (a recorded time must be above zero).
 */
export function suggestedTimeSeconds(state: StopwatchState): number | null {
  if (state.phase !== 'STOPPED') return null;
  const hundredths = Math.round(state.elapsedMs / 10);
  return hundredths >= 1 ? hundredths / 100 : null;
}

/**
 * The text of an elapsed time. RUNNING shows TENTHS ("5.3"), STOPPED shows HUNDREDTHS ("5.37"). From one minute on:
 * "1:05.3" / "1:05.37". Callers wrap it with `ltr()` so a Hebrew screen never reverses it.
 */
export function formatStopwatch(ms: number, precision: 'tenths' | 'hundredths'): string {
  const safe = Math.max(0, ms);
  const units = precision === 'tenths' ? Math.floor(safe / 100) : Math.round(safe / 10); // tenths, or hundredths
  const per = precision === 'tenths' ? 10 : 100;
  const whole = Math.floor(units / per);
  const frac = String(units % per).padStart(precision === 'tenths' ? 1 : 2, '0');
  if (whole < 60) return `${whole}.${frac}`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${frac}`;
}
