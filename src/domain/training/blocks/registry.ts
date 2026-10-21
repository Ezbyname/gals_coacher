import { GENERAL_SAFETY } from '../professional/athletic';
import type { Pair, WorkoutAdjustment } from '../professional/types';

import type { BlockDecision, BlockSession, TrainingBlock } from './types';

/**
 * TRAINING-BLOCKS-001 — the six V1 Training Blocks. Every set, repetition, duration, rest, weekly arrangement and progression
 * is Gals Coacher's own ORIGINAL_RECOMMENDATION; the ordering of qualities is our SYNTHESIZED coaching judgement; only the
 * decisions marked SOURCE_SUPPORTED rest on a source we actually opened (see ./evidence in the review sheet). Programmes are
 * for general athletic development — they make no injury-prevention or medical claim.
 *
 * Progression lives HERE (per-session adjustments), so a workout is never duplicated for "week 5".
 */

const L = {
  MF: ['יסודות תנועה', 'Movement'],
  SA: ['כוח א׳', 'Strength A'],
  SB: ['כוח ב׳', 'Strength B'],
  JL: ['קפיצה ונחיתה', 'Landing'],
  EL: ['כוח מתפרץ', 'Jump power'],
  RP: ['זריקות וסיבוב', 'Throws'],
  AC: ['האצה', 'Accel'],
  SP: ['מהירות מרבית', 'Max speed'],
  DC: ['עצירה וכיוון', 'Decel & COD'],
  RA: ['זריזות תגובתית', 'Reactive'],
  CB: ['בסיס אירובי', 'Aerobic base'],
  CI: ['אינטרוולים', 'Intervals'],
  RE: ['מאמץ חוזר', 'Repeat effort'],
} as const satisfies Record<string, Pair>;

const W = {
  MF: 'ATH-MOVEMENT-FOUNDATION-01',
  SA: 'ATH-STRENGTH-FULLBODY-A-01',
  SB: 'ATH-STRENGTH-FULLBODY-B-01',
  JL: 'ATH-JUMP-LANDING-01',
  EL: 'ATH-EXPLOSIVE-LOWER-01',
  RP: 'ATH-ROTATIONAL-POWER-01',
  AC: 'ATH-ACCELERATION-01',
  SP: 'ATH-SPEED-01',
  DC: 'ATH-DECEL-COD-01',
  RA: 'ATH-REACTIVE-AGILITY-01',
  CB: 'ATH-CONDITIONING-BASE-01',
  CI: 'ATH-CONDITIONING-INTERVALS-01',
  RE: 'ATH-REPEATED-EFFORT-01',
} as const;
type Key = keyof typeof W;

const s = (week: number, slot: number, key: Key, adjust?: WorkoutAdjustment, note?: Pair): BlockSession => ({
  week,
  slot,
  workoutId: W[key],
  label: L[key],
  ...(adjust ? { adjust } : {}),
  ...(note ? { note } : {}),
});

// strength progression: sets and repetitions first, then a small load (our recommendation; youth progression is SYNTHESIZED)
const A4: WorkoutAdjustment = { sets: { GOBLET_SQUAT: 4, PUSH_UP: 4 } };
const B4: WorkoutAdjustment = { sets: { STEP_UP: 4, ROMANIAN_DEADLIFT: 4 } };
const A4R10: WorkoutAdjustment = { sets: { GOBLET_SQUAT: 4, PUSH_UP: 4 }, target: { GOBLET_SQUAT: 10, PUSH_UP: 10 } };
const B4R10: WorkoutAdjustment = { sets: { STEP_UP: 4, ROMANIAN_DEADLIFT: 4 }, target: { STEP_UP: 10, ROMANIAN_DEADLIFT: 10 } };
const A2: WorkoutAdjustment = { sets: { GOBLET_SQUAT: 2, PUSH_UP: 2 } };
const B2: WorkoutAdjustment = { sets: { STEP_UP: 2, ROMANIAN_DEADLIFT: 2 } };
const LOAD_UP: Pair = [
  'מוסיפים עומס קטן כשכל החזרות נקיות, ומחזירים את מספר החזרות לבסיס.',
  'Add a small load once every repetition is clean, and return the repetitions to the base number.',
];
const LIGHT_WEEK: Pair = [
  'שבוע איחוד: פחות נפח, אותה איכות — לא מוסיפים עוד עבודה.',
  'Consolidation week: less volume, the same quality — do not add more work.',
];
const NO_CONSECUTIVE: Pair = [
  'לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.',
  'At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.',
];

const D_COMPETENCY: BlockDecision = {
  decision: [
    'טכניקה ואיכות תנועה לפני עצימות או עומס; ההתקדמות לפי יכולת ולא לפי גיל.',
    'Technique and movement quality before intensity or load; progression by competence, not by age.',
  ],
  evidence: 'SOURCE_SUPPORTED',
  sources: ['LTAD-1'],
};
const D_FREQUENCY: BlockDecision = {
  decision: [
    'שני אימונים בשבוע, עם יום מנוחה לפחות ביניהם.',
    'Two sessions a week, with at least one rest day between them.',
  ],
  evidence: 'SYNTHESIZED',
  sources: ['ACSM-2009', 'PLYO-ADOLESCENT'],
};
const D_PROGRESSION_STRENGTH: BlockDecision = {
  decision: [
    'התקדמות בכוח: סטים וחזרות קודם, ואז עומס קטן. קפיצת העומס המקובלת (2–10%) נלקחה ממבוגרים בלבד.',
    'Strength progression: sets and repetitions first, then a small load. The usual 2–10% load step comes from adults only.',
  ],
  evidence: 'SYNTHESIZED',
  sources: ['ACSM-2009'],
};
const D_DOSAGE: BlockDecision = {
  decision: [
    'כל הסטים, החזרות, המנוחות, סידור השבועות וההתקדמות הם המלצה מקורית של Gals Coacher.',
    'Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation.',
  ],
  evidence: 'ORIGINAL_RECOMMENDATION',
  sources: [],
};

export const TRAINING_BLOCKS: readonly TrainingBlock[] = [
  {
    id: 'ATHLETICISM-FOUNDATION-6W-01',
    name: ['בסיס אתלטי', 'Athleticism Foundation'],
    shortName: ['בסיס אתלטי', 'Athleticism'],
    summary: [
      'שישה שבועות שמחברים כוח בסיסי, נחיתה וקפיצה, האצה ועצירה — בסיס תנועתי רחב לכל ספורט.',
      'Six weeks that combine foundation strength, landing and jumping, acceleration and deceleration — a broad movement base for any sport.',
    ],
    goal: ['לשפר אתלטיות כללית: תנועה, כוח, שליטה בנחיתה, האצה ועצירה.', 'Improve general athleticism: movement, strength, landing control, acceleration and deceleration.'],
    athlete: ['מתאמנים שמתחילים תוכנית מובנית, או רוצים בסיס רחב לפני התמחות.', 'Athletes starting a structured programme, or wanting a broad base before specialising.'],
    prerequisite: ['אין תנאי מוקדם. מתאים גם למתאמן חדש; מבוגר אחראי או מאמן מתאים את העצימות.', 'No prerequisite. Suitable for a new athlete; a coach or responsible adult adjusts the intensity.'],
    difficulty: 'BEGINNER',
    weeks: 6,
    sessionsPerWeek: 2,
    schedule: [
      s(1, 1, 'MF'),
      s(1, 2, 'SA'),
      s(2, 1, 'SB'),
      s(2, 2, 'JL'),
      s(3, 1, 'SA', A4, LOAD_UP),
      s(3, 2, 'AC'),
      s(4, 1, 'SB', B4, LOAD_UP),
      s(4, 2, 'JL', { sets: { DROP_LANDING_STICK: 4, SQUAT_JUMP: 4 } }),
      s(5, 1, 'SA', A4, LOAD_UP),
      s(5, 2, 'DC', { omitExercises: ['PRO_AGILITY_5_10_5', 'LATERAL_BOUNDS'] }),
      s(6, 1, 'SB', B2, LIGHT_WEEK),
      s(6, 2, 'AC', { sets: { SPRINT_10M: 4, SPRINT_20M: 2 } }, LIGHT_WEEK),
    ],
    progression: [
      ['שבועות 1–2: לומדים את התנועה. שבועות 3–5: מעט יותר נפח. שבוע 6: איחוד.', 'Weeks 1–2: learn the movement. Weeks 3–5: slightly more volume. Week 6: consolidate.'],
      ['נחיתה לפני קפיצות, עצירה לפני שינויי כיוון חדים.', 'Landing before jumping, stopping before sharp changes of direction.'],
    ],
    recovery: NO_CONSECUTIVE,
    equipment: [
      'משקולת יד או קטלבל, ספסל או קופסה נמוכה, רצועה, קונוסים ושטח פתוח.',
      'A dumbbell or kettlebell, a bench or low box, a band, cones and open space.',
    ],
    substitutions: [
      ['אין קופסה: ספסל יציב או מדרגה נמוכה בנחיתה.', 'No box: use a stable bench or a low step for the landing.'],
      ['אין משקולות: בקבוק מים מלא כעומס קל, בזהירות.', 'No weights: a filled water bottle can be a light load, with care.'],
    ],
    safety: GENERAL_SAFETY,
    decisions: [
      D_COMPETENCY,
      D_FREQUENCY,
      {
        decision: ['נחיתה מבוקרת לפני קפיצות, ועצירה לפני שינויי כיוון.', 'Controlled landing before jumping, and stopping before changes of direction.'],
        evidence: 'SYNTHESIZED',
        sources: ['LANDING-ADULTS'],
      },
      D_PROGRESSION_STRENGTH,
      D_DOSAGE,
    ],
    sources: ['LTAD-1', 'ACSM-2009', 'PLYO-ADOLESCENT', 'LANDING-ADULTS'],
    reviewStatus: 'PUBLISHED',
  },
  {
    id: 'EXPLOSIVE-POWER-8W-01',
    name: ['כוח מתפרץ', 'Explosive Power'],
    shortName: ['כוח מתפרץ', 'Explosive'],
    summary: [
      'שמונה שבועות: קודם איכות נחיתה, אחר כך קפיצות פשוטות ועד פלט מתפרץ באיכות גבוהה, עם נפח קפיצות מתון ושבוע אחרון של איחוד.',
      'Eight weeks: landing quality first, then simple jumps up to high-quality explosive output, with moderate jump volume and a consolidation week at the end.',
    ],
    goal: ['לשפר כוח מתפרץ — קפיצות וזריקות — בלי נפח מיותר.', 'Improve explosive power — jumping and throwing — without excess volume.'],
    athlete: ['מתאמנים שכבר מרגישים בנוח בנחיתה ובתבניות הבסיס.', 'Athletes already comfortable with landing and the basic movement patterns.'],
    prerequisite: ['נחיתה מבוקרת נקייה על שתי רגליים, סקווט ולאנג׳ בטכניקה טובה — או השלמת "בסיס אתלטי".', 'A clean two-leg landing and good squat and lunge technique — or having completed "Athleticism Foundation".'],
    difficulty: 'INTERMEDIATE',
    weeks: 8,
    sessionsPerWeek: 2,
    schedule: [
      s(1, 1, 'JL'),
      s(1, 2, 'SA'),
      s(2, 1, 'SB'),
      s(2, 2, 'JL', { sets: { DROP_LANDING_STICK: 4 } }),
      s(3, 1, 'EL', { sets: { BOX_JUMP: 3 }, omitExercises: ['LATERAL_BOUNDS'] }),
      s(3, 2, 'RP', { sets: { MED_BALL_ROTATIONAL_THROW: 3 } }),
      s(4, 1, 'SA', A4, LOAD_UP),
      s(4, 2, 'EL', { omitExercises: ['LATERAL_BOUNDS'] }),
      s(5, 1, 'RP'),
      s(5, 2, 'EL'),
      s(6, 1, 'SB', B4, LOAD_UP),
      s(6, 2, 'EL'),
      s(7, 1, 'RP'),
      s(7, 2, 'EL'),
      s(8, 1, 'SA', A2, LIGHT_WEEK),
      s(8, 2, 'EL', { sets: { BOX_JUMP: 3, LATERAL_BOUNDS: 2, KETTLEBELL_SWING: 2 } }, LIGHT_WEEK),
    ],
    progression: [
      ['שבועות 1–2: נחיתה ובסיס כוח. שבועות 3–4: קפיצות פשוטות. שבועות 5–7: פלט מתפרץ מלא. שבוע 8: איחוד.', 'Weeks 1–2: landing and a strength base. Weeks 3–4: simple jumps. Weeks 5–7: full explosive output. Week 8: consolidate.'],
      ['נפח הקפיצות נשאר מתון בכוונה; איכות ומנוחה מלאה לפני כמות.', 'Jump volume stays moderate on purpose; quality and full rest before quantity.'],
    ],
    recovery: NO_CONSECUTIVE,
    equipment: [
      'קופסה או ספסל יציב, קטלבל או משקולת, כדור כבד, ספסל, רצועה ומשטח יציב.',
      'A stable box or bench, a kettlebell or dumbbell, a medicine ball, a bench, a band and a stable surface.',
    ],
    substitutions: [
      ['אין קופסה: קפיצת סקווט במקום קפיצת קופסה.', 'No box: use the squat jump instead of the box jump.'],
      ['אם אין כדור כבד מתאים — מדלגים על חלק הזריקות או משתמשים בתרגיל או באימון כוח מתפרץ מאושר אחר.', 'If no appropriate medicine ball is available, skip the throwing section or use another approved power exercise or workout.'],
    ],
    safety: GENERAL_SAFETY,
    decisions: [
      D_COMPETENCY,
      {
        decision: ['נפח קפיצות מתון — יותר קפיצות לא תמיד נותנות יותר שיפור.', 'Moderate jump volume — more jumps do not always give more improvement.'],
        evidence: 'SOURCE_SUPPORTED',
        sources: ['PLYO-ADOLESCENT'],
      },
      {
        decision: ['שמונה שבועות, פעמיים בשבוע: המחקר מראה שיפור עקבי יותר סביב 8–10 שבועות (ממצא חקרני). התוכנית עצמה היא המלצה מקורית.', 'Eight weeks, twice a week: the review links 8 to under 10 weeks with more consistent gains (an exploratory finding). The programme itself is our own recommendation.'],
        evidence: 'ORIGINAL_RECOMMENDATION',
        sources: ['PLYO-ADOLESCENT'],
      },
      {
        decision: ['נחיתה לפני קפיצות, קפיצות פשוטות לפני פלט מתפרץ מלא.', 'Landing before jumping, simple jumps before full explosive output.'],
        evidence: 'SYNTHESIZED',
        sources: ['LANDING-ADULTS'],
      },
      D_PROGRESSION_STRENGTH,
      D_DOSAGE,
    ],
    sources: ['LTAD-1', 'ACSM-2009', 'PLYO-ADOLESCENT', 'LANDING-ADULTS'],
    reviewStatus: 'PUBLISHED',
  },
  {
    id: 'SPEED-ACCELERATION-6W-01',
    name: ['מהירות והאצה', 'Speed & Acceleration'],
    shortName: ['מהירות', 'Speed'],
    summary: [
      'שישה שבועות של האצה באיכות גבוהה ומנוחה מלאה, ובסוף עבודת מהירות מרבית — לא ריצה רציפה.',
      'Six weeks of high-quality acceleration with full rest, finishing with maximum-velocity work — not continuous running.',
    ],
    goal: ['לשפר האצה ומהירות מרבית בקו ישר.', 'Improve acceleration and straight-line maximum speed.'],
    athlete: ['מתאמנים שרוצים להאיץ מהר יותר ויכולים לעבוד על משטח ריצה.', 'Athletes wanting to accelerate faster, with a running surface available.'],
    prerequisite: ['שבועות 1–4 מתאימים גם למתחילים; שבועות 5–6 דורשים נחיתה וריצה נקיות.', 'Weeks 1–4 suit beginners; weeks 5–6 need clean landing and running mechanics.'],
    difficulty: 'INTERMEDIATE',
    weeks: 6,
    sessionsPerWeek: 2,
    schedule: [
      s(1, 1, 'JL'),
      s(1, 2, 'AC'),
      s(2, 1, 'AC'),
      s(2, 2, 'SB'),
      s(3, 1, 'AC', { sets: { SPRINT_10M: 6 } }),
      s(3, 2, 'EL', { sets: { BOX_JUMP: 3 }, omitExercises: ['LATERAL_BOUNDS'] }),
      s(4, 1, 'AC', { sets: { SPRINT_20M: 4 } }),
      s(4, 2, 'SA', A4, LOAD_UP),
      s(5, 1, 'SP'),
      s(5, 2, 'EL', { omitExercises: ['LATERAL_BOUNDS'] }),
      s(6, 1, 'SP', { sets: { SPRINT_30M_FLYING: 3 } }, LIGHT_WEEK),
      s(6, 2, 'AC', { sets: { SPRINT_10M: 4, SPRINT_20M: 2 } }, LIGHT_WEEK),
    ],
    progression: [
      ['שבועות 1–4: האצה ונפח ספרינט עולה בהדרגה. שבועות 5–6: מהירות מרבית ואיחוד.', 'Weeks 1–4: acceleration with gradually rising sprint volume. Weeks 5–6: maximum velocity and consolidation.'],
      ['ימי ספרינט מתחילים רעננים, ואחריהם יום מנוחה אחד לפחות.', 'Sprint days start fresh and are followed by at least one rest day.'],
    ],
    recovery: NO_CONSECUTIVE,
    equipment: ['קונוסים, שטח ריצה ישר של כ־40 מטרים, קופסה או ספסל, משקולת או קטלבל.', 'Cones, a straight running area of about 40 metres, a box or bench, a dumbbell or kettlebell.'],
    substitutions: [['אין מקום ל־30 מטרים: ספרינט 20 מטרים בלבד.', 'No room for 30 metres: use 20-metre sprints only.']],
    safety: GENERAL_SAFETY,
    decisions: [
      D_COMPETENCY,
      {
        decision: ['האצה לפני מהירות מרבית, ומנוחה מלאה בין ספרינטים בודדים — מנוחה ארוכה היא החלטה שלנו, לא ממקור.', 'Acceleration before maximum velocity, with full rest between single sprints — the long rest is our judgement, not from a source.'],
        evidence: 'SYNTHESIZED',
        sources: [],
      },
      D_FREQUENCY,
      D_DOSAGE,
    ],
    sources: ['LTAD-1', 'ACSM-2009'],
    reviewStatus: 'PUBLISHED',
  },
  {
    id: 'AGILITY-COD-6W-01',
    name: ['זריזות ושינויי כיוון', 'Agility & Change of Direction'],
    shortName: ['זריזות', 'Agility'],
    summary: [
      'שישה שבועות: עצירה מבוקרת, שינויי כיוון מתוכננים ואחר כך זריזות תגובתית לאות.',
      'Six weeks: controlled stopping, pre-planned changes of direction, and then reactive agility to a cue.',
    ],
    goal: ['לשפר שליטה בעצירה ובשינויי כיוון, ויכולת להגיב לאות.', 'Improve control of stopping and changing direction, and the ability to react to a cue.'],
    athlete: ['מתאמנים בענפי כדור ובענפי תנועה רב־כיוונית.', 'Athletes in ball and multi-directional sports.'],
    prerequisite: ['נחיתה מבוקרת וריצה נקייה. זריזות תגובתית דורשת בן זוג או מאמן.', 'A clean landing and running. Reactive agility needs a partner or coach.'],
    difficulty: 'INTERMEDIATE',
    weeks: 6,
    sessionsPerWeek: 2,
    schedule: [
      s(1, 1, 'JL'),
      s(1, 2, 'DC', { omitExercises: ['PRO_AGILITY_5_10_5'], sets: { T_DRILL: 2 } }),
      s(2, 1, 'DC'),
      s(2, 2, 'SA'),
      s(3, 1, 'DC'),
      s(3, 2, 'AC'),
      s(4, 1, 'RA'),
      s(4, 2, 'SB'),
      s(5, 1, 'DC'),
      s(5, 2, 'RA'),
      s(6, 1, 'RA', { sets: { COACH_CUE_REACTION_SPRINT: 4 } }, LIGHT_WEEK),
      s(6, 2, 'DC', { sets: { DECEL_STOP: 3, T_DRILL: 2, PRO_AGILITY_5_10_5: 2 } }, LIGHT_WEEK),
    ],
    progression: [
      ['שבועות 1–3: עצירה ושינויי כיוון מתוכננים. שבועות 4–6: זריזות תגובתית נכנסת, ושבוע אחרון של איחוד.', 'Weeks 1–3: stopping and pre-planned changes of direction. Weeks 4–6: reactive agility enters, and the last week consolidates.'],
      ['האות תמיד בלתי צפוי; בלי בן זוג מחליפים בעבודה מתוכננת.', 'The cue is always unpredictable; without a partner, swap in pre-planned work.'],
    ],
    recovery: NO_CONSECUTIVE,
    equipment: ['קונוסים, שטח ריצה, בן זוג או מאמן לאימוני התגובה, משקולת או קטלבל.', 'Cones, a running area, a partner or coach for the reactive sessions, a dumbbell or kettlebell.'],
    substitutions: [['אין בן זוג: במקום זריזות תגובתית — עצירה מבוקרת ושינוי כיוון מתוכנן.', 'No partner: replace reactive sessions with controlled stopping and pre-planned change of direction.']],
    safety: GENERAL_SAFETY,
    decisions: [
      D_COMPETENCY,
      {
        decision: ['זריזות תגובתית דורשת גירוי: גירוי אנושי או חזותי מבדיל טוב יותר בין רמות משחק (תקציר בלבד).', 'Reactive agility needs a stimulus: a human or video stimulus separates playing levels better (abstract only).'],
        evidence: 'SOURCE_SUPPORTED',
        sources: ['AGILITY-2016'],
      },
      {
        decision: ['עצירה לפני שינויי כיוון חדים, ושינוי כיוון מתוכנן לפני תגובתי.', 'Stopping before sharp changes of direction, and pre-planned before reactive change of direction.'],
        evidence: 'SYNTHESIZED',
        sources: ['DECEL-2022'],
      },
      D_FREQUENCY,
      D_DOSAGE,
    ],
    sources: ['LTAD-1', 'AGILITY-2016', 'ACSM-2009'],
    reviewStatus: 'PUBLISHED',
  },
  {
    id: 'STRENGTH-FOUNDATION-6W-01',
    name: ['בסיס כוח', 'Strength Foundation'],
    shortName: ['בסיס כוח', 'Strength'],
    summary: [
      'שישה שבועות של כוח כל הגוף: סקווט, ציר ירך, רגל אחת, דחיפה, משיכה ויציבות הגו — בהתקדמות הדרגתית ושבוע איחוד.',
      'Six weeks of full-body strength: squat, hip hinge, single leg, push, pull and trunk stability — with gradual progression and a consolidation week.',
    ],
    goal: ['לבנות בסיס כוח כללי בטכניקה טובה.', 'Build a general strength base with good technique.'],
    athlete: ['מתאמנים חדשים או חוזרים לאימון, ומתאמנים שרוצים בסיס לפני אימון מתקדם.', 'New or returning athletes, and athletes wanting a base before advanced training.'],
    prerequisite: ['אין תנאי מוקדם.', 'No prerequisite.'],
    difficulty: 'BEGINNER',
    weeks: 6,
    sessionsPerWeek: 2,
    schedule: [
      s(1, 1, 'MF'),
      s(1, 2, 'SA'),
      s(2, 1, 'SB'),
      s(2, 2, 'SA'),
      s(3, 1, 'SB', B4, LOAD_UP),
      s(3, 2, 'SA', A4, LOAD_UP),
      s(4, 1, 'SB', B4R10),
      s(4, 2, 'SA', A4R10),
      s(5, 1, 'SB', B4, LOAD_UP),
      s(5, 2, 'SA', A4, LOAD_UP),
      s(6, 1, 'SB', B2, LIGHT_WEEK),
      s(6, 2, 'SA', A2, LIGHT_WEEK),
    ],
    progression: [
      ['שבוע 1: לומדים. שבועות 2–5: יותר סטים, אחר כך יותר חזרות, אחר כך עומס קטן. שבוע 6: איחוד.', 'Week 1: learn. Weeks 2–5: more sets, then more repetitions, then a small load. Week 6: consolidate.'],
    ],
    recovery: NO_CONSECUTIVE,
    equipment: ['משקולת יד או קטלבל, רצועה וספסל או מדרגה.', 'A dumbbell or kettlebell, a band, and a bench or step.'],
    substitutions: [['אין משקולות: רצועה או משקל גוף.', 'No weights: use a band or bodyweight.']],
    safety: GENERAL_SAFETY,
    decisions: [
      D_COMPETENCY,
      {
        decision: ['שני אימוני כוח בשבוע למתחילים (הנחיה למבוגרים, בתקציר).', 'Two strength sessions a week for novices (adult guidance, abstract only).'],
        evidence: 'SOURCE_SUPPORTED',
        sources: ['ACSM-2009'],
      },
      D_PROGRESSION_STRENGTH,
      D_DOSAGE,
    ],
    sources: ['LTAD-1', 'ACSM-2009'],
    reviewStatus: 'PUBLISHED',
  },
  {
    id: 'CONDITIONING-6W-01',
    name: ['כושר וסבולת', 'Conditioning'],
    shortName: ['כושר וסבולת', 'Conditioning'],
    summary: [
      'שישה שבועות: בסיס אירובי, אינטרוולים בריצה ומאמץ חוזר בספרינטים קצרים. כושר כללי; כושר ספציפי לענף נשאר באימוני הענף.',
      'Six weeks: an aerobic base, run intervals and repeated short sprints. General conditioning; sport-specific conditioning stays in the sport workouts.',
    ],
    goal: ['לשפר סבולת אירובית ויכולת לחזור על מאמץ.', 'Improve aerobic endurance and the ability to repeat an effort.'],
    athlete: ['מתאמנים שצריכים כושר כללי בלי ציוד מיוחד — נעלי ספורט ושטח פתוח מספיקים.', 'Athletes needing general conditioning with no special equipment — trainers and open space are enough.'],
    prerequisite: ['אין תנאי מוקדם; שבועות 4–6 דורשים בסיס אירובי מהשבועות הראשונים.', 'No prerequisite; weeks 4–6 build on the aerobic base of the first weeks.'],
    difficulty: 'BEGINNER',
    weeks: 6,
    sessionsPerWeek: 2,
    schedule: [
      s(1, 1, 'CB', { target: { EASY_RUN: 900 } }),
      s(1, 2, 'CB', { target: { EASY_RUN: 900 } }),
      s(2, 1, 'CB', { target: { EASY_RUN: 1080 } }),
      s(2, 2, 'CI', { sets: { RUN_INTERVALS: 5 }, target: { RUN_INTERVALS: 30 } }),
      s(3, 1, 'CB', { target: { EASY_RUN: 1200 } }),
      s(3, 2, 'CI', { sets: { RUN_INTERVALS: 6 }, target: { RUN_INTERVALS: 30 } }),
      s(4, 1, 'CI', { sets: { RUN_INTERVALS: 6 }, target: { RUN_INTERVALS: 45 } }),
      s(4, 2, 'RE', { omitSections: [3] }),
      s(5, 1, 'CB', { target: { EASY_RUN: 1320 } }),
      s(5, 2, 'RE'),
      s(6, 1, 'CI', { sets: { RUN_INTERVALS: 6 }, target: { RUN_INTERVALS: 45 } }, LIGHT_WEEK),
      s(6, 2, 'CB', { target: { EASY_RUN: 1200 } }, LIGHT_WEEK),
    ],
    progression: [
      ['הסבולת האירובית מתארכת בהדרגה; האינטרוולים נעים מ־30 ל־45 שניות; המאמץ החוזר מתחיל בשני סבבים ועולה לשלושה.', 'The aerobic work lengthens gradually; the intervals go from 30 to 45 seconds; the repeated effort starts at two rounds and builds to three.'],
    ],
    recovery: NO_CONSECUTIVE,
    equipment: ['נעלי ספורט ושטח פתוח. אופניים, מכשיר חתירה או סקי ארג — אופציונליים כחלופות.', 'Trainers and open space. A bike, rower or ski erg are optional alternatives.'],
    substitutions: [['כל חלופה באינטרוולים והמאמץ החוזר מגיעה עם מינון משלה בתוך האימון.', 'Every alternative for the intervals and repeated effort comes with its own prescription inside the workout.']],
    safety: GENERAL_SAFETY,
    decisions: [
      D_COMPETENCY,
      {
        decision: ['אימוני אינטרוולים בריצה פעמיים עד שלוש בשבוע במשך כשבעה שבועות ומעלה (סקירה בבני נוער). התוכנית כאן היא שישה שבועות — מסומן לשיקול דעת אנושי.', 'Running interval training two to three times a week for about seven weeks or more (a review in youth). This programme is six weeks — flagged for human judgement.'],
        evidence: 'SOURCE_SUPPORTED',
        sources: ['HIIT-YOUTH'],
      },
      {
        decision: ['ספרינטים של עד 10 שניות עם מנוחה של עד 60 שניות, שניים עד שלושה סבבים בסשן.', 'Sprints of up to 10 seconds with up to 60 seconds of rest, two to three sets per session.'],
        evidence: 'SOURCE_SUPPORTED',
        sources: ['RST-NSCA'],
      },
      {
        decision: ['סדר: בסיס אירובי, אחר כך אינטרוולים, אחר כך מאמץ חוזר.', 'Order: aerobic base, then intervals, then repeated effort.'],
        evidence: 'SYNTHESIZED',
        sources: ['RSA-2011'],
      },
      D_DOSAGE,
    ],
    sources: ['HIIT-YOUTH', 'RST-NSCA', 'RSA-2011'],
    reviewStatus: 'PUBLISHED',
  },
];

const BY_ID = new Map(TRAINING_BLOCKS.map((b) => [b.id, b]));
export const trainingBlock = (id: string): TrainingBlock | null => BY_ID.get(id) ?? null;
