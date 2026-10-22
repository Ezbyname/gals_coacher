import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import {
  pauseTimer,
  remainingMs,
  resumeTimer,
  startTimer,
  stopTimer,
  tick,
  type TimeNow,
  type TimerIdentity,
  type TimerKind,
  type TimerState,
} from '@/domain/training/workoutTimer';
import { useApp } from '@/features/AppProvider';
import { DEFAULT_TIMER_PREFERENCES, readTimerPreferences, type TimerPreferences } from '@/preferences/timerPreference';

/**
 * TRAINING-TIMER-001 — the ONE active workout timer, owned ABOVE the session route so it survives navigation
 * (Session -> Calendar -> Session keeps the same timer and the correct remaining time). Runtime state only: nothing here
 * is persisted, and process death may lose it (the TrainingSession in SQLite is untouched).
 *
 * It never writes training data. It never marks a set, creates a measurement, skips or finishes anything: the user
 * confirms any actual result through the existing record path. It is bound to a session and cleared the moment that
 * session is no longer IN_PROGRESS.
 */

/** A late cue (the timer ran out while the app was away) is silent: the state is shown, the sound would be stale. */
export const STALE_CUE_MS = 2000;
const TICK_MS = 250;

export type TimerAnnouncementKind = 'WORK_STARTED' | 'PAUSED' | 'RESUMED' | 'WORK_FINISHED' | 'REST_FINISHED';
export interface TimerAnnouncement {
  readonly kind: TimerAnnouncementKind;
  /** Changes on every announcement, so a repeated kind is announced again. */
  readonly seq: number;
}

export interface WorkoutTimerApi {
  /** The active timer; changes only on transitions (the digits are derived with `readRemainingMs`). */
  readonly state: TimerState | null;
  readonly announcement: TimerAnnouncement | null;
  startWork(identity: TimerIdentity, seconds: number): void;
  startRest(identity: TimerIdentity, seconds: number): void;
  pause(): void;
  resume(): void;
  /** Stops the WORK timer early; the elapsed time stays as a suggestion. */
  stop(): void;
  skipRest(): void;
  /** Clears a finished / stopped timer. */
  dismiss(): void;
  /** The session is no longer IN_PROGRESS (or was left): whatever timer belongs to it ends now. */
  clearForSession(sessionId: string): void;
  readRemainingMs(): number;
  /**
   * An ACTIVE (running or paused) WORK timer exists for a DIFFERENT set. Starting another work timer would discard what it
   * has counted, so the caller must confirm first. A rest timer or a finished / stopped result never counts.
   */
  isActiveWorkElsewhere(identity: TimerIdentity): boolean;
}

const Context = createContext<WorkoutTimerApi | null>(null);

export function useWorkoutTimer(): WorkoutTimerApi {
  const api = useContext(Context);
  if (!api) throw new Error('useWorkoutTimer must be used inside <WorkoutTimerProvider>.');
  return api;
}

export function WorkoutTimerProvider({
  children,
  readPrefs = readTimerPreferences,
}: {
  children: ReactNode;
  /** Injected in tests. */
  readPrefs?: () => Promise<TimerPreferences>;
}) {
  const { services } = useApp();
  const stateRef = useRef<TimerState | null>(null);
  const [state, setState] = useState<TimerState | null>(null);
  const [announcement, setAnnouncement] = useState<TimerAnnouncement | null>(null);
  const seq = useRef(0);
  const prefs = useRef<TimerPreferences>(DEFAULT_TIMER_PREFERENCES);
  const clock = services.clock;

  const nowOf = useCallback((): TimeNow => ({ wall: clock.wallNow(), mono: clock.monotonicNow() }), [clock]);
  const refreshPrefs = useCallback(() => {
    readPrefs().then(
      (p) => {
        prefs.current = p;
      },
      () => {},
    );
  }, [readPrefs]);
  const announce = useCallback((kind: TimerAnnouncementKind) => {
    seq.current += 1;
    setAnnouncement({ kind, seq: seq.current });
  }, []);
  const commit = useCallback((next: TimerState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Sound and vibration are supplementary and optional; a failure in either never reaches the timer. */
  const cue = useCallback(
    (kind: 'TICK' | 'WORK_FINISHED' | 'REST_FINISHED') => {
      const p = prefs.current;
      try {
        if (p.sound) services.audio.play(kind === 'TICK' ? 'COUNTDOWN_TICK' : kind === 'WORK_FINISHED' ? 'WHISTLE' : 'DOUBLE_WHISTLE');
      } catch (e) {
        console.warn('[timer] sound cue failed', e);
      }
      try {
        if (p.vibration && kind !== 'TICK') services.haptics.success(); // never every second
      } catch (e) {
        console.warn('[timer] vibration cue failed', e);
      }
    },
    [services],
  );

  /** Advances the active timer to now. Runs on the interval and the instant the app returns to the foreground. */
  const reconcile = useCallback(() => {
    const current = stateRef.current;
    if (current === null || current.phase !== 'RUNNING') return;
    const now = nowOf();
    const result = tick(current, now);
    if (result.expired) {
      commit(result.state);
      if (now.wall - current.deadlineWall <= STALE_CUE_MS) cue(current.kind === 'WORK' ? 'WORK_FINISHED' : 'REST_FINISHED');
      announce(current.kind === 'WORK' ? 'WORK_FINISHED' : 'REST_FINISHED');
    } else {
      if (result.state !== current) stateRef.current = result.state; // the tick bookkeeping needs no re-render
      if (result.tickSecond !== null) cue('TICK');
    }
  }, [announce, commit, cue, nowOf]);

  const api = useMemo<WorkoutTimerApi>(() => {
    const start = (kind: TimerKind, identity: TimerIdentity, seconds: number) => {
      const current = stateRef.current;
      // Rapid repeated Start of the very same running timer is idempotent: one timer, never two.
      if (
        current !== null &&
        current.phase === 'RUNNING' &&
        current.kind === kind &&
        current.identity.sessionId === identity.sessionId &&
        current.identity.setId === identity.setId
      ) {
        return;
      }
      refreshPrefs();
      commit(startTimer(kind, identity, seconds, nowOf())); // any other timer is replaced: only ONE exists
      if (kind === 'WORK') announce('WORK_STARTED');
    };
    return {
      state,
      announcement,
      startWork: (identity, seconds) => start('WORK', identity, seconds),
      startRest: (identity, seconds) => start('REST', identity, seconds),
      pause: () => {
        const current = stateRef.current;
        if (current === null) return;
        const next = pauseTimer(current, nowOf());
        if (next !== current) {
          commit(next);
          announce('PAUSED');
        }
      },
      resume: () => {
        const current = stateRef.current;
        if (current === null) return;
        const next = resumeTimer(current, nowOf());
        if (next !== current) {
          commit(next);
          announce('RESUMED');
        }
      },
      stop: () => {
        const current = stateRef.current;
        if (current === null) return;
        const next = stopTimer(current, nowOf());
        if (next !== current) commit(next);
      },
      skipRest: () => {
        if (stateRef.current?.kind === 'REST') commit(null);
      },
      dismiss: () => {
        const current = stateRef.current;
        if (current !== null && (current.phase === 'FINISHED' || current.phase === 'STOPPED')) commit(null);
      },
      clearForSession: (sessionId) => {
        if (stateRef.current?.identity.sessionId === sessionId) commit(null);
      },
      readRemainingMs: () => (stateRef.current === null ? 0 : remainingMs(stateRef.current, nowOf())),
      isActiveWorkElsewhere: (identity) => {
        const current = stateRef.current;
        return (
          current !== null &&
          current.kind === 'WORK' &&
          (current.phase === 'RUNNING' || current.phase === 'PAUSED') &&
          !(current.identity.sessionId === identity.sessionId && current.identity.setId === identity.setId)
        );
      },
    };
  }, [state, announcement, announce, commit, nowOf, refreshPrefs]);

  // The display tick runs only while a timer is running; expiry and cues are decided here, from the deadline.
  const running = state?.phase === 'RUNNING';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(reconcile, TICK_MS);
    return () => clearInterval(id);
  }, [running, reconcile]);

  // Back in the foreground: recompute from the deadline at once (an expiry while away shows immediately).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reconcile();
    });
    return () => sub.remove();
  }, [reconcile]);

  // The screen stays on only while a timer is actively running; every other state releases it.
  useEffect(() => {
    if (running) services.keepAwake.activate();
    else services.keepAwake.release();
  }, [running, services]);
  useEffect(() => () => services.keepAwake.release(), [services]);

  return <Context.Provider value={api}>{children}</Context.Provider>;
}

/** The remaining time of the active timer, re-read about 4 times a second while it runs (display only). */
export function useRemainingMs(api: WorkoutTimerApi): number {
  const [, force] = useState(0);
  const running = api.state?.phase === 'RUNNING';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [running]);
  return api.readRemainingMs();
}
