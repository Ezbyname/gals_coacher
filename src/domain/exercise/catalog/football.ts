import { define, drillReps, madeAttempts, work, type Entry } from './define';

/**
 * Football / soccer (SPORT-CONTENT-001): ordinary Exercises linked to FOOTBALL — data, not a separate model. Informed
 * by public FIFA Training Centre material (youth / grassroots); the dosage, the cues and the sequencing are Gals
 * Coacher's own (see ./provenance.ts). Weaker foot, pressure level, game format and the counter-press rule are
 * configurations written into the instructions, not separate Exercises.
 */
const BALL_CONES: Entry['eq'] = [['SOCCER_BALL', 'CONES']];
const BALL_GOAL: Entry['eq'] = [['SOCCER_BALL', 'SOCCER_GOAL']];
const GAME_EQUIPMENT: Entry['eq'] = [['SOCCER_BALL', 'SOCCER_GOAL', 'CONES']];

const ENTRIES: Entry[] = [
  {
    id: 'FB_BALL_MASTERY',
    name: ['שליטה בכדור', 'Ball Mastery'],
    cat: ['FOOTBALL_SKILL'],
    prim: [],
    diff: 'BEGINNER',
    sports: ['FOOTBALL'],
    eq: [['SOCCER_BALL']],
    m: work(),
    d: [1, 300, 30],
    how: [
      'נוגעים בכדור הרבה פעמים במקום קטן: פנים וחוץ הרגל, סוליה, מעבר מרגל לרגל. הכדור צמוד והראש למעלה.',
      'Touch the ball many times in a small space: inside and outside of the foot, sole, from one foot to the other. Keep the ball close and the head up.',
    ],
    cues: [
      ['הכדור קרוב לרגל', 'Keep the ball close to the foot'],
      ['מרימים את הראש בין המגעים', 'Lift the head between touches'],
    ],
  },
  {
    id: 'FB_DRIBBLING_COURSE',
    name: ['דריבל בין קונוסים ושינוי כיוון', 'Cone Dribbling and Change of Direction'],
    cat: ['FOOTBALL_SKILL', 'AGILITY'],
    prim: ['QUADRICEPS', 'HIP_STABILIZERS'],
    sec: ['CALVES'],
    pat: ['CHANGE_OF_DIRECTION'],
    diff: 'BEGINNER',
    sports: ['FOOTBALL'],
    eq: BALL_CONES,
    m: work(),
    d: [4, 60, 30],
    how: [
      'מדרבלים בין קונוסים ומשנים כיוון בכל קונוס, כמה שיותר מגעים בדקה. אפשר להפוך את זה למשחק של דקה אחת מול שחקן אחר.',
      'Dribble between cones and change direction at each cone, with as many touches as possible in a minute. It can become a one-minute game against another player.',
    ],
    cues: [
      ['מגע קטן לפני כל קונוס', 'A small touch before each cone'],
      ['משנים כיוון עם החלק החיצוני של הרגל', 'Change direction with the outside of the foot'],
    ],
  },
  {
    id: 'FB_PASS_AND_CONTROL',
    name: ['מסירה ושליטה', 'Passing and First Touch'],
    cat: ['FOOTBALL_SKILL'],
    prim: [],
    diff: 'BEGINNER',
    sports: ['FOOTBALL'],
    eq: BALL_CONES,
    m: drillReps(),
    d: [6, 10, 20],
    how: [
      'מוסרים לפרטנר או דרך שער צר ושולטים בכדור במגע ראשון. כל סט הוא ברגל אחת, ומחליפים רגל בכל סט (שלושה סטים לכל רגל). בגרסה מאתגרת מרחיבים את המסירה לרגל החלשה או מקצרים את השער.',
      'Pass to a partner or through a narrow gate and control the ball with the first touch. Each set is with one foot, alternating the foot each set (three sets per foot). In a harder version focus on the weaker foot or make the gate narrower.',
    ],
    cues: [
      ['רגל תומכת ליד הכדור', 'Support foot beside the ball'],
      ['שולטים בכדור לכיוון הבא', 'Control the ball towards the next action'],
    ],
  },
  {
    id: 'FB_FIRST_TOUCH_AND_TURN',
    name: ['מגע ראשון והסתובבות', 'First Touch and Turn into Space'],
    cat: ['FOOTBALL_SKILL'],
    prim: [],
    diff: 'INTERMEDIATE',
    sports: ['FOOTBALL'],
    eq: BALL_CONES,
    m: drillReps(),
    d: [6, 8, 30],
    how: [
      'מקבלים כדור בתנועה, לוקחים מגע ראשון אל החלל הפנוי ומסתובבים אל הכיוון הבא, הרחק מהמגן. כל סט הוא לצד אחד, שלושה סטים לכל צד. בגרסה מאתגרת מוסיפים שחקן שלוחץ.',
      'Receive the ball on the move, take the first touch into the free space and turn towards the next direction, away from the defender. Each set is to one side, three sets per side. In a harder version add a defender who presses.',
    ],
    cues: [
      ['המגע הראשון הרחק מהמגן', 'First touch away from the defender'],
      ['הגוף פתוח לפני שהכדור מגיע', 'Open the body before the ball arrives'],
    ],
  },
  {
    id: 'FB_DRIBBLE_AND_SHOOT',
    name: ['דריבל ובעיטה', 'Dribble and Shoot'],
    cat: ['FOOTBALL_SKILL', 'FOOTBALL_SHOOTING'],
    prim: [],
    diff: 'BEGINNER',
    sports: ['FOOTBALL'],
    eq: BALL_GOAL,
    m: madeAttempts(),
    d: [1, 10, 60],
    how: [
      'מדרבלים כמה צעדים (אפשר עם הסתובבות) ובועטים לשער. סופרים שערים מתוך ניסיונות. בגרסה מאתגרת בועטים ברגל החלשה.',
      'Dribble a few steps (optionally with a turn) and shoot at the goal. Count goals out of attempts. In a harder version shoot with the weaker foot.',
    ],
    cues: [
      ['המגע האחרון מכין את הבעיטה', 'The last touch sets up the shot'],
      ['מביטים אל השער לפני הבעיטה', 'Look at the goal before shooting'],
    ],
  },
  {
    id: 'FB_SHOOTING_ACCURACY',
    name: ['בעיטות למטרה', 'Target Shooting'],
    cat: ['FOOTBALL_SHOOTING'],
    prim: [],
    diff: 'BEGINNER',
    sports: ['FOOTBALL'],
    eq: BALL_GOAL,
    m: madeAttempts(),
    d: [1, 10, 60],
    how: [
      'בועטים לפינות או למטרות שסומנו בשער. סופרים פגיעות במטרה מתוך ניסיונות.',
      'Shoot at the corners or at targets marked in the goal. Count hits on the target out of attempts.',
    ],
    cues: [
      ['בוחרים מטרה לפני כל בעיטה', 'Choose a target before every shot'],
      ['רגל תומכת לכיוון המטרה', 'Support foot pointing at the target'],
    ],
  },
  {
    id: 'FB_COMBINATION_PLAY',
    name: ['משחק קומבינציות', 'Combination Play'],
    cat: ['FOOTBALL_SKILL'],
    prim: [],
    diff: 'INTERMEDIATE',
    sports: ['FOOTBALL'],
    eq: BALL_CONES,
    m: work(),
    d: [4, 120, 30],
    how: [
      'מוסרים, זזים לחלל ומקבלים שוב (מסירה-תנועה-קבלה), ומשלבים דריבל קצר ומסירה. עובדים בקבוצות קטנות בזמן קבוע בכל סבב.',
      'Pass, move into space and receive again (pass-move-receive), and combine a short dribble with a pass. Work in small groups for a fixed time in each round.',
    ],
    cues: [
      ['מוסרים ומיד זזים', 'Pass and move straight away'],
      ['מדברים ומסמנים לשחקן הבא', 'Communicate and signal to the next player'],
    ],
  },
  {
    id: 'FB_RONDO',
    name: ['רונדו (שמירת כדור)', 'Rondo (Keep-Ball)'],
    cat: ['FOOTBALL_SKILL'],
    prim: [],
    diff: 'INTERMEDIATE',
    sports: ['FOOTBALL'],
    eq: BALL_CONES,
    m: work(),
    d: [4, 120, 60],
    how: [
      'שחקנים במעגל או בריבוע שומרים על הכדור מול שחקן אחד או שניים שמנסים לקחת אותו. מגבילים את מספר המגעים (למשל שניים) או משתמשים ברגל החלשה כדי להקשות. בגרסת מעבר, מי שאיבד את הכדור לוחץ מיד כדי להחזיר אותו.',
      'Players in a circle or a square keep the ball away from one or two defenders. Limit the touches (for example two) or use the weaker foot to make it harder. In the transition version, the player who loses the ball presses at once to win it back.',
    ],
    cues: [
      ['זווית מסירה פתוחה לכל שחקן', 'An open passing angle for every player'],
      ['מגע ראשון הרחק מהלוחץ', 'First touch away from the presser'],
    ],
  },
  {
    id: 'FB_SMALL_SIDED_GAME',
    name: ['משחק קטן', 'Small-Sided Game'],
    cat: ['FOOTBALL_GAME_PLAY', 'CONDITIONING'],
    prim: ['QUADRICEPS', 'CALVES'],
    sec: ['HAMSTRINGS', 'GLUTES'],
    pat: ['CHANGE_OF_DIRECTION', 'LOCOMOTION'],
    diff: 'INTERMEDIATE',
    sports: ['FOOTBALL'],
    eq: GAME_EQUIPMENT,
    m: work(),
    d: [1, 900, 0],
    how: [
      'משחק בקבוצות קטנות בשטח מצומצם, בפורמט שבוחרים (1 נגד 1 או 2 נגד 2, 2 נגד 2 או 3 נגד 3, או משחק מעבר). אפשר להוסיף כלל כמו "מי שאיבד כדור לוחץ מיד, ואם לא החזיר תוך 3–4 מסירות חוזר להגנה מסודרת". הזמן לפי הרמה.',
      'A game in small groups in a small area, in the format you choose (1v1 or 2v2, 2v2 or 3v3, or a transition game). A rule can be added such as "whoever loses the ball presses at once, and if it is not won back within 3–4 passes, drop back into a compact shape". The time depends on the level.',
    ],
    cues: [
      ['מחפשים את החלל הפנוי', 'Look for the free space'],
      ['כשמאבדים כדור, מגיבים מיד', 'When the ball is lost, react at once'],
    ],
  },
  {
    id: 'FB_ATTACKING_TRANSITION_OVERLOAD',
    name: ['מעבר להתקפה ביתרון מספרי', 'Attacking Transition with a Numerical Advantage'],
    cat: ['FOOTBALL_GAME_PLAY'],
    prim: ['QUADRICEPS', 'GLUTES', 'HAMSTRINGS'],
    sec: ['CALVES'],
    pat: ['SPRINT', 'CHANGE_OF_DIRECTION'],
    diff: 'ADVANCED',
    sports: ['FOOTBALL'],
    eq: GAME_EQUIPMENT,
    m: drillReps(),
    d: [1, 7, 90],
    how: [
      'מתקפה של שניים נגד אחד או שלושה נגד שניים לשער: רצים לפני ומאחורי המגן הנסוג, תופסים את הערוצים השונים ומסיימים בבעיטה. מחליפים תפקידים בין הניסיונות.',
      'An attack of two against one or three against two on goal: run in front of and behind the retreating defender, occupy the different channels and finish with a shot. Rotate the roles between the attempts.',
    ],
    cues: [
      ['לא כולם רצים לאותו ערוץ', 'Not everyone runs into the same channel'],
      ['מקבלים החלטה מהירה: מוסרים או בועטים', 'Decide quickly: pass or shoot'],
    ],
    safety: [
      'מתאימים את העצימות ואת הריצה לרמה ולגיל, ומחממים לפני; עוצרים כשמרגישים עייפות או כאב.',
      'Match the intensity and the running to the level and age and warm up first; stop when tired or in pain.',
    ],
  },
  {
    id: 'FB_FINISHING_UNDER_PRESSURE',
    name: ['גימור תחת לחץ', 'Finishing under Pressure'],
    cat: ['FOOTBALL_SHOOTING'],
    prim: [],
    diff: 'ADVANCED',
    sports: ['FOOTBALL'],
    eq: BALL_GOAL,
    m: madeAttempts(),
    d: [1, 10, 90],
    how: [
      'מקבלים כדור וגומרים במהירות מול מגן, או במשחק קטן של שניים נגד שניים לשער. סופרים שערים מתוך ניסיונות.',
      'Receive the ball and finish quickly against a defender, or in a small 2v2 game on goal. Count goals out of attempts.',
    ],
    cues: [
      ['מגע ראשון הרחק מהמגן, מיד בעיטה', 'First touch away from the defender, then shoot at once'],
      ['מכוונים לפינה ולא רק בעוצמה', 'Aim for a corner, not only for power'],
    ],
    safety: [
      'מתאימים את הלחץ ואת המגע לרמה ולגיל; בלי מגע גופני חזק, ועוצרים בכאב.',
      'Match the pressure and the contact to the level and age; no hard body contact, and stop with pain.',
    ],
  },
];

export const FOOTBALL = ENTRIES.map(define);
