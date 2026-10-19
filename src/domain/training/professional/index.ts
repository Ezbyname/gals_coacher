import { SURF_SAFETY } from '../../exercise/catalog/surfing';
import type { Difficulty } from '../../exercise/taxonomy';

import { EXPANDED_WORKOUTS } from './expanded';
import { reuse, x, type Pair, type ProfessionalSport, type ProfessionalWorkout, type TrainingFocus } from './types';

export * from './types';

/**
 * SPORT-CONTENT-001 — the professional starter workouts (Surfing and Football × Beginner / Intermediate / Advanced).
 *
 * READ-ONLY managed source content, in code: no table, no row, no user data. Using one COPIES its sections into a
 * Player's PlannedWorkout (new, or an existing editable one); the copy is independent, so editing it never changes this
 * source, and changing this source later never rewrites a workout that was already copied. `difficulty` is content
 * progression metadata — never a medical or readiness assessment of a player.
 *
 * A section is copied in the existing legacy grouping (a named run of items, no Block behind it), so no PlannedWorkout
 * schema changes. Coach notes (the surf briefing, video review) have no home in a plan item and are shown on the
 * workout's own screen instead; they are not copied.
 */
const SURF_BRIEFING: Pair = [
  'תדריך לפני הים (5 דקות): עוצרים, מסתכלים, מתכננים. מזהים סימני זרם יוצא ("ריפ"), מתאמים כללי עדיפות ואתיקה בין גולשים, וקובעים איפה נכנסים ויוצאים. אם נקלעים לזרם: צפים על הלוח, מסמנים לעזרה ושוחים במקביל לחוף.',
  'Briefing before the water (5 minutes): stop, look, plan. Spot rip-current signs, agree priority and etiquette between surfers, and decide where to enter and exit. If caught in a rip: float on the board, signal for help and swim parallel to the shore.',
];
const SURF_VIDEO_REVIEW: Pair = [
  'סקירת וידאו או מאמן (10 דקות): צופים בגלים שנתפסו ובתמרונים, ומסכמים שתי נקודות לשיפור לפעם הבאה.',
  'Video or coach review (10 minutes): watch the waves caught and the manoeuvres, and agree two points to improve next time.',
];

const SURF_WARMUP: Pair = ['חימום לפני גלישה', 'Pre-surf activation'];
const SURF_COOLDOWN: Pair = ['מוביליטי ושחרור', 'Mobility cooldown'];
const FB_WARMUP: Pair = ['חימום טכני', 'Technical activation'];

/** The six SPORT-CONTENT-001 workouts (unchanged apart from their `focus` tag). */
const CORE_WORKOUTS: readonly ProfessionalWorkout[] = [
  {
    id: 'SURF-FOUNDATION-01',
    sport: 'SURFING',
    difficulty: 'BEGINNER',
    focus: 'SURF_TECHNIQUE',
    name: ['גלישה — מתחילים', 'Surfing — Beginner'],
    summary: [
      'קימה, חתירה, גלי קצף ובחירת גל — הבסיס לגלישה בטוחה ונהנית.',
      'Pop-up, paddling, whitewater and wave choice — the base for safe, enjoyable surfing.',
    ],
    minutes: [45, 60],
    sections: [
      { name: SURF_WARMUP, items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART') },
      {
        name: ['קימה, חתירה וגלים', 'Pop-up, paddling and waves'],
        items: [
          x('SURF_POP_UP', 3, 6, 30),
          x('SURF_PADDLING', 3, 120, 60),
          x('SURF_TAKE_OFF', 2, 4, 60),
          x('SURF_TRIM_AND_SPEED', 1, 6, 0),
          x('SURF_WAVE_SELECTION_POSITIONING', 1, 5, 0),
        ],
      },
      { name: SURF_COOLDOWN, items: reuse('HIP_90_90', 'THORACIC_OPEN_BOOK', 'CHILDS_POSE') },
    ],
    coachNotes: [SURF_BRIEFING],
    safety: SURF_SAFETY,
    sources: ['SA-CAMPS', 'SA-SCHED', 'SA-TIPS', 'SLS-RIP', 'ISA-COURSES'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'SURF-PROGRESSION-01',
    sport: 'SURFING',
    difficulty: 'INTERMEDIATE',
    focus: 'SURF_TECHNIQUE',
    name: ['גלישה — בינוני', 'Surfing — Intermediate'],
    summary: [
      'חתירה יעילה, צלילת ברווז, מיקום ופניות בסיסיות — מרכיבים רכיבה לפנייה.',
      'Efficient paddling, duck-dive, positioning and basic turns — building a ride into a turn.',
    ],
    minutes: [60, 75],
    sections: [
      { name: SURF_WARMUP, items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART', 'BODYWEIGHT_SQUAT') },
      {
        name: ['חתירה, מיקום ופניות', 'Paddling, positioning and turns'],
        items: [
          x('SURF_PADDLING', 3, 180, 60),
          x('SURF_DUCK_DIVE', 2, 4, 60),
          x('SURF_WAVE_SELECTION_POSITIONING', 1, 6, 0),
          x('SURF_TRIM_AND_SPEED', 1, 7, 0),
          x('SURF_BOTTOM_TURN', 2, 5, 45),
          x('SURF_CUTBACK', 2, 5, 45),
        ],
      },
      { name: SURF_COOLDOWN, items: reuse('HIP_90_90', 'THORACIC_OPEN_BOOK', 'HIP_FLEXOR_STRETCH', 'CHILDS_POSE') },
    ],
    coachNotes: [SURF_BRIEFING],
    safety: SURF_SAFETY,
    sources: ['SA-CAMPS', 'SA-SCHED', 'SA-COACH', 'SA-PROG', 'SLS-RIP'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'SURF-PERFORMANCE-01',
    sport: 'SURFING',
    difficulty: 'ADVANCED',
    focus: 'SURF_TECHNIQUE',
    name: ['גלישה — מתקדמים', 'Surfing — Advanced'],
    summary: [
      'האצת חתירה, שילוב בוטום-טופ, קאטבק, סימולציית היט וסקירה — עבודה על ביצועים.',
      'Paddle acceleration, bottom-to-top combination, cutback, a heat simulation and review — performance work.',
    ],
    minutes: [75, 90],
    sections: [
      {
        name: ['חימום דינמי לגלישה', 'Dynamic surf activation'],
        items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'BAND_PULL_APART', 'BODYWEIGHT_SQUAT', 'LATERAL_LUNGE'),
      },
      {
        name: ['ביצועים בגלים', 'Performance in the waves'],
        items: [
          x('SURF_PADDLING', 5, 30, 45),
          x('SURF_WAVE_SELECTION_POSITIONING', 1, 8, 0),
          x('SURF_BOTTOM_TURN', 2, 5, 45),
          x('SURF_TOP_TURN', 2, 5, 45),
          x('SURF_CUTBACK', 1, 5, 60),
          x('SURF_TRIM_AND_SPEED', 1, 6, 0),
          x('SURF_HEAT_SIMULATION', 2, 900, 300),
        ],
      },
      { name: ['התאוששות', 'Recovery mobility'], items: reuse('HIP_90_90', 'CAT_COW', 'CHILDS_POSE', 'CALF_STRETCH') },
    ],
    coachNotes: [SURF_BRIEFING, SURF_VIDEO_REVIEW],
    safety: SURF_SAFETY,
    sources: ['SA-CAMPS', 'SA-SCHED', 'SA-COACH', 'SA-PROG', 'SLS-RIP'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'FOOTBALL-FOUNDATION-01',
    sport: 'FOOTBALL',
    difficulty: 'BEGINNER',
    focus: 'ALL_ROUND',
    name: ['כדורגל — מתחילים', 'Football — Beginner'],
    summary: [
      'שליטה בכדור, דריבל, מסירה ובעיטה — הרבה מגעים בכדור ומשחק קטן.',
      'Ball mastery, dribbling, passing and shooting — many touches on the ball and a small game.',
    ],
    minutes: [45, 55],
    sections: [
      { name: FB_WARMUP, items: reuse('HIGH_KNEES', 'A_SKIP', 'BUTT_KICKS', 'LATERAL_LUNGE', 'AGILITY_LADDER_FOOTWORK') },
      {
        name: ['טכניקה ובעיטה', 'Technique and shooting'],
        items: [
          x('FB_BALL_MASTERY', 1, 300, 30),
          x('FB_DRIBBLING_COURSE', 4, 60, 30),
          x('FB_PASS_AND_CONTROL', 6, 10, 20),
          x('FB_DRIBBLE_AND_SHOOT', 1, 10, 60),
          x('FB_SHOOTING_ACCURACY', 1, 10, 60),
        ],
      },
      { name: ['משחק קטן', 'Small game'], items: [x('FB_SMALL_SIDED_GAME', 1, 600, 0)] },
    ],
    coachNotes: [
      [
        'המשחק הקטן (1 נגד 1 או 2 נגד 2) מתאים כשיש פרטנר; בלי פרטנר אפשר לדלג עליו.',
        'The small game (1v1 or 2v2) suits when there is a partner; without one it can be skipped.',
      ],
    ],
    safety: null,
    sources: ['F-ONCE', 'F-DRIB48', 'F-PASSREC', 'F-64', 'F-57', 'F-51'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'FOOTBALL-PROGRESSION-01',
    sport: 'FOOTBALL',
    difficulty: 'INTERMEDIATE',
    focus: 'ALL_ROUND',
    name: ['כדורגל — בינוני', 'Football — Intermediate'],
    summary: [
      'קומבינציות, מגע ראשון והסתובבות, גימור ורגל חלשה, ומשחק של 2 נגד 2 או 3 נגד 3.',
      'Combinations, first touch and turn, finishing and the weaker foot, and a 2v2 or 3v3 game.',
    ],
    minutes: [60, 70],
    sections: [
      { name: FB_WARMUP, items: reuse('LEG_SWINGS', 'HIGH_KNEES', 'A_SKIP', 'LATERAL_LUNGE') },
      {
        name: ['טכניקה ומשחק משולב', 'Technique and combination play'],
        items: [
          x('FB_COMBINATION_PLAY', 4, 120, 30),
          x('FB_FIRST_TOUCH_AND_TURN', 6, 8, 30),
          x('FB_DRIBBLE_AND_SHOOT', 1, 10, 60),
          x('FB_PASS_AND_CONTROL', 3, 10, 20),
        ],
      },
      { name: ['משחק קטן', 'Small game'], items: [x('FB_SMALL_SIDED_GAME', 1, 900, 0)] },
    ],
    coachNotes: [
      [
        'המסירה והשליטה בסעיף הזה מתמקדות ברגל החלשה: כל שלושת הסטים ברגל החלשה.',
        'The passing and control item here focuses on the weaker foot: all three sets with the weaker foot.',
      ],
    ],
    safety: null,
    sources: ['F-PASSREC', 'F-FINATK', 'F-TCP-1V1', 'F-ADV812', 'F-111', 'F-42'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'FOOTBALL-PERFORMANCE-01',
    sport: 'FOOTBALL',
    difficulty: 'ADVANCED',
    focus: 'ALL_ROUND',
    name: ['כדורגל — מתקדמים', 'Football — Advanced'],
    summary: [
      'רונדו, קבלה והסתובבות בלחץ, מעבר להתקפה, גימור בלחץ ומשחק מעבר.',
      'Rondo, receiving and turning under pressure, attacking transition, finishing under pressure and a transition game.',
    ],
    minutes: [70, 85],
    sections: [
      {
        name: ['חימום טכני דינמי', 'Dynamic technical warm-up'],
        items: reuse('HIGH_KNEES', 'A_SKIP', 'LATERAL_LUNGE', 'AGILITY_LADDER_FOOTWORK', 'BODYWEIGHT_SQUAT'),
      },
      {
        name: ['לחץ ומעבר', 'Pressure and transition'],
        items: [
          x('FB_RONDO', 4, 120, 60),
          x('FB_FIRST_TOUCH_AND_TURN', 3, 6, 30),
          x('FB_ATTACKING_TRANSITION_OVERLOAD', 1, 7, 90),
          x('FB_FINISHING_UNDER_PRESSURE', 1, 10, 90),
        ],
      },
      { name: ['משחק מעבר', 'Transition game'], items: [x('FB_SMALL_SIDED_GAME', 1, 1080, 0)] },
    ],
    coachNotes: [
      [
        'ההתאמה של האימון המתקדם לגיל ולרמה של השחקן נקבעת על ידי המאמן; מתאימים את העצימות ואת המגע.',
        'Whether this advanced session suits the player\'s age and level is the coach\'s decision; adjust the intensity and the contact.',
      ],
    ],
    safety: null,
    sources: ['F-FINATK', 'F-ADV812', 'F-SKILL1215', 'F-TCP-3V2', 'F-TCP-1V1', 'F-MEXU15', 'F-TRANS1215'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
];

/** Every professional workout: the six of SPORT-CONTENT-001, then the nine of SPORT-CONTENT-002. */
export const PROFESSIONAL_WORKOUTS: readonly ProfessionalWorkout[] = [...CORE_WORKOUTS, ...EXPANDED_WORKOUTS];
/** The ids of the SPORT-CONTENT-001 workouts, which SPORT-CONTENT-002 must never change. */
export const SPORT_CONTENT_001_WORKOUT_IDS: readonly string[] = CORE_WORKOUTS.map((w) => w.id);

const BY_ID = new Map(PROFESSIONAL_WORKOUTS.map((w) => [w.id, w]));

export function professionalWorkout(id: string): ProfessionalWorkout | null {
  return BY_ID.get(id) ?? null;
}

export function professionalWorkoutsFor(
  sport: ProfessionalSport | null,
  difficulty: Difficulty | null,
  focus: TrainingFocus | null = null,
): ProfessionalWorkout[] {
  return PROFESSIONAL_WORKOUTS.filter(
    (w) => (sport === null || w.sport === sport) && (difficulty === null || w.difficulty === difficulty) && (focus === null || w.focus === focus),
  );
}

export function professionalExerciseCount(workout: ProfessionalWorkout): number {
  return workout.sections.reduce((sum, s) => sum + s.items.length, 0);
}
