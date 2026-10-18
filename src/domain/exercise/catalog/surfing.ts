import { define, drillReps, work, type Entry, type Pair } from './define';

/**
 * Surfing (SPORT-CONTENT-001): ordinary Exercises linked to SURFING — data, not a separate model. Curated from public
 * Surfing Australia / ISA material; the dosage and the technique cues are Gals Coacher's own (see ./provenance.ts).
 *
 * Locked safety direction (owner): no claim that the sea is safe, no breath-hold training; conditions, currents, weather
 * and the suitable level are judged by the surfer, the coach or the responsible adult.
 */
export const SURF_SAFETY: Pair = [
  'תנאי ים, זרמים, מזג אוויר ורמת הגלישה המתאימה דורשים שיקול דעת אמיתי של הגולש, המאמן או המבוגר האחראי.',
  'Ocean conditions, currents, weather and suitable surf level require real-world judgement by the surfer, coach or responsible adult.',
];
const withSafety = (he: string, en: string): Pair => [`${SURF_SAFETY[0]} ${he}`, `${SURF_SAFETY[1]} ${en}`];

const BOARD: Entry['eq'] = [['SURFBOARD']];

const ENTRIES: Entry[] = [
  {
    id: 'SURF_POP_UP',
    name: ['קימה על הלוח ויציבה (על היבשה)', 'Pop-up and Stance (on Land)'],
    cat: ['SURF_SKILL'],
    prim: ['SHOULDERS', 'TRICEPS'],
    sec: ['ABDOMINALS', 'QUADRICEPS'],
    diff: 'BEGINNER',
    sports: ['SURFING'],
    eq: [['SURFBOARD'], ['MAT']],
    m: drillReps(),
    d: [3, 6, 30],
    how: [
      'שוכבים על הלוח (או על מזרן) על החול, ידיים מתחת לכתפיים, וקמים בתנועה אחת רציפה אל היציבה. מתרגלים על היבשה לפני הים, ומגלים את היציבה הטבעית שלך (רגל שמאל או ימין מקדימה).',
      'Lie on the board (or a mat) on the sand, hands under the shoulders, and rise to your stance in one continuous movement. Practise on land before the water, and find your natural stance (left or right foot forward).',
    ],
    cues: [
      ['אותה תנועה בכל חזרה', 'The same movement every time'],
      ['מבט קדימה, לא על הרגליים', 'Eyes forward, not on the feet'],
      ['שמים לב לרגל המקדימה הטבעית שלך', 'Notice your natural front foot'],
    ],
    safety: withSafety(
      'מתרגלים על חול או משטח רך וללא אנשים סביב הלוח.',
      'Practise on sand or a soft surface with nobody around the board.',
    ),
  },
  {
    id: 'SURF_PADDLING',
    name: ['טכניקת חתירה', 'Paddling Technique'],
    cat: ['SURF_PADDLING', 'CONDITIONING'],
    prim: ['LATS', 'SHOULDERS'],
    sec: ['UPPER_BACK', 'TRICEPS', 'LOWER_BACK'],
    pat: ['PULL'],
    diff: 'BEGINNER',
    sports: ['SURFING'],
    eq: BOARD,
    m: work(),
    d: [3, 120, 60],
    how: [
      'חותרים בשכיבה על הלוח עם חתירות ארוכות ורציפות, חזה מורם מעט וראש יציב. בגרסה מתקדמת מוסיפים מקטעי האצה קצרים. אפשר לתרגל על יבשה או במים שטוחים.',
      'Paddle lying on the board with long, continuous strokes, chest slightly raised and head steady. In a harder version add short acceleration bursts. It can be practised on land or in flat water.',
    ],
    cues: [
      ['חתירות ארוכות ורציפות', 'Long, continuous strokes'],
      ['חזה מורם מעט, מבט קדימה', 'Chest slightly up, eyes forward'],
    ],
    safety: withSafety(
      'חותרים במים רדודים ושטוחים עם השגחה, ולא מרחיקים מהחוף.',
      'Paddle in shallow, flat water with supervision, and do not go far from shore.',
    ),
  },
  {
    id: 'SURF_TAKE_OFF',
    name: ['קימה בגלי קצף', 'Whitewater Take-off'],
    cat: ['SURF_SKILL'],
    prim: ['SHOULDERS', 'TRICEPS'],
    sec: ['ABDOMINALS', 'QUADRICEPS'],
    diff: 'BEGINNER',
    sports: ['SURFING'],
    eq: BOARD,
    m: drillReps(),
    d: [2, 4, 60],
    how: [
      'בגלי קצף (גל שכבר נשבר) חותרים, מרגישים את הגל תופס את הלוח וקמים אל היציבה. רק בגלי קצף, בעומק שמתאים לרמה ובבחירה של מבוגר או מאמן מנוסה.',
      'In whitewater (a wave that has already broken) paddle, feel the wave catch the board and rise to your stance. Whitewater only, at a depth that suits the level and chosen by an experienced adult or coach.',
    ],
    cues: [
      ['חותרים עד שהגל תופס את הלוח', 'Paddle until the wave catches the board'],
      ['קמים בתנועה אחת, מבט קדימה', 'Rise in one movement, eyes forward'],
    ],
    safety: withSafety(
      'רק גלי קצף שנבחרו על ידי מבוגר או מאמן מנוסה; לא מתרגלים לבד.',
      'Whitewater only, chosen by an experienced adult or coach; never practise alone.',
    ),
  },
  {
    id: 'SURF_DUCK_DIVE',
    name: ['צלילת ברווז', 'Duck-Dive Technique'],
    cat: ['SURF_SKILL'],
    prim: ['SHOULDERS', 'TRICEPS'],
    sec: ['ABDOMINALS', 'CHEST'],
    diff: 'INTERMEDIATE',
    sports: ['SURFING'],
    eq: BOARD,
    m: drillReps(),
    d: [2, 4, 60],
    how: [
      'חותרים אל הגל, דוחפים את חזית הלוח מתחת לפני המים עם הידיים, ואז מכניסים את הברך או הרגל כדי להעמיק את הלוח עד שהגל עובר מעליכם. אפשר לתרגל קודם בבריכה או בתנאים שבחר המאמן.',
      'Paddle towards the wave, push the nose of the board under the surface with your hands, then drive the knee or foot down to take the board deeper until the wave passes over you. Practise first in a pool or in conditions chosen by the coach.',
    ],
    cues: [
      ['מתחילים את הצלילה לפני שהגל מגיע אליכם', 'Start the dive before the wave reaches you'],
      ['מחזיקים את הלוח קרוב לגוף', 'Keep the board close to your body'],
    ],
    safety: withSafety(
      'מתחילים בבריכה או במים רדודים ושקטים; לא נשארים מתחת לגל או מול גולשים אחרים.',
      'Start in a pool or shallow, calm water; do not stay under a wave or in front of other surfers.',
    ),
  },
  {
    id: 'SURF_WAVE_SELECTION_POSITIONING',
    name: ['בחירת גל ומיקום', 'Wave Selection and Positioning'],
    cat: ['SURF_SKILL'],
    prim: [],
    diff: 'INTERMEDIATE',
    sports: ['SURFING'],
    m: drillReps(),
    d: [1, 6, 0],
    how: [
      'מתרגלים להסתכל על הגלים לפני הכניסה ובזמן ההמתנה: איפה הגל נשבר, מאיפה הוא מגיע ואיפה לעמוד כדי לתפוס אותו. סופרים את מספר הגלים שנבחרו ונתפסו. הבחירה נעשית יחד עם המאמן.',
      'Practise watching the waves before entering and while waiting: where the wave breaks, where it comes from and where to wait to catch it. Count the waves chosen and caught. The choice is made together with the coach.',
    ],
    cues: [
      ['קודם מסתכלים ורק אחר כך חותרים', 'Look first, then paddle'],
      ['מכבדים את סדר העדיפויות בין הגולשים', 'Respect the priority between surfers'],
    ],
    safety: withSafety(
      'בחירת הגל ומקום ההמתנה היא החלטה של הגולש יחד עם המאמן, ולא של האפליקציה.',
      'Choosing the wave and where to wait is a decision for the surfer together with the coach, never for the app.',
    ),
  },
  {
    id: 'SURF_TRIM_AND_SPEED',
    name: ['רכיבה, יצירת מהירות ויציאה מבוקרת', 'Trim, Speed Generation and Controlled Exit'],
    cat: ['SURF_SKILL'],
    prim: [],
    diff: 'BEGINNER',
    sports: ['SURFING'],
    eq: BOARD,
    m: drillReps(),
    d: [1, 6, 0],
    how: [
      'אחרי הקימה רוכבים לאורך הגל במהירות, מזיזים את המשקל כדי ליצור מהירות, ומסיימים ביציאה מבוקרת מהגל. סופרים רכיבות מלאות.',
      'After the pop-up ride along the wave, shift your weight to generate speed, and finish with a controlled exit from the wave. Count complete rides.',
    ],
    cues: [
      ['מבט קדימה לאן שרוצים להגיע', 'Look where you want to go'],
      ['מזיזים את המשקל לאט ובשליטה', 'Shift your weight smoothly and under control'],
    ],
    safety: withSafety(
      'מתרגלים רק בגלים ובתנאים שמתאימים לרמה; יוצאים מהגל כשהוא נגמר ולא מול גולשים אחרים.',
      'Practise only in waves and conditions that suit the level; exit when the wave ends and not in front of other surfers.',
    ),
  },
  {
    id: 'SURF_BOTTOM_TURN',
    name: ['בוטום טרן', 'Bottom Turn'],
    cat: ['SURF_SKILL'],
    prim: [],
    diff: 'INTERMEDIATE',
    sports: ['SURFING'],
    eq: BOARD,
    m: drillReps(),
    d: [2, 5, 45],
    how: [
      'בתחתית הגל מכופפים ברכיים, מסתובבים אל הקיר של הגל ומעבירים משקל כדי לצאת מהפנייה במהירות. כל סט הוא לצד אחד.',
      'At the bottom of the wave bend the knees, turn up towards the wall of the wave and shift your weight to come out of the turn with speed. Each set is to one side.',
    ],
    cues: [
      ['ברכיים כפופות, מרכז כובד נמוך', 'Knees bent, low centre of gravity'],
      ['מבט אל המקום שאליו פונים', 'Look where you are turning'],
    ],
    safety: withSafety(
      'מתרגלים רק בגלים בגודל שמתאים לרמה ובנוכחות מאמן או מבוגר אחראי.',
      'Practise only in waves of a size that suits the level, with a coach or responsible adult present.',
    ),
  },
  {
    id: 'SURF_TOP_TURN',
    name: ['טופ טרן (כולל שילוב בוטום-טופ)', 'Top Turn (incl. Bottom-to-Top Combination)'],
    cat: ['SURF_SKILL'],
    prim: [],
    diff: 'ADVANCED',
    sports: ['SURFING'],
    eq: BOARD,
    m: drillReps(),
    d: [2, 5, 45],
    how: [
      'אחרי בוטום טרן עולים אל החלק העליון של הגל ופונים בחדות בחזרה אל התחתית. מתחילים בקטע אחד, ובהמשך מחברים בוטום טרן וטופ טרן ברצף. כל סט הוא לצד אחד.',
      'After a bottom turn go up to the top of the wave and turn sharply back down. Start with one section, then link a bottom turn and a top turn in sequence. Each set is to one side.',
    ],
    cues: [
      ['מסתכלים אל שפת הגל לפני הפנייה', 'Look at the lip before the turn'],
      ['מסובבים את הכתפיים ואת האגן יחד', 'Rotate the shoulders and the hips together'],
    ],
    safety: withSafety(
      'רמה מתקדמת: רק בגלים ובתנאים שמתאימים לרמה, לא מול גולשים אחרים ובנוכחות מאמן או מבוגר אחראי.',
      'Advanced level: only in waves and conditions that suit the level, not in front of other surfers, with a coach or responsible adult present.',
    ),
  },
  {
    id: 'SURF_CUTBACK',
    name: ['קאטבק (ריאנטרי כגרסה מתקדמת)', 'Cutback (Re-entry as an Advanced Variant)'],
    cat: ['SURF_SKILL'],
    prim: [],
    diff: 'INTERMEDIATE',
    sports: ['SURFING'],
    eq: BOARD,
    m: drillReps(),
    d: [2, 5, 45],
    how: [
      'כשהגל מתרחק מכם, פונים בקשת חזרה אל החלק התלול של הגל כדי לחזור אל הכוח שלו. בגרסה מתקדמת (ריאנטרי) חוזרים אל שפת הגל. כל סט הוא לצד אחד.',
      'When the wave moves away from you, turn in an arc back towards the steeper part of the wave to return to its power. In the advanced version (re-entry) return to the lip. Each set is to one side.',
    ],
    cues: [
      ['פנייה רחבה ורציפה', 'A wide, continuous turn'],
      ['מבט אל המקום שאליו חוזרים', 'Look at where you are returning to'],
    ],
    safety: withSafety(
      'מתרגלים רק בגלים בגודל שמתאים לרמה; הריאנטרי רק בנוכחות מאמן.',
      'Practise only in waves of a size that suits the level; the re-entry only with a coach present.',
    ),
  },
  {
    id: 'SURF_HEAT_SIMULATION',
    name: ['סימולציית היט', 'Heat Simulation'],
    cat: ['SURF_SKILL', 'CONDITIONING'],
    prim: ['LATS', 'SHOULDERS'],
    sec: ['QUADRICEPS', 'ABDOMINALS'],
    diff: 'ADVANCED',
    sports: ['SURFING'],
    eq: BOARD,
    m: work(),
    d: [2, 900, 300],
    how: [
      'גולשים פרק זמן קבוע כמו בהיט: בוחרים גלים, מתמקמים ומבצעים את התמרונים שתרגלתם, בזמן מוגבל. אחרי כל היט מנוחה וסקירה קצרה עם המאמן.',
      'Surf for a fixed period like a heat: choose waves, position yourself and perform the manoeuvres you have practised, within a time limit. After each heat rest and have a short review with the coach.',
    ],
    cues: [
      ['בוחרים פחות גלים ומבצעים אותם טוב', 'Choose fewer waves and ride them well'],
      ['מנוחה אמיתית בין ההיטים', 'Real rest between the heats'],
    ],
    safety: withSafety(
      'רמה מתקדמת ותחרותית: מבוצע רק בתנאים שמתאימים לרמה ובנוכחות מאמן או מבוגר אחראי, עם הפסקה כשמתעייפים.',
      'Advanced, competitive format: only in conditions that suit the level with a coach or responsible adult present, stopping when tired.',
    ),
  },
];

export const SURFING = ENTRIES.map(define);
