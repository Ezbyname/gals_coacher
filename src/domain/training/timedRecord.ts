import { parseEntry, resultKinds, type MeasurementKind, type SetValues } from './training';
import type { ExerciseMeasurement } from '../exercise/exercise';

/**
 * TRAINING-STOPWATCH-001 (also fixes TRAINING-TIMER-001): what a "Record N s" from a timer / stopwatch can save.
 *
 * A timed value is only ONE of the kinds a set needs. FARMER_CARRY (DURATION + LOAD) and SLED_PUSH (TIME + LOAD) also need
 * a load. The other kinds are taken from what the USER has in the set's fields (a typed load, or the last ACTUAL load the
 * screen already offers) — never from the plan, never invented. When a required kind is still missing the caller must
 * NOT record: it keeps the timed value as a suggestion and says what is still needed.
 */
export function timedRecordValues(
  measurement: ExerciseMeasurement,
  timedKind: 'DURATION_S' | 'TIME_S',
  timedValue: number,
  fields: Partial<Record<MeasurementKind, string>>,
): { readonly values: SetValues; readonly missing: readonly MeasurementKind[] } {
  const values: SetValues = {};
  const missing: MeasurementKind[] = [];
  for (const kind of resultKinds(measurement)) {
    if (kind === timedKind) {
      values[kind] = timedValue;
      continue;
    }
    const raw = fields[kind];
    const parsed = raw === undefined ? null : parseEntry(raw, kind);
    if (parsed === null) missing.push(kind);
    else values[kind] = parsed;
  }
  return { values, missing };
}
