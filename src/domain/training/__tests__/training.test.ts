import type { ExerciseMeasurement } from '../../exercise/exercise';
import {
  adaptPrescription,
  finishedStatus,
  isValidConfidence,
  parseEntry,
  resultKinds,
  validatePrescription,
  validateSetValues,
} from '../training';

const m = (
  type: ExerciseMeasurement['type'],
  usesLoad = false,
  comparison: ExerciseMeasurement['comparison'] = null,
) => ({ type, usesLoad, comparison, distanceM: null }) satisfies ExerciseMeasurement;
const rx = (
  sets: number,
  target: number | null,
  loadKg: number | null = null,
  restSec: number | null = null,
) => ({
  sets,
  target,
  loadKg,
  restSec,
});

describe('prescription', () => {
  it('sets × target in the measurement’s unit; load only where the exercise uses one', () => {
    expect(validatePrescription(m('REPETITIONS', true), rx(3, 10, 50, 90))).toEqual({ ok: true });
    expect(validatePrescription(m('DURATION', false, 'HIGHER_IS_BETTER'), rx(3, 42.5))).toEqual({ ok: true });
    expect(validatePrescription(m('REPETITIONS'), rx(3, 10, 50))).toEqual({
      ok: false,
      errors: { loadKg: 'NOT_APPLICABLE' },
    });
    expect(validatePrescription(m('COMPLETION'), rx(1, 1))).toEqual({
      ok: false,
      errors: { target: 'NOT_APPLICABLE' },
    });
    expect(validatePrescription(m('MADE_ATTEMPTS'), rx(0, 9.5, null, -1))).toEqual({
      ok: false,
      errors: { sets: 'INVALID', target: 'INVALID', restSec: 'INVALID' },
    });
    expect(validatePrescription(m('REPETITIONS'), rx(3, null))).toEqual({ ok: true }); // a target is optional
  });

  it('a block follows its edited exercise: a no-longer-applicable target / load is dropped, sets kept', () => {
    expect(adaptPrescription(m('REPETITIONS'), rx(3, 10, 50, 60))).toEqual(rx(3, 10, null, 60));
    expect(adaptPrescription(m('COMPLETION'), rx(3, 10))).toEqual(rx(3, null));
    expect(adaptPrescription(m('REPETITIONS'), rx(3, 40.5))).toEqual(rx(3, null)); // was a duration
    expect(adaptPrescription(m('REPETITIONS'), rx(0, 10))).toBeNull(); // malformed sets = corrupt
  });
});

describe('set results', () => {
  it('each measurement type records its own kinds (plus load when the exercise uses one)', () => {
    expect(resultKinds(m('REPETITIONS', true))).toEqual(['REPETITIONS', 'LOAD_KG']);
    expect(resultKinds(m('TIME'))).toEqual(['TIME_S']);
    expect(resultKinds(m('MADE_ATTEMPTS'))).toEqual(['MADE', 'ATTEMPTS']);
    expect(resultKinds(m('COMPLETION'))).toEqual(['COMPLETED']);
    expect(resultKinds(m('RATING'))).toEqual(['RATING']);
  });

  it('values are validated, never adjusted: a short set stays short; 0 reps is a truthful result', () => {
    expect(validateSetValues(m('REPETITIONS', true), { REPETITIONS: 7, LOAD_KG: 50 })).toEqual({
      ok: true,
      values: { REPETITIONS: 7, LOAD_KG: 50 },
    });
    expect(validateSetValues(m('REPETITIONS'), { REPETITIONS: 0 })).toEqual({
      ok: true,
      values: { REPETITIONS: 0 },
    });
    expect(validateSetValues(m('MADE_ATTEMPTS'), { MADE: 11, ATTEMPTS: 10 })).toEqual({
      ok: false,
      errors: { MADE: 'MADE_OVER_ATTEMPTS' },
    });
    expect(validateSetValues(m('MADE_ATTEMPTS'), { MADE: 0, ATTEMPTS: 0 })).toEqual({
      ok: false,
      errors: { ATTEMPTS: 'INVALID' },
    });
    expect(validateSetValues(m('REPETITIONS', true), { REPETITIONS: 7.5 })).toEqual({
      ok: false,
      errors: { REPETITIONS: 'INVALID', LOAD_KG: 'REQUIRED' },
    });
    expect(validateSetValues(m('TIME'), { TIME_S: 4.38, LOAD_KG: 5 })).toEqual({
      ok: false,
      errors: { LOAD_KG: 'INVALID' },
    });
    expect(validateSetValues(m('COMPLETION'), { COMPLETED: 0 })).toEqual({
      ok: false,
      errors: { COMPLETED: 'INVALID' },
    });
  });

  it('typed entries: decimal comma or point; m:ss for times; anything else is not a number', () => {
    expect(parseEntry('4,38', 'TIME_S')).toBe(4.38);
    expect(parseEntry(' 12 ', 'REPETITIONS')).toBe(12);
    expect(parseEntry('1:30', 'DURATION_S')).toBe(90);
    expect(parseEntry('1:02:03', 'DURATION_S')).toBe(3723);
    expect(parseEntry('1:75', 'DURATION_S')).toBeNull();
    expect(parseEntry('1:30', 'REPETITIONS')).toBeNull();
    expect(parseEntry('-3', 'REPETITIONS')).toBeNull();
    expect(parseEntry('', 'LOAD_KG')).toBeNull();
    expect(parseEntry('ten', 'LOAD_KG')).toBeNull();
  });

  it('confidence: none for manual entry; 0–1 for future sources', () => {
    expect(isValidConfidence('MANUAL', null)).toBe(true);
    expect(isValidConfidence('MANUAL', 0.9)).toBe(false);
    expect(isValidConfidence('CAMERA', 0.97)).toBe(true);
    expect(isValidConfidence('SENSOR', 1.2)).toBe(false);
  });
});

describe('finishing a session', () => {
  const set = (planned: boolean, status: 'PENDING' | 'DONE' | 'SKIPPED') => ({ planned, status });
  it('COMPLETED when every planned set was performed; PARTIAL otherwise; nothing performed → cannot finish', () => {
    expect(finishedStatus([set(true, 'DONE'), set(true, 'DONE')])).toBe('COMPLETED');
    expect(finishedStatus([set(true, 'DONE'), set(true, 'SKIPPED')])).toBe('PARTIAL');
    expect(finishedStatus([set(true, 'DONE'), set(true, 'PENDING')])).toBe('PARTIAL');
    // An extra set never makes up for a missing planned one; an extra unperformed one does not matter.
    expect(finishedStatus([set(true, 'SKIPPED'), set(false, 'DONE')])).toBe('PARTIAL');
    expect(finishedStatus([set(true, 'DONE'), set(false, 'PENDING')])).toBe('COMPLETED');
    expect(finishedStatus([set(true, 'SKIPPED'), set(true, 'PENDING')])).toBeNull();
  });
});
