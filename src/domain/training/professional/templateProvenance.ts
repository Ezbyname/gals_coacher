import type { EvidenceClass, SourceKey } from '../../exercise/catalog/provenance';

import type { Pair } from './types';

/**
 * WORKOUT-TEMPLATES-001 (S1) — what each decision of the new draft templates rests on, per element, never one label for a whole
 * template. No external source was opened FOR THIS FEATURE: the PubMed page of ACSM 2009 (progression models in resistance
 * training for healthy adults, already listed in the registry) could not be read in this session, so NOTHING below is marked
 * SOURCE_SUPPORTED. Exact sets, repetitions, rest, load guidance and weekly arrangement are Gals Coacher's own recommendation;
 * the general principle is UNVERIFIED until a human re-opens the source. Feeds the review sheet; never shown as a status.
 */
export interface TemplateDecision {
  readonly decision: Pair;
  readonly evidence: EvidenceClass;
  readonly sources: readonly SourceKey[];
}

const STRUCTURE: TemplateDecision = {
  decision: ['מבנה: חימום, אימון מרכזי ושחרור.', 'Structure: warm-up, main workout and cool-down.'],
  evidence: 'SYNTHESIZED',
  sources: [],
};
const DOSAGE: TemplateDecision = {
  decision: ['סטים, חזרות ומנוחה של כל תרגיל.', 'Sets, repetitions and rest of every exercise.'],
  evidence: 'ORIGINAL_RECOMMENDATION',
  sources: [],
};
const SELECTION: TemplateDecision = {
  decision: ['בחירת התרגילים וסדרם (מתוך הקטלוג הקיים).', 'The choice and order of exercises (from the existing catalog).'],
  evidence: 'ORIGINAL_RECOMMENDATION',
  sources: [],
};
const PRINCIPLE: TemplateDecision = {
  decision: [
    'עקרון כללי: אימון התנגדות הדרגתי לבוגרים בריאים. הדף לא נפתח — לא מסומן כנתמך במקור.',
    'General principle: progressive resistance training for healthy adults. The source page was not opened — not marked source-supported.',
  ],
  evidence: 'UNVERIFIED',
  sources: ['ACSM-2009'],
};
const WARMUP: TemplateDecision = {
  decision: [
    'החימום: עלייה כללית ואז הכנה לתנועות של האימון. אין טענה למניעת פציעות.',
    'The warm-up: a general rise, then preparation for the movements of the workout. No injury-prevention claim.',
  ],
  evidence: 'SYNTHESIZED',
  sources: [],
};
const COOLDOWN: TemplateDecision = {
  decision: [
    'השחרור: תנועה קלה, נשימה ומתיחה עדינה. אין טענה להתאוששות מובטחת או למניעת פציעות.',
    'The cool-down: easy movement, breathing and gentle stretching. No claim of guaranteed recovery or injury prevention.',
  ],
  evidence: 'SYNTHESIZED',
  sources: [],
};
const BARBELL: TemplateDecision = {
  decision: [
    'תרגילי מוט כבדים מיועדים לבעלי ניסיון או להשגחת מאמן — דורש אישור תוכן אנושי מפורש לפני פרסום.',
    'Heavy barbell lifts are written for experienced lifters or coached training — needs explicit human content review before publication.',
  ],
  evidence: 'ORIGINAL_RECOMMENDATION',
  sources: [],
};

const common = [STRUCTURE, SELECTION, DOSAGE, WARMUP, COOLDOWN, PRINCIPLE] as const;

/**
 * The explicit, OWNER-APPROVED review transitions of the new templates (nothing is published without one). 2026-10-26: after the content
 * review the owner approved four templates with revisions, which were made; each went PENDING_HUMAN_REVIEW -> HUMAN_REVIEWED -> PUBLISHED.
 * Approval does not change the evidence classes: selection / order and sets / reps / rest stay ORIGINAL_RECOMMENDATION, the
 * Warm-up / Main / Cool-down structure stays SYNTHESIZED, and nothing is SOURCE_SUPPORTED.
 */
export interface ReviewTransition {
  readonly from: 'PENDING_HUMAN_REVIEW' | 'HUMAN_REVIEWED';
  readonly to: 'HUMAN_REVIEWED' | 'PUBLISHED';
  readonly approvedBy: 'OWNER';
  readonly on: string;
  readonly note: string;
}
const OWNER_APPROVED = (note: string): readonly ReviewTransition[] => [
  { from: 'PENDING_HUMAN_REVIEW', to: 'HUMAN_REVIEWED', approvedBy: 'OWNER', on: '2026-10-26', note },
  { from: 'HUMAN_REVIEWED', to: 'PUBLISHED', approvedBy: 'OWNER', on: '2026-10-26', note: 'Published after the approved revisions and the focused tests.' },
];
export const TEMPLATE_REVIEW_LOG: Readonly<Record<string, readonly ReviewTransition[]>> = {
  'GYM-BEG-FULLBODY-A': OWNER_APPROVED('Approved with revisions: Romanian deadlift replaced by reverse lunge; warm-up squat 1 x 10, glute bridge removed from the warm-up, band pull-apart added.'),
  'GYM-BEG-FULLBODY-B': OWNER_APPROVED('Approved with revision: glute bridge removed from the warm-up (kept in Main).'),
  'CORE-FOUNDATION-01': OWNER_APPROVED('Approved with revision: warm-up glute bridge 1 x 10.'),
  'MOBILITY-FULLBODY-01': OWNER_APPROVED('Approved with revisions: renamed Lower Body & Spine Mobility; jumping jacks removed from the warm-up.'),
};

export const TEMPLATE_PROVENANCE: Readonly<Record<string, readonly TemplateDecision[]>> = {
  'GYM-BEG-FULLBODY-A': common,
  'GYM-BEG-FULLBODY-B': common,
  'GYM-INT-UPPER-A': [...common, BARBELL],
  'GYM-INT-LOWER-A': [...common, BARBELL],
  'GYM-INT-UPPER-B': common,
  'GYM-INT-LOWER-B': [...common, BARBELL],
  'GYM-ADV-PUSH': [...common, BARBELL],
  'GYM-ADV-PULL': common,
  'GYM-ADV-LEGS': [...common, BARBELL],
  'CORE-FOUNDATION-01': [STRUCTURE, SELECTION, DOSAGE, WARMUP, COOLDOWN],
  'MOBILITY-FULLBODY-01': [STRUCTURE, SELECTION, DOSAGE, WARMUP, COOLDOWN],
  'RECOVERY-EASY-01': [STRUCTURE, SELECTION, DOSAGE, WARMUP, COOLDOWN],
};
