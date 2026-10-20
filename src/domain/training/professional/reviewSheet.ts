import { builtinExercise } from '../../exercise/catalog';
import { BASKETBALL_EXPANSION } from '../../exercise/catalog/basketball';
import { FOOTBALL } from '../../exercise/catalog/football';
import { PROVENANCE, SOURCES, type SourceKey } from '../../exercise/catalog/provenance';
import { SURFING } from '../../exercise/catalog/surfing';
import type { ExerciseDefinition } from '../../exercise/exercise';
import { defaultPrescription } from '../training';
import { PROFESSIONAL_WORKOUTS, SPORT_CONTENT_001_WORKOUT_IDS, SPORT_CONTENT_003_WORKOUT_IDS, type ProfessionalWorkout } from '.';
import { IBBC_CANDIDATE_VIDEOS } from './ibbc';

/**
 * The bilingual CONTENT-REVIEW-SHEET for human approval, rendered from the very same code the app ships (so the sheet can
 * never drift from the content). ONE combined sheet for SPORT-CONTENT-001 and SPORT-CONTENT-002. Nothing here is shown to
 * users as a status; publishing / building a release waits for a human to approve this sheet (every item is
 * `PENDING_HUMAN_REVIEW`).
 */
const measurementText = (e: ExerciseDefinition): string => {
  const t = e.measurement.type;
  return t === 'REPETITIONS' ? 'repetitions' : t === 'DURATION' ? 'duration (seconds)' : t === 'MADE_ATTEMPTS' ? 'makes / attempts' : t === 'TIME' ? 'time to complete' : t.toLowerCase();
};
const unit = (e: ExerciseDefinition): string =>
  e.measurement.type === 'DURATION' ? 's' : e.measurement.type === 'MADE_ATTEMPTS' ? ' attempts' : e.measurement.type === 'REPETITIONS' ? ' reps' : '';
const dosage = (e: ExerciseDefinition, d: { sets: number; target: number | null; restSec: number | null } | null): string =>
  d === null ? '—' : `${d.sets} × ${d.target === null ? '(no target)' : `${d.target}${unit(e)}`}, rest ${d.restSec ?? 0} s`;
const equipmentText = (e: ExerciseDefinition): string =>
  e.equipment.length === 0 ? 'none (bodyweight)' : e.equipment.map((o) => o.join(' + ')).join(' OR ');
const sourceLine = (key: SourceKey): string =>
  `- ${SOURCES[key].name}${SOURCES[key].url ? ` — ${SOURCES[key].url}` : ''} _(${SOURCES[key].read})_`;
const bullets = (items: readonly (readonly [string, string])[], lang: 0 | 1): string => items.map((p) => `  - ${p[lang]}`).join('\n') || '  - —';

function exerciseBlock(e: ExerciseDefinition, slice: string): string {
  const p = PROVENANCE[e.id]!;
  return [
    `### ${e.id}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Slice** | ${slice} |`,
    `| **HE name** | ${e.name.he} |`,
    `| **EN name** | ${e.name.en} |`,
    `| **Sport** | ${e.sports.join(', ')} |`,
    `| **Difficulty** | ${e.difficulty} (content progression, not a readiness assessment) |`,
    `| **Measurement** | ${measurementText(e)} |`,
    `| **Dosage (ORIGINAL_RECOMMENDATION)** | ${dosage(e, e.defaults)} |`,
    `| **Equipment** | ${equipmentText(e)} |`,
    `| **Evidence class** | topic: \`${p.topic}\` · cues: \`${p.cues}\` · dosage: \`${p.dosage}\` |`,
    '',
    `**Instructions — HE:** ${e.instructions!.he}`,
    '',
    `**Instructions — EN:** ${e.instructions!.en}`,
    '',
    `**Coaching cues — HE:**`,
    bullets(e.cues.map((c) => [c.he, c.en] as const), 0),
    '',
    `**Coaching cues — EN:**`,
    bullets(e.cues.map((c) => [c.he, c.en] as const), 1),
    '',
    `**Safety — HE:** ${e.safety ? e.safety.he : '— (none written)'}`,
    '',
    `**Safety — EN:** ${e.safety ? e.safety.en : '— (none written)'}`,
    '',
    `**Source / provenance:**`,
    p.sources.length === 0 ? '- No external source was consulted.' : p.sources.map(sourceLine).join('\n'),
    '',
    `**Exactly what the source supports:** ${p.supports}`,
    '',
    `**What is Gals Coacher synthesis:** ${p.synthesis}`,
    '',
    `**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.`,
    '',
  ].join('\n');
}

/** What the sources do and do not support for each SPORT-CONTENT-002 workout, and what is our own. */
const EXPANDED_EVIDENCE: Readonly<Record<string, { supports: string; synthesis: string }>> = {
  'SURF-FITNESS-FOUNDATION-01': {
    supports: 'Surfing Australia HPC camp schedule (SA-SCHED, opened): upper-body and lower-body strength & mobility, pre-surf activation and recovery. ISA Surf Strength and Mobility education (ISA-STRENGTH, opened): resistance training, cardio and mobility. Published surfing-performance research (SURF-PHYSIOLOGY, opened): cardiorespiratory fitness, muscular endurance, strength, anaerobic power and a significant upper-torso demand. None of them gives these exact exercises or any dosage.',
    synthesis: 'The exact exercise selection, the order, the movement families chosen, every set / repetition / duration and the sectioning. Gym exercises are NOT claimed to be paddling.',
  },
  'SURF-PADDLE-ENDURANCE-01': {
    supports: 'Surfing Australia HPC camp schedule (SA-SCHED, opened): upper-body and lower-body strength & mobility, pre-surf activation and recovery. ISA Surf Strength and Mobility education (ISA-STRENGTH, opened): resistance training, cardio and mobility. Published surfing-performance research (SURF-PHYSIOLOGY, opened): cardiorespiratory fitness, muscular endurance, strength, anaerobic power and a significant upper-torso demand. None of them gives these exact exercises or any dosage. The repeated, intermittent paddling demand is supported by the same research.',
    synthesis: 'The repeated-effort interval structure (6 × 30 s style), the ONE conditioning station (ski erg OR rowing machine OR battle ropes — not all of them), the two pulling-endurance rows plus face pull, the trunk endurance selection and every dosage. It does not reproduce water mechanics, and there is no breath-hold training.',
  },
  'SURF-POWER-ROTATION-01': {
    supports: 'Surfing Australia HPC camp schedule (SA-SCHED, opened): upper-body and lower-body strength & mobility, pre-surf activation and recovery. ISA Surf Strength and Mobility education (ISA-STRENGTH, opened): resistance training, cardio and mobility. Published surfing-performance research (SURF-PHYSIOLOGY, opened): cardiorespiratory fitness, muscular endurance, strength, anaerobic power and a significant upper-torso demand. None of them gives these exact exercises or any dosage.',
    synthesis: 'The lower-body strength selection with ONE jump (squat jump) and ONE hip-extension (hip thrust), the rotation / anti-rotation trio (rotational throw, Pallof press, side plank — no Russian twist), the burpee as a general lie-down-and-get-up pattern (not a pop-up copy), about 15 movements and every dosage. Strength alone is not claimed to make an advanced surfer. Advanced content may need adjustment by a coach or responsible adult.',
  },
  'FOOTBALL-FIRST-TOUCH-PASSING-01': {
    supports: 'Passing and receiving patterns, keep-ball circles and combination play appear in FIFA Training Centre grassroots material (F-PASSREC, F-FINATK, F-SKILL1215, F-ONCE — opened); first touch away from the defender (F-TCP-1V1, opened). Body orientation on the turn is only a listing (F-42).',
    synthesis: 'The selection from our existing Football exercises, the scanning coaching point (look around before the ball arrives) and every dosage.',
  },
  'FOOTBALL-1V1-FINISHING-01': {
    supports: 'Dribbling with direction changes and a one-minute dribbling game (F-DRIB48, opened), receiving on the move and beating a defender (F-TCP-1V1, opened), scoring games (F-FINATK, opened). Dribble-and-shoot and corridor dribbling are listings only (F-57, F-51).',
    synthesis: 'The selection and order, the 1v1 → 2v2 game progression and every dosage.',
  },
  'FOOTBALL-TRANSITION-PRESSING-01': {
    supports: 'Target-player transition games (F-TRANS1215) and a 3v2 overload (F-TCP-3V2, no age stated) are opened; the 3–4-pass regain rule comes from an elite youth session (F-MEXU15, opened) and is not shown to suit every age.',
    synthesis: 'Turning these ideas into one game-based session for our players, the pressing-rule wording and every dosage. Advanced content may need adjustment by a coach or responsible adult.',
  },
  'BASKETBALL-BALL-HANDLING-01': {
    supports: 'USA Basketball (USAB-CURRICULUM, opened) is CONTEXTUAL evidence only: it separates player development into skill families such as ball handling & dribbling, passing & receiving, shooting, rebounding, footwork & body control and team defense. USA Basketball did not author this workout or any dosage. Skill family: Ball Handling & Dribbling.',
    synthesis: 'The whole workout is assembled from the app\'s own existing, already-curated Basketball drills (no new Exercise); the order and every dosage are ours.',
  },
  'BASKETBALL-SHOOTING-FINISHING-01': {
    supports: 'USA Basketball (USAB-CURRICULUM, opened) is CONTEXTUAL evidence only: it separates player development into skill families such as ball handling & dribbling, passing & receiving, shooting, rebounding, footwork & body control and team defense. USA Basketball did not author this workout or any dosage. Skill family: Shooting (finishing at the rim is part of shooting practice).',
    synthesis: 'Assembled from the app\'s existing Basketball shooting and finishing drills (no new Exercise); the order and every dosage are ours — about 160 shot / finish attempts for the stated 45–60 minutes.',
  },
  'BASKETBALL-DEFENSE-REBOUNDING-01': {
    supports: 'USA Basketball (USAB-CURRICULUM, opened) is CONTEXTUAL evidence only: it separates player development into skill families such as ball handling & dribbling, passing & receiving, shooting, rebounding, footwork & body control and team defense. USA Basketball did not author this workout or any dosage. Skill families: Rebounding, Footwork & Body Control, Team Defense. USA Basketball box-out / rebounding material (USAB-REBOUND, opened) supports the box-out topic.',
    synthesis: 'Assembled from the app\'s existing defensive drills plus ONE new drill, BOX_OUT_DRILL; the order and every dosage are ours.',
  },
};
const IBBC_EVIDENCE = {
  supports: 'The IBBC beginner-training page (opened) embeds six YouTube videos and contains NO written drills and NO dosage. The videos were NOT watched and no transcript was available, so nothing about HOW a drill is done is taken from them: they are kept ONLY in this review sheet as CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED notes and are NOT shown in the app.',
  synthesis: 'The choice and order of EXISTING library exercises (no new Exercise), the sections and every set / repetition / duration (all ORIGINAL_RECOMMENDATION). The videos belong to Jr. NBA / Jr. WNBA, HoopsKing and Peak Performance Training.',
};
const CORE_EVIDENCE = {
  supports: 'See the Sources list: the topics of the drills come from the opened Surfing Australia, Surf Life Saving NSW and FIFA Training Centre pages; none gives dosages.',
  synthesis: 'Selection, order, sectioning and every dosage.',
};

function workoutBlock(w: ProfessionalWorkout): string {
  const core = SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id);
  const ibbc = SPORT_CONTENT_003_WORKOUT_IDS.includes(w.id);
  const ev = core ? CORE_EVIDENCE : ibbc ? IBBC_EVIDENCE : EXPANDED_EVIDENCE[w.id]!;
  const lines: string[] = [
    `### ${w.id} — ${w.name[1]} / ${w.name[0]}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Slice** | ${core ? 'SPORT-CONTENT-001 (unchanged apart from the review patch)' : ibbc ? 'SPORT-CONTENT-003 (new)' : 'SPORT-CONTENT-002 (new)'} |`,
    `| **Sport** | ${w.sport} |`,
    `| **Difficulty** | ${w.difficulty} |`,
    `| **Focus** | ${w.focus} |`,
    `| **Length** | about ${w.minutes[0]}–${w.minutes[1]} minutes |`,
    `| **Review status** | \`${w.reviewStatus}\` |`,
    `| **Evidence class** | structure and sequencing: \`SYNTHESIZED\` · every dosage: \`ORIGINAL_RECOMMENDATION\` |`,
    '',
    `**Summary — HE:** ${w.summary[0]}`,
    '',
    `**Summary — EN:** ${w.summary[1]}`,
    '',
  ];
  for (const [s, section] of w.sections.entries()) {
    lines.push(`**Section ${s + 1} — ${section.name[1]} / ${section.name[0]}**`, '');
    lines.push('| # | Exercise (ID) | EN | HE | Dosage |', '|---|---|---|---|---|');
    for (const [i, item] of section.items.entries()) {
      const e = builtinExercise(item.exerciseId)!;
      const fromDefaults = !item.dosage;
      const d = item.dosage ?? defaultPrescription(e.measurement, e.defaults);
      lines.push(`| ${i + 1} | ${e.id} | ${e.name.en} | ${e.name.he} | ${dosage(e, d)}${fromDefaults ? " _(the Exercise's own default — existing catalog content)_" : ''} |`);
    }
    lines.push('');
  }
  lines.push(`**Coach notes (shown on the workout screen, NOT copied into a plan):**`, '');
  for (const note of w.coachNotes) lines.push(`- HE: ${note[0]}`, `- EN: ${note[1]}`);
  lines.push('', `**Safety — HE:** ${w.safety ? w.safety[0] : '— (none)'}`, '', `**Safety — EN:** ${w.safety ? w.safety[1] : '— (none)'}`, '');
  const candidates = IBBC_CANDIDATE_VIDEOS.filter((v) => v.candidateFor.includes(w.id));
  if (candidates.length > 0) {
    lines.push(`**Candidate reference videos (review notes only — NOT shown in the app; status \`CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED\`):**`, '');
    for (const v of candidates) lines.push(`- ${v.title} — ${v.author} — ${v.url}`);
    lines.push('');
  }
  lines.push(`**Sources:**`, w.sources.length === 0 ? '- No external source was consulted (built from the app\'s own curated catalog).' : w.sources.map(sourceLine).join('\n'), '');
  lines.push(`**Exactly what the sources support:** ${ev.supports}`, '', `**What is Gals Coacher synthesis:** ${ev.synthesis}`, '', `**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.`, '');
  return lines.join('\n');
}

export function renderContentReviewSheet(): string {
  const core = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id));
  const expanded = PROFESSIONAL_WORKOUTS.filter((w) => !SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id) && !SPORT_CONTENT_003_WORKOUT_IDS.includes(w.id));
  const fromIbbc = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_003_WORKOUT_IDS.includes(w.id));
  const newExercises = SURFING.length + FOOTBALL.length + BASKETBALL_EXPANSION.length;
  const out: string[] = [
    '# CONTENT-REVIEW-SHEET — SPORT-CONTENT-001 + 002 + 003 (one combined sheet)',
    '',
    'Status of every item below: **PENDING_HUMAN_REVIEW**. Nothing is published as approved until a human approves this sheet.',
    '',
    `Contents: **${newExercises} new built-in Exercises** (Surfing ${SURFING.length}, Football ${FOOTBALL.length}, Basketball ${BASKETBALL_EXPANSION.length}) and **${PROFESSIONAL_WORKOUTS.length} professional workouts** (${core.length} from SPORT-CONTENT-001, ${expanded.length} from SPORT-CONTENT-002, ${fromIbbc.length} from SPORT-CONTENT-003). The SPORT-CONTENT-002 workouts reuse the existing catalog (their only new Exercise is the Basketball box-out); SPORT-CONTENT-003 adds NO Exercise and NO user-facing video: two beginner workouts from existing exercises, with the six IBBC videos kept as review notes only.`,
    '',
    '- Everything here is **Gals Coacher\'s own programming, informed by public sources**. It is not official FIFA, ISA, Surfing Australia or USA Basketball programming.',
    '- **Every dosage (sets, targets, rest, durations, counts) is an `ORIGINAL_RECOMMENDATION`** — no source gives dosages for these drills.',
    '- Evidence classes: `SOURCE_SUPPORTED` (an opened source states the topic), `SYNTHESIZED` (our coaching synthesis), `ORIGINAL_RECOMMENDATION` (our own recommendation), `UNVERIFIED` (not stated by any opened source; kept as our synthesis pending verification).',
    '- Sources marked _listing only_ were seen only as a search-result summary; _owner-cited, not opened_ were cited to us and not opened (none remain after review round 1 except those so marked). Neither is relied on for anything beyond what is written here.',
    '- Difficulty is content progression metadata, never a medical or readiness assessment. Advanced content may require adjustment by a coach or responsible adult based on age, experience and physical ability.',
    '- Surf safety: ocean sessions carry the reviewed wording (conditions, currents, weather and level are assessed in person by the surfer, coach or responsible adult; the app does not determine whether conditions are safe). Dry-land surf workouts use ordinary strength-training wording. No breath-hold training anywhere.',
    '',
    '## Points that need a human decision',
    '',
    '**Review round 1 (human review: CHANGES REQUIRED — SMALL CONTENT PATCH) — applied in this version**',
    '',
    '- Surf ocean-safety wording replaced (HE + EN) and the rip-current briefing aligned with Surf Life Saving NSW (stay calm / float, signal for help, if able escape sideways toward breaking waves, reassess).',
    '- `SURF_TAKE_OFF`: topic is now `SOURCE_SUPPORTED` (opened surf-school page that teaches a whitewater take-off); wording, cues and dosage stay `SYNTHESIZED` / `ORIGINAL_RECOMMENDATION`. No claim that ISA or Surfing Australia authored the drill.',
    '- Surf dry-land sources recorded as opened: Surfing Australia HPC, ISA Surf Strength and Mobility, surfing-performance research.',
    '- The three prescriptions that had no target now have one: `CONE_DRIBBLE_SLALOM` 4 × 30 s, `DEFENSIVE_SLIDES` 4 × 30 s, `LANE_AGILITY` 3 × 30 s.',
    '- `BASKETBALL-SHOOTING-FINISHING-01` reduced to about 160 attempts. `SURF-POWER-ROTATION-01` reduced to about 15 movements (one jump, one hip extension, no Russian twist). `SURF-PADDLE-ENDURANCE-01` now has ONE conditioning station (ski erg OR rowing machine OR battle ropes) and two rows.',
    '- `BOX_OUT_DRILL`: Hebrew name and instructions reworded; topic `SOURCE_SUPPORTED` (USA Basketball). USA Basketball is recorded for the Basketball workouts as contextual evidence for the skill families only.',
    '- Hebrew names: משחקון בשטח קטן, סגירה לריבאונד (Box-Out), קליעה ולייאפים, מעברים ולחץ לאחר איבוד.',
    '- Unchanged and approved: Advanced Football (with the age / coach-adjustment note), bottom turn / top turn / cutback as `SYNTHESIZED`, the six IBBC videos as `CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED` review notes only.',
    '',
    '**Points that still need a human decision**',
    '',
    '1. Final approval of the reviewed surf ocean-safety wording and rip-current briefing.',
    '2. Hebrew names, instructions and cues (native-speaker coach review of the remaining text).',
    '3. Dosage for every item (all `ORIGINAL_RECOMMENDATION`).',
    '4. **Equipment**: Paddle Endurance needs one of ski erg / rowing machine / battle ropes (the workout lists the ski erg; the section title names the alternatives).',
    '5. **Surf Technique vs Surf Strength & Fitness** are shown as separate groups in the Professional workouts list; the Football 001 workouts are tagged "All-round progression".',
    '',
    '**SPORT-CONTENT-003 (the IBBC beginner page)**',
    '',
    '6. **The six videos were not watched and no transcript could be obtained** (five have no captions; the sixth\'s caption file is empty). So no video became an Exercise, no how-to was written from a title, and **no video is shown in the app**; they are `CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED` notes in this sheet only. If you want one promoted to a user-facing reference or turned into an Exercise, someone needs to watch it and give the exact setup, roles, steps, cues and progression.',
    '7. **The sources are third-party** (Jr. NBA / Jr. WNBA, HoopsKing — a commercial site whose coaching quality has not been reviewed — and Peak Performance Training).',
    '8. **The sets / repetitions / durations** of the two beginner workouts are ours (all `ORIGINAL_RECOMMENDATION`).',
    '',
    '',
    `## A. New Exercises (${newExercises})`,
    '',
    '### A1. Surfing (SPORT-CONTENT-001)',
    '',
    ...SURFING.map((e) => exerciseBlock(e, 'SPORT-CONTENT-001')),
    '### A2. Football (SPORT-CONTENT-001)',
    '',
    ...FOOTBALL.map((e) => exerciseBlock(e, 'SPORT-CONTENT-001')),
    '### A3. Basketball (SPORT-CONTENT-002)',
    '',
    ...BASKETBALL_EXPANSION.map((e) => exerciseBlock(e, 'SPORT-CONTENT-002')),
    `## B. Professional workouts (${PROFESSIONAL_WORKOUTS.length})`,
    '',
    `### B1. SPORT-CONTENT-001 (${core.length}, unchanged)`,
    '',
    ...core.map(workoutBlock),
    `### B2. SPORT-CONTENT-002 (${expanded.length}, new)`,
    '',
    ...expanded.map(workoutBlock),
    `### B3. SPORT-CONTENT-003 (${fromIbbc.length}, new — existing exercises only; the IBBC videos are review notes, not shown in the app)`,
    '',
    ...fromIbbc.map(workoutBlock),
    '## C. Video verification table (the IBBC beginner page)',
    '',
    'Page: https://www.ibbcoaches.org.il/beginnerbasketballtraining — six embedded YouTube videos, no written drills, no dosage. Status of every video: `CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED`.',
    '',
    '| Video | Watched / transcript verified | What the source actually shows (its own title + YouTube description only) | What we implemented | What remains our own recommendation | New Exercise required? |',
    '|---|---|---|---|---|---|',
    ...IBBC_CANDIDATE_VIDEOS.map(
      (v) => `| [${v.title}](${v.url}) — ${v.author} | NO — not watched; no transcript available | ${v.about[1]} | Nothing shown to users: kept as a \`CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED\` review note | All sets / reps / durations and the choice of existing exercises | **NO** |`,
    ),
    '',
  ];
  return out.join('\n');
}
