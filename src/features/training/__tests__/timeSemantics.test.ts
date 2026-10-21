import { builtinExercise } from '@/domain/exercise/catalog';
import { resolveTimeSemantics, storableTimeSemantics, TIME_SEMANTICS } from '@/domain/exercise/timeSemantics';
import { stripBidi } from '@/i18n/bidi';
import { en } from '@/i18n/en';
import { he } from '@/i18n/he';
import { translate } from '@/i18n/translate';

import { plannedSetText, prescriptionText, targetLabelKey, timeCapHint } from '../trainingLabels';

/**
 * The meaning of a seconds value, shown from the PRESCRIPTION's stored semantics (never from the exercise id):
 * DURATION_TARGET reads as a duration, PERFORMANCE_GOAL_TIME keeps the historical "Goal time" (the legacy default for TIME),
 * and only an explicit COMPLETION_TIME_CAP reads as a recording cap.
 */
const tEn = ((key: string, params?: Record<string, string | number>) => stripBidi(translate(en, key as never, params))) as never;
const tHe = ((key: string, params?: Record<string, string | number>) => stripBidi(translate(he, key as never, params))) as never;
const ex = (id: string) => builtinExercise(id)!;
const rx = (sets: number, target: number | null, timeSemantics?: 'DURATION_TARGET' | 'PERFORMANCE_GOAL_TIME' | 'COMPLETION_TIME_CAP') => ({
  sets,
  target,
  loadKg: null,
  restSec: 30,
  ...(timeSemantics ? { timeSemantics } : {}),
});
const CAP = 'Record your actual time. The value shown is only a recording cap, not a performance goal.';

describe('resolving a prescription’s meaning', () => {
  it('DURATION is always a duration; TIME with nothing stored is the historical Goal time; a stored meaning wins; other measurements have none', () => {
    expect(TIME_SEMANTICS).toEqual(['DURATION_TARGET', 'PERFORMANCE_GOAL_TIME', 'COMPLETION_TIME_CAP']);
    expect(resolveTimeSemantics('DURATION', null)).toBe('DURATION_TARGET');
    expect(resolveTimeSemantics('DURATION', 'COMPLETION_TIME_CAP')).toBe('DURATION_TARGET');
    expect(resolveTimeSemantics('TIME', null)).toBe('PERFORMANCE_GOAL_TIME');
    expect(resolveTimeSemantics('TIME', undefined)).toBe('PERFORMANCE_GOAL_TIME');
    expect(resolveTimeSemantics('TIME', 'DURATION_TARGET')).toBe('DURATION_TARGET');
    expect(resolveTimeSemantics('TIME', 'COMPLETION_TIME_CAP')).toBe('COMPLETION_TIME_CAP');
    for (const type of ['REPETITIONS', 'DISTANCE', 'MADE_ATTEMPTS', 'RATING', 'COMPLETION'] as const) expect(resolveTimeSemantics(type, 'COMPLETION_TIME_CAP')).toBeNull();
  });

  it('only a TIME prescription stores a meaning', () => {
    expect(storableTimeSemantics('TIME', 'COMPLETION_TIME_CAP')).toBe('COMPLETION_TIME_CAP');
    expect(storableTimeSemantics('TIME', null)).toBeNull();
    expect(storableTimeSemantics('DURATION', 'COMPLETION_TIME_CAP')).toBeNull();
    expect(storableTimeSemantics('REPETITIONS', 'DURATION_TARGET')).toBeNull();
    expect(storableTimeSemantics('TIME', 'BOGUS' as never)).toBeNull();
  });
});

describe('DURATION_TARGET: plain seconds, the duration label, no hint (English and Hebrew)', () => {
  it.each([
    ['PLANK', 20],
    ['SIDE_PLANK', 25],
    ['RUN_INTERVALS', 45],
    ['PARTNER_MIRROR_DRILL', 15],
    ['EASY_RUN', 1200],
    ['JUMP_ROPE', 40],
  ])('%s %s s', (id, seconds) => {
    const m = ex(id).measurement;
    expect(plannedSetText(tEn, m, seconds, null)).toBe(`${seconds} s`);
    expect(plannedSetText(tHe, m, seconds, null)).toBe(`${seconds} שנ׳`);
    expect(prescriptionText(tEn, m, rx(2, seconds))).not.toMatch(/cap|goal/i);
    expect(prescriptionText(tHe, m, rx(2, seconds))).not.toMatch(/תקרה|תקרת/);
    expect(timeCapHint(tEn, m, seconds)).toBeNull();
    expect(targetLabelKey(m.type)).toBe('training.targetDuration');
  });

  it('a TIME exercise prescribed as work for a duration (a shuttle run for 30 s, a sled push for 10 s) reads as a duration, not a cap or a goal', () => {
    for (const id of ['SHUTTLE_RUN', 'SLED_PUSH']) {
      const m = ex(id).measurement;
      expect(m.type).toBe('TIME');
      expect(plannedSetText(tEn, m, 30, null, 'DURATION_TARGET')).toBe('30 s');
      expect(timeCapHint(tEn, m, 30, 'DURATION_TARGET')).toBeNull();
      expect(targetLabelKey('TIME', 'DURATION_TARGET')).toBe('training.targetDuration');
    }
  });
});

describe('PERFORMANCE_GOAL_TIME: the historical behaviour is preserved for every TIME value with no stored meaning', () => {
  it.each([['SPRINT_10M'], ['T_DRILL'], ['ROW_500M'], ['CONE_DRIBBLE_SLALOM'], ['SHUTTLE_RUN']])('%s with no stored semantics reads exactly as it always did', (id) => {
    const m = ex(id).measurement;
    expect(plannedSetText(tEn, m, 5, null)).toBe('5 s');
    expect(plannedSetText(tHe, m, 5, null)).toBe('5 שנ׳');
    expect(prescriptionText(tEn, m, rx(3, 5))).not.toMatch(/cap/i);
    expect(timeCapHint(tEn, m, 5)).toBeNull();
    expect(targetLabelKey('TIME')).toBe('training.targetTime');
    expect(translate(en, 'training.targetTime')).toBe('Goal time (seconds)');
    expect(translate(he, 'training.targetTime')).toBe('זמן יעד (שניות)');
  });

  it('an explicit PERFORMANCE_GOAL_TIME reads the same as a legacy one', () => {
    const m = ex('SPRINT_10M').measurement;
    expect(plannedSetText(tEn, m, 5, null, 'PERFORMANCE_GOAL_TIME')).toBe('5 s');
    expect(targetLabelKey('TIME', 'PERFORMANCE_GOAL_TIME')).toBe('training.targetTime');
  });
});

describe('COMPLETION_TIME_CAP: only when the prescription says so', () => {
  it.each([
    ['SPRINT_10M', 5, 'time cap 5 s', 'תקרת זמן 5 שנ׳'],
    ['SPRINT_20M', 7, 'time cap 7 s', 'תקרת זמן 7 שנ׳'],
    ['T_DRILL', 16, 'time cap 16 s', 'תקרת זמן 16 שנ׳'],
    ['PRO_AGILITY_5_10_5', 8, 'time cap 8 s', 'תקרת זמן 8 שנ׳'],
    ['ROW_500M', 150, 'time cap 150 s', 'תקרת זמן 150 שנ׳'],
  ])('%s: a cap, the actual-time hint and the cap field label (English and Hebrew)', (id, seconds, textEn, textHe) => {
    const m = ex(id).measurement;
    expect(plannedSetText(tEn, m, seconds, null, 'COMPLETION_TIME_CAP')).toBe(textEn);
    expect(plannedSetText(tHe, m, seconds, null, 'COMPLETION_TIME_CAP')).toBe(textHe);
    expect(prescriptionText(tEn, m, rx(2, seconds, 'COMPLETION_TIME_CAP'))).toMatch(/time cap/);
    expect(timeCapHint(tEn, m, seconds, 'COMPLETION_TIME_CAP')).toBe(CAP);
    expect(timeCapHint(tHe, m, seconds, 'COMPLETION_TIME_CAP')).toBe('מתעדים את הזמן בפועל. הערך המוצג הוא רק תקרה לתיעוד, לא יעד ביצוע.');
    expect(targetLabelKey(m.type, 'COMPLETION_TIME_CAP')).toBe('training.targetTimeCap');
    expect(plannedSetText(tEn, m, seconds, null, 'COMPLETION_TIME_CAP')).not.toMatch(/goal|target/i);
  });

  it('the cap label and wording are exact in both languages', () => {
    expect(translate(en, 'training.targetTimeCap')).toBe('Time cap (seconds) — record your actual time');
    expect(translate(he, 'training.targetTimeCap')).toBe('תקרת זמן (שניות) — מתעדים את הזמן בפועל');
  });

  it('no configured value, no hint; and the same exercise is a cap or a goal depending ONLY on the prescription', () => {
    const m = ex('SPRINT_20M').measurement;
    expect(timeCapHint(tEn, m, null, 'COMPLETION_TIME_CAP')).toBeNull();
    expect(plannedSetText(tEn, m, 7, null, 'COMPLETION_TIME_CAP')).toBe('time cap 7 s');
    expect(plannedSetText(tEn, m, 7, null)).toBe('7 s');
    expect(plannedSetText(tEn, m, 7, null, 'PERFORMANCE_GOAL_TIME')).toBe('7 s');
  });
});
