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
  SPORT_CONTENT_002_WORKOUT_IDS,
  SPORT_CONTENT_003_WORKOUT_IDS,
  professionalExerciseCount,
  professionalWorkout,
  professionalWorkoutsFor,
} from '..';
import { IBBC_CANDIDATE_VIDEOS } from '../ibbc';

/** SPORT-CONTENT-001 — the Surfing and Football starter catalog and the six professional workouts. */
const NEW_EXERCISES = [...SURFING, ...FOOTBALL];
const CORE = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id));
const EXPANDED = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_002_WORKOUT_IDS.includes(w.id));
const IBBC = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_003_WORKOUT_IDS.includes(w.id));
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
    // the reviewed wording itself says "the app does not determine whether conditions are safe" — remove it before checking for any other claim
    const all = JSON.stringify([...NEW_EXERCISES, ...PROFESSIONAL_WORKOUTS])
      .replaceAll(SURF_SAFETY[0], '')
      .replaceAll(SURF_SAFETY[1], '')
      .toLowerCase();
    expect(all).not.toMatch(/breath-hold|breath hold|holding your breath|החזקת נשימה/);
    expect(all).not.toMatch(/conditions are safe|safe conditions|the sea is safe|הים בטוח|התנאים בטוחים/);
    expect(SURF_SAFETY[1]).toMatch(/assessed in person by the surfer, coach, or responsible adult/);
    expect(SURF_SAFETY[1]).toMatch(/The app does not determine whether conditions are safe\./);
    expect(SURF_SAFETY[0]).toMatch(/האפליקציה אינה קובעת אם תנאי הים בטוחים/);
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
    expect(sha(six)).toBe('75e987ca685be52fca0b7679e77c23e967dd4e15d8f6b21b346ede76399594b5');
    const earlier = BUILTIN_EXERCISES.filter((e) => e.id !== 'BOX_OUT_DRILL');
    expect(earlier).toHaveLength(145);
    expect(sha(earlier)).toBe('c69054985860296add49c4e8ea34807b7ef97b7122c5d4ba6eb211c5528959e7');
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
    expect(PROFESSIONAL_WORKOUTS).toHaveLength(17);
    expect(professionalWorkoutsFor('SURFING', null, 'SURF_STRENGTH_FITNESS').map((w) => w.difficulty)).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
    expect(professionalWorkoutsFor('SURFING', null, 'SURF_TECHNIQUE')).toHaveLength(3);
    expect(professionalWorkoutsFor('SURFING', null)).toHaveLength(6);
    expect(professionalWorkoutsFor('FOOTBALL', null)).toHaveLength(6);
    expect(professionalWorkoutsFor('BASKETBALL', null)).toHaveLength(5);
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

/** SPORT-CONTENT-003 — two beginner Basketball workouts that LINK the IBBC beginner page's videos as reference material. */
describe('SPORT-CONTENT-003: reference videos from the IBBC beginner page (no new Exercise, no migration)', () => {
  it('two beginner workouts built ONLY from existing built-in Exercises: no Exercise was created from a video', () => {
    expect(IBBC.map((w) => w.id)).toEqual(['BASKETBALL-BEGINNER-BALL-FEEL-01', 'BASKETBALL-BEGINNER-SHOOT-LAYUP-01']);
    expect(BUILTIN_EXERCISES).toHaveLength(145 + 1); // unchanged by this slice: only the SPORT-CONTENT-002 box-out was added
    for (const w of IBBC) {
      expect([w.sport, w.difficulty, w.focus, w.sources]).toEqual(['BASKETBALL', 'BEGINNER', 'FUNDAMENTALS', ['IBBC-BEGINNER']]);
      expect(w.name[0].length).toBeLessThanOrEqual(WORKOUT_NAME_MAX_LENGTH);
      expect(w.name[1].length).toBeLessThanOrEqual(WORKOUT_NAME_MAX_LENGTH);
      for (const item of w.sections.flatMap((s) => s.items)) {
        const e = builtinExercise(item.exerciseId)!;
        expect(e).not.toBeNull();
        expect(e.tutorialUrl).toBeNull(); // no video is attached to any Exercise
        if (e.sports.length > 0) expect(e.sports).toEqual(['BASKETBALL']);
        const p = item.dosage ? { sets: item.dosage.sets, target: item.dosage.target, loadKg: null, restSec: item.dosage.restSec } : defaultPrescription(e.measurement, e.defaults);
        expect(validatePrescription(e.measurement, p).ok).toBe(true);
      }
    }
    expect(BUILTIN_EXERCISES.map((e) => e.id)).not.toEqual(expect.arrayContaining(['UP_OR_DOWN_GAME']));
    expect(BUILTIN_EXERCISES.some((e) => /^(UP_OR_DOWN|TOSS_AND_CATCH|CATCH_WITH|LAYUP_SKIP)/.test(e.id))).toBe(false); // no Exercise was made from a video title
  });

  it('the six IBBC videos are CANDIDATES for human review only: never on a workout, never on an Exercise, each marked not human verified', () => {
    expect(IBBC_CANDIDATE_VIDEOS).toHaveLength(6);
    expect(new Set(IBBC_CANDIDATE_VIDEOS.map((v) => v.url))).toEqual(
      new Set(['ePX7umliH_s', '-KSQDWxptE0', 'KmJburYaPlE', '_XXSmPJS8_M', 'vprXdk5f-pA', '9z6NtAuiB4U'].map((id) => `https://www.youtube.com/watch?v=${id}`)),
    );
    for (const v of IBBC_CANDIDATE_VIDEOS) {
      expect(v.status).toBe('CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED');
      expect(v.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
      expect(v.about[1]).toMatch(/^Per its YouTube description:/);
      expect(v.about[1]).not.toMatch(/\b(step|steps|rule|rules|first,|then,|set up|setup)\b/i); // no how-to is invented from a title
      expect(v.candidateFor.every((id) => SPORT_CONTENT_003_WORKOUT_IDS.includes(id))).toBe(true);
    }
    // nothing user-facing: no workout carries a video, and no user-facing text mentions or links one
    expect(PROFESSIONAL_WORKOUTS.every((w) => !('videos' in w))).toBe(true);
    expect(JSON.stringify(PROFESSIONAL_WORKOUTS).toLowerCase()).not.toMatch(/youtube|youtu\.be|jr\. nba|hoopsking/);
    expect(BUILTIN_EXERCISES.every((e) => e.tutorialUrl === null)).toBe(true);
  });

  it('the source is recorded honestly: the page has no written drills or dosage, the videos were not watched, and every dosage is ours', () => {
    expect(SOURCES['IBBC-BEGINNER'].url).toBe('https://www.ibbcoaches.org.il/beginnerbasketballtraining');
    expect(SOURCES['IBBC-BEGINNER'].name).toMatch(/no written drills or dosage/);
    expect(SOURCES['IBBC-BEGINNER'].name).toMatch(/NOT watched/);
    expect(JSON.stringify(IBBC.map((w) => [w.summary, w.coachNotes])).toLowerCase()).not.toMatch(/ibbc|jr\. nba|hoopsking|iba/);
    expect(IBBC.map((w) => w.coachNotes[0]![1]).join(' ')).toMatch(/Gals Coacher's own/);
  });
});

/** Human content review round 1 — the small content patch (registry / catalog text only; no migration). */
describe('content review round 1', () => {
  const items = (id: string) => professionalWorkout(id)!.sections.flatMap((s) => s.items);
  const ids = (id: string) => items(id).map((i) => i.exerciseId);

  it('no professional workout item has an empty target (nothing may show "(no target)")', () => {
    for (const w of PROFESSIONAL_WORKOUTS) {
      for (const i of w.sections.flatMap((s) => s.items)) {
        const e = builtinExercise(i.exerciseId)!;
        const d = i.dosage ?? defaultPrescription(e.measurement, e.defaults);
        expect(d?.target).not.toBeNull();
        expect(d?.target).toBeGreaterThan(0);
      }
    }
    const dosageOf = (w: string, ex: string) => items(w).find((i) => i.exerciseId === ex)!.dosage;
    expect(dosageOf('BASKETBALL-BALL-HANDLING-01', 'CONE_DRIBBLE_SLALOM')).toEqual({ sets: 4, target: 30, restSec: 60 });
    expect(dosageOf('BASKETBALL-DEFENSE-REBOUNDING-01', 'DEFENSIVE_SLIDES')).toEqual({ sets: 4, target: 30, restSec: 60 });
    expect(dosageOf('BASKETBALL-DEFENSE-REBOUNDING-01', 'LANE_AGILITY')).toEqual({ sets: 3, target: 30, restSec: 120 });
  });

  it('Shooting & Finishing is about 160-190 attempts; the targets are the reviewed values', () => {
    const attempts = items('BASKETBALL-SHOOTING-FINISHING-01')
      .filter((i) => i.dosage)
      .reduce((n, i) => n + i.dosage!.sets * i.dosage!.target!, 0);
    expect(attempts).toBeGreaterThanOrEqual(160);
    expect(attempts).toBeLessThanOrEqual(190);
    const fmt = items('BASKETBALL-SHOOTING-FINISHING-01')
      .filter((i) => i.dosage)
      .map((i) => `${i.exerciseId} ${i.dosage!.sets}x${i.dosage!.target}`);
    expect(fmt).toEqual([
      'FORM_SHOOTING 2x8',
      'MID_RANGE_SPOT_SHOOTING 5x6',
      'RELOCATION_SHOOTING 3x6',
      'PULL_UP_JUMPER 3x6',
      'LAYUPS 3x8',
      'REVERSE_LAYUPS 2x6',
      'CONTACT_FINISHES 2x6',
      'FREE_THROWS 3x10',
    ]);
  });

  it('Surf Power & Rotation: one jump, one hip extension, no Russian twist, 12-15 movements', () => {
    const list = ids('SURF-POWER-ROTATION-01');
    expect(list).not.toContain('RUSSIAN_TWIST');
    expect(list.filter((id) => id === 'SQUAT_JUMP' || id === 'BOX_JUMP')).toHaveLength(1);
    expect(list.filter((id) => id === 'HIP_THRUST' || id === 'KETTLEBELL_SWING')).toHaveLength(1);
    expect(list.length).toBeGreaterThanOrEqual(12);
    expect(list.length).toBeLessThanOrEqual(15);
    expect(list).toEqual(expect.arrayContaining(['MED_BALL_ROTATIONAL_THROW', 'PALLOF_PRESS', 'SIDE_PLANK']));
  });

  it('Paddle Endurance: ONE conditioning station (ski erg, rowing machine or battle ropes) and two rows', () => {
    const w = professionalWorkout('SURF-PADDLE-ENDURANCE-01')!;
    const list = ids(w.id);
    expect(list).not.toContain('BATTLE_ROPE_WAVES');
    expect(list.filter((id) => id.endsWith('_ROW'))).toHaveLength(2);
    const station = w.sections.find((s) => s.items.some((i) => i.exerciseId === 'SKI_ERG_INTERVALS'))!;
    expect(station.name[1]).toMatch(/ski erg, rowing machine or battle ropes/);
    expect(station.name[0]).toMatch(/סקי-ארג, מכונת חתירה או חבלי קרב/);
    expect(w.coachNotes.flat().join(' ')).toMatch(/ONE of three options/);
  });

  it('SURF_TAKE_OFF is SOURCE_SUPPORTED by an opened surf-school page, with no claim that ISA / Surfing Australia authored it', () => {
    const p = PROVENANCE.SURF_TAKE_OFF!;
    expect(p.topic).toBe('SOURCE_SUPPORTED');
    expect(p.cues).toBe('SYNTHESIZED');
    expect(p.dosage).toBe('ORIGINAL_RECOMMENDATION');
    expect(p.sources).toEqual(['SURF-SCHOOL-WW']);
    expect(SOURCES['SURF-SCHOOL-WW'].read).toBe('opened');
    expect(SOURCES['SURF-SCHOOL-WW'].name).toMatch(/NOT ISA or Surfing Australia content/);
    expect(p.synthesis).toMatch(/not claimed to have authored/);
  });

  it('the surf dry-land sources are recorded as opened', () => {
    for (const key of ['ISA-STRENGTH', 'SURF-PHYSIOLOGY', 'SA-SCHED'] as const) expect(SOURCES[key].read).toBe('opened');
  });

  it('BOX_OUT_DRILL: new Hebrew name and instructions, SOURCE_SUPPORTED by USA Basketball', () => {
    const e = builtinExercise('BOX_OUT_DRILL')!;
    expect(e.name.he).toBe('סגירה לריבאונד (Box-Out)');
    expect(e.instructions!.he).toMatch(/מאתרים את היריב, יוצרים מגע מבוקר, מסתובבים כך שהגוף נמצא בינו לבין הסל, שומרים עמדה רחבה ונמוכה ואז יוצאים לכדור/);
    expect(e.instructions!.he).not.toMatch(/עם הגב אליו/);
    const p = PROVENANCE.BOX_OUT_DRILL!;
    expect([p.topic, p.cues, p.dosage]).toEqual(['SOURCE_SUPPORTED', 'SYNTHESIZED', 'ORIGINAL_RECOMMENDATION']);
    expect(p.sources).toContain('USAB-REBOUND');
  });

  it('USA Basketball is contextual evidence for the three 002 Basketball workouts only, never authorship', () => {
    for (const w of EXPANDED.filter((x) => x.sport === 'BASKETBALL')) expect(w.sources).toContain('USAB-CURRICULUM');
    expect(SOURCES['USAB-CURRICULUM'].name).toMatch(/did not author our workouts or dosage/);
    for (const w of IBBC) expect(w.sources).not.toContain('USAB-CURRICULUM');
  });

  it('Hebrew names follow the review', () => {
    const he = JSON.stringify([...PROFESSIONAL_WORKOUTS, ...NEW_EXERCISES, builtinExercise('BOX_OUT_DRILL')]);
    expect(he).not.toMatch(/משחק קטן|חסימה לריבאונד|מעבר ולחץ/);
    expect(builtinExercise('FB_SMALL_SIDED_GAME')!.name.he).toBe('משחקון בשטח קטן');
    expect(professionalWorkout('BASKETBALL-BEGINNER-SHOOT-LAYUP-01')!.name[0]).toBe('כדורסל — קליעה ולייאפים');
    expect(professionalWorkout('FOOTBALL-TRANSITION-PRESSING-01')!.name[0]).toBe('כדורגל — מעברים ולחץ לאחר איבוד');
  });

  it('the rip-current briefing offers several actions and does not present swim parallel as the only one', () => {
    const brief = professionalWorkout('SURF-FOUNDATION-01')!.coachNotes.flat().join(' ');
    expect(brief).toMatch(/stay calm and float to conserve energy, signal for help, and if able escape sideways/);
    expect(brief).toMatch(/No single action is always right/);
    expect(brief).not.toMatch(/swim parallel to the shore/);
  });
});
