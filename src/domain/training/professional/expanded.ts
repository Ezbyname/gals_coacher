import { reuse, STRENGTH_SAFETY, x, type Pair, type ProfessionalWorkout } from './types';

/**
 * SPORT-CONTENT-002 — the expanded catalog, added ON TOP of the six SPORT-CONTENT-001 workouts (which are not touched):
 *   Surfing   — 3 dry-land Strength & Fitness workouts (beside the 3 ocean Technique workouts),
 *   Football  — 3 targeted workouts (first touch & passing, 1v1 & finishing, transition & pressing),
 *   Basketball— 3 targeted workouts (ball handling, shooting & finishing, defense & rebounding).
 * Exercises are REUSED from the existing built-in catalog; the only new one is the Basketball BOX_OUT_DRILL.
 * Every dosage is Gals Coacher's own (ORIGINAL_RECOMMENDATION). Difficulty describes the workout's content, never a
 * player's readiness.
 */
const ADVANCED_NOTE: Pair = [
  'תוכן מתקדם עשוי לדרוש התאמה על ידי מאמן או מבוגר אחראי לפי גיל, ניסיון ויכולת גופנית.',
  'Advanced content may require adjustment by a coach or responsible adult based on age, experience and physical ability.',
];
const OCEAN_NOTE: Pair = [
  'האימון הזה מתבצע על היבשה. אימוני הים (טכניקת גלישה) נושאים את אזהרת תנאי הים.',
  'This workout is done on dry land. The ocean sessions (Surf Technique workouts) carry the ocean-conditions warning.',
];
const NOT_PADDLING: Pair = [
  'תרגילי הכושר כאן תומכים בדרישות הגלישה, אבל אינם זהים לחתירה או לגלישה, והם לא מחליפים אימון במים.',
  'The fitness exercises here support the demands of surfing, but they are not the same as paddling or surfing and do not replace time in the water.',
];

const WARM = (he: string, en: string): Pair => [he, en];

export const EXPANDED_WORKOUTS: readonly ProfessionalWorkout[] = [
  // ------------------------------------------------------------------ SURFING — dry-land Strength & Fitness
  {
    id: 'SURF-FITNESS-FOUNDATION-01',
    sport: 'SURFING',
    difficulty: 'BEGINNER',
    focus: 'SURF_STRENGTH_FITNESS',
    name: ['כוח וכושר לגלישה — מתחילים', 'Surf Strength — Beginner'],
    summary: [
      'בסיס גופני לגלישה על היבשה: כתפיים ושכמות, גב עליון, דחיפה, יציבות הגו, ירכיים ורגליים ומוביליטי.',
      'A dry-land physical base for surfing: shoulders and shoulder blades, upper back, pushing, trunk stability, hips and legs, and mobility.',
    ],
    minutes: [45, 60],
    sections: [
      { name: WARM('חימום והפעלת כתפיים', 'Warm-up and shoulder activation'), items: reuse('CAT_COW', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART', 'LEG_SWINGS') },
      {
        name: ['כוח בסיס', 'Foundation strength'],
        items: [
          x('BAND_ROW', 3, 12, 45),
          x('PUSH_UP', 3, 8, 60),
          x('FACE_PULL', 3, 12, 45),
          x('GOBLET_SQUAT', 3, 10, 60),
          x('REVERSE_LUNGE', 2, 8, 45),
          x('GLUTE_BRIDGE', 3, 12, 45),
        ],
      },
      { name: ['יציבות הגו', 'Trunk stability'], items: [x('PLANK', 3, 30, 30), x('DEAD_BUG', 3, 8, 30), x('BIRD_DOG', 3, 8, 30)] },
      { name: ['מוביליטי ושחרור', 'Mobility cooldown'], items: reuse('HIP_90_90', 'WORLDS_GREATEST_STRETCH', 'CHILDS_POSE') },
    ],
    coachNotes: [NOT_PADDLING, OCEAN_NOTE],
    safety: STRENGTH_SAFETY,
    sources: ['SA-SCHED', 'ISA-STRENGTH', 'SURF-PHYSIOLOGY'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'SURF-PADDLE-ENDURANCE-01',
    sport: 'SURFING',
    difficulty: 'INTERMEDIATE',
    focus: 'SURF_STRENGTH_FITNESS',
    name: ['סבולת חתירה — בינוני', 'Paddle Endurance — Intermediate'],
    summary: [
      'סבולת משיכה, גב עליון, שליטה בשכמות וסבולת הגו, עם מקטעי מאמץ חוזרים — בהשראת אופי החתירה.',
      'Pulling endurance, upper back, shoulder-blade control and trunk endurance, with repeated short efforts — inspired by the intermittent nature of paddling.',
    ],
    minutes: [55, 70],
    sections: [
      { name: WARM('חימום והפעלה', 'Warm-up and activation'), items: reuse('CAT_COW', 'THORACIC_OPEN_BOOK', 'BAND_PULL_APART', 'WORLDS_GREATEST_STRETCH') },
      {
        name: ['סבולת משיכה', 'Pulling endurance'],
        items: [x('ONE_ARM_DUMBBELL_ROW', 3, 15, 45), x('SEATED_CABLE_ROW', 3, 15, 45), x('FACE_PULL', 3, 20, 30), x('INVERTED_ROW', 3, 12, 45)],
      },
      { name: ['סבולת הגו', 'Trunk endurance'], items: [x('PLANK', 3, 45, 30), x('SIDE_PLANK', 2, 30, 30), x('HOLLOW_HOLD', 3, 20, 30)] },
      {
        name: ['מאמץ חוזר במקטעים', 'Repeated-effort intervals'],
        items: [x('SKI_ERG_INTERVALS', 6, 30, 60), x('BATTLE_ROPE_WAVES', 6, 20, 40), x('MOUNTAIN_CLIMBERS', 3, 30, 30)],
      },
      { name: ['מוביליטי והתאוששות', 'Mobility and recovery'], items: reuse('THORACIC_OPEN_BOOK', 'HIP_FLEXOR_STRETCH', 'CHILDS_POSE', 'CAT_COW') },
    ],
    coachNotes: [
      NOT_PADDLING,
      [
        'אם אין סקי-ארג, אפשר להחליף במכונת חתירה או בחבלי קרב עם אותו מבנה מקטעים.',
        'If there is no ski erg, a rowing machine or battle ropes can replace it with the same interval structure.',
      ],
      OCEAN_NOTE,
    ],
    safety: STRENGTH_SAFETY,
    sources: ['SA-SCHED', 'ISA-STRENGTH', 'SURF-PHYSIOLOGY'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'SURF-POWER-ROTATION-01',
    sport: 'SURFING',
    difficulty: 'ADVANCED',
    focus: 'SURF_STRENGTH_FITNESS',
    name: ['כוח וסיבוב לגלישה — מתקדמים', 'Surf Power & Rotation — Advanced'],
    summary: [
      'כוח רגליים, הארכה מתפרצת, כוח הגו בסיבוב ויציבות בסיבוב, וחיזוק עליון — תמיכה בתנועה עוצמתית.',
      'Leg strength, explosive extension, rotational trunk strength and anti-rotation stability, and upper-body strength — supporting powerful movement.',
    ],
    minutes: [60, 75],
    sections: [
      { name: WARM('חימום דינמי', 'Dynamic warm-up'), items: reuse('LEG_SWINGS', 'WORLDS_GREATEST_STRETCH', 'BAND_PULL_APART', 'BODYWEIGHT_SQUAT', 'POGO_JUMPS') },
      {
        name: ['כוח רגליים והארכה מתפרצת', 'Leg strength and explosive extension'],
        items: [
          x('BULGARIAN_SPLIT_SQUAT', 3, 8, 90),
          x('SINGLE_LEG_RDL', 3, 8, 60),
          x('HIP_THRUST', 3, 8, 90),
          x('SQUAT_JUMP', 3, 5, 60),
          x('BOX_JUMP', 4, 4, 90),
          x('KETTLEBELL_SWING', 4, 12, 60),
        ],
      },
      { name: ['דחיפה, משיכה וקימה', 'Push, pull and get-up pattern'], items: [x('PUSH_UP', 3, 12, 60), x('INVERTED_ROW', 3, 10, 60), x('FACE_PULL', 3, 15, 45), x('BURPEE', 3, 8, 60)] },
      {
        name: ['סיבוב ויציבות הגו', 'Rotation and trunk stability'],
        items: [x('MED_BALL_ROTATIONAL_THROW', 3, 6, 60), x('PALLOF_PRESS', 3, 10, 45), x('SIDE_PLANK', 3, 30, 30), x('RUSSIAN_TWIST', 3, 16, 45)],
      },
      { name: ['מוביליטי', 'Mobility'], items: reuse('HIP_90_90', 'THORACIC_OPEN_BOOK', 'CHILDS_POSE') },
    ],
    coachNotes: [
      NOT_PADDLING,
      [
        'הבורפי משמש כתבנית "שכיבה וקימה" כללית ואינו מחקה את הקימה על הלוח. כוח לבדו אינו הופך אדם לגולש מתקדם.',
        'The burpee is a general lie-down-and-get-up pattern and does not copy the pop-up. Strength alone does not make a surfer advanced.',
      ],
      ADVANCED_NOTE,
      OCEAN_NOTE,
    ],
    safety: STRENGTH_SAFETY,
    sources: ['SA-SCHED', 'ISA-STRENGTH', 'SURF-PHYSIOLOGY'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },

  // ------------------------------------------------------------------ FOOTBALL — targeted workouts
  {
    id: 'FOOTBALL-FIRST-TOUCH-PASSING-01',
    sport: 'FOOTBALL',
    difficulty: 'INTERMEDIATE',
    focus: 'PASSING',
    name: ['כדורגל — מגע ראשון ומסירות', 'Football — First Touch & Passing'],
    summary: [
      'קבלה, מגע ראשון, דיוק מסירה, תנועה אחרי המסירה ומשחק קומבינציות.',
      'Receiving, first touch, passing accuracy, movement after the pass and combination play.',
    ],
    minutes: [55, 65],
    sections: [
      { name: ['חימום טכני', 'Technical activation'], items: reuse('HIGH_KNEES', 'A_SKIP', 'LATERAL_LUNGE', 'AGILITY_LADDER_FOOTWORK') },
      {
        name: ['מגע ראשון ומסירה', 'First touch and passing'],
        items: [x('FB_BALL_MASTERY', 1, 240, 30), x('FB_PASS_AND_CONTROL', 6, 10, 20), x('FB_FIRST_TOUCH_AND_TURN', 6, 8, 30)],
      },
      { name: ['קומבינציות ושמירת כדור', 'Combinations and keep-ball'], items: [x('FB_COMBINATION_PLAY', 4, 150, 30), x('FB_RONDO', 4, 120, 60)] },
    ],
    coachNotes: [
      [
        'לפני שהכדור מגיע — מסתכלים סביב (סריקה) ופותחים את הגוף; אחרי המסירה — זזים מיד לחלל.',
        'Before the ball arrives, look around (scan) and open the body; after the pass, move into space at once.',
      ],
    ],
    safety: null,
    sources: ['F-PASSREC', 'F-FINATK', 'F-SKILL1215', 'F-ONCE', 'F-TCP-1V1', 'F-42'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'FOOTBALL-1V1-FINISHING-01',
    sport: 'FOOTBALL',
    difficulty: 'INTERMEDIATE',
    focus: 'FINISHING',
    name: ['כדורגל — 1 על 1 וגימור', 'Football — 1v1 & Finishing'],
    summary: [
      'דריבל מול מגן, שינוי כיוון, קבלה בתנועה, יצירת מקום לבעיטה וגימור.',
      'Dribbling at a defender, changing direction, receiving on the move, creating space to shoot and finishing.',
    ],
    minutes: [55, 65],
    sections: [
      { name: ['חימום טכני', 'Technical activation'], items: reuse('HIGH_KNEES', 'A_SKIP', 'BUTT_KICKS', 'LATERAL_LUNGE') },
      {
        name: ['דריבל, קבלה וגימור', 'Dribbling, receiving and finishing'],
        items: [x('FB_DRIBBLING_COURSE', 4, 60, 30), x('FB_FIRST_TOUCH_AND_TURN', 6, 6, 30), x('FB_DRIBBLE_AND_SHOOT', 1, 10, 60), x('FB_SHOOTING_ACCURACY', 1, 10, 60)],
      },
      { name: ['משחק 1 על 1 / 2 על 2', 'A 1v1 / 2v2 game'], items: [x('FB_SMALL_SIDED_GAME', 1, 720, 0)] },
    ],
    coachNotes: [
      [
        'במשחק מתחילים ב-1 על 1 ועוברים ל-2 על 2 כשיש שחקנים; בלי מגע גופני חזק.',
        'In the game start with 1v1 and move to 2v2 when there are players; no hard body contact.',
      ],
    ],
    safety: null,
    sources: ['F-TCP-1V1', 'F-FINATK', 'F-DRIB48', 'F-57', 'F-51'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'FOOTBALL-TRANSITION-PRESSING-01',
    sport: 'FOOTBALL',
    difficulty: 'ADVANCED',
    focus: 'TRANSITION',
    name: ['כדורגל — מעבר ולחץ', 'Football — Transition & Pressing'],
    summary: [
      'תגובה במעבר, יתרון מספרי, משחק קטן, כללי לחץ אחרי איבוד כדור וקבלת החלטות — דרך פעילות כדורגל.',
      'Reacting in transition, numerical advantage, small-sided play, pressing rules after losing the ball and decision making — through football activity.',
    ],
    minutes: [65, 80],
    sections: [
      { name: ['חימום טכני דינמי', 'Dynamic technical warm-up'], items: reuse('HIGH_KNEES', 'A_SKIP', 'LATERAL_LUNGE', 'AGILITY_LADDER_FOOTWORK', 'BODYWEIGHT_SQUAT') },
      {
        name: ['רונדו ומעבר', 'Rondo and transition'],
        items: [x('FB_RONDO', 4, 120, 60), x('FB_ATTACKING_TRANSITION_OVERLOAD', 1, 8, 90), x('FB_FINISHING_UNDER_PRESSURE', 1, 8, 90)],
      },
      { name: ['משחק קטן עם כלל לחץ', 'Small game with a pressing rule'], items: [x('FB_SMALL_SIDED_GAME', 2, 600, 120)] },
    ],
    coachNotes: [
      [
        'כלל המשחק: מי שאיבד כדור לוחץ מיד; אם לא החזירו תוך 3–4 מסירות — חוזרים להגנה מסודרת. כלל זה מבוסס על מפגש נוער מקצועי ואינו מוכח כמתאים לכל גיל.',
        'Game rule: whoever loses the ball presses at once; if it is not won back within 3–4 passes, drop back into a compact shape. The rule comes from an elite youth session and is not shown to suit every age.',
      ],
      ADVANCED_NOTE,
    ],
    safety: null,
    sources: ['F-TRANS1215', 'F-MEXU15', 'F-TCP-3V2', 'F-ADV812', 'F-TCP-1V1'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },

  // ------------------------------------------------------------------ BASKETBALL — targeted workouts
  {
    id: 'BASKETBALL-BALL-HANDLING-01',
    sport: 'BASKETBALL',
    difficulty: 'INTERMEDIATE',
    focus: 'BALL_HANDLING',
    name: ['כדורסל — כדרור ושינוי כיוון', 'Basketball — Ball Handling'],
    summary: [
      'שליטה בשתי הידיים, שינוי כיוון וקצב, שליטה בגוף וכדרור בתנאים שהולכים ומקשים.',
      'Control with both hands, change of direction and pace, body control and dribbling under increasing difficulty.',
    ],
    minutes: [40, 50],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'HIGH_KNEES', 'LATERAL_LUNGE') },
      {
        name: ['שליטה בכדור', 'Ball control'],
        items: [x('STATIONARY_DRIBBLING', 4, 30, 15), x('FIGURE_8_DRIBBLE', 3, 20, 30), x('CROSSOVER_DRIBBLE', 4, 20, 30), x('BETWEEN_THE_LEGS_DRIBBLE', 4, 20, 30), x('BEHIND_THE_BACK_DRIBBLE', 4, 20, 30)],
      },
      {
        name: ['שינוי כיוון וקצב', 'Direction and pace'],
        items: [x('CONE_DRIBBLE_SLALOM', 4, null, 60), x('CHANGE_OF_PACE_DRIBBLE', 4, 4, 45), x('HESITATION_DRIVE', 4, 6, 45)],
      },
    ],
    coachNotes: [
      [
        'מתחילים לאט עם מבט קדימה, ומוסיפים מהירות רק כשהכדרור נקי; עובדים בשתי הידיים באותה מידה.',
        'Start slowly with the eyes up and add speed only when the dribble is clean; work both hands equally.',
      ],
    ],
    safety: null,
    sources: [],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'BASKETBALL-SHOOTING-FINISHING-01',
    sport: 'BASKETBALL',
    difficulty: 'INTERMEDIATE',
    focus: 'SHOOTING',
    name: ['כדורסל — קליעה וסיומים', 'Basketball — Shooting & Finishing'],
    summary: [
      'טכניקת זריקה, קליעה אחרי קבלה ואחרי תנועה, וסיומים לסל מזוויות וביד שונות.',
      'Shooting form, shooting after a catch and after movement, and finishing at the rim from different angles and with either hand.',
    ],
    minutes: [45, 60],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LEG_SWINGS', 'HIGH_KNEES', 'LATERAL_LUNGE') },
      {
        name: ['טכניקה וקליעה', 'Form and shooting'],
        items: [x('FORM_SHOOTING', 3, 10, 30), x('MID_RANGE_SPOT_SHOOTING', 5, 10, 60), x('RELOCATION_SHOOTING', 4, 10, 60), x('PULL_UP_JUMPER', 4, 10, 60)],
      },
      {
        name: ['סיומים לסל', 'Finishing at the rim'],
        items: [x('LAYUPS', 4, 10, 45), x('REVERSE_LAYUPS', 4, 10, 45), x('CONTACT_FINISHES', 4, 8, 60), x('FREE_THROWS', 5, 10, 60)],
      },
    ],
    coachNotes: [
      [
        'סופרים קליעות מתוך ניסיונות; מתחילים מקרוב ומרחיקים רק כשהטכניקה יציבה.',
        'Count makes out of attempts; start close and move back only when the form is stable.',
      ],
    ],
    safety: null,
    sources: [],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'BASKETBALL-DEFENSE-REBOUNDING-01',
    sport: 'BASKETBALL',
    difficulty: 'INTERMEDIATE',
    focus: 'DEFENSE',
    name: ['כדורסל — הגנה וריבאונד', 'Basketball — Defense & Rebounding'],
    summary: [
      'עמידה ועבודת רגליים בהגנה, תנועה צדדית, יציאה לשחקן (closeout), חסימה (box-out) וריבאונד, וכושר ספציפי למשחק.',
      'Defensive stance and footwork, lateral movement, closeouts, box-out and rebounding, and basketball-specific conditioning.',
    ],
    minutes: [45, 55],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('LATERAL_LUNGE', 'HIGH_KNEES', 'LEG_SWINGS') },
      {
        name: ['הגנה ורגליים', 'Defense and footwork'],
        items: [x('DEFENSIVE_SLIDES', 4, null, 60), x('ZIGZAG_DEFENSIVE_SLIDES', 4, 2, 45), x('CLOSEOUT_DRILL', 3, 6, 45), x('DEFENSIVE_RECOVERY_DRILL', 4, 4, 45)],
      },
      { name: ['חסימה וריבאונד', 'Box-out and rebounding'], items: [x('BOX_OUT_DRILL', 3, 8, 45), x('TIP_DRILL', 3, 10, 60)] },
      { name: ['כושר למשחק', 'Game conditioning'], items: [x('LANE_AGILITY', 3, null, 120)] },
    ],
    coachNotes: [
      [
        'בחסימה שומרים על מגע גופני מבוקר ובלי דחיפה; מתאימים את העצימות לגיל וליכולת.',
        'In the box-out keep body contact controlled and without pushing; match the intensity to age and ability.',
      ],
    ],
    safety: null,
    sources: [],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
];
