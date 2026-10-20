import type { SourceKey } from '../../exercise/catalog/provenance';
import type { Difficulty } from '../../exercise/taxonomy';
import type { SportKey } from '../../sport';

/**
 * SPORT-CONTENT-001 / 002 — the shape of a professional workout (read-only managed content, in code: no table, no row,
 * no user data). See ./index.ts for the content.
 */
export type Pair = readonly [he: string, en: string];

/** One exercise of a section. Without a dosage the exercise's own defaults apply (reused warm-up / mobility items). */
export interface ProfessionalItem {
  readonly exerciseId: string;
  readonly dosage?: { readonly sets: number; readonly target: number | null; readonly restSec: number };
}

export interface ProfessionalSection {
  readonly name: Pair;
  readonly items: readonly ProfessionalItem[];
}

export type ReviewStatus = 'PENDING_HUMAN_REVIEW' | 'HUMAN_REVIEWED' | 'PUBLISHED';

/**
 * What a workout is FOR (SPORT-CONTENT-002): lightweight registry metadata used to group and filter the library — never a
 * database column. ALL_ROUND = the general Beginner / Intermediate / Advanced progression of a sport.
 */
export const TRAINING_FOCUSES = [
  'ALL_ROUND',
  'SURF_TECHNIQUE',
  'SURF_STRENGTH_FITNESS',
  'BALL_HANDLING',
  'SHOOTING',
  'FINISHING',
  'PASSING',
  'DEFENSE',
  'TRANSITION',
  'FUNDAMENTALS',
] as const;
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];

export type ProfessionalSport = Extract<SportKey, 'FOOTBALL' | 'SURFING' | 'BASKETBALL'>;
export const PROFESSIONAL_SPORTS: readonly ProfessionalSport[] = ['SURFING', 'FOOTBALL', 'BASKETBALL'];

export interface ProfessionalWorkout {
  readonly id: string;
  readonly sport: ProfessionalSport;
  readonly difficulty: Difficulty;
  readonly focus: TrainingFocus;
  readonly name: Pair;
  readonly summary: Pair;
  /** Approximate session length in minutes [min, max]. */
  readonly minutes: readonly [number, number];
  readonly sections: readonly ProfessionalSection[];
  /** For the coach; shown on the workout screen, never copied into a plan. */
  readonly coachNotes: readonly Pair[];
  /** The locked ocean wording (surf technique), or ordinary strength-training wording (dry-land); null when none. */
  readonly safety: Pair | null;
  /** Sources consulted; empty = no external source was consulted (the content is built from the app's own curated catalog). */
  readonly sources: readonly SourceKey[];
  readonly reviewStatus: ReviewStatus;
}

export const x = (exerciseId: string, sets: number, target: number | null, restSec: number): ProfessionalItem => ({
  exerciseId,
  dosage: { sets, target, restSec },
});
export const reuse = (...ids: string[]): ProfessionalItem[] => ids.map((exerciseId) => ({ exerciseId }));

/** Ordinary strength-training wording for the dry-land workouts (the ocean wording belongs to ocean sessions). */
export const STRENGTH_SAFETY: Pair = [
  'מתאימים את המשקל ואת העצימות ליכולת, שומרים על טכניקה נקייה, מתחממים לפני ועוצרים אם יש כאב. תוכן מתקדם עשוי לדרוש התאמה על ידי מאמן או מבוגר אחראי לפי גיל, ניסיון ויכולת גופנית.',
  'Match the load and intensity to the person, keep the technique clean, warm up first and stop if there is pain. Advanced content may require adjustment by a coach or responsible adult based on age, experience and physical ability.',
];

/**
 * A CANDIDATE reference video (SPORT-CONTENT-003). It lives only in the content-review / provenance notes — it is never shown in
 * the production Professional Workout UI and never creates an Exercise. `about` is only what the video's own title / YouTube
 * description states. Promotion to a user-facing reference needs a human to watch and approve it.
 */
export const VIDEO_STATUS = 'CANDIDATE_REFERENCE_NOT_HUMAN_VERIFIED' as const;
export interface CandidateVideo {
  readonly title: string;
  readonly author: string;
  readonly url: string;
  readonly about: Pair;
  readonly status: typeof VIDEO_STATUS;
  /** Which workouts it is a candidate reference for. */
  readonly candidateFor: readonly string[];
}
