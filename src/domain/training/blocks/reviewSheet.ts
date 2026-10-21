import { builtinExercise } from '../../exercise/catalog';
import { ATHLETIC } from '../../exercise/catalog/athletic';
import type { SourceKey } from '../../exercise/catalog/provenance';
import type { ExerciseDefinition } from '../../exercise/exercise';
import { resolveTimeSemantics, type TimeSemantics } from '../../exercise/timeSemantics';
import { defaultPrescription } from '../training';
import { GENERAL_ATHLETIC_WORKOUTS } from '../professional';
import { dosage, exerciseBlock, sourceLine } from '../professional/reviewSheet';
import type { Dosage, ProfessionalWorkout, WorkoutAdjustment } from '../professional/types';

import { TRAINING_BLOCKS } from './registry';
import { orderedSessions, planName } from './schedule';
import { totalSessions, type TrainingBlock } from './types';

/**
 * The bilingual CONTENT-REVIEW-SHEET for TRAINING-BLOCKS-001 (6 Exercises, 13 workouts, 6 Training Blocks), rendered from the very
 * same code the app ships, so it can never drift from the content. Every item is `PENDING_HUMAN_REVIEW`; nothing is published as
 * approved until a human approves this sheet.
 */

const ex = (id: string): ExerciseDefinition => builtinExercise(id)!;
const d = (id: string, dose: Dosage | undefined, semantics?: TimeSemantics): string => {
  const e = ex(id);
  const text = dosage(e, dose ? { sets: dose.sets, target: dose.target, restSec: dose.restSec } : defaultPrescription(e.measurement, e.defaults));
  const meaning = resolveTimeSemantics(e.measurement.type, semantics);
  // the MEANING of a TIME value is stored with the prescription: a cap is only a recording reference, a duration is work time
  if (e.measurement.type === 'TIME' && meaning === 'COMPLETION_TIME_CAP') {
    return text.replace(/ × (\d+)s/, ' × $1s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_');
  }
  if (e.measurement.type === 'TIME' && meaning === 'DURATION_TARGET') return text.replace(/ × (\d+)s/, ' × $1s _(DURATION_TARGET — work for this long)_');
  return text;
};

/** What the sources do and do not support for each general workout, and what is Gals Coacher's own. */
const WORKOUT_EVIDENCE: Readonly<Record<string, { supports: string; synthesis: string }>> = {
  'ATH-MOVEMENT-FOUNDATION-01': {
    supports: 'Movement competency before intensity, and building basic movement skill first (LTAD-1, opened). No source gives these exercises or dosages.',
    synthesis: 'The choice of the basic patterns, their order and every set / repetition / rest.',
  },
  'ATH-STRENGTH-FULLBODY-A-01': {
    supports: 'Competency before intensity (LTAD-1, opened). Two to three sessions a week for novices and an 8–12 RM range come from ADULT guidance (ACSM-2009, abstract only).',
    synthesis: 'The pattern split between A and B, the exercise choice and every dosage. Youth strength progression is our synthesis.',
  },
  'ATH-STRENGTH-FULLBODY-B-01': {
    supports: 'As Strength A: competency before intensity (LTAD-1, opened); adult novice frequency (ACSM-2009, abstract only).',
    synthesis: 'The complementary pattern split (single leg, hinge, vertical press, anti-rotation) and every dosage.',
  },
  'ATH-JUMP-LANDING-01': {
    supports: 'Competency before intensity (LTAD-1, opened). Instruction and feedback improved landing mechanics in ADULT athletes (LANDING-ADULTS, opened). The adolescent plyometric review found more jumps were not consistently better and made NO landing recommendation (PLYO-ADOLESCENT, opened).',
    synthesis: 'Teaching the landing as its own first step before any jump, the step-off wording, and the low number of contacts. Landing-before-plyometrics is our professional synthesis, not a sourced progression.',
  },
  'ATH-EXPLOSIVE-LOWER-01': {
    supports: 'Moderate jump volume: more total jumps were not consistently better (PLYO-ADOLESCENT, opened). Nothing sourced about box-jump height, kettlebell swings or hip thrusts.',
    synthesis: 'The selection, the landing primer, the long rests, and every dosage.',
  },
  'ATH-ROTATIONAL-POWER-01': {
    supports: 'Competency before intensity (LTAD-1, opened). No source gives medicine-ball throw dosages.',
    synthesis: 'The throw selection, the anti-rotation pairing and every dosage.',
  },
  'ATH-ACCELERATION-01': {
    supports: 'No opened source gives rest times for single maximal acceleration sprints; the rests here are our judgement.',
    synthesis: 'The acceleration mechanics, the 10–20 m distances, the long rests and the time CAPS (the athlete records the real time).',
  },
  'ATH-SPEED-01': {
    supports: 'No opened source gives flying-sprint distance or rest.',
    synthesis: 'The build-up, the 30 m flying runs, the 3-minute rests and the time caps.',
  },
  'ATH-DECEL-COD-01': {
    supports: 'Nothing is claimed from a source: the deceleration-training paper could not be opened (DECEL-2022, not opened).',
    synthesis: 'Controlled stopping first, then pre-planned change of direction (T-drill and 5-10-5), and every dosage and time cap.',
  },
  'ATH-REACTIVE-AGILITY-01': {
    supports: 'Only what the abstract states (AGILITY-2016, abstract only): agility involves reacting to a stimulus, and a human stimulus is a valid one.',
    synthesis: 'The cue-based starts, the partner mirror drill, the box size, the work times and every dosage.',
  },
  'ATH-CONDITIONING-BASE-01': {
    supports: 'Running-based interval work in youth is reviewed (HIIT-YOUTH, opened); that review does not cover easy continuous running.',
    synthesis: 'One continuous easy run as the aerobic base, its duration (progressed in the block) and the "bike or rower" swap, which has no dedicated exercise in the catalog.',
  },
  'ATH-CONDITIONING-INTERVALS-01': {
    supports: 'A review of running-based HIIT in children and adolescents (HIIT-YOUTH, opened) suggests 2–3 sessions a week for about 7 weeks or more; it says bout duration and rest are still ambiguous and reports no safety data.',
    synthesis: 'The 6 × 45 s / 90 s default and EVERY alternative prescription (bike, ski erg, rower, jump rope): each is ours, set separately, and none is validated.',
  },
  'ATH-REPEATED-EFFORT-01': {
    supports: 'Repeated-sprint training is sprints of up to 10 s with up to 60 s recovery; two to three sets a session is generally recommended; distances from 10 to 40 m; about 2 minutes between sets is an example (RST-NSCA, full text). Repeated-sprint training suggests including single-sprint training and some high-intensity interval training (RSA-2011, abstract only). Neither is a youth study.',
    synthesis: 'Three rounds of 6 × 20 m with about 25 s between repetitions, the rest between rounds, and the sled / battle-rope / shuttle alternatives, each with its own prescription.',
  },
};

/** A readable one-line description of a block session's adjustment. */
export function describeAdjust(adjust: WorkoutAdjustment | undefined): string {
  if (adjust === undefined) return 'as written';
  const parts: string[] = [];
  if (adjust.sets) parts.push(`sets: ${Object.entries(adjust.sets).map(([id, n]) => `${id} ${n}`).join(', ')}`);
  if (adjust.target) parts.push(`target: ${Object.entries(adjust.target).map(([id, n]) => `${id} ${n}`).join(', ')}`);
  if (adjust.omitExercises) parts.push(`without: ${adjust.omitExercises.join(', ')}`);
  if (adjust.omitSections) parts.push(`without section(s): ${adjust.omitSections.map((i) => i + 1).join(', ')}`);
  return parts.join('; ');
}

function workoutBlock(w: ProfessionalWorkout): string {
  const ev = WORKOUT_EVIDENCE[w.id]!;
  const lines: string[] = [
    `### ${w.id} — ${w.name[1]} / ${w.name[0]}`,
    '',
    '| | |',
    '|---|---|',
    '| **Slice** | TRAINING-BLOCKS-001 (new) |',
    '| **Domain** | `GENERAL_ATHLETIC` (no sport) |',
    `| **Difficulty** | ${w.difficulty} (content progression, not a readiness assessment) |`,
    `| **Focus** | ${w.focus} |`,
    `| **Length** | about ${w.minutes[0]}–${w.minutes[1]} minutes |`,
    `| **Review status** | \`${w.reviewStatus}\` |`,
    '| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |',
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
      const e = ex(item.exerciseId);
      lines.push(`| ${i + 1} | ${e.id} | ${e.name.en} | ${e.name.he} | ${d(item.exerciseId, item.dosage, item.timeSemantics)}${item.dosage ? '' : " _(the Exercise's own default — existing catalog content)_"} |`);
      for (const a of item.alternatives ?? []) {
        const ae = ex(a.exerciseId);
        lines.push(`| ↳ | alternative: ${ae.id} | ${ae.name.en} | ${ae.name.he} | ${d(a.exerciseId, a.dosage, a.timeSemantics)} _(its own prescription)_ |`);
      }
    }
    lines.push('');
  }
  lines.push('**Coach notes (shown on the workout screen, NOT copied into a plan):**', '');
  for (const note of w.coachNotes) lines.push(`- HE: ${note[0]}`, `- EN: ${note[1]}`);
  lines.push('', `**Safety — HE:** ${w.safety ? w.safety[0] : '— (none)'}`, '', `**Safety — EN:** ${w.safety ? w.safety[1] : '— (none)'}`, '');
  lines.push('**Sources:**', w.sources.length === 0 ? '- No external source was consulted for this workout.' : w.sources.map(sourceLine).join('\n'), '');
  lines.push(`**Exactly what the sources support:** ${ev.supports}`, '', `**What is Gals Coacher synthesis:** ${ev.synthesis}`, '', '**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.', '');
  return lines.join('\n');
}

function blockSection(b: TrainingBlock): string {
  const sessions = orderedSessions(b);
  const cell = (week: number, slot: number) => {
    const s = sessions.find((x) => x.week === week && x.slot === slot)!;
    return `${s.workoutId}${s.adjust ? ` — ${describeAdjust(s.adjust)}` : ''}${s.note ? ` — _${s.note[1]}_` : ''}`;
  };
  const lines: string[] = [
    `### ${b.id} — ${b.name[1]} / ${b.name[0]}`,
    '',
    '| | |',
    '|---|---|',
    `| **Difficulty** | ${b.difficulty} (content progression — not an age or a readiness assessment) |`,
    `| **Duration** | ${b.weeks} weeks · ${b.sessionsPerWeek} sessions a week · ${totalSessions(b)} sessions |`,
    `| **Review status** | \`${b.reviewStatus}\` |`,
    '',
    `**Summary — HE:** ${b.summary[0]}`,
    '',
    `**Summary — EN:** ${b.summary[1]}`,
    '',
    `**Goal — HE / EN:** ${b.goal[0]} / ${b.goal[1]}`,
    '',
    `**Who it is for — HE / EN:** ${b.athlete[0]} / ${b.athlete[1]}`,
    '',
    `**Prerequisites — HE / EN:** ${b.prerequisite[0]} / ${b.prerequisite[1]}`,
    '',
    `**Equipment — HE / EN:** ${b.equipment[0]} / ${b.equipment[1]}`,
    '',
    '**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):',
    '',
    '| Week | Session 1 | Session 2 |',
    '|---|---|---|',
    ...Array.from({ length: b.weeks }, (_, i) => `| ${i + 1} | ${cell(i + 1, 1)} | ${cell(i + 1, 2)} |`),
    '',
    '**Plan names created (EN / HE):**',
    '',
    ...sessions.map((s) => `- ${planName(b, s, 'en')} / ${planName(b, s, 'he')}`),
    '',
    '**Progression:**',
    ...b.progression.flatMap((p) => [`- HE: ${p[0]}`, `- EN: ${p[1]}`]),
    '',
    `**Recovery — HE:** ${b.recovery[0]}`,
    '',
    `**Recovery — EN:** ${b.recovery[1]}`,
    '',
    '**Substitutions:**',
    ...b.substitutions.flatMap((p) => [`- HE: ${p[0]}`, `- EN: ${p[1]}`]),
    '',
    `**Safety — HE:** ${b.safety[0]}`,
    '',
    `**Safety — EN:** ${b.safety[1]}`,
    '',
    '**Programming decisions and their evidence class:**',
    '',
    '| Decision (EN) | Evidence class | Sources |',
    '|---|---|---|',
    ...b.decisions.map((x) => `| ${x.decision[1]} | \`${x.evidence}\` | ${x.sources.length === 0 ? '—' : x.sources.join(', ')} |`),
    '',
    '**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.',
    '',
  ];
  return lines.join('\n');
}

/** Every prescription of the new content that explicitly opts into the cap: "workout: exercise". */
const CAP_PRESCRIPTIONS: readonly string[] = GENERAL_ATHLETIC_WORKOUTS.flatMap((w) =>
  w.sections.flatMap((s) =>
    s.items.flatMap((i) => [
      ...(i.timeSemantics === 'COMPLETION_TIME_CAP' ? [`${w.id}: ${i.exerciseId}`] : []),
      ...(i.alternatives ?? []).filter((a) => a.timeSemantics === 'COMPLETION_TIME_CAP').map((a) => `${w.id}: ${a.exerciseId} (alternative)`),
    ]),
  ),
).filter((value, index, all) => all.indexOf(value) === index);

const USED_SOURCES: readonly SourceKey[] = ['LTAD-1', 'RST-NSCA', 'PLYO-ADOLESCENT', 'HIIT-YOUTH', 'LANDING-ADULTS', 'ACSM-2009', 'AGILITY-2016', 'RSA-2011', 'NSCA-YOUTH-2009', 'YOUTH-RT-2014', 'DECEL-2022'];

export function renderTrainingBlocksReviewSheet(): string {
  const out: string[] = [
    '# CONTENT-REVIEW-SHEET — TRAINING-BLOCKS-001 (6 Exercises + 13 workouts + 6 Training Blocks)',
    '',
    'Status of every item below: **PENDING_HUMAN_REVIEW**. Nothing is published as approved until a human approves this sheet.',
    '',
    `Contents: **${ATHLETIC.length} new built-in Exercises** (schema v21, data only), **${GENERAL_ATHLETIC_WORKOUTS.length} general-athletic Professional Workouts** (no sport) and **${TRAINING_BLOCKS.length} Training Blocks** (5 × 6 weeks, Explosive Power 8 weeks).`,
    '',
    '- A Training Block is an ordered multi-week programme made of Professional Workouts. Adding it to a Player creates one independent PlannedWorkout COPY per session (and, if the user chooses dates, one CalendarEvent per plan), all-or-nothing per Player. Nothing of the block is stored on the Player: there is no "Week 3 of 6" and no duplicate detection yet.',
    '- Everything here is **Gals Coacher\'s own programming, informed by public sources**. Every dosage, the weekly arrangement and the progression are `ORIGINAL_RECOMMENDATION`.',
    '- Evidence classes: `SOURCE_SUPPORTED` (an opened source states exactly the claim — abstract-only sources support only what the abstract says), `SYNTHESIZED` (our coaching synthesis), `ORIGINAL_RECOMMENDATION` (our own recommendation), `UNVERIFIED`.',
    '- The programmes make no injury-prevention or medical claim. Difficulty is content progression, never an age or a readiness assessment; a coach or responsible adult adjusts the intensity.',
    '- Landing-before-plyometrics, deceleration-before-sharp-change-of-direction, pre-planned-before-reactive, youth strength progression and single-sprint recovery are **SYNTHESIZED**: no source I could open states them.',
    '',
    '## Source verification (what was actually opened)',
    '',
    ...USED_SOURCES.map(sourceLine),
    '',
    '_Read status: **opened** = the full text was read; **abstract only** = only the abstract, so it supports only a claim written in it; **not opened** = access was blocked and NO claim relies on it._',
    '',
    '**Corrections to the Phase 1 report:** a landing-progression source and a deceleration-training source could not be found or opened; the landing evidence that was opened is adult-only; the adolescent plyometric review makes no landing recommendation and links 8 to under 10 weeks with more consistent (exploratory) gains; the youth running-HIIT review leaves bout length and rest open and reports no safety data.',
    '',
    '## Resolved human-review decisions (review round 1: CHANGES REQUIRED — SMALL CONTENT PATCH, applied)',
    '',
    '**Decisions recorded as RESOLVED / APPROVED:**',
    '',
    '- Explosive Power = 8 weeks / 16 sessions — APPROVED.',
    '- Conditioning = 6 weeks / 12 sessions — APPROVED (our own recommendation; no source claims it is the optimal length).',
    '- No age-specific blocks in V1 — APPROVED.',
    '- Reactive agility requires a partner or coach; without one the session falls back to pre-planned work — APPROVED.',
    '- Aerobic Base defaults to running; bike / rower remain edit-time options with no new dedicated exercise — APPROVED.',
    '- Sprint and agility time values are recording CAPS, not goals — APPROVED, subject to the user-facing wording below.',
    '',
    '**Corrections applied in this version:**',
    '',
    '- Warm-up fatigue: the warm-up bodyweight squat is now 2 × 8 (was the default 3 × 15) in Strength B, Jump & Landing and Explosive Lower Body; in Strength A the warm-up glute bridge is 1 × 10 (the main 3 × 12 is unchanged, so there is no 6-set duplication).',
    '- Movement Foundation: the Hebrew now says "גשר עכוז / יישור ירך", matching the glute bridge that is actually in the workout (no hip-hinge drill was added).',
    '- The improvised "heavy basketball or football against a wall" substitute was removed: with no appropriate medicine ball, skip the throwing section or use another approved power exercise or workout.',
    '- Time semantics (final content review, history-safe): what a seconds value MEANS belongs to the PRESCRIPTION and is stored with the copied plan item and with the session exercise (schema v22, `time_semantics`, NULL = legacy). `DURATION_TARGET` = work for this long; `PERFORMANCE_GOAL_TIME` = a goal time (what a stored TIME value meant before, so legacy TIME rows keep reading "Goal time"); `COMPLETION_TIME_CAP` = a fixed course or distance whose actual time is recorded, shown as "Time cap (seconds) — record your actual time" with the hint "Record your actual time. The value shown is only a recording cap, not a performance goal." A cap is NOT a pass / fail line: a real result above it is recorded as it is. Nothing is inferred from the exercise id, so the same exercise can be a goal time in an old plan and a cap in a block. The prescriptions below opt in explicitly: ' + CAP_PRESCRIPTIONS.join('; ') + '. Shuttle run and sled push alternatives are prescribed as work durations (DURATION_TARGET), the 500 m row as a completion-time cap.',
    '- Hebrew: the awkward supervision sentence is replaced everywhere by "למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית."; "באותה משך" → "באותו משך"; names: ירידה ונחיתה מבוקרת, תרגיל מראה בזוגות, אינטרוולים בריצה.',
    '',
    '**Still for the final human review:** native-speaker Hebrew review of the remaining text; then publication approval.',
    '',
    `## A. New Exercises (${ATHLETIC.length}, schema v21)`,
    '',
    ...ATHLETIC.map((e) => exerciseBlock(e, 'TRAINING-BLOCKS-001')),
    `## B. General-athletic Professional Workouts (${GENERAL_ATHLETIC_WORKOUTS.length})`,
    '',
    ...GENERAL_ATHLETIC_WORKOUTS.map(workoutBlock),
    `## C. Training Blocks (${TRAINING_BLOCKS.length})`,
    '',
    ...TRAINING_BLOCKS.map(blockSection),
    '## D. Reuse matrix (which block uses which workout)',
    '',
    `| Workout | ${TRAINING_BLOCKS.map((b) => b.shortName[1]).join(' | ')} |`,
    `|---|${TRAINING_BLOCKS.map(() => '---').join('|')}|`,
    ...GENERAL_ATHLETIC_WORKOUTS.map((w) => `| ${w.id} | ${TRAINING_BLOCKS.map((b) => b.schedule.filter((s) => s.workoutId === w.id).length || '').join(' | ')} |`),
    '',
    '_A number is how many sessions of that block use the workout; the same workout is never duplicated for another block._',
    '',
  ];
  return out.join('\n');
}
