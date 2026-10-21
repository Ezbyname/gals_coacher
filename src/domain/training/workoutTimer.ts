import type { MeasurementType } from '../measurement';

/**
 * TRAINING-TIMER-001 — the pure timer engine. A timer is an EXECUTION AID: it never writes training data, never
 * marks a set done and never finishes a session. The user confirms any actual result (the existing record path).
 *
 * Correctness never depends on counting ticks. A running timer holds an absolute deadline; the remaining time is derived
 * on every read from the wall clock (which keeps counting while the phone sleeps) and, as a floor, from the monotonic
 * clock (which a backwards wall-clock adjustment cannot move). So:
 *   - background / lock: the wall clock covers the time spent away, never "duration + time away";
 *   - the clock set BACK can never give a timer more than it has left;
 *   - the clock set FORWARD may expire the timer.
 */

export type TimerKind = 'WORK' | 'REST';

/** What the timer belongs to; carried by the timer so it can never detach from its set. */
export interface TimerIdentity {
  readonly sessionId: string;
  /** session_exercises.id */
  readonly exerciseId: string;
  readonly exercisePosition: number;
  /** session_sets.id */
  readonly setId: string;
  readonly setNumber: number;
}

export interface TimeNow {
  /** Wall clock, epoch ms. */
  readonly wall: number;
  /** Monotonic ms (a floor against backwards wall-clock changes). */
  readonly mono: number;
}

interface TimerBase {
  readonly kind: TimerKind;
  readonly identity: TimerIdentity;
  /** The original full duration. */
  readonly durationMs: number;
}

export interface RunningTimer extends TimerBase {
  readonly phase: 'RUNNING';
  /** The time left when this run segment began (the whole duration, or what was left when resumed). */
  readonly segmentMs: number;
  readonly segmentStartWall: number;
  readonly segmentStartMono: number;
  /** Absolute wall deadline of this segment. */
  readonly deadlineWall: number;
  /** The last whole second a countdown tick was reported for (3, 2, 1), or null. */
  readonly lastTickSecond: number | null;
}
export interface PausedTimer extends TimerBase {
  readonly phase: 'PAUSED';
  readonly remainingMs: number;
}
/** Ran to zero by itself. Nothing was written. */
export interface FinishedTimer extends TimerBase {
  readonly phase: 'FINISHED';
}
/** Stopped early; the worked time is kept as a SUGGESTION the user may record. Nothing was written. */
export interface StoppedTimer extends TimerBase {
  readonly phase: 'STOPPED';
  readonly elapsedMs: number;
}
export type TimerState = RunningTimer | PausedTimer | FinishedTimer | StoppedTimer;

const SECOND = 1000;
/** The final seconds that get a countdown tick. */
export const COUNTDOWN_TICKS_FROM = 3;

// ----------------------------------------------------------------------------------------------- eligibility

/**
 * A WORK countdown is eligible ONLY for a DURATION measurement with a target above zero (seconds of work). Every TIME
 * exercise (goal time, completion-time cap, legacy) is a completion-time measurement and never gets a countdown. The
 * decision uses the measurement type and the planned target only — never the exercise id or the time semantics.
 */
export function workTimerSeconds(measurementType: MeasurementType, target: number | null): number | null {
  if (measurementType !== 'DURATION') return null;
  if (target === null || !Number.isFinite(target) || target <= 0) return null;
  return target;
}

/** A REST countdown needs a rest above zero; null or 0 creates no timer. */
export function restTimerSeconds(restSec: number | null): number | null {
  if (restSec === null || !Number.isFinite(restSec) || restSec <= 0) return null;
  return restSec;
}

/**
 * The set a rest timer is bound to after a set was saved: the next PENDING set of the SAME exercise — the first one after
 * the saved set, else the first pending one before it (sets can be done out of order). null when none is left (the last
 * set of an exercise starts no rest). Another exercise never counts.
 */
export function nextPendingSet<S extends { readonly id: string; readonly setNumber: number; readonly status: string }>(
  sets: readonly S[],
  savedSetId: string,
): S | null {
  const saved = sets.find((s) => s.id === savedSetId);
  if (!saved) return null;
  const pending = sets.filter((s) => s.status === 'PENDING' && s.id !== savedSetId).sort((a, b) => a.setNumber - b.setNumber);
  return pending.find((s) => s.setNumber > saved.setNumber) ?? pending[0] ?? null;
}

// ----------------------------------------------------------------------------------------------- transitions

export function startTimer(kind: TimerKind, identity: TimerIdentity, seconds: number, now: TimeNow): RunningTimer {
  const durationMs = Math.round(seconds * SECOND);
  return {
    phase: 'RUNNING',
    kind,
    identity,
    durationMs,
    segmentMs: durationMs,
    segmentStartWall: now.wall,
    segmentStartMono: now.mono,
    deadlineWall: now.wall + durationMs,
    lastTickSecond: null,
  };
}

/** The time left (ms), derived from the deadline; never above the segment, never negative. */
export function remainingMs(state: TimerState, now: TimeNow): number {
  switch (state.phase) {
    case 'RUNNING': {
      const byWall = state.deadlineWall - now.wall; // forward jump -> expires; backwards jump -> clamped below
      const byMono = state.segmentMs - (now.mono - state.segmentStartMono); // cannot be extended by a clock change
      return Math.max(0, Math.min(state.segmentMs, byWall, byMono));
    }
    case 'PAUSED':
      return state.remainingMs;
    default:
      return 0;
  }
}

/** The worked time so far (ms) of a work timer. */
export function elapsedMs(state: TimerState, now: TimeNow): number {
  if (state.phase === 'STOPPED') return state.elapsedMs;
  if (state.phase === 'FINISHED') return state.durationMs;
  return state.durationMs - remainingMs(state, now);
}

/** A whole-second countdown value, rounded UP (0.2 s left shows 1). */
export const remainingSeconds = (ms: number): number => Math.ceil(ms / SECOND);

export interface TickResult {
  readonly state: TimerState;
  /** true exactly once: on the transition RUNNING -> FINISHED. */
  readonly expired: boolean;
  /** 3, 2 or 1 — once per second in the final seconds of a WORK timer; null otherwise. */
  readonly tickSecond: number | null;
}

/** Advances a timer to `now`. Pure; a non-running timer is returned unchanged. */
export function tick(state: TimerState, now: TimeNow): TickResult {
  if (state.phase !== 'RUNNING') return { state, expired: false, tickSecond: null };
  const left = remainingMs(state, now);
  if (left <= 0) {
    const finished: FinishedTimer = { phase: 'FINISHED', kind: state.kind, identity: state.identity, durationMs: state.durationMs };
    return { state: finished, expired: true, tickSecond: null };
  }
  const second = remainingSeconds(left);
  if (state.kind === 'WORK' && second <= COUNTDOWN_TICKS_FROM && second !== state.lastTickSecond) {
    return { state: { ...state, lastTickSecond: second }, expired: false, tickSecond: second };
  }
  return { state, expired: false, tickSecond: null };
}

/** Pause freezes what is left. Only a running WORK timer pauses. */
export function pauseTimer(state: TimerState, now: TimeNow): TimerState {
  if (state.phase !== 'RUNNING' || state.kind !== 'WORK') return state;
  const left = remainingMs(state, now);
  if (left <= 0) return state; // already over: the next tick finishes it
  return { phase: 'PAUSED', kind: state.kind, identity: state.identity, durationMs: state.durationMs, remainingMs: left };
}

/** Resume continues from the remaining time with a NEW deadline. */
export function resumeTimer(state: TimerState, now: TimeNow): TimerState {
  if (state.phase !== 'PAUSED') return state;
  return {
    phase: 'RUNNING',
    kind: state.kind,
    identity: state.identity,
    durationMs: state.durationMs,
    segmentMs: state.remainingMs,
    segmentStartWall: now.wall,
    segmentStartMono: now.mono,
    deadlineWall: now.wall + state.remainingMs,
    lastTickSecond: null,
  };
}

/** Stops a WORK timer early, keeping the elapsed time as a suggestion. A timer already finished or stopped is unchanged. */
export function stopTimer(state: TimerState, now: TimeNow): TimerState {
  if (state.kind !== 'WORK' || state.phase === 'FINISHED' || state.phase === 'STOPPED') return state;
  const worked = Math.min(state.durationMs, Math.max(0, elapsedMs(state, now)));
  return { phase: 'STOPPED', kind: state.kind, identity: state.identity, durationMs: state.durationMs, elapsedMs: worked };
}

/**
 * The actual-duration value a stopped or finished WORK timer suggests, in whole seconds (nearest), or null when it
 * rounds to nothing. The PLAN is never touched: planned 30 s stays 30 s whatever is suggested.
 */
export function suggestedSeconds(state: TimerState): number | null {
  if (state.kind !== 'WORK') return null;
  if (state.phase === 'FINISHED') return Math.round(state.durationMs / SECOND);
  if (state.phase === 'STOPPED') {
    const s = Math.round(state.elapsedMs / SECOND);
    return s >= 1 ? s : null;
  }
  return null;
}

/** m:ss for the display digits ("01:30"). Callers wrap it with `ltr()` so a Hebrew UI never reverses it. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
