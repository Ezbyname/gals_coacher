import { reuse, x, VIDEO_STATUS, type CandidateVideo, type Pair, type ProfessionalWorkout } from './types';

/**
 * SPORT-CONTENT-003 — two beginner Basketball workouts that use the Israel Basketball Coaches Association's "beginner
 * basketball training" page (https://www.ibbcoaches.org.il/beginnerbasketballtraining) as a REFERENCE-VIDEO source.
 *
 * Evidence rule (owner): that page holds six embedded YouTube videos and NO written drills or dosage. The videos were NOT
 * watched and no transcript could be obtained (five have no captions; the sixth's caption file is empty), so none of them
 * may become an Exercise, supply instructions, or even be shown to users yet. Therefore:
 *   - every Exercise in these workouts is an EXISTING, already-curated built-in Basketball / warm-up Exercise (no new Exercise,
 *     no migration);
 *   - the six videos are kept ONLY as CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED review / provenance notes (IBBC_CANDIDATE_VIDEOS);
 *   - every set / repetition / duration is Gals Coacher's own recommendation.
 * The videos belong to their authors (Jr. NBA / Jr. WNBA, HoopsKing, Peak Performance Training) and are not copied or hosted.
 */
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const FEEL = 'BASKETBALL-BEGINNER-BALL-FEEL-01';
const SHOOT = 'BASKETBALL-BEGINNER-SHOOT-LAYUP-01';
/** The six videos on the IBBC page: CANDIDATES for human review only (not shown to users, never an Exercise). */
export const IBBC_CANDIDATE_VIDEOS: readonly CandidateVideo[] = [
  {
    title: 'Basketball Skills Clinic: Ages 6 to 9',
    author: 'getppt (Peak Performance Training)',
    url: yt('ePX7umliH_s'),
    about: ['לפי תיאור היוטיוב: מקצה כישורי כדורסל לגילאי 6–9 עם דגש על התקדמות והתפתחות נכונה.', 'Per its YouTube description: a basketball skills clinic for ages 6 to 9 focused on progressions and proper development.'],
    status: VIDEO_STATUS,
    candidateFor: [FEEL, SHOOT],
  },
  {
    title: 'How to Teach Your Child to Shoot a Basketball',
    author: 'HoopsKing.com',
    url: yt('-KSQDWxptE0'),
    about: ['לפי תיאור היוטיוב: על הוראת קליעה נכונה לילד. הסרטון הוא של אתר מסחרי ואיכות ההוראה בו לא נבדקה.', 'Per its YouTube description: about teaching a child to shoot correctly. It is from a commercial site and its teaching quality has not been checked.'],
    status: VIDEO_STATUS,
    candidateFor: [SHOOT],
  },
  {
    title: 'Up Or Down Game',
    author: 'Jr. NBA Jr. WNBA',
    url: yt('KmJburYaPlE'),
    about: ['לפי תיאור היוטיוב: משחק לתרגול כדרור עם ראש מורם.', 'Per its YouTube description: a game to practise ball handling with the head up.'],
    status: VIDEO_STATUS,
    candidateFor: [FEEL],
  },
  {
    title: 'Toss And Catch Drill (adds a clap, 2, 3, turn)',
    author: 'Jr. NBA Jr. WNBA',
    url: yt('_XXSmPJS8_M'),
    about: ['לפי תיאור היוטיוב: בניית קואורדינציה בהטלה ותפיסה של הכדור.', 'Per its YouTube description: builds coordination by tossing and catching the ball.'],
    status: VIDEO_STATUS,
    candidateFor: [FEEL],
  },
  {
    title: 'Catch With Coach Drill',
    author: 'Jr. NBA Jr. WNBA',
    url: yt('vprXdk5f-pA'),
    about: ['לפי תיאור היוטיוב: משחק תפיסה לתרגול שליטה בכדור וטכניקת מסירה.', 'Per its YouTube description: playing catch to work on ball handling and passing technique.'],
    status: VIDEO_STATUS,
    candidateFor: [FEEL],
  },
  {
    title: 'Layup Skip Drill',
    author: 'Jr. NBA Jr. WNBA',
    url: yt('9z6NtAuiB4U'),
    about: ['לפי תיאור היוטיוב: הסבר על כך שדילוג הוא התקדמות טבעית לליי-אפ.', 'Per its YouTube description: explains that skipping is a natural progression into layups.'],
    status: VIDEO_STATUS,
    candidateFor: [SHOOT],
  },
];

const OWN_NOTE: Pair = [
  'בחירת התרגילים, הסדר והמינונים באימון הזה הם של Gals Coacher (תרגילים קיימים בספרייה), ואינם של גוף חיצוני.',
  'The exercise selection, the order and the dosages in this workout are Gals Coacher\'s own (existing library exercises), not an outside body\'s.',
];

export const IBBC_WORKOUTS: readonly ProfessionalWorkout[] = [
  {
    id: 'BASKETBALL-BEGINNER-BALL-FEEL-01',
    sport: 'BASKETBALL',
    difficulty: 'BEGINNER',
    focus: 'FUNDAMENTALS',
    name: ['כדורסל — היכרות עם הכדור', 'Basketball — Ball Feel'],
    summary: [
      'שליטה בכדור, כדרור ומסירות בסיסיות למתחילים — מתרגילים קיימים בספרייה.',
      'Basic ball control, dribbling and passing for beginners — from existing library exercises.',
    ],
    minutes: [25, 35],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('JUMPING_JACKS', 'HIGH_KNEES', 'LEG_SWINGS') },
      { name: ['שליטה בכדור', 'Ball control'], items: [x('STATIONARY_DRIBBLING', 3, 30, 20), x('CROSSOVER_DRIBBLE', 3, 10, 30), x('CHANGE_OF_PACE_DRIBBLE', 3, 4, 45)] },
      { name: ['מסירה ותפיסה', 'Passing and catching'], items: [x('WALL_PASSING', 3, 12, 30), x('ONE_HAND_PUSH_PASS', 3, 10, 30)] },
    ],
    coachNotes: [OWN_NOTE],
    safety: null,
    sources: ['IBBC-BEGINNER'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
  {
    id: 'BASKETBALL-BEGINNER-SHOOT-LAYUP-01',
    sport: 'BASKETBALL',
    difficulty: 'BEGINNER',
    focus: 'FUNDAMENTALS',
    name: ['כדורסל — קליעה וליי-אפ', 'Basketball — Form & Layups'],
    summary: [
      'טכניקת קליעה בסיסית, עבודת רגליים וסיומים קרובים לסל למתחילים — מתרגילים קיימים בספרייה.',
      'Basic shooting form, footwork and close finishes at the rim for beginners — from existing library exercises.',
    ],
    minutes: [30, 40],
    sections: [
      { name: ['חימום', 'Warm-up'], items: reuse('JUMPING_JACKS', 'HIGH_KNEES', 'LEG_SWINGS') },
      { name: ['טכניקת קליעה', 'Shooting form'], items: [x('FORM_SHOOTING', 3, 8, 30), x('JUMP_STOP_PIVOTS', 3, 8, 30)] },
      { name: ['סיומים לסל', 'Finishing at the rim'], items: [x('LAYUPS', 3, 8, 45), x('POWER_LAYUPS', 3, 8, 45), x('MIKAN_DRILL', 3, 10, 45)] },
    ],
    coachNotes: [OWN_NOTE],
    safety: null,
    sources: ['IBBC-BEGINNER'],
    reviewStatus: 'PENDING_HUMAN_REVIEW',
  },
];
