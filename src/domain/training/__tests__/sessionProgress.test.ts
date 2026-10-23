import type { SetStatus } from '../training';
import { exerciseProgress, nextSetId, workoutProgress } from '../sessionProgress';
import { timedRecordValues } from '../timedRecord';

const set = (id: string, setNumber: number, status: SetStatus, planned = true) => ({ id, setNumber, planned, status });

describe('exercise progress is derived from the set states, planned and extra kept apart', () => {
  it('2 of 4 planned sets done -> in progress', () => {
    const p = exerciseProgress([set('a', 1, 'DONE'), set('b', 2, 'DONE'), set('c', 3, 'PENDING'), set('d', 4, 'PENDING')]);
    expect(p).toMatchObject({ planned: 4, plannedDone: 2, plannedPending: 2, state: 'IN_PROGRESS' });
  });
  it('all planned done -> completed', () => {
    expect(exerciseProgress([set('a', 1, 'DONE'), set('b', 2, 'DONE'), set('c', 3, 'DONE')]).state).toBe('COMPLETED');
  });
  it('all resolved but one planned set skipped -> completed with skipped sets (and the skip is counted)', () => {
    const p = exerciseProgress([set('a', 1, 'DONE'), set('b', 2, 'SKIPPED'), set('c', 3, 'DONE')]);
    expect(p).toMatchObject({ state: 'COMPLETED_WITH_SKIPPED', plannedDone: 2, plannedSkipped: 1, skipped: 1 });
  });
  it('an extra set is never added to the planned denominator (3 / 3 planned + 1 extra, never 4 / 3)', () => {
    const p = exerciseProgress([set('a', 1, 'DONE'), set('b', 2, 'DONE'), set('c', 3, 'DONE'), set('x', 4, 'DONE', false)]);
    expect(p).toMatchObject({ planned: 3, plannedDone: 3, extraDone: 1, state: 'COMPLETED' });
  });
  it('planned work done but an added extra set still pending is NOT "completed"', () => {
    const p = exerciseProgress([set('a', 1, 'DONE'), set('b', 2, 'DONE'), set('x', 3, 'PENDING', false)]);
    expect(p).toMatchObject({ planned: 2, plannedDone: 2, extraPending: 1, state: 'PLANNED_DONE_EXTRA_PENDING' });
  });
  it('once the extra set is resolved the normal completed state returns (done or skipped)', () => {
    expect(exerciseProgress([set('a', 1, 'DONE'), set('x', 2, 'DONE', false)]).state).toBe('COMPLETED');
    expect(exerciseProgress([set('a', 1, 'DONE'), set('x', 2, 'SKIPPED', false)]).state).toBe('COMPLETED'); // an extra skip is not a skipped PLANNED set
  });
  it('a pending planned set wins over everything else', () => {
    expect(exerciseProgress([set('a', 1, 'PENDING'), set('x', 2, 'PENDING', false)]).state).toBe('IN_PROGRESS');
  });
});

describe('workout progress and the Next hint', () => {
  const ex = (id: string, position: number, sets: ReturnType<typeof set>[]) => ({ id, position, sets });
  const exercises = [
    ex('e1', 0, [set('a', 1, 'DONE'), set('b', 2, 'DONE')]),
    ex('e2', 1, [set('c', 1, 'DONE'), set('d', 2, 'SKIPPED'), set('x', 3, 'DONE', false)]),
    ex('e3', 2, [set('e', 1, 'PENDING'), set('f', 2, 'PENDING')]),
  ];
  it('counts planned done, skipped, extra and completed exercises', () => {
    expect(workoutProgress(exercises)).toEqual({ plannedSets: 6, plannedDone: 3, skipped: 1, extraDone: 1, extraPending: 0, exercises: 3, exercisesCompleted: 1 });
  });
  it('Next = the first pending planned set in workout order, regardless of what was done out of order', () => {
    expect(nextSetId(exercises)).toBe('e');
    const outOfOrder = [ex('e1', 0, [set('a', 1, 'PENDING'), set('b', 2, 'DONE')]), ex('e2', 1, [set('c', 1, 'DONE')])];
    expect(nextSetId(outOfOrder)).toBe('a'); // the earlier set is still the hint after the later one was done first
  });
  it('with no planned set pending, the first pending extra set; with nothing pending, none', () => {
    expect(nextSetId([ex('e1', 0, [set('a', 1, 'DONE'), set('x', 2, 'PENDING', false)])])).toBe('x');
    expect(nextSetId([ex('e1', 0, [set('a', 1, 'DONE'), set('b', 2, 'SKIPPED')])])).toBeNull();
  });
  it('exercise order is the exercise position, not the array order', () => {
    const shuffled = [ex('late', 5, [set('l', 1, 'PENDING')]), ex('early', 1, [set('e', 1, 'PENDING')])];
    expect(nextSetId(shuffled)).toBe('e');
  });
});

describe('timedRecordValues: a timed value alone is only part of the result for load-bearing exercises', () => {
  const m = (type: 'DURATION' | 'TIME', usesLoad: boolean) => ({ type, comparison: 'HIGHER_IS_BETTER', usesLoad, distanceM: null }) as never;
  it('a plain DURATION / TIME exercise needs nothing else', () => {
    expect(timedRecordValues(m('DURATION', false), 'DURATION_S', 30, {})).toEqual({ values: { DURATION_S: 30 }, missing: [] });
    expect(timedRecordValues(m('TIME', false), 'TIME_S', 5.37, {})).toEqual({ values: { TIME_S: 5.37 }, missing: [] });
  });
  it('FARMER_CARRY (DURATION + load) without a load: nothing is saved, the load is reported missing', () => {
    expect(timedRecordValues(m('DURATION', true), 'DURATION_S', 30, {})).toEqual({ values: { DURATION_S: 30 }, missing: ['LOAD_KG'] });
    expect(timedRecordValues(m('DURATION', true), 'DURATION_S', 30, { LOAD_KG: '' }).missing).toEqual(['LOAD_KG']);
    expect(timedRecordValues(m('DURATION', true), 'DURATION_S', 30, { LOAD_KG: 'abc' }).missing).toEqual(['LOAD_KG']);
  });
  it('SLED_PUSH (TIME + load) with the user\'s load: both kinds, nothing missing', () => {
    expect(timedRecordValues(m('TIME', true), 'TIME_S', 6.12, { LOAD_KG: '60' })).toEqual({ values: { TIME_S: 6.12, LOAD_KG: 60 }, missing: [] });
  });
  it('the plan is never an input: only the user\'s fields are read', () => {
    expect(timedRecordValues(m('TIME', true), 'TIME_S', 6, { TIME_S: '99' }).values.TIME_S).toBe(6); // the timed value wins over a stale field
  });
});
