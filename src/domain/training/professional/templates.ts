import { SECTION_ROLE_NAMES } from './templateMeta';
import {
  STRENGTH_SAFETY,
  reuse,
  x,
  type GeneralWorkout,
  type Pair,
  type ProfessionalItem,
  type ProfessionalSection,
  type StandardSectionRole,
} from './types';

/**
 * WORKOUT-TEMPLATES-001 (S1) — the 12 NEW built-in Workout Templates, DRAFT CONTENT ONLY.
 *
 * Every one is `PENDING_HUMAN_REVIEW`: nothing here is published, nothing is shown to users until the owner approves it
 * (the library lists only PUBLISHED). Each has exactly Warm-up, Main workout and Cool-down. Every exercise is an existing
 * catalog exercise. Every dosage is Gals Coacher's own ORIGINAL_RECOMMENDATION (see ./templateProvenance); no source is claimed
 * to support the exact sets, repetitions, rest, load guidance or weekly arrangement. No medical or injury-prevention claim.
 * Upper Volume / Lower Volume are deliberately deferred.
 */
const BASE = { sport: null, trainingDomain: 'GENERAL_ATHLETIC', reviewStatus: 'PENDING_HUMAN_REVIEW' } as const;

const section = (role: StandardSectionRole, items: ProfessionalItem[]): ProfessionalSection => ({ name: SECTION_ROLE_NAMES[role], role, items });
const warmUp = (...items: ProfessionalItem[]) => section('WARM_UP', items);
const main = (...items: ProfessionalItem[]) => section('MAIN', items);
const coolDown = (...items: ProfessionalItem[]) => section('COOL_DOWN', items);

const DOSAGE_NOTE: Pair = [
  'המינון (סטים, חזרות ומנוחה) הוא המלצה של Gals Coacher, לא תוכנית רשמית של גוף כלשהו. את העומס בוחרים לפי היכולת — לא רושמים עומס מראש.',
  "The dosage (sets, repetitions and rest) is Gals Coacher's own recommendation, not an official programme of any body. The load is chosen by ability — none is prescribed in advance.",
];
const BARBELL_NOTE: Pair = [
  'האימון כולל תרגילי מוט כבדים. הוא מיועד למי שמנוסה בהרמת משקולות או מתאמן בהשגחת מאמן; התאמה לגיל וליכולת נקבעת על ידי מאמן או מבוגר אחראי.',
  'This workout includes heavy barbell lifts. It is written for people experienced in lifting or training under a coach; suitability for age and ability is decided by a coach or responsible adult.',
];

const LOWER_WARMUP = [...reuse('HIGH_KNEES', 'LEG_SWINGS', 'HIP_90_90'), x('BODYWEIGHT_SQUAT', 1, 10, 0), x('GLUTE_BRIDGE', 1, 10, 0)];
const LOWER_COOLDOWN = reuse('HIP_FLEXOR_STRETCH', 'STANDING_HAMSTRING_STRETCH', 'CALF_STRETCH', 'CHILDS_POSE');
const UPPER_COOLDOWN = reuse('CHILDS_POSE', 'THORACIC_OPEN_BOOK', 'CAT_COW');

export const WORKOUT_TEMPLATE_DRAFTS: readonly GeneralWorkout[] = [
  {
    ...BASE,
    reviewStatus: 'PUBLISHED',
    id: 'GYM-BEG-FULLBODY-A',
    difficulty: 'BEGINNER',
    focus: 'GYM_FULL_BODY',
    name: ['גוף מלא א׳ — מתחילים', 'Full Body A — Beginner'],
    summary: [
      'סקוואט, לחיצה, חתירה ולאנג׳ לאחור — תבנית בסיס לכל הגוף, עם עומס שבוחרים לפי היכולת.',
      'Squat, press, row and reverse lunge — a base full-body workout, with a load chosen by ability.',
    ],
    minutes: [45, 60],
    sections: [
      warmUp(...reuse('JUMPING_JACKS', 'WORLDS_GREATEST_STRETCH', 'CAT_COW'), x('BODYWEIGHT_SQUAT', 1, 10, 0), x('BAND_PULL_APART', 1, 12, 0)),
      main(x('GOBLET_SQUAT', 3, 10, 90), x('DUMBBELL_BENCH_PRESS', 3, 10, 90), x('ONE_ARM_DUMBBELL_ROW', 3, 10, 60), x('REVERSE_LUNGE', 3, 10, 60), x('PLANK', 3, 30, 45)),
      coolDown(...reuse('HIP_FLEXOR_STRETCH', 'STANDING_HAMSTRING_STRETCH', 'CHILDS_POSE')),
    ],
    coachNotes: [DOSAGE_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    reviewStatus: 'PUBLISHED',
    id: 'GYM-BEG-FULLBODY-B',
    difficulty: 'BEGINNER',
    focus: 'GYM_FULL_BODY',
    name: ['גוף מלא ב׳ — מתחילים', 'Full Body B — Beginner'],
    summary: [
      'לחיצת רגליים, לחיצת כתפיים, משיכה עליונה וגשר — השלמה לאימון א׳.',
      'Leg press, shoulder press, lat pulldown and glute bridge — the partner of workout A.',
    ],
    minutes: [45, 60],
    sections: [
      warmUp(...reuse('JUMPING_JACKS', 'WORLDS_GREATEST_STRETCH', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART')),
      main(x('LEG_PRESS', 3, 10, 90), x('DUMBBELL_SHOULDER_PRESS', 3, 10, 90), x('LAT_PULLDOWN', 3, 10, 90), x('GLUTE_BRIDGE', 3, 12, 45), x('DEAD_BUG', 3, 10, 30)),
      coolDown(...reuse('HIP_FLEXOR_STRETCH', 'THORACIC_OPEN_BOOK', 'CHILDS_POSE')),
    ],
    coachNotes: [DOSAGE_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-INT-UPPER-A',
    difficulty: 'INTERMEDIATE',
    focus: 'GYM_UPPER_LOWER',
    name: ['פלג עליון א׳', 'Upper A'],
    summary: [
      'לחיצת חזה, חתירה וכתפיים עם מוט — עליון בנפח בינוני.',
      'Barbell bench press, rowing and shoulders — a moderate-volume upper-body day.',
    ],
    minutes: [55, 70],
    audience: 'EXPERIENCED_OR_SUPERVISED',
    sections: [
      warmUp(...reuse('JUMPING_JACKS', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART'), x('INCLINE_PUSH_UP', 1, 8, 0)),
      main(x('BARBELL_BENCH_PRESS', 4, 8, 120), x('SEATED_CABLE_ROW', 4, 8, 90), x('BARBELL_OVERHEAD_PRESS', 3, 8, 120), x('LAT_PULLDOWN', 3, 10, 90), x('TRICEPS_PUSHDOWN', 3, 12, 60)),
      coolDown(...UPPER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE, BARBELL_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-INT-LOWER-A',
    difficulty: 'INTERMEDIATE',
    focus: 'GYM_UPPER_LOWER',
    name: ['פלג תחתון א׳', 'Lower A'],
    summary: [
      'סקוואט מוט, הינג׳ וחד־רגלי — תחתון בנפח בינוני.',
      'Barbell squat, hinge and single-leg work — a moderate-volume lower-body day.',
    ],
    minutes: [55, 70],
    audience: 'EXPERIENCED_OR_SUPERVISED',
    sections: [
      warmUp(...LOWER_WARMUP),
      main(x('BARBELL_BACK_SQUAT', 4, 8, 150), x('ROMANIAN_DEADLIFT', 3, 8, 120), x('BULGARIAN_SPLIT_SQUAT', 3, 10, 90), x('CALF_RAISE', 3, 12, 45), x('HANGING_KNEE_RAISE', 3, 10, 60)),
      coolDown(...LOWER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE, BARBELL_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-INT-UPPER-B',
    difficulty: 'INTERMEDIATE',
    focus: 'GYM_UPPER_LOWER',
    name: ['פלג עליון ב׳', 'Upper B'],
    summary: [
      'משקולות יד, מתח וכתף אחורית — עליון שני בשבוע, עם דגש אחר.',
      'Dumbbell press, pull-ups and rear shoulder — the second upper day, with a different emphasis.',
    ],
    minutes: [55, 70],
    sections: [
      warmUp(...reuse('JUMPING_JACKS', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART', 'CAT_COW')),
      main(x('DUMBBELL_BENCH_PRESS', 4, 8, 90), x('PULL_UP', 4, 6, 120), x('DUMBBELL_SHOULDER_PRESS', 3, 10, 90), x('FACE_PULL', 3, 12, 60), x('DUMBBELL_BICEPS_CURL', 3, 12, 60)),
      coolDown(...UPPER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-INT-LOWER-B',
    difficulty: 'INTERMEDIATE',
    focus: 'GYM_UPPER_LOWER',
    name: ['פלג תחתון ב׳', 'Lower B'],
    summary: [
      'הרמת מתים, לחיצת רגליים ודחיפת ירכיים — תחתון שני בשבוע.',
      'Deadlift, leg press and hip thrust — the second lower day.',
    ],
    minutes: [55, 70],
    audience: 'EXPERIENCED_OR_SUPERVISED',
    sections: [
      warmUp(...LOWER_WARMUP),
      main(x('DEADLIFT', 3, 5, 180), x('LEG_PRESS', 3, 10, 90), x('WALKING_LUNGE', 3, 12, 60), x('HIP_THRUST', 3, 10, 90), x('SIDE_PLANK', 2, 30, 30)),
      coolDown(...LOWER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE, BARBELL_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-ADV-PUSH',
    difficulty: 'ADVANCED',
    focus: 'GYM_PUSH_PULL_LEGS',
    name: ['דחיפה', 'Push'],
    summary: [
      'לחיצת חזה וכתפיים, מקבילים וטריצפס — יום דחיפה.',
      'Chest and shoulder pressing, dips and triceps — the push day.',
    ],
    minutes: [60, 75],
    audience: 'EXPERIENCED_OR_SUPERVISED',
    sections: [
      warmUp(...reuse('JUMPING_JACKS', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART'), x('INCLINE_PUSH_UP', 1, 8, 0)),
      main(x('BARBELL_BENCH_PRESS', 4, 6, 120), x('BARBELL_OVERHEAD_PRESS', 3, 8, 120), x('PARALLEL_BAR_DIP', 3, 8, 90), x('LATERAL_RAISE', 3, 12, 60), x('TRICEPS_PUSHDOWN', 3, 12, 60)),
      coolDown(...UPPER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE, BARBELL_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-ADV-PULL',
    difficulty: 'ADVANCED',
    focus: 'GYM_PUSH_PULL_LEGS',
    name: ['משיכה', 'Pull'],
    summary: [
      'מתח, חתירות, משיכה עליונה וכתף אחורית — יום משיכה.',
      'Pull-ups, rows, pulldowns and rear shoulder — the pull day.',
    ],
    minutes: [60, 75],
    sections: [
      warmUp(...reuse('JUMPING_JACKS', 'CAT_COW', 'BAND_PULL_APART', 'THORACIC_OPEN_BOOK')),
      main(x('PULL_UP', 4, 6, 120), x('SEATED_CABLE_ROW', 3, 8, 90), x('LAT_PULLDOWN', 3, 10, 90), x('FACE_PULL', 3, 12, 60), x('DUMBBELL_BICEPS_CURL', 3, 12, 60)),
      coolDown(...UPPER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'GYM-ADV-LEGS',
    difficulty: 'ADVANCED',
    focus: 'GYM_PUSH_PULL_LEGS',
    name: ['רגליים', 'Legs'],
    summary: [
      'סקוואט מוט, הינג׳, לחיצת רגליים ושרירי הירך האחורי — יום רגליים.',
      'Barbell squat, hinge, leg press and hamstrings — the legs day.',
    ],
    minutes: [60, 75],
    audience: 'EXPERIENCED_OR_SUPERVISED',
    sections: [
      warmUp(...LOWER_WARMUP),
      main(x('BARBELL_BACK_SQUAT', 4, 6, 150), x('ROMANIAN_DEADLIFT', 3, 8, 120), x('LEG_PRESS', 3, 10, 90), x('WALKING_LUNGE', 3, 12, 60), x('NORDIC_HAMSTRING', 3, 5, 120), x('CALF_RAISE', 4, 12, 45)),
      coolDown(...LOWER_COOLDOWN),
    ],
    coachNotes: [DOSAGE_NOTE, BARBELL_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    reviewStatus: 'PUBLISHED',
    id: 'CORE-FOUNDATION-01',
    difficulty: 'BEGINNER',
    focus: 'CORE',
    name: ['ליבה — בסיס', 'Core Foundation'],
    summary: [
      'פלאנק, באג מת, ציפור־כלב ותרגילי יציבות — בסיס לליבה יציבה.',
      'Plank, dead bug, bird dog and stability work — a base for a stable trunk.',
    ],
    minutes: [25, 35],
    sections: [
      warmUp(...reuse('CAT_COW', 'WORLDS_GREATEST_STRETCH'), x('GLUTE_BRIDGE', 1, 10, 0)),
      main(x('PLANK', 3, 30, 45), x('DEAD_BUG', 3, 10, 30), x('BIRD_DOG', 3, 10, 30), x('SIDE_PLANK', 2, 25, 30), x('PALLOF_PRESS', 3, 10, 45)),
      coolDown(...reuse('CHILDS_POSE', 'CAT_COW', 'HIP_FLEXOR_STRETCH')),
    ],
    coachNotes: [DOSAGE_NOTE],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    reviewStatus: 'PUBLISHED',
    id: 'MOBILITY-FULLBODY-01',
    difficulty: 'BEGINNER',
    focus: 'MOBILITY',
    name: ['מוביליטי לפלג גוף תחתון ועמוד השדרה', 'Lower Body & Spine Mobility'],
    summary: [
      'תנועתיות לירכיים, לגב החזי ולקרסוליים — בקצב רגוע.',
      'Mobility for the hips, the upper back and the ankles — at a calm pace.',
    ],
    minutes: [20, 30],
    sections: [
      warmUp(...reuse('LEG_SWINGS', 'CAT_COW')),
      main(...reuse('WORLDS_GREATEST_STRETCH', 'HIP_90_90', 'THORACIC_OPEN_BOOK', 'ANKLE_KNEE_TO_WALL', 'HIP_FLEXOR_STRETCH')),
      coolDown(...reuse('CHILDS_POSE', 'STANDING_HAMSTRING_STRETCH', 'CALF_STRETCH')),
    ],
    coachNotes: [
      [
        'עובדים בטווח נוח, בלי כאב, ובלי להתאמץ להגיע רחוק. אם משהו כואב — עוצרים.',
        'Work in a comfortable range, without pain and without forcing the range. If something hurts, stop.',
      ],
    ],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'RECOVERY-EASY-01',
    difficulty: 'BEGINNER',
    focus: 'RECOVERY',
    name: ['יום התאוששות קל', 'Easy Recovery Day'],
    summary: [
      'ריצה קלה בקצב שיחה ותנועתיות עדינה — יום קל בין אימונים.',
      'An easy run at a conversational pace and gentle mobility — an easy day between workouts.',
    ],
    minutes: [25, 35],
    sections: [
      warmUp(...reuse('CAT_COW', 'LEG_SWINGS')),
      main(...reuse('EASY_RUN', 'HIP_90_90', 'WORLDS_GREATEST_STRETCH')),
      coolDown(...reuse('CHILDS_POSE', 'CALF_STRETCH', 'STANDING_HAMSTRING_STRETCH')),
    ],
    coachNotes: [
      [
        'קצב קל: אפשר לדבר בזמן הריצה. זה יום קל — לא מוסיפים עצימות.',
        'An easy pace: you can talk while running. This is an easy day — do not add intensity.',
      ],
    ],
    safety: STRENGTH_SAFETY,
    sources: [],
  },
];

export const WORKOUT_TEMPLATES_001_IDS: readonly string[] = WORKOUT_TEMPLATE_DRAFTS.map((w) => w.id);
