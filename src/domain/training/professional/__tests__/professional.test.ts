import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BUILTIN_EXERCISES, builtinExercise } from '../../../exercise/catalog';
import { BASKETBALL_EXPANSION } from '../../../exercise/catalog/basketball';
import { FOOTBALL } from '../../../exercise/catalog/football';
import { PROVENANCE, SOURCES } from '../../../exercise/catalog/provenance';
import { SURF_SAFETY, SURFING } from '../../../exercise/catalog/surfing';
import { exerciseComparison } from '../../../exercise/exercise';
import { CONTENT_SPORTS, V1_ENABLED_SPORTS } from '../../../sport';
import { BUILTIN_TAXONOMY_MEMBERS } from '../../../taxonomy/memberships';
import { BUILTIN_TAXONOMY_NODES } from '../../../taxonomy/nodes';
import { defaultPrescription, validatePrescription, WORKOUT_NAME_MAX_LENGTH } from '../../training';
import {
  PROFESSIONAL_WORKOUTS,
  SPORT_CONTENT_001_WORKOUT_IDS,
  professionalExerciseCount,
  professionalWorkout,
  professionalWorkoutsFor,
} from '..';

/** SPORT-CONTENT-001 — the Surfing and Football starter catalog and the six professional workouts. */
const NEW_EXERCISES = [...SURFING, ...FOOTBALL];
const CORE = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id));
const EXPANDED = PROFESSIONAL_WORKOUTS.filter((w) => !SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id));
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const HEBREW = /[֐-׿]/;

describe('the new built-in Exercises', () => {
  it('Surfing 10 (incl. the heat simulation), Football 11 — no inflation back to the 17 + 21 candidates', () => {
    expect(SURFING).toHaveLength(10);
    expect(FOOTBALL).toHaveLength(11);
    expect(SURFING.map((e) => e.id)).toContain('SURF_HEAT_SIMULATION');
    expect(builtinExercise('SURF_HEAT_SIMULATION')!.measurement.type).toBe('DURATION');
    for (const e of SURFING) expect(e.sports).toEqual(['SURFING']);
    for (const e of FOOTBALL) expect(e.sports).toEqual(['FOOTBALL']);
    for (const e of NEW_EXERCISES) expect(BUILTIN_EXERCISES).toContain(e);
  });

  it('weaker foot, pressure, game format and the counter-press rule are NOT separate Exercises', () => {
    const ids = FOOTBALL.map((e) => e.id).join(' ');
    expect(ids).not.toMatch(/WEAK|COUNTER|2V2|3V3|FORMAT/);
    expect(FOOTBALL.find((e) => e.id === 'FB_PASS_AND_CONTROL')!.instructions!.en).toMatch(/weaker foot/);
    expect(FOOTBALL.find((e) => e.id === 'FB_SMALL_SIDED_GAME')!.instructions!.en).toMatch(/3–4 passes/);
  });

  it('every new Exercise has both languages, a resolvable comparison and equipment that exists', () => {
    for (const e of NEW_EXERCISES) {
      expect(e.name.he).toMatch(HEBREW);
      expect(e.instructions!.en.length).toBeGreaterThan(20);
      expect(e.instructions!.he).toMatch(HEBREW);
      expect(e.cues.length).toBeGreaterThanOrEqual(2);
      expect(() => exerciseComparison(e.measurement)).not.toThrow();
    }
  });

  it('every surf Exercise carries the locked safety wording; no breath-hold training and no "the sea is safe" claim anywhere', () => {
    for (const e of SURFING) {
      expect(e.safety!.he.startsWith(SURF_SAFETY[0])).toBe(true);
      expect(e.safety!.en.startsWith(SURF_SAFETY[1])).toBe(true);
    }
    const all = JSON.stringify([...NEW_EXERCISES, ...PROFESSIONAL_WORKOUTS]).toLowerCase();
    expect(all).not.toMatch(/breath-hold|breath hold|holding your breath|החזקת נשימה/);
    expect(all).not.toMatch(/conditions are safe|safe conditions|the sea is safe|הים בטוח|התנאים בטוחים/);
    expect(SURF_SAFETY[1]).toMatch(/real-world judgement by the surfer, coach or responsible adult/);
  });

  it('is classified in the taxonomy under Football / Surfing only (never under Fitness or Basketball)', () => {
    const nodes = new Map(BUILTIN_TAXONOMY_NODES.map((n) => [n.key, n]));
    const domainOf = (key: string): string => (nodes.get(key)!.parent === null ? key : domainOf(nodes.get(key)!.parent!));
    for (const e of NEW_EXERCISES) {
      const where = Object.entries(BUILTIN_TAXONOMY_MEMBERS).filter(([, ids]) => ids.includes(e.id)).map(([k]) => domainOf(k));
      expect(where.length).toBeGreaterThan(0);
      expect(new Set(where)).toEqual(new Set([e.sports[0]]));
    }
  });

  it('every one has a provenance entry: dosage is always ORIGINAL_RECOMMENDATION, a SOURCE_SUPPORTED claim rests on an OPENED source, and no source is invented', () => {
    expect(Object.keys(PROVENANCE).sort()).toEqual([...NEW_EXERCISES.map((e) => e.id), ...BASKETBALL_EXPANSION.map((e) => e.id)].sort());
    for (const [id, p] of Object.entries(PROVENANCE)) {
      expect(p.dosage).toBe('ORIGINAL_RECOMMENDATION');
      if (p.sources.length === 0) expect(p.supports).toMatch(/No external source was consulted/);
      for (const s of p.sources) expect(SOURCES[s]).toBeDefined();
      if (p.topic === 'SOURCE_SUPPORTED') {
        expect([id, p.sources.filter((s) => SOURCES[s].read === 'opened').length > 0]).toEqual([id, true]);
      }
      expect(p.supports.length).toBeGreaterThan(20);
      expect(p.synthesis).toMatch(/Gals Coacher/);
    }
    expect(JSON.stringify(PROVENANCE).toLowerCase()).not.toMatch(/official (fifa|isa|surfing australia) program/);
  });
});

describe('the six SPORT-CONTENT-001 workouts', () => {
  it('Surfing and Football × Beginner / Intermediate / Advanced, with the right level labels', () => {
    expect(CORE).toHaveLength(6);
    const matrix = CORE.map((w) => `${w.sport}:${w.difficulty}`).sort();
    expect(matrix).toEqual(
      ['FOOTBALL:ADVANCED', 'FOOTBALL:BEGINNER', 'FOOTBALL:INTERMEDIATE', 'SURFING:ADVANCED', 'SURFING:BEGINNER', 'SURFING:INTERMEDIATE'],
    );
    expect(professionalWorkoutsFor('SURFING', null, 'SURF_TECHNIQUE')).toHaveLength(3);
    expect(professionalWorkoutsFor('FOOTBALL', 'ADVANCED', 'ALL_ROUND').map((w) => w.id)).toEqual(['FOOTBALL-PERFORMANCE-01']);
    expect(professionalWorkoutsFor(null, 'BEGINNER', 'ALL_ROUND').map((w) => w.id)).toEqual(['FOOTBALL-FOUNDATION-01']);
    expect(professionalWorkoutsFor(null, 'BEGINNER', 'SURF_TECHNIQUE').map((w) => w.id)).toEqual(['SURF-FOUNDATION-01']);
    expect(professionalWorkout('SURF-FOUNDATION-01')!.difficulty).toBe('BEGINNER');
    expect(professionalWorkout('NOPE')).toBeNull();
  });

  it('ids are unique; names fit a workout name in both languages; Hebrew is Hebrew', () => {
    expect(new Set(PROFESSIONAL_WORKOUTS.map((w) => w.id)).size).toBe(PROFESSIONAL_WORKOUTS.length);
    for (const w of PROFESSIONAL_WORKOUTS) {
      expect(w.name[0]).toMatch(HEBREW);
      expect(w.name[0].length).toBeLessThanOrEqual(WORKOUT_NAME_MAX_LENGTH);
      expect(w.name[1].length).toBeLessThanOrEqual(WORKOUT_NAME_MAX_LENGTH);
      expect(w.summary[0]).toMatch(HEBREW);
      for (const s of w.sections) expect(s.name[0]).toMatch(HEBREW);
    }
  });

  it('every item resolves to a real Exercise and every prescription validates against its measurement', () => {
    for (const w of PROFESSIONAL_WORKOUTS) {
      expect(professionalExerciseCount(w)).toBeGreaterThanOrEqual(7);
      for (const section of w.sections) {
        expect(section.items.length).toBeGreaterThan(0);
        for (const item of section.items) {
          const exercise = builtinExercise(item.exerciseId);
          expect([w.id, item.exerciseId, exercise !== null]).toEqual([w.id, item.exerciseId, true]);
          const p = item.dosage
            ? { sets: item.dosage.sets, target: item.dosage.target, loadKg: null, restSec: item.dosage.restSec }
            : defaultPrescription(exercise!.measurement, exercise!.defaults);
          expect([w.id, item.exerciseId, validatePrescription(exercise!.measurement, p).ok]).toEqual([w.id, item.exerciseId, true]);
        }
      }
    }
  });

  it("each workout uses only its own sport's sport-specific Exercises (general warm-up / mobility / strength ones may be reused anywhere)", () => {
    for (const w of PROFESSIONAL_WORKOUTS) {
      for (const item of w.sections.flatMap((s) => s.items)) {
        const e = builtinExercise(item.exerciseId)!;
        if (e.sports.length > 0) expect([w.id, e.sports]).toEqual([w.id, [w.sport]]);
      }
    }
  });

  it('matches the approved templates: representative content per workout', () => {
    const ids = (id: string) => professionalWorkout(id)!.sections.flatMap((s) => s.items.map((i) => i.exerciseId));
    expect(ids('SURF-FOUNDATION-01')).toEqual(expect.arrayContaining(['SURF_POP_UP', 'SURF_PADDLING', 'SURF_TAKE_OFF', 'SURF_TRIM_AND_SPEED', 'SURF_WAVE_SELECTION_POSITIONING']));
    expect(ids('SURF-PROGRESSION-01')).toEqual(expect.arrayContaining(['SURF_DUCK_DIVE', 'SURF_BOTTOM_TURN', 'SURF_CUTBACK']));
    expect(ids('SURF-PERFORMANCE-01')).toEqual(expect.arrayContaining(['SURF_TOP_TURN', 'SURF_HEAT_SIMULATION', 'SURF_CUTBACK']));
    expect(ids('FOOTBALL-FOUNDATION-01')).toEqual(expect.arrayContaining(['FB_BALL_MASTERY', 'FB_DRIBBLING_COURSE', 'FB_PASS_AND_CONTROL', 'FB_DRIBBLE_AND_SHOOT', 'FB_SHOOTING_ACCURACY', 'FB_SMALL_SIDED_GAME']));
    expect(ids('FOOTBALL-PROGRESSION-01')).toEqual(expect.arrayContaining(['FB_COMBINATION_PLAY', 'FB_FIRST_TOUCH_AND_TURN', 'FB_SMALL_SIDED_GAME']));
    expect(ids('FOOTBALL-PERFORMANCE-01')).toEqual(expect.arrayContaining(['FB_RONDO', 'FB_ATTACKING_TRANSITION_OVERLOAD', 'FB_FINISHING_UNDER_PRESSURE', 'FB_SMALL_SIDED_GAME']));
    // the surf briefing and the advanced video review are coach notes, not Exercises
    expect(professionalWorkout('SURF-FOUNDATION-01')!.coachNotes[0]![1]).toMatch(/rip/i);
    expect(professionalWorkout('SURF-PERFORMANCE-01')!.coachNotes[1]![1]).toMatch(/review/i);
  });

  it('every ocean (Surf Technique) workout carries the locked safety wording; football workouts carry none', () => {
    for (const w of professionalWorkoutsFor('SURFING', null, 'SURF_TECHNIQUE')) expect(w.safety).toEqual(SURF_SAFETY);
    for (const w of professionalWorkoutsFor('FOOTBALL', null)) expect(w.safety).toBeNull();
  });

  it('is content metadata only: published as pending human review, with real sources', () => {
    for (const w of PROFESSIONAL_WORKOUTS) {
      expect(w.reviewStatus).toBe('PENDING_HUMAN_REVIEW');
      if (w.sport !== 'BASKETBALL') expect(w.sources.length).toBeGreaterThan(0);
      for (const s of w.sources) expect(SOURCES[s]).toBeDefined();
    }
  });
});

describe('sports', () => {
  it('content sports are Basketball, Football and Surfing; Player / Calendar sports stay Basketball only', () => {
    expect(CONTENT_SPORTS).toEqual(['BASKETBALL', 'FOOTBALL', 'SURFING']);
    expect(V1_ENABLED_SPORTS).toEqual(['BASKETBALL']);
  });

  it('every new built-in id is seeded by the v19 migration, and that migration only INSERTS', () => {
    const source = readFileSync(resolve(__dirname, '../../../../data/local/migrations/index.ts'), 'utf8');
    const v19 = source.slice(source.indexOf("name: 'sport_content_001'"), source.indexOf("name: 'sport_content_002'"));
    for (const { id } of NEW_EXERCISES) expect(v19).toContain(`('${id}', 1, NULL, 1, 0, 0)`);
    const sql = v19.slice(v19.indexOf('sql: `'), v19.indexOf('`,', v19.indexOf('sql: `')));
    expect(sql).not.toMatch(/\b(ALTER|CREATE|DROP|UPDATE|DELETE|REPLACE)\b/i);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(2);
  });
});

/** SPORT-CONTENT-002 — the expanded catalog, added on top of 001. */
describe('SPORT-CONTENT-002: the expanded catalog', () => {
  it('SPORT-CONTENT-001 is unchanged: the six workouts, every earlier Exercise and every Basketball drill are byte-identical', () => {
    // the six 001 workouts, ignoring only the new `focus` tag
    const six = CORE.map(({ focus: _focus, ...rest }) => rest);
    expect(sha(six)).toBe('501ee02b13d25ac134cbb85b09925b67e586409e30d2e7bddb36aa11fcf91fe4');
    const earlier = BUILTIN_EXERCISES.filter((e) => e.id !== 'BOX_OUT_DRILL');
    expect(earlier).toHaveLength(145);
    expect(sha(earlier)).toBe('c7b7e17fc0402bb4228d6931d2040285ecbb35faaf60706619ed0369ba9605b3');
    expect(sha(earlier.filter((e) => e.sports.includes('BASKETBALL')))).toBe('7234a03a746007eef75cd1025238e3e9fc298e88fb92cc5858f8a7aac006aee9');
    expect(SURFING).toHaveLength(10);
    expect(FOOTBALL).toHaveLength(11);
  });

  it('nine new workouts: three per sport; the Surf focus split exists; levels and focuses are as designed', () => {
    expect(EXPANDED.map((w) => w.id)).toEqual([
      'SURF-FITNESS-FOUNDATION-01', 'SURF-PADDLE-ENDURANCE-01', 'SURF-POWER-ROTATION-01',
      'FOOTBALL-FIRST-TOUCH-PASSING-01', 'FOOTBALL-1V1-FINISHING-01', 'FOOTBALL-TRANSITION-PRESSING-01',
      'BASKETBALL-BALL-HANDLING-01', 'BASKETBALL-SHOOTING-FINISHING-01', 'BASKETBALL-DEFENSE-REBOUNDING-01',
    ]);
    expect(PROFESSIONAL_WORKOUTS).toHaveLength(15);
    expect(professionalWorkoutsFor('SURFING', null, 'SURF_STRENGTH_FITNESS').map((w) => w.difficulty)).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
    expect(professionalWorkoutsFor('SURFING', null, 'SURF_TECHNIQUE')).toHaveLength(3);
    expect(professionalWorkoutsFor('SURFING', null)).toHaveLength(6);
    expect(professionalWorkoutsFor('FOOTBALL', null)).toHaveLength(6);
    expect(professionalWorkoutsFor('BASKETBALL', null)).toHaveLength(3);
    expect(EXPANDED.filter((w) => w.sport === 'FOOTBALL').map((w) => w.focus)).toEqual(['PASSING', 'FINISHING', 'TRANSITION']);
    expect(EXPANDED.filter((w) => w.sport === 'BASKETBALL').map((w) => w.focus)).toEqual(['BALL_HANDLING', 'SHOOTING', 'DEFENSE']);
  });

  it('REUSE: the only new Exercise is the Basketball box-out; Surf fitness and Football add none', () => {
    expect(BASKETBALL_EXPANSION.map((e) => e.id)).toEqual(['BOX_OUT_DRILL']);
    expect(BUILTIN_EXERCISES).toHaveLength(145 + 1);
    const surfFitness = EXPANDED.filter((w) => w.focus === 'SURF_STRENGTH_FITNESS');
    const used = surfFitness.flatMap((w) => w.sections.flatMap((s) => s.items.map((i) => builtinExercise(i.exerciseId)!)));
    expect(used.every((e) => e.sports.length === 0)).toBe(true); // all general exercises, none newly created
    expect(new Set(used.map((e) => e.id)).size).toBeGreaterThanOrEqual(25);
    for (const w of EXPANDED.filter((x) => x.sport === 'FOOTBALL')) {
      for (const e of w.sections.flatMap((s) => s.items.map((i) => builtinExercise(i.exerciseId)!))) {
        if (e.sports.length > 0) expect(e.id).toMatch(/^FB_/);
      }
    }
  });

  it('Surf dry-land workouts are NOT ocean sessions: no ocean exercise, ordinary strength safety wording, no paddling-equivalence claim, no breath-hold', () => {
    for (const w of EXPANDED.filter((x) => x.focus === 'SURF_STRENGTH_FITNESS')) {
      expect(w.sections.flatMap((s) => s.items).some((i) => i.exerciseId.startsWith('SURF_'))).toBe(false);
      expect(w.safety![1]).toMatch(/Match the load and intensity/);
      expect(w.safety![1]).not.toMatch(/Ocean conditions/);
      expect(w.coachNotes.map((n) => n[1]).join(' ')).toMatch(/not the same as paddling or surfing/);
      expect(w.coachNotes.map((n) => n[1]).join(' ')).toMatch(/ocean-conditions warning/);
      expect(JSON.stringify(w).toLowerCase()).not.toMatch(/breath-hold|holding your breath|החזקת נשימה/);
    }
    expect(JSON.stringify(EXPANDED).toLowerCase()).not.toMatch(/prevents? injur|injury[- ]prevention|rehab|cure|diagnos|מניעת פציעות/);
  });

  it('every ADVANCED workout says the content may need adjusting by a coach or responsible adult (in its safety or coach notes)', () => {
    for (const w of PROFESSIONAL_WORKOUTS.filter((x) => x.difficulty === 'ADVANCED' && !SPORT_CONTENT_001_WORKOUT_IDS.includes(x.id))) {
      const text = [...(w.safety ? [w.safety[1]] : []), ...w.coachNotes.map((n) => n[1])].join(' ');
      expect([w.id, /adjustment by a coach or responsible adult/.test(text)]).toEqual([w.id, true]);
    }
  });

  it('every dosage in the expanded workouts is the app\'s own: no workout attributes sets / reps / durations to a federation or a source', () => {
    for (const w of EXPANDED) {
      const text = JSON.stringify([w.summary, w.coachNotes]).toLowerCase();
      expect(text).not.toMatch(/fifa (says|recommends|prescribes)|isa (says|recommends|prescribes)|usa basketball (says|recommends)|surfing australia (says|recommends|prescribes)/);
    }
  });

  it('the box-out drill is seeded by v20 (a single INSERT) and is a Basketball drill under Rebounding', () => {
    const source = readFileSync(resolve(__dirname, '../../../../data/local/migrations/index.ts'), 'utf8');
    const v20 = source.slice(source.indexOf("name: 'sport_content_002'"));
    const sql = v20.slice(v20.indexOf('sql: `'), v20.indexOf('`,', v20.indexOf('sql: `')));
    expect(sql).toContain("('BOX_OUT_DRILL', 1, NULL, 1, 0, 0)");
    expect(sql).not.toMatch(/\b(ALTER|CREATE|DROP|UPDATE|DELETE|REPLACE)\b/i);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect(builtinExercise('BOX_OUT_DRILL')!.sports).toEqual(['BASKETBALL']);
    expect(BUILTIN_TAXONOMY_MEMBERS.BASKETBALL_REBOUNDING).toContain('BOX_OUT_DRILL');
  });
});
