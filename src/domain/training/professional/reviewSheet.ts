import { FOOTBALL } from '../../exercise/catalog/football';
import { PROVENANCE, SOURCES, type SourceKey } from '../../exercise/catalog/provenance';
import { SURFING } from '../../exercise/catalog/surfing';
import { builtinExercise } from '../../exercise/catalog';
import type { ExerciseDefinition } from '../../exercise/exercise';
import { defaultPrescription } from '../training';
import { PROFESSIONAL_WORKOUTS, type ProfessionalWorkout } from '.';

/**
 * SPORT-CONTENT-001 — the bilingual CONTENT-REVIEW-SHEET for human approval, rendered from the very same code the app
 * ships (so the sheet can never drift from the content). Nothing here is shown to users; publishing / building an APK
 * waits for a human to approve this sheet (every item is `PENDING_HUMAN_REVIEW`).
 */
const measurementText = (e: ExerciseDefinition): string => {
  const t = e.measurement.type;
  return t === 'REPETITIONS' ? 'repetitions' : t === 'DURATION' ? 'duration (seconds)' : t === 'MADE_ATTEMPTS' ? 'makes / attempts' : t.toLowerCase();
};
const unit = (e: ExerciseDefinition): string =>
  e.measurement.type === 'DURATION' ? 's' : e.measurement.type === 'MADE_ATTEMPTS' ? ' attempts' : e.measurement.type === 'REPETITIONS' ? ' reps' : '';
const dosage = (e: ExerciseDefinition, d: { sets: number; target: number | null; restSec: number | null } | null): string =>
  d === null ? '—' : `${d.sets} × ${d.target === null ? '(no target)' : `${d.target}${unit(e)}`}, rest ${d.restSec ?? 0} s`;
const equipmentText = (e: ExerciseDefinition): string =>
  e.equipment.length === 0 ? 'none (bodyweight)' : e.equipment.map((o) => o.join(' + ')).join(' OR ');
const sourceLine = (key: SourceKey): string => `- ${SOURCES[key].name} — ${SOURCES[key].url} _(${SOURCES[key].read})_`;
const bullets = (items: readonly (readonly [string, string])[], lang: 0 | 1): string =>
  items.map((p) => `  - ${p[lang]}`).join('\n') || '  - —';

function exerciseBlock(e: ExerciseDefinition): string {
  const p = PROVENANCE[e.id]!;
  const d = e.defaults;
  return [
    `### ${e.id}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **HE name** | ${e.name.he} |`,
    `| **EN name** | ${e.name.en} |`,
    `| **Sport** | ${e.sports.join(', ')} |`,
    `| **Difficulty** | ${e.difficulty} (content progression, not a readiness assessment) |`,
    `| **Measurement** | ${measurementText(e)} |`,
    `| **Dosage (ORIGINAL_RECOMMENDATION)** | ${dosage(e, d)} |`,
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
    p.sources.map(sourceLine).join('\n'),
    '',
    `**Exactly what the source supports:** ${p.supports}`,
    '',
    `**What is Gals Coacher synthesis:** ${p.synthesis}`,
    '',
    `**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.`,
    '',
  ].join('\n');
}

function workoutBlock(w: ProfessionalWorkout): string {
  const lines: string[] = [
    `### ${w.id} — ${w.name[1]} / ${w.name[0]}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Sport** | ${w.sport} |`,
    `| **Difficulty** | ${w.difficulty} |`,
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
      lines.push(`| ${i + 1} | ${e.id} | ${e.name.en} | ${e.name.he} | ${dosage(e, d)}${fromDefaults ? ' _(the Exercise\'s own default — existing catalog content)_' : ''} |`);
    }
    lines.push('');
  }
  lines.push(`**Coach notes (shown on the workout screen, NOT copied into a plan):**`, '');
  for (const note of w.coachNotes) lines.push(`- HE: ${note[0]}`, `- EN: ${note[1]}`);
  lines.push('', `**Safety — HE:** ${w.safety ? w.safety[0] : '— (none; a football workout)'}`, '', `**Safety — EN:** ${w.safety ? w.safety[1] : '— (none; a football workout)'}`, '');
  lines.push(`**Sources:**`, w.sources.map(sourceLine).join('\n'), '');
  return lines.join('\n');
}

export function renderContentReviewSheet(): string {
  const out: string[] = [
    '# CONTENT-REVIEW-SHEET — SPORT-CONTENT-001 (Surfing + Football starter catalog)',
    '',
    'Status of every item below: **PENDING_HUMAN_REVIEW**. Nothing is published and no APK is built until a human approves this sheet.',
    '',
    '- Everything here is **Gals Coacher\'s own programming, informed by public sources**. It is not official FIFA, ISA or Surfing Australia programming.',
    '- **Every dosage (sets, targets, rest, durations, counts) is an `ORIGINAL_RECOMMENDATION`** — no source gives dosages for these drills.',
    '- Evidence classes: `SOURCE_SUPPORTED` (an opened source states the topic), `SYNTHESIZED` (our coaching synthesis), `ORIGINAL_RECOMMENDATION` (our own recommendation), `UNVERIFIED` (not stated by any opened source; kept as our synthesis pending verification).',
    '- Sources marked _listing only_ were seen only as a search-result summary and must be opened before anything that rests on them is published.',
    '- Difficulty is content progression metadata, never a medical or readiness assessment.',
    '- Surf safety wording (locked): no claim that ocean conditions are safe; conditions, currents, weather and level are judged by the surfer, coach or responsible adult. No breath-hold training.',
    '',
    '## Points that need a human decision',
    '',
    '1. **Surf safety wording** (HE and EN) — shown on every surf Exercise and surf workout.',
    '2. **Youth suitability of the advanced Football workout** (`FOOTBALL-PERFORMANCE-01`, 2v1 / 3v2 transition and finishing under pressure): FIFA gives the 3v2 drill with no age, and the counter-press rule comes from an elite youth session; the app tells the coach to adjust intensity and contact.',
    '3. **`SURF_TAKE_OFF`** is `UNVERIFIED` (no opened source states a whitewater take-off).',
    '4. **Bottom turn / top turn / cutback** are `SYNTHESIZED`: Surfing Australia lists them only as abilities expected of Progression-coach candidates, not as course content.',
    '5. **Hebrew names, instructions and cues** (all 21 Exercises and 6 workouts) need a native-speaker coach review.',
    '6. **Dosage** for every item (all `ORIGINAL_RECOMMENDATION`).',
    '',
    `## A. New Exercises (${SURFING.length + FOOTBALL.length}: Surfing ${SURFING.length}, Football ${FOOTBALL.length})`,
    '',
    '### A1. Surfing',
    '',
    ...SURFING.map(exerciseBlock),
    '### A2. Football',
    '',
    ...FOOTBALL.map(exerciseBlock),
    `## B. Professional workouts (${PROFESSIONAL_WORKOUTS.length})`,
    '',
    ...PROFESSIONAL_WORKOUTS.map(workoutBlock),
  ];
  return out.join('\n');
}
