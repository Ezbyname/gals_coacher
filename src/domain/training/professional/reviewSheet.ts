import { builtinExercise } from '../../exercise/catalog';
import { BASKETBALL_EXPANSION } from '../../exercise/catalog/basketball';
import { FOOTBALL } from '../../exercise/catalog/football';
import { PROVENANCE, SOURCES, type SourceKey } from '../../exercise/catalog/provenance';
import { SURFING } from '../../exercise/catalog/surfing';
import type { ExerciseDefinition } from '../../exercise/exercise';
import { defaultPrescription } from '../training';
import { PROFESSIONAL_WORKOUTS, SPORT_CONTENT_001_WORKOUT_IDS, type ProfessionalWorkout } from '.';

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
    supports: 'Surfing Australia camp schedule lists strength & mobility, pre-surf activation and recovery sessions (SA-SCHED, opened). The owner additionally cites upper-body and lower-body strength & mobility and surf-specific fitness on the Surfing Australia HPC pages, ISA Surf Strength and Mobility education (resistance training, cardio, mobility) and published surfing-physiology research — none of those three were opened in this slice, so they are recorded as owner-cited, not opened.',
    synthesis: 'The exact exercise selection, the order, the movement families chosen, every set / repetition / duration and the sectioning. Gym exercises are NOT claimed to be paddling.',
  },
  'SURF-PADDLE-ENDURANCE-01': {
    supports: 'Same as the foundation workout: strength & mobility and recovery sessions are listed (SA-SCHED, opened). The need for muscular endurance, cardiorespiratory fitness, upper-torso demand and repeated, intermittent paddling comes from the owner-cited physiology research and ISA education (not opened here).',
    synthesis: 'The repeated-effort interval structure (6 × 30 s style), the pulling / trunk endurance selection and every dosage. It does not reproduce water mechanics, and there is no breath-hold training.',
  },
  'SURF-POWER-ROTATION-01': {
    supports: 'Strength & mobility, pre-surf activation and recovery are listed (SA-SCHED, opened); strength, anaerobic power and upper-torso demand are owner-cited from surfing physiology research (not opened).',
    synthesis: 'The lower-body strength / explosive extension / rotation / anti-rotation selection, the burpee as a general lie-down-and-get-up pattern (not a pop-up copy), and every dosage. Strength alone is not claimed to make an advanced surfer. Advanced content may need adjustment by a coach or responsible adult.',
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
    supports: 'No external source was consulted for the Basketball workouts in this slice.',
    synthesis: 'The whole workout is assembled from the app\'s own existing, already-curated Basketball drills (no new Exercise); the order and every dosage are ours.',
  },
  'BASKETBALL-SHOOTING-FINISHING-01': {
    supports: 'No external source was consulted for the Basketball workouts in this slice.',
    synthesis: 'Assembled from the app\'s existing Basketball shooting and finishing drills (no new Exercise); the order and every dosage are ours.',
  },
  'BASKETBALL-DEFENSE-REBOUNDING-01': {
    supports: 'No external source was consulted for the Basketball workouts in this slice.',
    synthesis: 'Assembled from the app\'s existing defensive drills plus ONE new drill, BOX_OUT_DRILL (the catalog had no box-out); the order and every dosage are ours.',
  },
};
const CORE_EVIDENCE = {
  supports: 'See the Sources list: the topics of the drills come from the opened Surfing Australia, Surf Life Saving NSW and FIFA Training Centre pages; none gives dosages.',
  synthesis: 'Selection, order, sectioning and every dosage.',
};

function workoutBlock(w: ProfessionalWorkout): string {
  const core = SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id);
  const ev = core ? CORE_EVIDENCE : EXPANDED_EVIDENCE[w.id]!;
  const lines: string[] = [
    `### ${w.id} — ${w.name[1]} / ${w.name[0]}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Slice** | ${core ? 'SPORT-CONTENT-001 (unchanged)' : 'SPORT-CONTENT-002 (new)'} |`,
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
  lines.push(`**Sources:**`, w.sources.length === 0 ? '- No external source was consulted (built from the app\'s own curated catalog).' : w.sources.map(sourceLine).join('\n'), '');
  lines.push(`**Exactly what the sources support:** ${ev.supports}`, '', `**What is Gals Coacher synthesis:** ${ev.synthesis}`, '', `**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.`, '');
  return lines.join('\n');
}

export function renderContentReviewSheet(): string {
  const core = PROFESSIONAL_WORKOUTS.filter((w) => SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id));
  const expanded = PROFESSIONAL_WORKOUTS.filter((w) => !SPORT_CONTENT_001_WORKOUT_IDS.includes(w.id));
  const newExercises = SURFING.length + FOOTBALL.length + BASKETBALL_EXPANSION.length;
  const out: string[] = [
    '# CONTENT-REVIEW-SHEET — SPORT-CONTENT-001 + SPORT-CONTENT-002 (one combined sheet)',
    '',
    'Status of every item below: **PENDING_HUMAN_REVIEW**. Nothing is published as approved until a human approves this sheet.',
    '',
    `Contents: **${newExercises} new built-in Exercises** (Surfing ${SURFING.length}, Football ${FOOTBALL.length}, Basketball ${BASKETBALL_EXPANSION.length}) and **${PROFESSIONAL_WORKOUTS.length} professional workouts** (${core.length} from SPORT-CONTENT-001, ${expanded.length} from SPORT-CONTENT-002). The nine SPORT-CONTENT-002 workouts reuse the existing catalog; the only new Exercise they add is the Basketball box-out.`,
    '',
    '- Everything here is **Gals Coacher\'s own programming, informed by public sources**. It is not official FIFA, ISA, Surfing Australia or USA Basketball programming.',
    '- **Every dosage (sets, targets, rest, durations, counts) is an `ORIGINAL_RECOMMENDATION`** — no source gives dosages for these drills.',
    '- Evidence classes: `SOURCE_SUPPORTED` (an opened source states the topic), `SYNTHESIZED` (our coaching synthesis), `ORIGINAL_RECOMMENDATION` (our own recommendation), `UNVERIFIED` (not stated by any opened source; kept as our synthesis pending verification).',
    '- Sources marked _listing only_ were seen only as a search-result summary; _owner-cited, not opened_ were cited to us and not opened. Neither is relied on for anything beyond what is written here.',
    '- Difficulty is content progression metadata, never a medical or readiness assessment. Advanced content may require adjustment by a coach or responsible adult based on age, experience and physical ability.',
    '- Surf safety: ocean sessions keep the locked wording (no claim that conditions are safe; conditions, currents, weather and level are judged by the surfer, coach or responsible adult). Dry-land surf workouts use ordinary strength-training wording. No breath-hold training anywhere.',
    '',
    '## Points that need a human decision',
    '',
    '**From SPORT-CONTENT-001**',
    '',
    '1. **Surf ocean-safety wording** (HE and EN) — shown on every surf Exercise and every Surf Technique workout.',
    '2. **Youth suitability of the advanced Football workouts** (`FOOTBALL-PERFORMANCE-01`, and now `FOOTBALL-TRANSITION-PRESSING-01`): FIFA gives the 3v2 drill with no age, and the counter-press rule comes from an elite youth session. Every ADVANCED workout now also shows the neutral "may require adjustment by a coach or responsible adult" note.',
    '3. **`SURF_TAKE_OFF`** is `UNVERIFIED` (no opened source states a whitewater take-off).',
    '4. **Bottom turn / top turn / cutback** are `SYNTHESIZED`: Surfing Australia lists them only as abilities expected of Progression-coach candidates.',
    '5. **Hebrew names, instructions and cues** (all new Exercises and workouts) need a native-speaker coach review.',
    '6. **Dosage** for every item (all `ORIGINAL_RECOMMENDATION`).',
    '',
    '**New in SPORT-CONTENT-002**',
    '',
    '7. **Surf dry-land evidence**: only the Surfing Australia camp schedule (strength & mobility, pre-surf activation, recovery) was opened. The upper-/lower-body split, surf-specific fitness, the ISA Surf Strength and Mobility education and the physiology research are **owner-cited, not opened** — please supply the specific citations if you want them recorded as sources.',
    '8. **Basketball workouts have no external source** (built from the app\'s own drills). Say whether that is acceptable or whether you want USA Basketball material consulted before publication.',
    '9. **`BOX_OUT_DRILL`** is a new Basketball Exercise (the catalog had no box-out / rebounding-position drill); it is `SYNTHESIZED`, with no external source.',
    '10. **Equipment**: the Paddle Endurance workout uses a ski erg and battle ropes (with a rowing-machine / battle-rope alternative in the coach note).',
    '11. **Surf Technique vs Surf Strength & Fitness** are shown as separate groups in the Professional workouts list; the Football 001 workouts are tagged "All-round progression".',
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
  ];
  return out.join('\n');
}
