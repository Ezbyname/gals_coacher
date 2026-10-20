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
  /** opened = the full text was read; abstract only = just the abstract (supports only a claim written in it); listing = only a search-result summary was seen; not opened = access was blocked, so it is NOT relied on for any claim. */
  readonly read: 'opened' | 'abstract only' | 'listing only' | 'owner-cited, not opened' | 'not opened';
}

export const SOURCES = {
  'SA-CAMPS': { name: 'Surfing Australia — adult surf camps', url: 'https://surfingaustralia.com/hpc/adult-surf-camps/', read: 'opened' },
  'SA-SCHED': { name: 'Surfing Australia — camp schedule', url: 'https://surfingaustralia.com/hpc/camp-schedule/', read: 'opened' },
  'SA-COACH': { name: 'Surfing Australia — coaching', url: 'https://surfingaustralia.com/coaching/', read: 'opened' },
  'SA-PROG': { name: 'Surfing Australia — Progression Surf Coach', url: 'https://surfingaustralia.com/progression-surf-coach/', read: 'opened' },
  'SA-TIPS': { name: 'Surfing Australia — surf-school tips for children', url: 'https://surfingaustralia.com/tips-to-keep-your-surf-school-safe-fun-and-inclusive-for-children-and-young-people/', read: 'opened' },
  'ISA-COURSES': { name: 'ISA — courses', url: 'https://isasurf.org/isa-courses/', read: 'listing only' },
  'SLS-RIP': { name: 'Surf Life Saving NSW — rip currents', url: 'https://www.surflifesaving.com.au/beach-safety/rip-currents/', read: 'opened' },
  'ISA-STRENGTH': { name: 'ISA — Surf Strength and Mobility Training (resistance training, cardio, mobility)', url: 'https://source.isasurf.org/?academy=112&course=6055&view=course_view', read: 'opened' },
  'SURF-PHYS-1': { name: 'Farley O, Harris NK, Kilding AE. Physiological demands of competitive surfing. Journal of Strength and Conditioning Research. PMID 21986691. DOI 10.1519/JSC.0b013e3182392c4b — supports the physiological-demand rationale only, not our programming', url: 'https://pubmed.ncbi.nlm.nih.gov/21986691/', read: 'opened' },
  'SURF-PHYS-2': { name: 'Farley O, Harris NK, Kilding AE. Anaerobic and aerobic fitness profiling of competitive surfers. Journal of Strength and Conditioning Research. PMID 21997448. DOI 10.1519/JSC.0b013e31823a3c81 — supports the physiological-demand rationale only, not our programming', url: 'https://pubmed.ncbi.nlm.nih.gov/21997448/', read: 'opened' },
  'SURF-PHYS-3': { name: 'Performance Analysis of Surfing: A Review. PMID 27050247 — supports the physiological-demand rationale only, not our programming', url: 'https://pubmed.ncbi.nlm.nih.gov/27050247/', read: 'opened' },
  'SURF-SCHOOL-WW': { name: 'Otro Modo Surf School — beginner surf course (teaches a beginner take-off on whitewater; ISA / FES-certified instructors). A surf-school page: NOT ISA or Surfing Australia content', url: 'https://www.otro-modo-surfschool.com/surf-course-fuerteventura/beginner-surf-course/', read: 'opened' },
  'USAB-CURRICULUM': { name: 'USA Basketball — coaching guidebook / player-development curriculum (skill families: ball handling & dribbling, passing & receiving, shooting, rebounding, footwork & body control, team defense). Contextual only; USA Basketball did not author our workouts or dosage', url: 'https://www.usab.com/news/2025/10/usa-basketball-coaching-guidebook-player-development-curriculum', read: 'opened' },
  'USAB-REBOUND': { name: 'USA Basketball — advanced rebounding / box-out material', url: 'https://www.usab.com/news/2014/01/advanced-rebounding-secrets-from-the-pros', read: 'opened' },
  'IBBC-BEGINNER': { name: 'Israel Basketball Coaches Association — beginner / school basketball training page (six embedded YouTube videos; no written drills or dosage; the videos were NOT watched and no transcript was available)', url: 'https://www.ibbcoaches.org.il/beginnerbasketballtraining', read: 'opened' },
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
  // ------------------------------------------------------------------ TRAINING-BLOCKS-001 (general athletic development)
  'LTAD-1': { name: 'Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015', url: 'https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf', read: 'opened' },
  'RST-NSCA': { name: 'Thurlow F, McLaren SJ, Townshend A, Weakley J. The Application of Repeated-Sprint Training. NSCA Strength & Conditioning Journal', url: 'https://www.nsca.com/globalassets/certification/rscc/3--scj--application-of-repeat-sprint-training.pdf', read: 'opened' },
  'PLYO-ADOLESCENT': { name: 'The effects of plyometric training on physical fitness in adolescent team sports: a systematic review and meta-analysis', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12867812/', read: 'opened' },
  'HIIT-YOUTH': { name: 'Eddolls WTB, McNarry MA, Stratton G, et al. High-Intensity Interval Training Interventions in Children and Adolescents: A Systematic Review. Sports Med 2017', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5633633/', read: 'opened' },
  'LANDING-ADULTS': { name: 'Bathe et al. Training interventions to reduce the risk of injury to the lower limb during landing — systematic review and meta-analysis (adult athletes only). BMJ Open Sport Exerc Med 2023', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10254820/', read: 'opened' },
  'ACSM-2009': { name: 'Ratamess NA, et al. ACSM position stand: Progression models in resistance training for healthy adults. Med Sci Sports Exerc 2009 (adults)', url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/', read: 'abstract only' },
  'AGILITY-2016': { name: 'Paul DJ, Gabbett TJ, Nassis GP. Agility in team sports: testing, training and factors affecting performance. Sports Med 2016', url: 'https://pubmed.ncbi.nlm.nih.gov/26670456/', read: 'abstract only' },
  'RSA-2011': { name: 'Bishop D, Girard O, Mendez-Villanueva A. Repeated-sprint ability — Part II: recommendations for training. Sports Med 2011', url: 'https://pubmed.ncbi.nlm.nih.gov/21846163/', read: 'abstract only' },
  'NSCA-YOUTH-2009': { name: 'Faigenbaum AD, et al. Youth resistance training: updated position statement paper from the NSCA. J Strength Cond Res 2009 — full text blocked; NOT relied on for any specific claim', url: 'https://pubmed.ncbi.nlm.nih.gov/19620931/', read: 'not opened' },
  'YOUTH-RT-2014': { name: 'Lloyd RS, et al. Position statement on youth resistance training: the 2014 International Consensus. Br J Sports Med 2014 — full text not reachable; NOT relied on for any specific claim', url: 'https://doi.org/10.1136/bjsports-2013-092952', read: 'not opened' },
  'DECEL-2022': { name: 'McBurnie AJ, Harper DJ, Jones PA, Dos\'Santos T. Deceleration training in team sports. Sports Med 2022 — full text blocked; NOT relied on for any specific claim', url: 'https://salford-repository.worktribe.com/output/1334048/deceleration-training-in-team-sports-another-potential-vaccine-for-sports-related-injury', read: 'not opened' },
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
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['SURF-SCHOOL-WW'],
    supports: 'A surf-school page (SURF-SCHOOL-WW, opened; instructors described as ISA / FES-certified) teaches a beginner take-off on whitewater. It is not ISA or Surfing Australia content, and it does not give our drill wording or dosage.',
    synthesis: `The drill wording, cues, the whitewater-only safety rule and the counts. ISA / Surfing Australia are not claimed to have authored this drill. ${own}`,
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
  // ------------------------------------------------------------------ basketball (SPORT-CONTENT-002)
  BOX_OUT_DRILL: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['USAB-REBOUND', 'USAB-CURRICULUM'],
    supports: 'USA Basketball material treats rebounding and the box-out as a basketball skill (USAB-REBOUND; USAB-CURRICULUM lists Rebounding as a skill family). It does not give our wording or dosage.',
    synthesis: `The step-by-step wording (locate, controlled contact, pivot, wide low stance, go to the ball), the cues and the 3 × 8 dosage. ${own}`,
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
  // ------------------------------------------------------------------ general athletic (TRAINING-BLOCKS-001)
  DROP_LANDING_STICK: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['LTAD-1', 'LANDING-ADULTS'],
    supports: 'Competency (movement quality) should come before higher-intensity work (LTAD-1, opened). Instruction and feedback improved landing mechanics in ADULT athletes (LANDING-ADULTS, opened); no opened source covers youth or a landing progression.',
    synthesis: `Landing as its own first step before any jump, the step-off wording and the dosage. Landing-before-plyometrics is our professional synthesis. ${own}`,
  },
  SINGLE_LEG_HOP_STICK: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['LTAD-1', 'LANDING-ADULTS'],
    supports: 'Same limitation as the two-leg landing: competency before intensity (LTAD-1) and adult landing-technique evidence (LANDING-ADULTS). No opened source gives a single-leg progression.',
    synthesis: `Single-leg hop-and-stick as a later step after the two-leg landing, its distance and the dosage. ${own}`,
  },
  DECEL_STOP: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['DECEL-2022'],
    supports: 'Nothing is claimed from a source: the deceleration-training paper could not be opened, so it supports no claim here.',
    synthesis: `The whole drill — a controlled acceleration into a marked stop — and putting deceleration before aggressive change of direction. ${own}`,
  },
  PARTNER_MIRROR_DRILL: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['AGILITY-2016'],
    supports: 'Only what the abstract states (AGILITY-2016, abstract only): agility depends on reacting to a stimulus, a human or video stimulus separates playing levels better, and small-sided games may be an effective way to train it.',
    synthesis: `The mirror drill itself, its box size, the work time and the dosage. Pre-planned work before reactive work is our synthesis. ${own}`,
  },
  COACH_CUE_REACTION_SPRINT: {
    topic: 'SOURCE_SUPPORTED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['AGILITY-2016'],
    supports: 'Only the abstract-level point that agility involves reacting to a stimulus, with a human stimulus a valid one (AGILITY-2016, abstract only).',
    synthesis: `The cue types, the 5–10 m distance and the dosage. ${own}`,
  },
  RUN_INTERVALS: {
    topic: 'SYNTHESIZED', cues: 'SYNTHESIZED', dosage: 'ORIGINAL_RECOMMENDATION', sources: ['HIIT-YOUTH'],
    supports: 'A review of running-based high-intensity interval training in children and adolescents suggests 2–3 sessions a week for about 7 weeks or more; it says bout duration and rest are still ambiguous and reports no safety data (HIIT-YOUTH, opened). It does not validate any exact work / rest.',
    synthesis: `The exercise and its default representation (6 efforts of 45 s with 90 s rest). Exact work, rest, rounds and intensity guidance are set by each workout. ${own}`,
  },
};
