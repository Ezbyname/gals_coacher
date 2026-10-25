import { builtinExercise } from '../../exercise/catalog';

import { WORKOUT_TEMPLATE_DRAFTS } from './templates';
import { TEMPLATE_PROVENANCE } from './templateProvenance';
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
    'Status: **DRAFT — nothing is published.** Every template is `PENDING_HUMAN_REVIEW`; the library lists only PUBLISHED workouts, so none of these is visible to users. Approve, edit or reject each one below.',
    '',
    'Evidence: no external source was opened for this feature (the ACSM 2009 page could not be read), so **no decision is marked SOURCE_SUPPORTED**. Every dosage is `ORIGINAL_RECOMMENDATION`; the general principle is `UNVERIFIED` until a human re-opens the source. No medical or injury-prevention claim is made.',
    '',
    'Upper Volume / Lower Volume are deliberately deferred.',
    '',
  ];
  for (const w of WORKOUT_TEMPLATE_DRAFTS) {
    out.push(`## ${w.id} — ${w.name[1]} / ${w.name[0]}`, '');
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
  return out.join('\n');
}
