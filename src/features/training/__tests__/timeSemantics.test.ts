import { BUILTIN_EXERCISES, builtinExercise } from '@/domain/exercise/catalog';
import { COMPLETION_TIME_CAP_EXERCISES, timeSemantics } from '@/domain/exercise/timeSemantics';
import { PROFESSIONAL_WORKOUTS, professionalWorkout } from '@/domain/training/professional';
import { defaultPrescription } from '@/domain/training/training';
import { en } from '@/i18n/en';
import { he } from '@/i18n/he';
import { stripBidi } from '@/i18n/bidi';
import { translate } from '@/i18n/translate';

import { plannedSetText, prescriptionText, targetLabelKey, timeCapHint } from '../trainingLabels';

/**
 * The meaning of a seconds value (final content review): a DURATION_TARGET is how long to do the exercise; only an explicitly
 * classified COMPLETION_TIME_CAP drill shows a recording cap. `measurement == TIME` alone never implies a cap.
 */
const tEn = ((key: string, params?: Record<string, string | number>) => stripBidi(translate(en, key as never, params))) as never;
const tHe = ((key: string, params?: Record<string, string | number>) => stripBidi(translate(he, key as never, params))) as never;
const ex = (id: string) => builtinExercise(id)!;
const rx = (sets: number, target: number | null) => ({ sets, target, loadKg: null, restSec: 30 });
const CAP = 'Record your actual time. The value shown is only a recording cap, not a performance goal.';

describe('the registry', () => {
  it('classifies ONLY genuine completion-time drills, all of them TIME-measured and all existing', () => {
    expect([...COMPLETION_TIME_CAP_EXERCISES]).toEqual(['SPRINT_10M', 'SPRINT_20M', 'SPRINT_30M_FLYING', 'T_DRILL', 'PRO_AGILITY_5_10_5', 'SHUTTLE_RUN', 'ROW_500M', 'SLED_PUSH']);
    for (const id of COMPLETION_TIME_CAP_EXERCISES) expect([id, ex(id).measurement.type]).toEqual([id, 'TIME']);
  });

  it('every other exercise — every DURATION one, every unclassified TIME one, a user-made one — is a plain duration', () => {
    for (const e of BUILTIN_EXERCISES) {
      const s = timeSemantics(e.id, e.measurement.type);
      if (e.measurement.type === 'DURATION') expect([e.id, s]).toEqual([e.id, 'DURATION_TARGET']);
      else if (e.measurement.type === 'TIME') expect([e.id, s]).toEqual([e.id, COMPLETION_TIME_CAP_EXERCISES.includes(e.id) ? 'COMPLETION_TIME_CAP' : 'DURATION_TARGET']);
      else expect([e.id, s]).toEqual([e.id, null]);
    }
    expect(timeSemantics('3f2a-user-made-id', 'TIME')).toBe('DURATION_TARGET');
    expect(timeSemantics(null, 'TIME')).toBe('DURATION_TARGET');
    expect(timeSemantics('SPRINT_10M', 'DURATION')).toBe('DURATION_TARGET'); // the id alone never decides: the measurement must be TIME
  });

  it('the published Basketball course drills are NOT reclassified (their wording is unchanged); no published sport workout uses a cap drill', () => {
    for (const id of ['CONE_DRIBBLE_SLALOM', 'DEFENSIVE_SLIDES', 'LANE_AGILITY', 'COURT_SPRINTS_SUICIDES']) {
      expect([id, ex(id).measurement.type, timeSemantics(id, 'TIME')]).toEqual([id, 'TIME', 'DURATION_TARGET']);
    }
    for (const w of PROFESSIONAL_WORKOUTS) {
      for (const item of w.sections.flatMap((s) => s.items)) expect([w.id, item.exerciseId, timeSemantics(item.exerciseId, ex(item.exerciseId).measurement.type)]).not.toContain('COMPLETION_TIME_CAP');
    }
    const cone = professionalWorkout('BASKETBALL-BALL-HANDLING-01')!.sections.flatMap((s) => s.items).find((i) => i.exerciseId === 'CONE_DRIBBLE_SLALOM')!;
    expect(prescriptionText(tEn, ex('CONE_DRIBBLE_SLALOM').measurement, { sets: 4, target: 30, loadKg: null, restSec: 60 }, 'CONE_DRIBBLE_SLALOM')).toBe(
      prescriptionText(tEn, ex('CONE_DRIBBLE_SLALOM').measurement, { sets: cone.dosage!.sets, target: cone.dosage!.target, loadKg: null, restSec: cone.dosage!.restSec }),
    );
    expect(prescriptionText(tEn, ex('CONE_DRIBBLE_SLALOM').measurement, { sets: 4, target: 30, loadKg: null, restSec: 60 }, 'CONE_DRIBBLE_SLALOM')).not.toMatch(/cap/);
  });
});

describe('duration exercises show a duration, never a cap', () => {
  it.each([
    ['PLANK', 20],
    ['SIDE_PLANK', 25],
    ['RUN_INTERVALS', 45],
    ['PARTNER_MIRROR_DRILL', 15],
    ['EASY_RUN', 1200],
    ['JUMP_ROPE', 40],
    ['HIGH_KNEES', 20],
  ])('%s %s s: plain seconds, the duration label, no cap hint (English and Hebrew)', (id, seconds) => {
    const m = ex(id).measurement;
    expect(plannedSetText(tEn, m, seconds, null, id)).toBe(`${seconds} s`);
    expect(plannedSetText(tHe, m, seconds, null, id)).toBe(`${seconds} שנ׳`);
    expect(prescriptionText(tEn, m, rx(2, seconds), id)).not.toMatch(/cap/i);
    expect(prescriptionText(tHe, m, rx(2, seconds), id)).not.toMatch(/תקרה|תקרת/);
    expect(timeCapHint(tEn, m, seconds, id)).toBeNull();
    expect(targetLabelKey(m.type, id)).toBe('training.targetDuration');
  });

  it("an exercise's own default duration is shown as a duration too", () => {
    for (const id of ['PLANK', 'RUN_INTERVALS', 'PARTNER_MIRROR_DRILL']) {
      const e = ex(id);
      expect(prescriptionText(tEn, e.measurement, defaultPrescription(e.measurement, e.defaults), id)).not.toMatch(/cap/i);
    }
  });
});

describe('completion-time drills show actual-time / cap semantics', () => {
  it.each([
    ['SPRINT_10M', 5, 'time cap 5 s', 'תקרת זמן 5 שנ׳'],
    ['SPRINT_20M', 7, 'time cap 7 s', 'תקרת זמן 7 שנ׳'],
    ['T_DRILL', 16, 'time cap 16 s', 'תקרת זמן 16 שנ׳'],
    ['PRO_AGILITY_5_10_5', 8, 'time cap 8 s', 'תקרת זמן 8 שנ׳'],
  ])('%s: a cap, the actual-time hint, the Time cap field label (English and Hebrew)', (id, seconds, textEn, textHe) => {
    const m = ex(id).measurement;
    expect(plannedSetText(tEn, m, seconds, null, id)).toBe(textEn);
    expect(plannedSetText(tHe, m, seconds, null, id)).toBe(textHe);
    expect(timeCapHint(tEn, m, seconds, id)).toBe(CAP);
    expect(timeCapHint(tHe, m, seconds, id)).toBe('מתעדים את הזמן בפועל. הערך המוצג הוא רק תקרה לתיעוד, לא יעד ביצוע.');
    expect(targetLabelKey(m.type, id)).toBe('training.targetTimeCap');
    expect(translate(en, 'training.targetTimeCap')).toBe('Time cap (seconds) — record your actual time');
    expect(translate(he, 'training.targetTimeCap')).toBe('תקרת זמן (שניות) — מתעדים את הזמן בפועל');
    expect(plannedSetText(tEn, m, seconds, null, id)).not.toMatch(/goal|target/i);
  });

  it('no value, no hint: a cap drill with no configured value shows nothing to explain', () => {
    expect(timeCapHint(tEn, ex('SPRINT_10M').measurement, null, 'SPRINT_10M')).toBeNull();
  });

  it('an unclassified TIME exercise keeps the goal-time label it always had', () => {
    expect(targetLabelKey('TIME', 'CONE_DRIBBLE_SLALOM')).toBe('training.targetTime');
    expect(translate(en, 'training.targetTime')).toBe('Goal time (seconds)');
  });
});
