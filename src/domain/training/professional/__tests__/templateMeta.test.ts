import { PROFESSIONAL_WORKOUTS, GENERAL_ATHLETIC_WORKOUTS, PUBLISHED_WORKOUT_TEMPLATES, professionalWorkout } from '..';
import { TEMPLATE_PROVENANCE } from '../templateProvenance';
import { WORKOUT_TEMPLATE_DRAFTS, WORKOUT_TEMPLATES_001_IDS } from '../templates';
import {
  SECTION_ROLE_NAMES,
  WORKOUT_CATEGORIES,
  audienceProblem,
  categoryOf,
  newTemplateProblem,
  planSectionName,
  roleFromPlanSectionName,
} from '../templateMeta';
import { SECTION_ROLES, TEMPLATE_AUDIENCES, audienceOf } from '../types';

/** WORKOUT-TEMPLATES-001 S0 / S1: registry metadata, section roles, the quality rule for NEW templates, draft status. */
describe('section roles and canonical names', () => {
  it('four roles; the three standard roles have a canonical name in each language', () => {
    expect([...SECTION_ROLES]).toEqual(['WARM_UP', 'MAIN', 'COOL_DOWN', 'CUSTOM']);
    expect(SECTION_ROLE_NAMES).toEqual({ WARM_UP: ['חימום', 'Warm-up'], MAIN: ['אימון מרכזי', 'Main workout'], COOL_DOWN: ['שחרור', 'Cool-down'] });
  });
  it('a plan section name maps to a role only by the exact canonical name (either language); anything else is CUSTOM', () => {
    expect(roleFromPlanSectionName('Warm-up')).toBe('WARM_UP');
    expect(roleFromPlanSectionName(' חימום ')).toBe('WARM_UP');
    expect(roleFromPlanSectionName('Main workout')).toBe('MAIN');
    expect(roleFromPlanSectionName('שחרור')).toBe('COOL_DOWN');
    expect(roleFromPlanSectionName('Pre-surf activation')).toBe('CUSTOM');
    expect(roleFromPlanSectionName('Warm-up routine')).toBe('CUSTOM');
  });
  it("the name written to a plan: canonical for a standard role, the author's own for CUSTOM", () => {
    expect(planSectionName('MAIN', 'ignored', 'en')).toBe('Main workout');
    expect(planSectionName('COOL_DOWN', 'ignored', 'he')).toBe('שחרור');
    expect(planSectionName('CUSTOM', 'Throws', 'en')).toBe('Throws');
  });
});

describe('the 12 NEW built-in drafts', () => {
  it('exactly the 12 approved templates, with stable unique ids (Upper / Lower Volume deferred)', () => {
    expect(WORKOUT_TEMPLATES_001_IDS).toEqual([
      'GYM-BEG-FULLBODY-A', 'GYM-BEG-FULLBODY-B', 'GYM-INT-UPPER-A', 'GYM-INT-LOWER-A', 'GYM-INT-UPPER-B', 'GYM-INT-LOWER-B',
      'GYM-ADV-PUSH', 'GYM-ADV-PULL', 'GYM-ADV-LEGS', 'CORE-FOUNDATION-01', 'MOBILITY-FULLBODY-01', 'RECOVERY-EASY-01',
    ]);
    expect(new Set(WORKOUT_TEMPLATES_001_IDS).size).toBe(12);
  });
  it.each(WORKOUT_TEMPLATE_DRAFTS.map((w) => [w.id, w] as const))('%s: Warm-up, Main, Cool-down; ids resolve; dosage valid; main has 3+ exercises', (_id, w) => {
    expect(newTemplateProblem(w)).toBeNull();
    expect(w.sections.map((s) => s.role)).toEqual(['WARM_UP', 'MAIN', 'COOL_DOWN']);
    expect(w.sections.map((s) => s.name[1])).toEqual(['Warm-up', 'Main workout', 'Cool-down']);
  });
  it('every draft is PENDING_HUMAN_REVIEW: none is published, none is in the user-visible list', () => {
    for (const w of WORKOUT_TEMPLATE_DRAFTS) expect([w.id, w.reviewStatus]).toEqual([w.id, 'PENDING_HUMAN_REVIEW']);
    const shown = new Set(PUBLISHED_WORKOUT_TEMPLATES.map((w) => w.id));
    for (const id of WORKOUT_TEMPLATES_001_IDS) expect(shown.has(id)).toBe(false);
    expect(PUBLISHED_WORKOUT_TEMPLATES).toHaveLength(30); // the grandfathered 17 sport + 13 general workouts, unchanged
  });
  it('the 30 PUBLISHED workouts are unchanged by this feature (grandfathered: no role added, no section appended)', () => {
    expect(PROFESSIONAL_WORKOUTS).toHaveLength(17);
    expect(GENERAL_ATHLETIC_WORKOUTS).toHaveLength(13);
    for (const w of [...PROFESSIONAL_WORKOUTS, ...GENERAL_ATHLETIC_WORKOUTS]) {
      expect(w.reviewStatus).toBe('PUBLISHED');
      for (const s of w.sections) expect(s.role).toBeUndefined();
    }
  });
  it('a draft is still resolvable by id (import in tests / the review sheet) but is never listed', () => {
    expect(professionalWorkout('GYM-ADV-PUSH')?.id).toBe('GYM-ADV-PUSH');
  });
  it('heavy barbell work is audience EXPERIENCED_OR_SUPERVISED; the audience values are the two approved ones', () => {
    expect([...TEMPLATE_AUDIENCES]).toEqual(['GENERAL', 'EXPERIENCED_OR_SUPERVISED']);
    for (const w of WORKOUT_TEMPLATE_DRAFTS) expect([w.id, audienceProblem(w)]).toEqual([w.id, null]);
    expect(audienceOf(professionalWorkout('GYM-INT-LOWER-A')!)).toBe('EXPERIENCED_OR_SUPERVISED');
    expect(audienceOf(professionalWorkout('GYM-BEG-FULLBODY-A')!)).toBe('GENERAL');
    expect(audienceOf(PROFESSIONAL_WORKOUTS[0]!)).toBe('GENERAL'); // absent = GENERAL
  });
  it('no template makes an injury-prevention or medical claim, and no decision is marked SOURCE_SUPPORTED', () => {
    const claim = /injur|prevent|rehab|cure|medical|therap/i;
    for (const w of WORKOUT_TEMPLATE_DRAFTS) {
      const text = [...w.name, ...w.summary, ...w.coachNotes.flat()].join(' ');
      expect([w.id, claim.test(text)]).toEqual([w.id, false]);
      const prov = TEMPLATE_PROVENANCE[w.id]!;
      expect(prov.length).toBeGreaterThan(0);
      for (const d of prov) expect([w.id, d.evidence === 'SOURCE_SUPPORTED']).toEqual([w.id, false]);
      expect(prov.some((d) => d.evidence === 'ORIGINAL_RECOMMENDATION')).toBe(true);
    }
  });
  it('the quality rule rejects a template that lacks a cool-down, and one with an unknown exercise', () => {
    const w = WORKOUT_TEMPLATE_DRAFTS[0]!;
    expect(newTemplateProblem({ ...w, sections: w.sections.slice(0, 2) })).toMatch(/WARM_UP, MAIN, COOL_DOWN/);
    expect(newTemplateProblem({ ...w, sections: [w.sections[0]!, { ...w.sections[1]!, items: [{ exerciseId: 'NOPE' }, ...w.sections[1]!.items] }, w.sections[2]!] })).toMatch(/unknown exercise NOPE/);
  });
});

describe('categories come from focus + sport (never from the exercise taxonomy)', () => {
  it('the thirteen approved categories', () => {
    expect([...WORKOUT_CATEGORIES]).toEqual(['STRENGTH', 'HYPERTROPHY_GYM', 'ATHLETICISM', 'EXPLOSIVE_POWER', 'SPEED', 'AGILITY_COD', 'CONDITIONING', 'CORE', 'MOBILITY', 'RECOVERY', 'BASKETBALL', 'FOOTBALL', 'SURFING']);
  });
  it('a sport workout takes its sport; a general one the category of its focus; the drafts map as designed', () => {
    expect(categoryOf(professionalWorkout('SURF-FOUNDATION-01')!)).toBe('SURFING');
    expect(categoryOf(professionalWorkout('FOOTBALL-FOUNDATION-01')!)).toBe('FOOTBALL');
    expect(categoryOf(professionalWorkout('BASKETBALL-BALL-HANDLING-01')!)).toBe('BASKETBALL');
    expect(categoryOf(professionalWorkout('ATH-ACCELERATION-01')!)).toBe('SPEED');
    expect(categoryOf(professionalWorkout('ATH-DECEL-COD-01')!)).toBe('AGILITY_COD');
    expect(categoryOf(professionalWorkout('ATH-JUMP-LANDING-01')!)).toBe('EXPLOSIVE_POWER');
    expect(categoryOf(professionalWorkout('ATH-CONDITIONING-BASE-01')!)).toBe('CONDITIONING');
    expect(categoryOf(professionalWorkout('ATH-STRENGTH-FULLBODY-A-01')!)).toBe('STRENGTH');
    expect(categoryOf(professionalWorkout('GYM-ADV-PULL')!)).toBe('HYPERTROPHY_GYM');
    expect(categoryOf(professionalWorkout('CORE-FOUNDATION-01')!)).toBe('CORE');
    expect(categoryOf(professionalWorkout('MOBILITY-FULLBODY-01')!)).toBe('MOBILITY');
    expect(categoryOf(professionalWorkout('RECOVERY-EASY-01')!)).toBe('RECOVERY');
  });
  it('every PUBLISHED workout is categorised', () => {
    for (const w of PUBLISHED_WORKOUT_TEMPLATES) expect([w.id, categoryOf(w) !== null]).toEqual([w.id, true]);
  });
});
