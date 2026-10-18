/**
 * SPORT-CONTENT-001 — where the Surfing and Football content comes from, and exactly what the sources do and do not
 * support. Not shown to users (the app only says the programming is Gals Coacher's own, informed by public sources);
 * it feeds the human CONTENT-REVIEW-SHEET and a test that every new Exercise has a provenance entry.
 *
 * Evidence classes (per element, never one label for a whole drill):
 *   SOURCE_SUPPORTED          a source we OPENED states the topic / principle
 *   SYNTHESIZED               Gals Coacher's own coaching synthesis, informed by sources
 *   ORIGINAL_RECOMMENDATION   Gals Coacher's own recommendation (every dosage)
 *   UNVERIFIED                no opened source states it; kept as our synthesis pending verification
 * Nothing here is official FIFA / ISA / Surfing Australia programming. Sources were accessed 2026-10-17.
 */
export const EVIDENCE_CLASSES = ['SOURCE_SUPPORTED', 'SYNTHESIZED', 'ORIGINAL_RECOMMENDATION', 'UNVERIFIED'] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export interface SourceRef {
  readonly name: string;
  readonly url: string;
  /** opened = the page was read; listing = only a search-result summary was seen (must be opened before it is relied on). */
  readonly read: 'opened' | 'listing only';
}

export const SOURCES = {
  'SA-CAMPS': { name: 'Surfing Australia — adult surf camps', url: 'https://surfingaustralia.com/hpc/adult-surf-camps/', read: 'opened' },
  'SA-SCHED': { name: 'Surfing Australia — camp schedule', url: 'https://surfingaustralia.com/hpc/camp-schedule/', read: 'opened' },
  'SA-COACH': { name: 'Surfing Australia — coaching', url: 'https://surfingaustralia.com/coaching/', read: 'opened' },
  'SA-PROG': { name: 'Surfing Australia — Progression Surf Coach', url: 'https://surfingaustralia.com/progression-surf-coach/', read: 'opened' },
  'SA-TIPS': { name: 'Surfing Australia — surf-school tips for children', url: 'https://surfingaustralia.com/tips-to-keep-your-surf-school-safe-fun-and-inclusive-for-children-and-young-people/', read: 'opened' },
  'ISA-COURSES': { name: 'ISA — courses', url: 'https://isasurf.org/isa-courses/', read: 'listing only' },
  'SLS-RIP': { name: 'Surf Life Saving NSW — rip currents', url: 'https://www.surflifesaving.com.au/beach-safety/rip-currents/', read: 'opened' },
  'F-ONCE': { name: 'FIFA Training Centre — ages 8–12, once-a-week sessions', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/grassroots-and-youth-football-essentials/grassroots-coaching-essentials/sessions-for-once-a-week-training.php', read: 'opened' },
  'F-DRIB48': { name: 'FIFA Training Centre — ages 4–8, dribbling as a positive start', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/grassroots-and-youth-football-essentials/grassroots-coaching-essentials/jene-3-dribbling-as-a-positive-start.php', read: 'opened' },
  'F-PASSREC': { name: 'FIFA Training Centre — ages 8–12, pass-receiving drill', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/8-to-12/pass-receiving-drill.php', read: 'opened' },
  'F-ADV812': { name: 'FIFA Training Centre — ages 8–12, recognise and use the advantage', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/8-to-12/recognise-and-make-use-of-the-advantage.php', read: 'opened' },
  'F-FINATK': { name: 'FIFA Training Centre — ages 12–15, finishing an attack', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/12-to-15/finishing-an-attack.php', read: 'opened' },
  'F-TRANS1215': { name: 'FIFA Training Centre — ages 12–15, transition', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/12-to-15/transition.php', read: 'opened' },
  'F-MEXU15': { name: 'FIFA Training Centre — Mexico U15 boys, counter-pressing (elite youth)', url: 'https://www.fifatrainingcentre.com/en/practice/elite-sessions/youth-national-teams/mexico-u15-boys-/defensive-phase-and-pressing-flores.php', read: 'opened' },
  'F-TCP-3V2': { name: 'FIFA Talent Coach Programme — 3v2 exploiting the overload', url: 'https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/create-and-finish/3v2-attack-vs-defence-exploiting-the-overload.php', read: 'opened' },
  'F-TCP-1V1': { name: 'FIFA Talent Coach Programme — 1v1 finishing', url: 'https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/create-and-finish/1v1-finishing-beating-the-defender-and-score.php', read: 'opened' },
  'F-SKILL1215': { name: 'FIFA Training Centre — ages 12–15, optimising skill development', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/grassroots-and-youth-football-essentials/grassroots-coaching-essentials/optimising-skill-development-u12-u15.php', read: 'opened' },
  'F-64': { name: 'FIFA Training Centre — ages 8–12, playing the final pass', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/8-to-12/playing-the-final-pass.php', read: 'listing only' },
  'F-57': { name: 'FIFA Training Centre — ages 8–12, dribbling, shooting and teamwork', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/8-to-12/dribbling-shooting-and-teamwork.php', read: 'listing only' },
  'F-51': { name: 'FIFA Training Centre — ages 8–12, training technique', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/8-to-12/training-technique.php', read: 'listing only' },
  'F-42': { name: 'FIFA Training Centre — elite, directing the first touch', url: 'https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/directing-the-ball-with-the-first-touch.php', read: 'listing only' },
  'F-111': { name: 'FIFA Training Centre — ages 12–15, passing and movement', url: 'https://www.fifatrainingcentre.com/en/practice/grassroots/12-to-15/passing-and-movement.php', read: 'listing only' },
} as const satisfies Record<string, SourceRef>;
export type SourceKey = keyof typeof SOURCES;

export interface Provenance {
  /** The topic / principle of the drill. */
  readonly topic: EvidenceClass;
  /** The technique cues and how-to wording. */
  readonly cues: EvidenceClass;
  /** Sets, targets and rest are always Gals Coacher's own. */
  readonly dosage: 'ORIGINAL_RECOMMENDATION';
  readonly sources: readonly SourceKey[];
  /** Exactly what the sources support. */
  readonly supports: string;
  /** What is Gals Coacher synthesis. */
  readonly synthesis: string;
}

const own = 'Technique cues, wording and every dosage are Gals Coacher\'s own.';

export const PROVENANCE: Readonly<Record<string, Provenance>> = {
  // ------------------------------------------------------------------ surfing
  SURF_POP_UP: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-CAMPS', 'SA-TIPS'],
    supports: 'Pop-up and stance are Foundation topics (SA-CAMPS); learn pop-ups on the sand first and find the natural stance, regular or goofy (SA-TIPS). How-to is not given.',
    synthesis: `The movement description, cues and the mat option. ${own}`,
  },
  SURF_PADDLING: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-CAMPS', 'SA-SCHED'],
    supports: '"Effective paddling" (SA-CAMPS) and a paddling-technique session (SA-SCHED) are listed. No technique or dosage is given.',
    synthesis: `Stroke cues, the acceleration-interval version and all durations. ${own}`,
  },
  SURF_TAKE_OFF: {
    topic: 'UNVERIFIED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['ISA-COURSES'],
    supports: 'Not stated on any opened page. An ISA Level 1 search-result summary mentions riding green waves and a controlled exit (listing only; the document was not opened).',
    synthesis: `Whitewater take-off as a beginner step, its wording and the whitewater-only safety rule. ${own}`,
  },
  SURF_DUCK_DIVE: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-CAMPS', 'SA-SCHED'],
    supports: 'Duck-dive technique is a listed topic (SA-CAMPS) and a pool duck-dive session exists (SA-SCHED). No steps are given.',
    synthesis: `The step description, cues and counts. ${own}`,
  },
  SURF_WAVE_SELECTION_POSITIONING: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-CAMPS'],
    supports: 'Wave selection and positioning are Foundation topics (SA-CAMPS, both camps). No method or counts are given.',
    synthesis: `The observation practice, the wave counts and the rule that the choice is made with a coach. ${own}`,
  },
  SURF_TRIM_AND_SPEED: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-CAMPS', 'ISA-COURSES'],
    supports: '"Generating your own speed" is a Foundation topic (SA-CAMPS). A controlled exit appears only in an ISA Level 1 listing (not opened).',
    synthesis: `Trim wording, controlled-exit cue and the ride counts. ${own}`,
  },
  SURF_BOTTOM_TURN: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-COACH', 'SA-PROG'],
    supports: 'Turning with control is a prerequisite for Progression-coach candidates (SA-PROG, SA-COACH); it is not stated as course content and a bottom turn is not listed.',
    synthesis: `The whole drill as an athlete exercise. ${own}`,
  },
  SURF_TOP_TURN: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-COACH', 'SA-PROG'],
    supports: 'Same limitation as the bottom turn: an expected ability of Progression-coach candidates, not stated course content.',
    synthesis: `The whole drill and the bottom-to-top combination. ${own}`,
  },
  SURF_CUTBACK: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-CAMPS', 'SA-PROG'],
    supports: 'Basic cutbacks appear only in the intermediate ability description (SA-CAMPS); cutbacks on both sides are a prerequisite (SA-PROG).',
    synthesis: `The drill, the re-entry as an advanced variant and the counts. ${own}`,
  },
  SURF_HEAT_SIMULATION: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SA-COACH'],
    supports: 'Only that Club Coaching includes heat-drill simulations (SA-COACH). The drill itself is not described.',
    synthesis: `The heat format, the rest and review structure and the 2 × 15 minute dosage. ${own}`,
  },
  // ------------------------------------------------------------------ football
  FB_BALL_MASTERY: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-DRIB48', 'F-ONCE'],
    supports: 'The principle of many touches on the ball, unopposed (F-DRIB48; F-ONCE: the ball is in use most of the time).',
    synthesis: `The specific touches (inside / outside / sole) and cues. ${own}`,
  },
  FB_DRIBBLING_COURSE: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-DRIB48', 'F-51'],
    supports: 'A cone relay with a one-minute game (F-DRIB48, opened). Corridor dribbling with direction changes (F-51, listing only).',
    synthesis: `Change of direction at every cone and the four-round dosage. ${own}`,
  },
  FB_PASS_AND_CONTROL: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-PASSREC', 'F-FINATK', 'F-64'],
    supports: 'A passing square with the middle player working one minute (F-PASSREC); weaker-foot and touch limits as progressions (F-FINATK, opened). Gate passing (F-64, listing only).',
    synthesis: `Foot alternation per set and the dosage. ${own}`,
  },
  FB_FIRST_TOUCH_AND_TURN: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-TCP-1V1', 'F-42'],
    supports: 'First touch away from the defender and receiving on the move (F-TCP-1V1, opened; age not stated). Body orientation on the turn (F-42, elite, listing only).',
    synthesis: `The turn-into-space drill, the pressure variant and the dosage. Youth suitability rests on our judgement. ${own}`,
  },
  FB_DRIBBLE_AND_SHOOT: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-57', 'F-PASSREC'],
    supports: 'Shooting through small games with rebound shooting (F-PASSREC, opened); a dribble-and-shoot race with a weaker-foot finish (F-57, listing only).',
    synthesis: `The drill and its dosage. ${own}`,
  },
  FB_SHOOTING_ACCURACY: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-ONCE', 'F-PASSREC'],
    supports: 'Shooting practised inside mini-games (F-ONCE, F-PASSREC).',
    synthesis: `The target-shooting drill, cues and dosage. ${own}`,
  },
  FB_COMBINATION_PLAY: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-PASSREC', 'F-FINATK', 'F-111'],
    supports: 'Passing and movement patterns in small groups (F-PASSREC, F-FINATK; F-111 is listing only).',
    synthesis: `Merging pass-move-receive and the dribble-plus-pass combination into one drill, and the dosage. ${own}`,
  },
  FB_RONDO: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-FINATK', 'F-ADV812', 'F-SKILL1215', 'F-MEXU15'],
    supports: 'Keep-ball circles with defenders and touch limits (F-FINATK: 10 passes, 2 defenders; F-ADV812: 5v3; F-SKILL1215: 4 passes). A 5v2 rondo in 10x10 m with an immediate press is from an elite youth session (F-MEXU15); its suitability for our players is not inferred.',
    synthesis: `The generic rondo, the touch-limit options and the dosage. ${own}`,
  },
  FB_SMALL_SIDED_GAME: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-ONCE', 'F-ADV812', 'F-TRANS1215', 'F-MEXU15'],
    supports: 'Small-sided games with the ball in use most of the time (F-ONCE, F-ADV812). Transition games with target players (F-TRANS1215). The counter-press rule (regain within 3–4 passes, else drop compact) is from an elite youth session (F-MEXU15); FIFA gives only its own game times there.',
    synthesis: `The formats as options, the rule wording and the game durations. ${own}`,
  },
  FB_ATTACKING_TRANSITION_OVERLOAD: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-TCP-3V2', 'F-TRANS1215'],
    supports: 'A 3v2 attack with runs in front of and behind the closing defender and channel occupation (F-TCP-3V2, opened; no age stated). F-TRANS1215 teaches target-player transition games, not 2v1 / 3v2.',
    synthesis: `The 2v1 / 3v2 drill for our players, the rotation and the dosage. Youth suitability of the advanced session needs human review. ${own}`,
  },
  FB_FINISHING_UNDER_PRESSURE: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['F-TCP-1V1', 'F-FINATK'],
    supports: 'Finishing against a defender (F-TCP-1V1, opened) and a 2v2 scoring game (F-FINATK, opened).',
    synthesis: `The drill, the safety wording about contact and the dosage. ${own}`,
  },
};
