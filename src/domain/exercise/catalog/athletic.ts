import { define, drillReps, work, type Entry } from './define';

/**
 * TRAINING-BLOCKS-001: six general-athletic Exercises the existing catalog could not cover — controlled landing (two-leg and
 * single-leg), deceleration, two reactive-agility drills and a no-machine running-interval exercise. They carry no sport
 * (`sports: []`, like the other general-fitness Exercises), so they never touch a Player's sport. Every cue, drill wording and
 * dosage is Gals Coacher's own (see ./provenance.ts). Listed AFTER the sport content, in the order the v21 migration seeds them.
 */
const ENTRIES: Entry[] = [
  {
    id: 'DROP_LANDING_STICK',
    name: ['ירידה ונחיתה מבוקרת', 'Controlled Step-Off Landing'],
    cat: ['PLYOMETRIC', 'STABILITY'],
    prim: ['QUADRICEPS', 'GLUTES'],
    sec: ['CALVES', 'HIP_STABILIZERS'],
    pat: ['JUMP'],
    diff: 'BEGINNER',
    eq: [['PLYO_BOX'], ['BENCH']],
    m: drillReps(),
    d: [3, 5, 45],
    how: [
      'עומדים על קופסה נמוכה או ספסל, יורדים צעד קדימה אל הרצפה ונוחתים על שתי הרגליים בו־זמנית. נוחתים בשקט עם ברכיים וירכיים מכופפות, ומחזיקים את העמידה שתי שניות לפני שחוזרים לקופסה.',
      'Stand on a low box or bench, step forward off it and land on both feet at the same time. Land quietly with the knees and hips bent, and hold the position for two seconds before stepping back up.',
    ],
    cues: [
      ['נוחתים בשקט', 'Land quietly'],
      ['ברכיים לכיוון האצבעות, חזה גבוה', 'Knees over the toes, chest tall'],
    ],
    mistakes: [['ברכיים שנופלות פנימה או נחיתה נוקשה על רגליים ישרות', 'Knees collapsing inward, or a stiff landing on straight legs']],
    safety: [
      'גובה נמוך, משטח יציב ולא חלק. מפסיקים אם הנחיתה מאבדת שליטה או יש כאב.',
      'Use a low height and a stable, non-slip surface. Stop if the landing loses control or there is pain.',
    ],
  },
  {
    id: 'SINGLE_LEG_HOP_STICK',
    name: ['קפיצה ונחיתה על רגל אחת', 'Single-Leg Hop and Stick'],
    cat: ['PLYOMETRIC', 'STABILITY'],
    prim: ['QUADRICEPS', 'GLUTES', 'CALVES'],
    sec: ['HIP_STABILIZERS'],
    pat: ['JUMP'],
    diff: 'INTERMEDIATE',
    m: drillReps(),
    d: [2, 4, 60],
    how: [
      'עומדים על רגל אחת וקופצים קדימה למרחק קצר, ונוחתים על אותה רגל. מחזיקים את הנחיתה שתי שניות ביציבות לפני שמתחילים שוב. עושים את מספר החזרות על כל רגל.',
      'Stand on one leg and hop forward a short distance, landing on the same leg. Hold the landing steadily for two seconds before starting again. Do the repetitions on each leg.',
    ],
    cues: [
      ['נוחתים ועוצרים', 'Land and stop'],
      ['הברך ממוקמת מעל כף הרגל, הגו גבוה', 'Knee over the foot, trunk tall'],
    ],
    mistakes: [['קפיצה רחוקה מדי שמאבדת את שליטת הנחיתה', 'A hop so far that the landing loses control']],
    safety: [
      'רק אחרי שהנחיתה על שתי רגליים נקייה. מרחק קצר, משטח יציב ולא חלק, ומפסיקים אם יש כאב.',
      'Only once the two-leg landing is clean. Keep the distance short on a stable, non-slip surface, and stop if there is pain.',
    ],
  },
  {
    id: 'DECEL_STOP',
    name: ['האצה ועצירה מבוקרת', 'Accelerate and Decelerate to Stop'],
    cat: ['SPEED', 'AGILITY'],
    prim: ['QUADRICEPS', 'GLUTES'],
    sec: ['HAMSTRINGS', 'CALVES', 'HIP_STABILIZERS'],
    pat: ['SPRINT', 'CHANGE_OF_DIRECTION'],
    diff: 'BEGINNER',
    eq: [['RUNNING_AREA']],
    m: drillReps(),
    d: [4, 4, 60],
    how: [
      'מאיצים בקצב מבוקר לאורך כ־10 מטרים, ועוצרים בתוך אזור מסומן (בין שני קונוסים או קווים) בצעדים קצרים וירכיים נמוכות. מחזיקים את העצירה שתי שניות לפני שחוזרים.',
      'Accelerate at a controlled pace for about 10 metres, then stop inside a marked zone (between two cones or lines) with short steps and low hips. Hold the stop for two seconds before returning.',
    ],
    cues: [
      ['צעדים קצרים לפני העצירה', 'Short steps before the stop'],
      ['ירכיים נמוכות, גו קדימה מעט', 'Hips low, trunk slightly forward'],
    ],
    mistakes: [['להאט רק ברגע האחרון ולעצור בצעד גדול ונוקשה', 'Slowing only at the last moment and stopping with one big, stiff stride']],
    safety: [
      'מתחילים בקצב מבוקר ומעלים מהירות רק כשהעצירה נקייה. משטח יבש ולא חלק, והתחממות לפני.',
      'Start at a controlled pace and add speed only when the stop is clean. Use a dry, non-slip surface and warm up first.',
    ],
  },
  {
    id: 'PARTNER_MIRROR_DRILL',
    name: ['תרגיל מראה בזוגות', 'Partner Mirror Drill'],
    cat: ['AGILITY'],
    prim: ['QUADRICEPS', 'HIP_STABILIZERS'],
    sec: ['CALVES', 'GLUTES'],
    pat: ['CHANGE_OF_DIRECTION', 'LOCOMOTION'],
    diff: 'INTERMEDIATE',
    eq: [['CONES']],
    m: work(),
    d: [4, 15, 45],
    how: [
      'שניים עומדים זה מול זה בתוך מלבן קטן של כ־3 על 5 מטרים. הראשון זז לצדדים בחופשיות, והשני משקף את התנועה בעמידה נמוכה בלי להצליב רגליים. מחליפים תפקידים בכל סט.',
      'Two people face each other inside a small rectangle of about 3 by 5 metres. One moves sideways freely and the other mirrors the movement from a low stance without crossing the feet. Swap roles each set.',
    ],
    cues: [
      ['עיניים על האגן של בן הזוג', 'Eyes on your partner’s hips'],
      ['מגיבים, לא מנחשים', 'React, don’t guess'],
    ],
    mistakes: [['לנחש כיוון מראש במקום להגיב לתנועה', 'Guessing a direction in advance instead of reacting to the movement']],
    safety: [
      'מרחב נקי, משטח לא חלק, וקצב מתאים ליכולת. עוצרים אם יש כאב.',
      'Use clear space, a non-slip surface and a pace that suits the ability. Stop if there is pain.',
    ],
  },
  {
    id: 'COACH_CUE_REACTION_SPRINT',
    name: ['ספרינט תגובה לאות', 'Cue-Reaction Sprint'],
    cat: ['SPEED', 'AGILITY'],
    prim: ['QUADRICEPS', 'GLUTES'],
    sec: ['HAMSTRINGS', 'CALVES'],
    pat: ['SPRINT', 'CHANGE_OF_DIRECTION'],
    diff: 'BEGINNER',
    eq: [['RUNNING_AREA']],
    m: drillReps(),
    d: [6, 1, 60],
    how: [
      'מתחילים בעמידת מוכנות. בן זוג או מאמן נותן אות לא צפוי — מילה, כיוון שהוא מצביע עליו או צבע של קונוס — והמתאמן מגיב ומאיץ כ־5 עד 10 מטרים בכיוון שנקבע. חוזרים לנקודת ההתחלה בהליכה.',
      'Start in a ready stance. A partner or coach gives an unpredictable cue — a word, a pointed direction or a cone colour — and the athlete reacts and accelerates about 5 to 10 metres in the direction the cue sets. Walk back to the start.',
    ],
    cues: [
      ['מתחילים רק אחרי האות', 'Start only after the cue'],
      ['צעד ראשון חזק ונמוך', 'A strong, low first step'],
    ],
    mistakes: [['יציאה לפני האות או בכיוון שנחשב מראש', 'Starting before the cue, or in a direction chosen in advance']],
    safety: [
      'מרחק קצר, משטח יבש ולא חלק, ומנוחה מלאה בין החזרות. מפסיקים אם יש כאב.',
      'Keep the distance short on a dry, non-slip surface, with full rest between repetitions. Stop if there is pain.',
    ],
  },
  {
    id: 'RUN_INTERVALS',
    name: ['אינטרוולים בריצה', 'Run Intervals'],
    cat: ['HIIT', 'CONDITIONING', 'CARDIO'],
    prim: ['QUADRICEPS', 'CALVES'],
    sec: ['HAMSTRINGS', 'GLUTES'],
    pat: ['LOCOMOTION'],
    diff: 'BEGINNER',
    eq: [['RUNNING_AREA'], ['TREADMILL']],
    m: work(),
    d: [6, 45, 90],
    how: [
      'מקטעי ריצה מהירה אך מבוקרת לפי זמן העבודה, ובין המקטעים הליכה או ריצה קלה מאוד לפי זמן המנוחה. הקצב בכל המקטעים דומה, בלי לפתוח מהר מדי.',
      'Fast but controlled running for the work time, with walking or very easy jogging for the rest time between efforts. Keep the pace similar across the efforts and do not start too fast.',
    ],
    cues: [
      ['קצב אחיד בכל המקטעים', 'An even pace in every effort'],
      ['נושמים ברור, גו גבוה', 'Breathe freely, run tall'],
    ],
    mistakes: [['לפתוח מהר מדי ולהתרסק במקטעים האחרונים', 'Starting too fast and fading in the last efforts']],
    safety: [
      'מתחממים לפני, רצים על משטח שטוח ולא חלק, והעצימות מתאימה ליכולת. מפסיקים אם יש כאב, סחרחורת או תסמין חריג.',
      'Warm up first, run on a flat, non-slip surface and keep the intensity to the person’s ability. Stop if there is pain, dizziness or any unusual symptom.',
    ],
  },
];

export const ATHLETIC = ENTRIES.map(define);
