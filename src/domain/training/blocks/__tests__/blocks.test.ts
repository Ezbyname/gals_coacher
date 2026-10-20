import { ATHLETIC } from '../../../exercise/catalog/athletic';
import { builtinExercise } from '../../../exercise/catalog';
import { PROVENANCE, SOURCES } from '../../../exercise/catalog/provenance';
import { SPORTS, CONTENT_SPORTS, V1_ENABLED_SPORTS } from '../../../sport';
import { validatePrescription, defaultPrescription, WORKOUT_NAME_MAX_LENGTH } from '../../training';
import { adjustedSections } from '../../professional/adjust';
import {
  GENERAL_ATHLETIC_WORKOUTS,
  PROFESSIONAL_WORKOUTS,
  PROFESSIONAL_SPORTS,
  professionalWorkout,
  professionalWorkoutsFor,
  generalWorkoutsFor,
  domainOf,
} from '../../professional';
import { orderedSessions, planName, planSessionDates, previewBlock, sessionSections, TRAINING_BLOCKS, trainingBlock, totalSessions, weekdayOf } from '..';

const HEBREW = /[֐-׿]/;
const BLOCK_IDS = [
  'ATHLETICISM-FOUNDATION-6W-01',
  'EXPLOSIVE-POWER-8W-01',
  'SPEED-ACCELERATION-6W-01',
  'AGILITY-COD-6W-01',
  'STRENGTH-FOUNDATION-6W-01',
  'CONDITIONING-6W-01',
];
const WORKOUT_IDS = [
  'ATH-MOVEMENT-FOUNDATION-01',
  'ATH-STRENGTH-FULLBODY-A-01',
  'ATH-STRENGTH-FULLBODY-B-01',
  'ATH-JUMP-LANDING-01',
  'ATH-EXPLOSIVE-LOWER-01',
  'ATH-ROTATIONAL-POWER-01',
  'ATH-ACCELERATION-01',
  'ATH-SPEED-01',
  'ATH-DECEL-COD-01',
  'ATH-REACTIVE-AGILITY-01',
  'ATH-CONDITIONING-BASE-01',
  'ATH-CONDITIONING-INTERVALS-01',
  'ATH-REPEATED-EFFORT-01',
];
const NEW_EXERCISE_IDS = ['DROP_LANDING_STICK', 'SINGLE_LEG_HOP_STICK', 'DECEL_STOP', 'PARTNER_MIRROR_DRILL', 'COACH_CUE_REACTION_SPRINT', 'RUN_INTERVALS'];

describe('the registry: stable ids, sizes and review status', () => {
  it('six blocks with stable ids; five are 6 weeks / 12 sessions and Explosive Power is 8 weeks / 16 sessions', () => {
    expect(TRAINING_BLOCKS.map((b) => b.id)).toEqual(BLOCK_IDS);
    for (const b of TRAINING_BLOCKS) {
      const expected = b.id === 'EXPLOSIVE-POWER-8W-01' ? [8, 2, 16] : [6, 2, 12];
      expect([b.weeks, b.sessionsPerWeek, totalSessions(b)]).toEqual(expected);
      expect(b.schedule).toHaveLength(totalSessions(b));
    }
  });

  it('thirteen general workouts and six new exercises, all with the approved ids, all PENDING_HUMAN_REVIEW', () => {
    expect(GENERAL_ATHLETIC_WORKOUTS.map((w) => w.id)).toEqual(WORKOUT_IDS);
    expect(ATHLETIC.map((e) => e.id)).toEqual(NEW_EXERCISE_IDS);
    for (const w of GENERAL_ATHLETIC_WORKOUTS) expect([w.id, w.reviewStatus]).toEqual([w.id, 'PENDING_HUMAN_REVIEW']);
    for (const b of TRAINING_BLOCKS) expect([b.id, b.reviewStatus]).toEqual([b.id, 'PENDING_HUMAN_REVIEW']);
  });

  it('the schedule covers every (week, slot) exactly once and runs in order', () => {
    for (const b of TRAINING_BLOCKS) {
      const keys = orderedSessions(b).map((s) => `${s.week}.${s.slot}`);
      const expected = Array.from({ length: b.weeks }, (_, w) => Array.from({ length: b.sessionsPerWeek }, (_, s) => `${w + 1}.${s + 1}`)).flat();
      expect(keys).toEqual(expected);
    }
  });

  it('every block has every required descriptive field, in Hebrew and English', () => {
    for (const b of TRAINING_BLOCKS) {
      const pairs = [b.name, b.shortName, b.summary, b.goal, b.athlete, b.prerequisite, b.recovery, b.equipment, b.safety, ...b.progression, ...b.substitutions];
      for (const [he, en] of pairs) {
        expect(he.length).toBeGreaterThan(2);
        expect(en.length).toBeGreaterThan(2);
        expect(he).toMatch(HEBREW);
      }
      expect(b.progression.length).toBeGreaterThan(0);
      expect(b.decisions.length).toBeGreaterThan(0);
    }
  });
});

describe('workouts, references and prescriptions', () => {
  it('every block session references an existing GENERAL workout and its adjustment is valid', () => {
    for (const b of TRAINING_BLOCKS) {
      for (const s of b.schedule) {
        const w = professionalWorkout(s.workoutId);
        expect([s.workoutId, w === null ? null : domainOf(w)]).toEqual([s.workoutId, 'GENERAL_ATHLETIC']);
        expect(() => sessionSections(s)).not.toThrow();
        expect(sessionSections(s).length).toBeGreaterThan(0);
      }
    }
  });

  it('every item of every general workout and of every adjusted session exists, is built-in and validates (HE and EN)', () => {
    const sections = [
      ...GENERAL_ATHLETIC_WORKOUTS.flatMap((w) => w.sections),
      ...TRAINING_BLOCKS.flatMap((b) => b.schedule.flatMap((s) => sessionSections(s))),
    ];
    for (const section of sections) {
      expect(section.name[0]).toMatch(HEBREW);
      expect(section.name[1].length).toBeGreaterThan(1);
      for (const item of section.items) {
        const e = builtinExercise(item.exerciseId);
        expect([item.exerciseId, e !== null]).toEqual([item.exerciseId, true]);
        const p = item.dosage
          ? { sets: item.dosage.sets, target: item.dosage.target, loadKg: null, restSec: item.dosage.restSec }
          : defaultPrescription(e!.measurement, e!.defaults);
        expect([item.exerciseId, validatePrescription(e!.measurement, p).ok]).toEqual([item.exerciseId, true]);
        for (const a of item.alternatives ?? []) {
          const ae = builtinExercise(a.exerciseId)!;
          expect(ae).not.toBeNull();
          expect(validatePrescription(ae.measurement, { sets: a.dosage.sets, target: a.dosage.target, loadKg: null, restSec: a.dosage.restSec }).ok).toBe(true);
        }
      }
    }
  });

  it('no explicit prescription is missing its target ("(no target)" never appears)', () => {
    for (const w of GENERAL_ATHLETIC_WORKOUTS) {
      for (const item of w.sections.flatMap((s) => s.items)) {
        if (item.dosage) expect([item.exerciseId, item.dosage.target === null]).toEqual([item.exerciseId, false]);
        for (const a of item.alternatives ?? []) expect(a.dosage.target).not.toBeNull();
      }
    }
  });

  it('each substitution has its OWN prescription: it is never the main item\'s dosage reused for another modality', () => {
    const intervals = professionalWorkout('ATH-CONDITIONING-INTERVALS-01')!;
    const main = intervals.sections.flatMap((s) => s.items).find((i) => i.exerciseId === 'RUN_INTERVALS')!;
    expect(main.alternatives!.map((a) => a.exerciseId)).toEqual(['BIKE_INTERVALS', 'SKI_ERG_INTERVALS', 'ROW_500M', 'JUMP_ROPE']);
    for (const a of main.alternatives!) expect(a.dosage).not.toEqual(main.dosage);
    expect(new Set(main.alternatives!.map((a) => JSON.stringify(a.dosage))).size).toBeGreaterThan(1);
  });

  it('conditioning workouts use ONE modality per session (no shopping list)', () => {
    const base = professionalWorkout('ATH-CONDITIONING-BASE-01')!;
    const baseMain = base.sections.flatMap((s) => s.items.filter((i) => i.dosage));
    expect(baseMain.map((i) => i.exerciseId)).toEqual(['EASY_RUN']);
    const intervals = professionalWorkout('ATH-CONDITIONING-INTERVALS-01')!;
    expect(intervals.sections.flatMap((s) => s.items.filter((i) => i.dosage)).map((i) => i.exerciseId)).toEqual(['RUN_INTERVALS']);
    const repeated = professionalWorkout('ATH-REPEATED-EFFORT-01')!;
    expect(new Set(repeated.sections.flatMap((s) => s.items.filter((i) => i.dosage)).map((i) => i.exerciseId))).toEqual(new Set(['SPRINT_20M']));
  });

  it('plan names are unique within a block and fit the plan-name limit in both languages', () => {
    for (const b of TRAINING_BLOCKS) {
      for (const language of ['he', 'en'] as const) {
        const names = orderedSessions(b).map((s) => planName(b, s, language));
        expect(new Set(names).size).toBe(names.length);
        for (const n of names) {
          expect(n.length).toBeLessThanOrEqual(WORKOUT_NAME_MAX_LENGTH);
          expect(n.length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('adjustments are applied without touching the source workout, and a bad adjustment throws', () => {
    const source = professionalWorkout('ATH-STRENGTH-FULLBODY-A-01')!;
    const before = JSON.stringify(source);
    const out = adjustedSections(source, { sets: { GOBLET_SQUAT: 4 }, omitExercises: ['FACE_PULL'] });
    expect(out.flatMap((s) => s.items).find((i) => i.exerciseId === 'GOBLET_SQUAT')!.dosage!.sets).toBe(4);
    expect(out.flatMap((s) => s.items).some((i) => i.exerciseId === 'FACE_PULL')).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
    expect(() => adjustedSections(source, { sets: { SQUAT_JUMP: 3 } })).toThrow(/does not contain/);
    expect(() => adjustedSections(source, { omitSections: [9] })).toThrow(/does not have/);
    expect(() => adjustedSections(source, { sets: { LEG_SWINGS: 2 } })).toThrow(/no explicit dosage/); // a reused warm-up item
  });
});

describe('GENERAL_ATHLETIC is isolated from Sport', () => {
  it('Sport, SPORTS, V1_ENABLED_SPORTS and CONTENT_SPORTS are exactly as before; athleticism is not a sport', () => {
    expect([...SPORTS]).toEqual(['BASKETBALL', 'FOOTBALL', 'SURFING', 'RUNNING', 'GENERAL_FITNESS', 'SWIMMING', 'TENNIS']);
    expect([...V1_ENABLED_SPORTS]).toEqual(['BASKETBALL']);
    expect([...CONTENT_SPORTS]).toEqual(['BASKETBALL', 'FOOTBALL', 'SURFING']);
    expect([...PROFESSIONAL_SPORTS]).toEqual(['SURFING', 'FOOTBALL', 'BASKETBALL']);
    expect(JSON.stringify(SPORTS)).not.toMatch(/ATHLET/);
  });

  it('the 17 published sport workouts are untouched: still exactly 17, SPORT_SPECIFIC, with a sport; the 13 general ones have no sport', () => {
    expect(PROFESSIONAL_WORKOUTS).toHaveLength(17);
    for (const w of PROFESSIONAL_WORKOUTS) expect([w.id, domainOf(w), w.sport !== null, w.reviewStatus]).toEqual([w.id, 'SPORT_SPECIFIC', true, 'PUBLISHED']);
    for (const w of GENERAL_ATHLETIC_WORKOUTS) expect([w.id, domainOf(w), w.sport]).toEqual([w.id, 'GENERAL_ATHLETIC', null]);
    for (const sport of PROFESSIONAL_SPORTS) {
      expect(professionalWorkoutsFor(sport, null).every((w) => w.sport === sport)).toBe(true);
    }
    expect(professionalWorkoutsFor(null, null)).toHaveLength(17);
    expect(generalWorkoutsFor(null)).toHaveLength(13);
  });

  it('the new exercises carry no sport, so no sport filter or Player sport can pick them up', () => {
    for (const e of ATHLETIC) expect([e.id, e.sports]).toEqual([e.id, []]);
  });
});

describe('provenance and wording', () => {
  it('every new Exercise has a provenance entry with an ORIGINAL_RECOMMENDATION dosage; SOURCE_SUPPORTED rests on an opened or abstract-only source', () => {
    for (const id of NEW_EXERCISE_IDS) {
      const p = PROVENANCE[id]!;
      expect([id, p.dosage]).toEqual([id, 'ORIGINAL_RECOMMENDATION']);
      expect(p.synthesis).toMatch(/Gals Coacher/);
      if (p.topic === 'SOURCE_SUPPORTED') expect(p.sources.some((s) => ['opened', 'abstract only'].includes(SOURCES[s].read))).toBe(true);
    }
    for (const id of ['DROP_LANDING_STICK', 'SINGLE_LEG_HOP_STICK', 'DECEL_STOP', 'RUN_INTERVALS']) expect(PROVENANCE[id]!.topic).toBe('SYNTHESIZED');
  });

  it('claims keep the corrected classification: nothing is SOURCE_SUPPORTED on a source that was not opened', () => {
    for (const b of TRAINING_BLOCKS) {
      for (const d of b.decisions) {
        if (d.evidence === 'SOURCE_SUPPORTED') {
          expect(d.sources.length).toBeGreaterThan(0);
          for (const s of d.sources) expect([s, ['opened', 'abstract only'].includes(SOURCES[s].read)]).toEqual([s, true]);
        }
      }
      for (const s of b.sources) expect(SOURCES[s]).toBeDefined();
    }
    for (const key of ['NSCA-YOUTH-2009', 'YOUTH-RT-2014', 'DECEL-2022'] as const) expect(SOURCES[key].read).toBe('not opened');
    // the progressions the owner required to stay SYNTHESIZED
    const all = TRAINING_BLOCKS.flatMap((b) => b.decisions);
    const find = (text: RegExp) => all.filter((d) => text.test(d.decision[1]));
    for (const d of find(/Landing before jumping|landing before jumping/)) expect(d.evidence).toBe('SYNTHESIZED');
    for (const d of find(/Stopping before sharp|stopping before/)) expect(d.evidence).toBe('SYNTHESIZED');
    for (const d of find(/Strength progression/)) expect(d.evidence).toBe('SYNTHESIZED');
    for (const d of find(/Every set, repetition/)) expect(d.evidence).toBe('ORIGINAL_RECOMMENDATION');
  });

  it('no medical or injury-prevention promise, and no video, in any new Exercise, workout or block', () => {
    const text = JSON.stringify([ATHLETIC, GENERAL_ATHLETIC_WORKOUTS, TRAINING_BLOCKS]).toLowerCase();
    expect(text).not.toMatch(/prevent|injury[- ]prevention|reduce (the )?risk of injur|מניעת פציעות|מונע פציעות|ימנע פציעות/);
    expect(text).not.toMatch(/youtube|https?:\/\//);
  });

  it('the Explosive Power block does not claim a source prescribes eight weeks', () => {
    const d = trainingBlock('EXPLOSIVE-POWER-8W-01')!.decisions.find((x) => /Eight weeks/.test(x.decision[1]))!;
    expect(d.evidence).toBe('ORIGINAL_RECOMMENDATION');
    expect(d.decision[1]).toMatch(/exploratory/);
    expect(d.decision[1]).toMatch(/our own recommendation/);
  });
});

describe('planning the dates', () => {
  const block = trainingBlock('ATHLETICISM-FOUNDATION-6W-01')!;
  const MON = 1;
  const THU = 4;

  it('starts on the first chosen weekday on or after the start date and produces one date per session, ascending', () => {
    const r = planSessionDates(block, { year: 2026, month: 10, day: 21 }, [MON, THU]); // a Wednesday
    if (!r.ok) throw new Error('plan');
    expect(r.dates).toHaveLength(12);
    expect(r.dates[0]).toEqual({ year: 2026, month: 10, day: 22 }); // Thursday
    expect(r.dates[1]).toEqual({ year: 2026, month: 10, day: 26 }); // next Monday
    expect(r.dates.map(weekdayOf).every((d) => d === MON || d === THU)).toBe(true);
    const ms = r.dates.map((d) => Date.UTC(d.year, d.month - 1, d.day));
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    expect(new Set(ms).size).toBe(12);
  });

  it('the 16-session block yields 16 dates; spacing crosses month and year boundaries', () => {
    const r = planSessionDates(trainingBlock('EXPLOSIVE-POWER-8W-01')!, { year: 2026, month: 12, day: 14 }, [MON, THU]);
    if (!r.ok) throw new Error('plan');
    expect(r.dates).toHaveLength(16);
    expect(r.dates.at(-1)!.year).toBe(2027);
  });

  it('refuses a wrong number of days, an invalid or duplicated day, consecutive days (also Saturday + Sunday) and an impossible start date', () => {
    const start = { year: 2026, month: 10, day: 21 };
    expect(planSessionDates(block, start, [MON])).toEqual({ ok: false, error: 'WEEKDAY_COUNT' });
    expect(planSessionDates(block, start, [MON, 9])).toEqual({ ok: false, error: 'WEEKDAY_INVALID' });
    expect(planSessionDates(block, start, [MON, MON])).toEqual({ ok: false, error: 'WEEKDAY_INVALID' });
    expect(planSessionDates(block, start, [MON, 2])).toEqual({ ok: false, error: 'WEEKDAYS_ADJACENT' });
    expect(planSessionDates(block, start, [6, 0])).toEqual({ ok: false, error: 'WEEKDAYS_ADJACENT' });
    expect(planSessionDates(block, { year: 2026, month: 2, day: 30 }, [MON, THU])).toEqual({ ok: false, error: 'START_DATE_INVALID' });
  });

  it('the preview lists every plan that will be created, with its workout and (when scheduled) its date', () => {
    const r = planSessionDates(block, { year: 2026, month: 10, day: 21 }, [MON, THU]);
    if (!r.ok) throw new Error('plan');
    const rows = previewBlock(block, 'en', r.dates);
    expect(rows).toHaveLength(12);
    expect(rows.map((x) => x.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(rows[0]).toMatchObject({ week: 1, slot: 1, workoutId: 'ATH-MOVEMENT-FOUNDATION-01', date: r.dates[0] });
    expect(previewBlock(block, 'he', null).every((x) => x.date === null)).toBe(true);
  });
});
