import { builtinExercise } from '../../exercise/catalog';
import { PROGRAM_BLOCK_DRAFTS } from '../blocks/programBlocks';

import { WORKOUT_TEMPLATE_DRAFTS } from './templates';
import { TEMPLATE_PROVENANCE, TEMPLATE_REVIEW_LOG } from './templateProvenance';
import { categoryOf } from './templateMeta';
import { audienceOf, type ProfessionalItem } from './types';

/**
 * The CONTENT-REVIEW-SHEET of WORKOUT-TEMPLATES-001: the 12 draft Workout Templates rendered from the very code the app would ship,
 * so the sheet can never drift from the content. NOTHING here is published: every template is PENDING_HUMAN_REVIEW until the owner
 * approves it, and the heavy-barbell ones need explicit human content review.
 */
const dose = (item: ProfessionalItem): string => {
  const e = builtinExercise(item.exerciseId)!;
  const d = item.dosage ?? e.defaults;
  if (!d) return 'catalog default';
  const unit = e.measurement.type === 'DURATION' ? 's' : e.measurement.type === 'REPETITIONS' ? ' reps' : '';
  return `${d.sets} × ${d.target === null ? '—' : `${d.target}${unit}`}, rest ${d.restSec ?? 0}s${item.dosage ? '' : ' (catalog default)'}`;
};

export function renderTemplateReviewSheet(): string {
  const out: string[] = [
    '# CONTENT-REVIEW-SHEET — WORKOUT-TEMPLATES-001 (12 draft Workout Templates)',
    '',
    'Status: **four templates were PUBLISHED on explicit owner approval (2026-10-26, after the content review and its revisions): Full Body A, Full Body B, Core Foundation and Lower Body & Spine Mobility. The other eight remain `PENDING_HUMAN_REVIEW`** and are not visible to users (the library lists only PUBLISHED workouts). Everything below marked pending applies only to those eight.',
    '',
    'Evidence: no external source was opened for this feature (the ACSM 2009 page could not be read), so **no decision is marked SOURCE_SUPPORTED**. Every dosage is `ORIGINAL_RECOMMENDATION`; the general principle is `UNVERIFIED` until a human re-opens the source. No medical or injury-prevention claim is made.',
    '',
    'Upper Volume / Lower Volume are deliberately deferred.',
    '',
  ];
  for (const w of WORKOUT_TEMPLATE_DRAFTS) {
    out.push(`## ${w.id} — ${w.name[1]} / ${w.name[0]}`, '');
    for (const t of TEMPLATE_REVIEW_LOG[w.id] ?? []) out.push(`> Owner-approved review transition ${t.on}: ${t.from} → ${t.to} — ${t.note}`, '');
    out.push(`- Category: ${categoryOf(w)} · Level: ${w.difficulty} · Audience: ${audienceOf(w)} · About ${w.minutes[0]}–${w.minutes[1]} minutes · Review status: **${w.reviewStatus}**`);
    out.push(`- Summary EN: ${w.summary[1]}`, `- Summary HE: ${w.summary[0]}`, '');
    for (const s of w.sections) {
      out.push(`### ${s.role} — ${s.name[1]} / ${s.name[0]}`, '');
      out.push('| Exercise id | EN | HE | Dosage |', '|---|---|---|---|');
      for (const item of s.items) {
        const e = builtinExercise(item.exerciseId)!;
        out.push(`| ${item.exerciseId} | ${e.name.en} | ${e.name.he} | ${dose(item)} |`);
      }
      out.push('');
    }
    out.push('**Provenance (per decision):**', '');
    for (const d of TEMPLATE_PROVENANCE[w.id]!) out.push(`- \`${d.evidence}\` — ${d.decision[1]} / ${d.decision[0]}${d.sources.length ? ` (source: ${d.sources.join(', ')})` : ''}`);
    out.push('', `**Owner decision:** ☐ approve  ☐ edit  ☐ reject${audienceOf(w) === 'EXPERIENCED_OR_SUPERVISED' ? '  — heavy barbell: explicit content review required' : ''}`, '');
  }
  out.push('# Program Blocks (drafts) — the gym programmes built from the templates above', '');
  out.push('Status: **DRAFT — PENDING_HUMAN_REVIEW.** Not listed, not assignable. Progression, RIR and the lighter week are informational notes only; nothing changes a prescription automatically and no load is written. Nothing is source-supported.', '');
  for (const b of PROGRAM_BLOCK_DRAFTS) {
    out.push(`## ${b.id} — ${b.name[1]} / ${b.name[0]}`, '');
    out.push(`- ${b.weeks} weeks × ${b.sessionsPerWeek} sessions = ${b.schedule.length} planned workouts · Level: ${b.difficulty} · Consecutive training days allowed: **${b.allowAdjacentTrainingDays === true ? 'yes' : 'no'}** · Review status: **${b.reviewStatus}**`);
    out.push(`- Summary EN: ${b.summary[1]}`, `- Summary HE: ${b.summary[0]}`, '');
    out.push('| Week | Slot | Workout template | Note (informational) |', '|---|---|---|---|');
    for (const x of b.schedule) out.push(`| ${x.week} | ${x.slot} | ${x.workoutId} | ${x.note ? x.note[1] : ''} |`);
    out.push('', '**Owner decision:** ☐ approve  ☐ edit  ☐ reject', '');
  }
  return out.join('\n');
}
