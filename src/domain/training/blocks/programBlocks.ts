import { STRENGTH_SAFETY, type Pair } from '../professional/types';

import type { BlockDecision, BlockSession, TrainingBlock } from './types';

/**
 * WORKOUT-TEMPLATES-001 — the gym PROGRAM BLOCKS (a product term; in code they are ordinary Training Blocks): a few weeks of the built-in
 * gym Workout Templates in a fixed order. DRAFT CONTENT ONLY: every block is PENDING_HUMAN_REVIEW, so none is listed or assignable in the
 * app until the owner approves it. Progression, RIR and the lighter week are INFORMATIONAL NOTES for the coach or athlete: nothing here
 * changes a prescription automatically (no `adjust`), and no load is ever written. Every number below is Gals Coacher's own
 * ORIGINAL_RECOMMENDATION; no external source was opened, so nothing is marked SOURCE_SUPPORTED. No medical or injury-prevention claim.
 */
const L = {
  FA: ['גוף מלא א׳', 'Full Body A'],
  FB: ['גוף מלא ב׳', 'Full Body B'],
  UA: ['עליון א׳', 'Upper A'],
  LA: ['תחתון א׳', 'Lower A'],
  UB: ['עליון ב׳', 'Upper B'],
  LB: ['תחתון ב׳', 'Lower B'],
  PU: ['דחיפה', 'Push'],
  PL: ['משיכה', 'Pull'],
  LG: ['רגליים', 'Legs'],
} as const satisfies Record<string, Pair>;

const W = {
  FA: 'GYM-BEG-FULLBODY-A',
  FB: 'GYM-BEG-FULLBODY-B',
  UA: 'GYM-INT-UPPER-A',
  LA: 'GYM-INT-LOWER-A',
  UB: 'GYM-INT-UPPER-B',
  LB: 'GYM-INT-LOWER-B',
  PU: 'GYM-ADV-PUSH',
  PL: 'GYM-ADV-PULL',
  LG: 'GYM-ADV-LEGS',
} as const;
type Key = keyof typeof W;

const s = (week: number, slot: number, key: Key, note?: Pair): BlockSession => ({ week, slot, workoutId: W[key], label: L[key], ...(note ? { note } : {}) });

// informational notes only (they never change a prescription)
const RIR_EASY: Pair = [
  'בוחרים משקל שמאפשר לסיים כל סט עם לפחות 3 חזרות רזרבה (RIR 3 ומעלה). טכניקה נקייה קודם.',
  'Choose a weight that lets every set finish with at least 3 repetitions in reserve (RIR 3 or more). Clean technique first.',
];
const RIR_MID: Pair = [
  'אפשר להתקרב ל־2–3 חזרות רזרבה (RIR 2–3) כשהטכניקה נשארת נקייה בכל חזרה.',
  'You may move closer to 2–3 repetitions in reserve (RIR 2–3) while technique stays clean on every repetition.',
];
const RIR_HARD: Pair = [
  'סטים עבודה בטווח של 1–3 חזרות רזרבה (RIR 1–3); אין לסיים סט בכשל טכני.',
  'Working sets at about 1–3 repetitions in reserve (RIR 1–3); never finish a set at technical failure.',
];
const DELOAD: Pair = [
  'שבוע קל (דילואד) — המלצה בלבד: אותם תרגילים, פחות סטים ומשקל קל יותר, בלי להגיע קרוב לכשל. הוא לא משנה את הרשום באימון אוטומטית.',
  'Lighter (deload) week — a recommendation only: the same exercises, fewer sets and a lighter weight, nowhere near failure. It does not change the workout automatically.',
];
const REST_DAY: Pair = [
  'לפחות יום מנוחה בין אימונים שמעמיסים על אותן קבוצות שרירים.',
  'At least one rest day between sessions that load the same muscle groups.',
];
const ALTERNATE_DAYS: Pair = [
  'אימוני עליון ותחתון מתחלפים, ולכן מותר לקבוע שני אימונים ביום רצוף (למשל שני ושלישי), כל עוד האחד עליון והשני תחתון.',
  'Upper and lower sessions alternate, so two sessions on consecutive days (for example Monday and Tuesday) are allowed as long as one is upper and the other lower.',
];

const D_ORIGINAL: BlockDecision = {
  decision: [
    'כל הסטים, החזרות, המנוחות, סידור השבועות, ה־RIR וההתקדמות הם המלצה מקורית של Gals Coacher. לא נפתח מקור חיצוני, ולכן שום החלטה אינה מסומנת כנתמכת במקור.',
    'Every set, repetition, rest, weekly arrangement, RIR and progression is Gals Coacher’s own recommendation. No external source was opened, so no decision is marked source-supported.',
  ],
  evidence: 'ORIGINAL_RECOMMENDATION',
  sources: [],
};

const COMMON = {
  sources: [],
  decisions: [D_ORIGINAL],
  safety: STRENGTH_SAFETY,
  reviewStatus: 'PENDING_HUMAN_REVIEW' as const,
};

export const PROGRAM_BLOCK_DRAFTS: readonly TrainingBlock[] = [
  {
    ...COMMON,
    id: 'GYM-BEGINNER-4W-01',
    name: ['חדר כושר למתחילים — 4 שבועות', 'Beginner Gym — 4 Weeks'],
    shortName: ['חדר כושר מתחילים', 'Gym Beginner'],
    summary: [
      'ארבעה שבועות, שלושה אימוני גוף מלא בשבוע (א׳ ו־ב׳ לסירוגין). בסיס לימוד טכניקה לפני הרמות כבדות.',
      'Four weeks, three full-body sessions a week (A and B alternating). A technique base before heavier lifting.',
    ],
    goal: ['ללמוד את תרגילי הבסיס בטכניקה נקייה ולבנות הרגל אימון קבוע.', 'Learn the basic lifts with clean technique and build a steady training habit.'],
    athlete: ['מתחילים בחדר כושר, או חוזרים לאימון אחרי הפסקה.', 'People new to the gym, or returning to training after a break.'],
    prerequisite: ['אין תנאי מוקדם; מבוגר אחראי או מאמן מתאים את המשקל והעצימות.', 'No prerequisite; a coach or responsible adult adjusts the weight and intensity.'],
    difficulty: 'BEGINNER',
    weeks: 4,
    sessionsPerWeek: 3,
    schedule: [
      s(1, 1, 'FA', RIR_EASY),
      s(1, 2, 'FB'),
      s(1, 3, 'FA'),
      s(2, 1, 'FB'),
      s(2, 2, 'FA'),
      s(2, 3, 'FB'),
      s(3, 1, 'FA', RIR_MID),
      s(3, 2, 'FB'),
      s(3, 3, 'FA'),
      s(4, 1, 'FB', DELOAD),
      s(4, 2, 'FA', DELOAD),
      s(4, 3, 'FB', DELOAD),
    ],
    progression: [
      ['שבועות 1–2: לומדים את התנועות עם RIR גבוה. שבוע 3: מתקרבים בהדרגה לעצימות מעט גבוהה יותר. שבוע 4: שבוע קל. ההתקדמות היא הערה בלבד ואינה משנה את האימון.', 'Weeks 1–2: learn the movements with a high RIR. Week 3: edge gradually toward slightly higher effort. Week 4: a lighter week. Progression is a note only and does not change the workouts.'],
    ],
    recovery: REST_DAY,
    equipment: ['חדר כושר או ציוד ביתי בסיסי — משקולות יד, מוט ומשקולות, ספסל, מקבילים/מוט עליון לפי האימון.', 'A gym or basic home equipment — dumbbells, barbell and plates, a bench, and a bar or pulldown as each workout needs.'],
    substitutions: [['אם חסר ציוד, מחליפים בתרגיל דומה מהקטלוג; כל החלפה נעשית על ידי מאמן או מבוגר אחראי.', 'If equipment is missing, swap for a similar catalogue exercise; a coach or responsible adult makes any swap.']],
  },
  {
    ...COMMON,
    id: 'GYM-INTERMEDIATE-4W-01',
    name: ['חדר כושר בינוני — 4 שבועות', 'Intermediate Gym — 4 Weeks'],
    shortName: ['חדר כושר בינוני', 'Gym Intermed.'],
    summary: [
      'ארבעה שבועות, ארבעה אימונים בשבוע: עליון א׳, תחתון א׳, עליון ב׳, תחתון ב׳. עליון ותחתון מתחלפים, ולכן מותר לקבוע ימים רצופים.',
      'Four weeks, four sessions a week: Upper A, Lower A, Upper B, Lower B. Upper and lower alternate, so consecutive days are allowed.',
    ],
    goal: ['לבנות כוח ונפח עבודה בחלוקה עליון / תחתון.', 'Build strength and work volume in an upper / lower split.'],
    athlete: ['מתאמנים עם בסיס טכני יציב בתרגילי הבסיס.', 'People with a stable technical base in the basic lifts.'],
    prerequisite: ['נוח עם תרגילי הבסיס; אימוני המוט דורשים ניסיון או השגחת מאמן.', 'Comfortable with the basic lifts; barbell sessions need experience or a coach’s supervision.'],
    difficulty: 'INTERMEDIATE',
    weeks: 4,
    sessionsPerWeek: 4,
    allowAdjacentTrainingDays: true,
    schedule: [
      s(1, 1, 'UA', RIR_MID),
      s(1, 2, 'LA'),
      s(1, 3, 'UB'),
      s(1, 4, 'LB'),
      s(2, 1, 'UA'),
      s(2, 2, 'LA'),
      s(2, 3, 'UB'),
      s(2, 4, 'LB'),
      s(3, 1, 'UA', RIR_HARD),
      s(3, 2, 'LA'),
      s(3, 3, 'UB'),
      s(3, 4, 'LB'),
      s(4, 1, 'UA', DELOAD),
      s(4, 2, 'LA', DELOAD),
      s(4, 3, 'UB', DELOAD),
      s(4, 4, 'LB', DELOAD),
    ],
    progression: [
      ['שבוע 1: RIR 2–3. שבועות 2–3: מוסיפים חזרה או משקל קטן כשכל החזרות נקיות. שבוע 4: שבוע קל. ההתקדמות היא הערה בלבד.', 'Week 1: RIR 2–3. Weeks 2–3: add a repetition or a small weight once every repetition is clean. Week 4: a lighter week. Progression is a note only.'],
    ],
    recovery: ALTERNATE_DAYS,
    equipment: ['חדר כושר מצויד: מוט ומשקולות, משקולות יד, ספסל, מוט עליון או כבלים.', 'An equipped gym: barbell and plates, dumbbells, a bench, and a bar or cable station.'],
    substitutions: [['החלפת תרגיל נעשית על ידי מאמן או מבוגר אחראי, עם מינון משלה.', 'A coach or responsible adult makes any exercise swap, with its own prescription.']],
  },
  {
    ...COMMON,
    id: 'GYM-ADVANCED-4W-01',
    name: ['חדר כושר מתקדם — 4 שבועות', 'Advanced Gym — 4 Weeks'],
    shortName: ['חדר כושר מתקדם', 'Gym Advanced'],
    summary: [
      'ארבעה שבועות, שלושה אימונים בשבוע: דחיפה, משיכה, רגליים. מיועד למנוסים או למתאמנים עם מאמן.',
      'Four weeks, three sessions a week: Push, Pull, Legs. Written for experienced lifters or people training with a coach.',
    ],
    goal: ['לבנות כוח ונפח בחלוקה דחיפה / משיכה / רגליים.', 'Build strength and volume in a push / pull / legs split.'],
    athlete: ['מתאמנים מנוסים בהרמת משקולות, או בהשגחת מאמן.', 'Experienced lifters, or people training under a coach.'],
    prerequisite: ['ניסיון בהרמות מוט, או השגחת מאמן; מבוגר אחראי קובע התאמה לגיל וליכולת.', 'Experience with barbell lifts, or a coach’s supervision; a responsible adult decides suitability for age and ability.'],
    difficulty: 'ADVANCED',
    weeks: 4,
    sessionsPerWeek: 3,
    schedule: [
      s(1, 1, 'PU', RIR_HARD),
      s(1, 2, 'PL'),
      s(1, 3, 'LG'),
      s(2, 1, 'PU'),
      s(2, 2, 'PL'),
      s(2, 3, 'LG'),
      s(3, 1, 'PU'),
      s(3, 2, 'PL'),
      s(3, 3, 'LG'),
      s(4, 1, 'PU', DELOAD),
      s(4, 2, 'PL', DELOAD),
      s(4, 3, 'LG', DELOAD),
    ],
    progression: [
      ['שבועות 1–3: מתקדמים בחזרות או במשקל בצעדים קטנים, תמיד עם טכניקה נקייה. שבוע 4: שבוע קל. ההתקדמות היא הערה בלבד.', 'Weeks 1–3: progress in repetitions or weight in small steps, always with clean technique. Week 4: a lighter week. Progression is a note only.'],
    ],
    recovery: REST_DAY,
    equipment: ['חדר כושר מצויד: מוט ומשקולות, מתקן כוח, ספסל, מוט עליון או כבלים.', 'An equipped gym: barbell and plates, a rack, a bench, and a bar or cable station.'],
    substitutions: [['החלפת תרגיל נעשית על ידי מאמן, עם מינון משלה.', 'A coach makes any exercise swap, with its own prescription.']],
  },
];
