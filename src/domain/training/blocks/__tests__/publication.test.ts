import { builtinExercise } from '../../../exercise/catalog';
import { ATHLETIC } from '../../../exercise/catalog/athletic';
import { PROVENANCE } from '../../../exercise/catalog/provenance';
import { adjustedSections } from '../../professional/adjust';
import { GENERAL_ATHLETIC_WORKOUTS, PROFESSIONAL_WORKOUTS, professionalWorkout } from '../../professional';
import { TRAINING_BLOCKS } from '..';

/** TRAINING-BLOCKS-001 — the focused publication gate: statuses, stable ids, every reference, and nothing else rewritten. */
const HEBREW = /[֐-׿]/;

describe('publication gate', () => {
  it('all 6 Training Blocks and all 13 general workouts are PUBLISHED; nothing newly approved is still PENDING_HUMAN_REVIEW', () => {
    expect(TRAINING_BLOCKS).toHaveLength(6);
    expect(GENERAL_ATHLETIC_WORKOUTS).toHaveLength(13);
    for (const x of [...TRAINING_BLOCKS, ...GENERAL_ATHLETIC_WORKOUTS]) expect([x.id, x.reviewStatus]).toEqual([x.id, 'PUBLISHED']);
    expect(JSON.stringify([TRAINING_BLOCKS, GENERAL_ATHLETIC_WORKOUTS])).not.toContain('PENDING_HUMAN_REVIEW');
  });

  it('the 6 new Exercises are built-in, have provenance, and carry no sport', () => {
    expect(ATHLETIC.map((e) => e.id)).toEqual(['DROP_LANDING_STICK', 'SINGLE_LEG_HOP_STICK', 'DECEL_STOP', 'PARTNER_MIRROR_DRILL', 'COACH_CUE_REACTION_SPRINT', 'RUN_INTERVALS']);
    for (const e of ATHLETIC) {
      expect(builtinExercise(e.id)).toBe(e);
      expect(PROVENANCE[e.id]!.dosage).toBe('ORIGINAL_RECOMMENDATION'); // publication keeps the evidence labels
      expect(e.sports).toEqual([]);
    }
  });

  it('stable ids are exactly the approved ones', () => {
    expect(TRAINING_BLOCKS.map((b) => b.id)).toEqual(['ATHLETICISM-FOUNDATION-6W-01', 'EXPLOSIVE-POWER-8W-01', 'SPEED-ACCELERATION-6W-01', 'AGILITY-COD-6W-01', 'STRENGTH-FOUNDATION-6W-01', 'CONDITIONING-6W-01']);
    expect(GENERAL_ATHLETIC_WORKOUTS.map((w) => w.id)).toEqual([
      'ATH-MOVEMENT-FOUNDATION-01', 'ATH-STRENGTH-FULLBODY-A-01', 'ATH-STRENGTH-FULLBODY-B-01', 'ATH-JUMP-LANDING-01', 'ATH-EXPLOSIVE-LOWER-01', 'ATH-ROTATIONAL-POWER-01', 'ATH-ACCELERATION-01',
      'ATH-SPEED-01', 'ATH-DECEL-COD-01', 'ATH-REACTIVE-AGILITY-01', 'ATH-CONDITIONING-BASE-01', 'ATH-CONDITIONING-INTERVALS-01', 'ATH-REPEATED-EFFORT-01',
    ]);
    expect(TRAINING_BLOCKS.map((b) => [b.weeks, b.sessionsPerWeek, b.weeks * b.sessionsPerWeek])).toEqual([[6, 2, 12], [8, 2, 16], [6, 2, 12], [6, 2, 12], [6, 2, 12], [6, 2, 12]]);
  });

  it('every block → workout → exercise (and every alternative) reference resolves, and every progression override is valid', () => {
    for (const b of TRAINING_BLOCKS) {
      for (const s of b.schedule) {
        const w = professionalWorkout(s.workoutId);
        expect([b.id, s.workoutId, w !== null]).toEqual([b.id, s.workoutId, true]);
        expect(() => adjustedSections(w!, s.adjust)).not.toThrow();
        expect(s.label[0]).toMatch(HEBREW);
        expect(s.label[1].length).toBeGreaterThan(1);
      }
    }
    for (const w of GENERAL_ATHLETIC_WORKOUTS) {
      expect(w.name[0]).toMatch(HEBREW);
      for (const i of w.sections.flatMap((s) => s.items)) {
        expect(builtinExercise(i.exerciseId)).not.toBeNull();
        for (const a of i.alternatives ?? []) expect(builtinExercise(a.exerciseId)).not.toBeNull();
      }
    }
  });

  it('the legacy sport content is untouched: still 17 PUBLISHED sport workouts, none with a time semantics', () => {
    expect(PROFESSIONAL_WORKOUTS).toHaveLength(17);
    for (const w of PROFESSIONAL_WORKOUTS) expect([w.id, w.reviewStatus, w.sport !== null]).toEqual([w.id, 'PUBLISHED', true]);
    expect(JSON.stringify(PROFESSIONAL_WORKOUTS)).not.toContain('timeSemantics');
  });
});
