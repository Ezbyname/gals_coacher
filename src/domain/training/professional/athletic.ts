import { alt, reuse, x, type GeneralWorkout, type Pair } from './types';

/**
 * TRAINING-BLOCKS-001 — the 13 general-athletic Professional Workouts (no sport). Built almost entirely from the EXISTING
 * Exercise catalog; the six new Exercises (v21) cover only landing, deceleration, reactive agility and running intervals.
 * Every set / repetition / duration / rest below is Gals Coacher's own ORIGINAL_RECOMMENDATION; the structure and the order
 * are SYNTHESIZED (see ./athleticEvidence.ts and the content-review sheet). A TIME-measured sprint or agility target is a
 * generous time CAP in seconds — the athlete records the real time.
 *
 * One workout can serve several Training Blocks; progression is set in the block (per-week adjustments), so there is no
 * duplicate "week 5 version" of a workout.
 */

export const GENERAL_SAFETY: Pair = [
  'מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. אימון לצעירים מתאים לתת בליווי מאמן או מבוגר אחראי, שמתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.',
  'Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.',
];
const SURFACE: Pair = [
  'משטח יציב, יבש ולא חלק, ומרחב נקי סביב.',
  'Use a stable, dry, non-slip surface with clear space around.',
];
const CAP_NOTE: Pair = [
  'יעדי הזמן בספרינטים ובתרגילי הזריזות הם תקרה נדיבה בשניות — לא מטרה. המתאמן מתעד את הזמן בפועל.',
  'The time targets on sprints and agility drills are generous caps in seconds, not goals — the athlete records the real time.',
];
const FULL_REST: Pair = [
  'במאמץ מרבי חכו מנוחה מלאה בין החזרות ועצרו כשהמהירות או הטכניקה יורדות — איכות לפני כמות.',
  'For maximal efforts take full rest between repetitions and stop when speed or technique drops — quality over quantity.',
];

const BASE = { sport: null, trainingDomain: 'GENERAL_ATHLETIC', reviewStatus: 'PENDING_HUMAN_REVIEW' } as const;

export const GENERAL_WORKOUTS: readonly GeneralWorkout[] = [
  {
    ...BASE,
    id: 'ATH-MOVEMENT-FOUNDATION-01',
    difficulty: 'BEGINNER',
    focus: 'ATHLETIC_FOUNDATION',
    name: ['יסודות תנועה', 'Movement Foundation'],
    summary: [
      'היכרות עם דפוסי התנועה הבסיסיים — סקווט, לאנג׳, ציר ירך, דחיפה, משיכה ויציבות הגו — בעומס נמוך ובדגש על איכות התנועה.',
      'An introduction to the basic movement patterns — squat, lunge, hip bridge, push, pull and trunk stability — at low load, with the focus on movement quality.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('CAT_COW', 'WORLDS_GREATEST_STRETCH', 'LEG_SWINGS', 'ANKLE_KNEE_TO_WALL') },
      {
        name: ['דפוסי תנועה', 'Movement patterns'],
        items: [x('BODYWEIGHT_SQUAT', 3, 10, 45), x('REVERSE_LUNGE', 2, 8, 45), x('GLUTE_BRIDGE', 3, 12, 45), x('INCLINE_PUSH_UP', 3, 8, 45), x('BAND_ROW', 3, 12, 45)],
      },
      { name: ['יציבות הגו', 'Trunk stability'], items: [x('BIRD_DOG', 2, 8, 30), x('DEAD_BUG', 2, 8, 30), x('PLANK', 2, 20, 30)] },
      { name: ['סיום ושחרור', 'Cool-down'], items: reuse('HIP_FLEXOR_STRETCH', 'CHILDS_POSE') },
    ],
    coachNotes: [
      [
        'מטרת האימון היא ללמוד תנועה נכונה, לא להתעייף. מעלים עומס רק כשהתנועה נקייה בכל החזרות.',
        'The aim is to learn good movement, not to get tired. Add load only when the movement is clean on every repetition.',
      ],
      [
        'כל הציוד: משקל גוף ורצועת גומי. אפשר להחליף את הדחיפה בשיפוע בדחיפה רגילה כשהמתאמן מוכן.',
        'Equipment: bodyweight and a resistance band. Swap the incline push-up for a regular push-up when the athlete is ready.',
      ],
    ],
    safety: GENERAL_SAFETY,
    sources: ['LTAD-1'],
  },
  {
    ...BASE,
    id: 'ATH-STRENGTH-FULLBODY-A-01',
    difficulty: 'BEGINNER',
    focus: 'STRENGTH_FOUNDATION',
    name: ['כוח כל הגוף א׳', 'Full-Body Strength A'],
    summary: [
      'סקווט, דחיפה אופקית, משיכה אופקית, גשר ירך ויציבות הגו — יום כוח בסיסי שמשלים את כוח ב׳.',
      'Squat, horizontal push, horizontal pull, hip bridge and trunk stability — a foundation strength day that pairs with Strength B.',
    ],
    minutes: [40, 50],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'BAND_PULL_APART', 'GLUTE_BRIDGE') },
      {
        name: ['כוח', 'Strength'],
        items: [x('GOBLET_SQUAT', 3, 8, 90), x('PUSH_UP', 3, 8, 60), x('ONE_ARM_DUMBBELL_ROW', 3, 10, 60), x('GLUTE_BRIDGE', 3, 12, 45)],
      },
      { name: ['הגו והכתפיים', 'Trunk and shoulders'], items: [x('PLANK', 3, 30, 45), x('FACE_PULL', 2, 15, 45)] },
    ],
    coachNotes: [
      [
        'בוחרים משקל שמאפשר את כל החזרות בטכניקה נקייה, עם עוד חזרה או שתיים בצד. מעלים לאט, לפי עיקרון ההתקדמות של התוכנית.',
        'Pick a load that allows every repetition with clean technique and a rep or two in reserve. Progress gradually, following the programme.',
      ],
      [
        'ציוד: משקולת יד או קטלבל, ספסל (לא חובה), רצועה או כבל. אפשר לבצע שורות עם רצועה במקום משקולת.',
        'Equipment: a dumbbell or kettlebell, a bench (optional), a band or cable. Band rows can replace the dumbbell row.',
      ],
    ],
    safety: GENERAL_SAFETY,
    sources: ['LTAD-1', 'ACSM-2009'],
  },
  {
    ...BASE,
    id: 'ATH-STRENGTH-FULLBODY-B-01',
    difficulty: 'BEGINNER',
    focus: 'STRENGTH_FOUNDATION',
    name: ['כוח כל הגוף ב׳', 'Full-Body Strength B'],
    summary: [
      'עבודה על רגל אחת, ציר ירך, משיכה, לחיצה מעל הראש ויציבות נגד סיבוב — משלים את כוח א׳.',
      'Single-leg work, hip hinge, pull, overhead press and anti-rotation — the complement to Strength A.',
    ],
    minutes: [40, 50],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'BAND_PULL_APART', 'BODYWEIGHT_SQUAT') },
      {
        name: ['כוח', 'Strength'],
        items: [x('STEP_UP', 3, 8, 60), x('ROMANIAN_DEADLIFT', 3, 8, 90), x('BAND_ROW', 3, 12, 45), x('DUMBBELL_SHOULDER_PRESS', 3, 8, 60)],
      },
      { name: ['יציבות הגו', 'Trunk stability'], items: [x('PALLOF_PRESS', 3, 10, 45), x('SIDE_PLANK', 2, 25, 30)] },
    ],
    coachNotes: [
      [
        'בציר הירך מתחילים עם משקל קל מאוד ועובדים על גב ישר ואגן שנע אחורה; מעלים עומס רק כשהתנועה נקייה.',
        'On the hip hinge start very light, with a flat back and the hips moving back; add load only once the movement is clean.',
      ],
      [
        'חזרות בעליית הצעד ובעבודת הצד נספרות לכל רגל בנפרד.',
        'Repetitions on the step-up and side work are counted for each side separately.',
      ],
    ],
    safety: GENERAL_SAFETY,
    sources: ['LTAD-1', 'ACSM-2009'],
  },
  {
    ...BASE,
    id: 'ATH-JUMP-LANDING-01',
    difficulty: 'BEGINNER',
    focus: 'EXPLOSIVE_POWER',
    name: ['קפיצה ונחיתה', 'Jump & Landing'],
    summary: [
      'נחיתה מבוקרת לפני קפיצות: ירידה מצעד, קפיצת סקווט עם החזקת הנחיתה וקפיצות קצרות — כמות נמוכה, איכות גבוהה.',
      'Controlled landing before jumping: a step-off landing, a squat jump with a held landing and short low jumps — low volume, high quality.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'ANKLE_KNEE_TO_WALL', 'BODYWEIGHT_SQUAT') },
      { name: ['נחיתה מבוקרת', 'Controlled landing'], items: [x('DROP_LANDING_STICK', 3, 5, 45)] },
      { name: ['קפיצות בסיסיות', 'Low-complexity jumps'], items: [x('SQUAT_JUMP', 3, 5, 60), x('POGO_JUMPS', 2, 10, 45)] },
    ],
    coachNotes: [
      [
        'הנחיתה היא המיומנות: כל חזרה נגמרת בעצירה של שתי שניות בעמידה יציבה. אם הנחיתה רועשת או לא יציבה — מורידים גובה או עוצרים.',
        'The landing is the skill: every repetition ends with a two-second stable hold. If the landing is noisy or unstable, lower the height or stop.',
      ],
      SURFACE,
      [
        'סך המגעים נמוך בכוונה. יותר קפיצות לא בהכרח נותנות יותר שיפור.',
        'The number of ground contacts is deliberately low. More jumps do not necessarily give more improvement.',
      ],
    ],
    safety: GENERAL_SAFETY,
    sources: ['LTAD-1', 'LANDING-ADULTS', 'PLYO-ADOLESCENT'],
  },
  {
    ...BASE,
    id: 'ATH-EXPLOSIVE-LOWER-01',
    difficulty: 'INTERMEDIATE',
    focus: 'EXPLOSIVE_POWER',
    name: ['כוח מתפרץ לרגליים', 'Explosive Lower Body'],
    summary: [
      'נחיתה על רגל אחת, קפיצת קופסה, קפיצות צד וכוח מפרק הירך — פלט מתפרץ באיכות גבוהה עם מנוחות ארוכות.',
      'Single-leg landing, box jump, lateral bounds and hip power — high-quality explosive output with long rests.',
    ],
    minutes: [35, 45],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'BODYWEIGHT_SQUAT') },
      { name: ['הכנת נחיתה', 'Landing primer'], items: [x('DROP_LANDING_STICK', 2, 5, 30), x('SINGLE_LEG_HOP_STICK', 2, 4, 45)] },
      { name: ['קפיצות עוצמה', 'Explosive jumps'], items: [x('BOX_JUMP', 4, 4, 90), x('LATERAL_BOUNDS', 3, 6, 60)] },
      { name: ['כוח ירך', 'Hip power'], items: [x('KETTLEBELL_SWING', 3, 10, 60), x('HIP_THRUST', 3, 6, 90)] },
    ],
    coachNotes: [
      [
        'איכות לפני עייפות: כל קפיצה במאמץ מלא עם מנוחה מלאה. אם הנחיתות מתדרדרות — מפסיקים את הקפיצות.',
        'Quality over fatigue: every jump at full effort with full rest. If the landings deteriorate, stop the jumps.',
      ],
      [
        'ציוד: קופסה או ספסל יציב, קטלבל או משקולת, ספסל להיפ־ת׳ראסט. ללא קופסה אפשר להחליף בקפיצת סקווט.',
        'Equipment: a stable box or bench, a kettlebell or dumbbell, a bench for the hip thrust. Without a box a squat jump can replace the box jump.',
      ],
      SURFACE,
    ],
    safety: GENERAL_SAFETY,
    sources: ['LTAD-1', 'LANDING-ADULTS', 'PLYO-ADOLESCENT'],
  },
  {
    ...BASE,
    id: 'ATH-ROTATIONAL-POWER-01',
    difficulty: 'INTERMEDIATE',
    focus: 'EXPLOSIVE_POWER',
    name: ['כוח סיבובי וזריקות', 'Rotational Power & Throws'],
    summary: [
      'זריקות כדור כבד — סיבוב, הטחה ודחיפה — לצד יציבות נגד סיבוב. עומס נמוך יחסית על הרגליים, שימושי ביום שאחרי קפיצות.',
      'Medicine-ball throws — rotational, slam and chest pass — with anti-rotation stability. A light load on the legs, useful on a day away from jumping.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART') },
      { name: ['זריקות', 'Throws'], items: [x('MED_BALL_ROTATIONAL_THROW', 4, 5, 60), x('MED_BALL_SLAM', 3, 6, 60), x('MED_BALL_CHEST_PASS', 3, 6, 60)] },
      { name: ['דחיפה ויציבות', 'Push and stability'], items: [x('PUSH_UP', 3, 8, 60), x('PALLOF_PRESS', 3, 10, 45), x('SIDE_PLANK', 2, 25, 30)] },
    ],
    coachNotes: [
      [
        'זריקות במהירות מרבית עם כדור שמאפשר תנועה מהירה ונקייה. חזרות הזריקה הסיבובית נספרות לכל צד.',
        'Throw at maximum speed with a ball light enough to move fast and cleanly. Rotational-throw repetitions count for each side.',
      ],
      [
        'ציוד: כדור כבד, קיר או שותף לזריקות, רצועה לפאלוף.',
        'Equipment: a medicine ball, a wall or partner, a band for the Pallof press.',
      ],
    ],
    safety: GENERAL_SAFETY,
    sources: ['LTAD-1'],
  },
  {
    ...BASE,
    id: 'ATH-ACCELERATION-01',
    difficulty: 'BEGINNER',
    focus: 'SPEED_ACCELERATION',
    name: ['האצה', 'Acceleration'],
    summary: [
      'מכניקת האצה ופרצי ספרינט קצרים (10–20 מטרים) באיכות גבוהה, עם מנוחה ארוכה בין החזרות.',
      'Acceleration mechanics and short, high-quality sprints (10–20 metres) with long rests between repetitions.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'A_SKIP', 'HIGH_KNEES') },
      { name: ['מכניקת האצה', 'Acceleration mechanics'], items: [x('FALLING_START_ACCELERATION', 4, 1, 60)] },
      { name: ['ספרינטים קצרים', 'Short sprints'], items: [x('SPRINT_10M', 5, 5, 90), x('SPRINT_20M', 3, 7, 120)] },
    ],
    coachNotes: [FULL_REST, CAP_NOTE, SURFACE],
    safety: GENERAL_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'ATH-SPEED-01',
    difficulty: 'INTERMEDIATE',
    focus: 'SPEED_ACCELERATION',
    name: ['מהירות מרבית', 'Maximum Velocity'],
    summary: [
      'ספרינט ארוך יותר עם ריצה מעופפת — פיתוח מהירות מרבית אחרי שבסיס ההאצה יציב. נפח נמוך ומנוחה מלאה.',
      'Longer sprinting with flying runs — maximum-velocity work once the acceleration base is solid. Low volume, full rest.',
    ],
    minutes: [35, 45],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'A_SKIP', 'HIGH_KNEES') },
      { name: ['הכנה', 'Build-up'], items: [x('FALLING_START_ACCELERATION', 3, 1, 60), x('SPRINT_20M', 2, 7, 120)] },
      { name: ['ריצה מעופפת', 'Flying runs'], items: [x('SPRINT_30M_FLYING', 4, 6, 180)] },
    ],
    coachNotes: [FULL_REST, CAP_NOTE, SURFACE],
    safety: GENERAL_SAFETY,
    sources: [],
  },
  {
    ...BASE,
    id: 'ATH-DECEL-COD-01',
    difficulty: 'INTERMEDIATE',
    focus: 'AGILITY_COD',
    name: ['עצירה ושינויי כיוון', 'Deceleration & Change of Direction'],
    summary: [
      'קודם עצירה מבוקרת, אחר כך שינויי כיוון מתוכננים מראש: T-דריל ו־5-10-5, עם קפיצות צד.',
      'Controlled stopping first, then pre-planned changes of direction: the T-drill and 5-10-5, with lateral bounds.',
    ],
    minutes: [35, 45],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'LATERAL_LUNGE', 'A_SKIP') },
      { name: ['עצירה מבוקרת', 'Controlled deceleration'], items: [x('DECEL_STOP', 4, 4, 60)] },
      { name: ['שינויי כיוון מתוכננים', 'Pre-planned changes of direction'], items: [x('T_DRILL', 3, 16, 120), x('PRO_AGILITY_5_10_5', 3, 8, 120)] },
      { name: ['קפיצות צד', 'Lateral bounds'], items: [x('LATERAL_BOUNDS', 3, 6, 60)] },
    ],
    coachNotes: [
      [
        'מתחילים בקצב מבוקר: העצירה והיציאה מהכיוון צריכות להיות נקיות לפני שמוסיפים מהירות.',
        'Start at a controlled pace: the stop and the exit from the turn must be clean before speed is added.',
      ],
      CAP_NOTE,
      SURFACE,
    ],
    safety: GENERAL_SAFETY,
    sources: ['DECEL-2022'],
  },
  {
    ...BASE,
    id: 'ATH-REACTIVE-AGILITY-01',
    difficulty: 'INTERMEDIATE',
    focus: 'AGILITY_COD',
    name: ['זריזות תגובתית', 'Reactive Agility'],
    summary: [
      'תגובה לאות — מילה, כיוון או מראה של בן זוג — במקום מסלול ידוע מראש. דורש בן זוג או מאמן.',
      'Reacting to a cue — a word, a direction or a partner’s movement — instead of a known path. Needs a partner or coach.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'LATERAL_LUNGE', 'A_SKIP') },
      { name: ['התחלה לפי אות', 'Cue-based starts'], items: [x('COACH_CUE_REACTION_SPRINT', 6, 1, 60)] },
      { name: ['מראה עם בן זוג', 'Partner mirror'], items: [x('PARTNER_MIRROR_DRILL', 4, 15, 45)] },
    ],
    coachNotes: [
      [
        'זריזות תגובתית נבנית אחרי שינויי כיוון מתוכננים. האות חייב להיות בלתי צפוי — לא להודיע מראש על הכיוון.',
        'Reactive agility comes after pre-planned change of direction. The cue must be unpredictable — do not announce the direction in advance.',
      ],
      [
        'בלי בן זוג התרגיל לא עובד: אפשר להחליף בעצירה מבוקרת או בשינוי כיוון מתוכנן.',
        'Without a partner the session does not work as designed: swap in the deceleration stop or a pre-planned change of direction.',
      ],
      SURFACE,
    ],
    safety: GENERAL_SAFETY,
    sources: ['AGILITY-2016'],
  },
  {
    ...BASE,
    id: 'ATH-CONDITIONING-BASE-01',
    difficulty: 'BEGINNER',
    focus: 'CONDITIONING',
    name: ['בסיס אירובי', 'Aerobic Base'],
    summary: [
      'ריצה קלה ורציפה בקצב שמאפשר לדבר — בסיס סיבולת אירובית. שיטה אחת בכל אימון.',
      'Easy continuous running at a pace where you can talk — an aerobic base. One modality per session.',
    ],
    minutes: [25, 35],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'HIGH_KNEES') },
      { name: ['ריצה קלה (או אופניים או חתירה בקצב שיחה)', 'Easy run (or a bike or rower at a conversational pace)'], items: [x('EASY_RUN', 1, 1200, 0)] },
      { name: ['סיום ושחרור', 'Cool-down'], items: reuse('CALF_STRETCH', 'HIP_FLEXOR_STRETCH') },
    ],
    coachNotes: [
      [
        'בוחרים שיטה אחת: ריצה, אופניים או מכשיר חתירה, באותה משך ובקצב שיחה נוח. את ההחלפה עושים בעריכת האימון; הריצה היא ברירת המחדל.',
        'Pick ONE modality: running, a bike or a rower, for the same duration at a comfortable conversational pace. Swap it when editing the workout; running is the default.',
      ],
      SURFACE,
    ],
    safety: GENERAL_SAFETY,
    sources: ['HIIT-YOUTH'],
  },
  {
    ...BASE,
    id: 'ATH-CONDITIONING-INTERVALS-01',
    difficulty: 'BEGINNER',
    focus: 'CONDITIONING',
    name: ['אינטרוולים', 'Intervals'],
    summary: [
      'מקטעי ריצה מהירים אך מבוקרים עם מנוחה בין המקטעים. ללא ציוד מיוחד; לכל חלופה יש מינון משלה.',
      'Fast but controlled running efforts with rest between them. No special equipment; each alternative modality has its own prescription.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'HIGH_KNEES', 'A_SKIP') },
      {
        name: ['אינטרוולי ריצה (או אינטרוולים באופניים, בסקי ארג, בחתירה או בחבל קפיצה)', 'Run intervals (or intervals on a bike, ski erg, rower or jump rope)'],
        items: [
          x('RUN_INTERVALS', 6, 45, 90, [
            alt('BIKE_INTERVALS', 8, 30, 60),
            alt('SKI_ERG_INTERVALS', 6, 30, 60),
            alt('ROW_500M', 4, 150, 120),
            alt('JUMP_ROPE', 6, 40, 60),
          ]),
        ],
      },
      { name: ['סיום ושחרור', 'Cool-down'], items: reuse('CALF_STRETCH', 'STANDING_HAMSTRING_STRETCH') },
    ],
    coachNotes: [
      [
        'שיטה אחת בלבד בכל אימון. כל חלופה מגיעה עם מינון משלה — לא מניחים שאותו מינון מתאים לכל מכשיר.',
        'ONE modality per session. Each alternative comes with its own prescription — the same dosage is never assumed to suit every device.',
      ],
      [
        'הקצב אחיד בכל המקטעים. אם הקצב יורד בחדות — מקצרים את האימון.',
        'Keep an even pace across the efforts. If the pace drops sharply, shorten the session.',
      ],
      SURFACE,
    ],
    safety: GENERAL_SAFETY,
    sources: ['HIIT-YOUTH'],
  },
  {
    ...BASE,
    id: 'ATH-REPEATED-EFFORT-01',
    difficulty: 'INTERMEDIATE',
    focus: 'CONDITIONING',
    name: ['מאמץ חוזר', 'Repeated Effort'],
    summary: [
      'ספרינטים קצרים חוזרים (20 מטרים) עם מנוחות קצרות, בשלושה סבבים — יכולת לחזור על מאמץ. גרסת שטח פשוטה.',
      'Repeated short sprints (20 metres) with short rests in three rounds — the ability to repeat an effort. A simple field version.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'A_SKIP', 'HIGH_KNEES') },
      { name: ['סבב 1', 'Round 1'], items: [x('SPRINT_20M', 6, 7, 25, [alt('SHUTTLE_RUN', 6, 30, 30), alt('SLED_PUSH', 6, 10, 30), alt('BATTLE_ROPE_WAVES', 6, 20, 30)])] },
      { name: ['סבב 2 — אחרי כשתי דקות מנוחה', 'Round 2 — after about two minutes of rest'], items: [x('SPRINT_20M', 6, 7, 25)] },
      { name: ['סבב 3 — אחרי כשתי דקות מנוחה', 'Round 3 — after about two minutes of rest'], items: [x('SPRINT_20M', 6, 7, 25)] },
    ],
    coachNotes: [
      [
        'ספרינטים של עד 10 שניות עם מנוחה של עד 60 שניות; כשתי דקות בין הסבבים. מתחילים בשני סבבים אם צריך.',
        'Sprints of up to 10 seconds with up to 60 seconds of rest, and about two minutes between rounds. Start with two rounds if needed.',
      ],
      [
        'אם אין מקום ל־20 מטרים: ריצת הלוך־וחזור (שאטל), או מזחלת וחבלי קרב לפי הציוד. לכל חלופה מינון משלה.',
        'If there is no room for 20 metres: shuttle runs, or a sled or battle ropes if available. Each alternative has its own prescription.',
      ],
      CAP_NOTE,
      SURFACE,
    ],
    safety: GENERAL_SAFETY,
    sources: ['RST-NSCA', 'RSA-2011'],
  },
];
