import type { TimeSemantics } from '../../exercise/timeSemantics';
import type { SourceKey } from '../../exercise/catalog/provenance';
import type { Difficulty } from '../../exercise/taxonomy';
import type { SportKey } from '../../sport';

/**
 * SPORT-CONTENT-001 / 002 — the shape of a professional workout (read-only managed content, in code: no table, no row,
 * no user data). See ./index.ts for the content.
 */
export type Pair = readonly [he: string, en: string];

export interface Dosage {
  readonly sets: number;
  readonly target: number | null;
  readonly restSec: number;
}

/** One exercise of a section. Without a dosage the exercise's own defaults apply (reused warm-up / mobility items). */
export interface ProfessionalItem {
  readonly exerciseId: string;
  readonly dosage?: Dosage;
  /** What the seconds value of a TIME exercise means in THIS use (only an explicit COMPLETION_TIME_CAP opts into the cap). Absent = legacy Goal time. */
  readonly timeSemantics?: TimeSemantics;
  /**
   * TRAINING-BLOCKS-001: other Exercises that can replace this one when the equipment differs (e.g. a bike or a ski erg for
   * run intervals). Each substitution has its OWN dosage: a prescription for one modality is never assumed to suit another.
   * Shown for the coach; a plan is always copied with the item itself.
   */
  readonly alternatives?: readonly { readonly exerciseId: string; readonly dosage: Dosage; readonly timeSemantics?: TimeSemantics }[];
}

/**
 * WORKOUT-TEMPLATES-001: what a section IS FOR. Never inferred from a translated section name when the role exists. Every NEW
 * built-in Workout Template has exactly one WARM_UP, one MAIN and one COOL_DOWN section; sections of the already-PUBLISHED
 * workouts (grandfathered) have no role.
 */
export const SECTION_ROLES = ['WARM_UP', 'MAIN', 'COOL_DOWN', 'CUSTOM'] as const;
export type SectionRole = (typeof SECTION_ROLES)[number];
/** The three standard roles (a CUSTOM section is named by its author). */
export type StandardSectionRole = Exclude<SectionRole, 'CUSTOM'>;

export interface ProfessionalSection {
  readonly name: Pair;
  readonly items: readonly ProfessionalItem[];
  /** Absent on grandfathered workouts. */
  readonly role?: SectionRole;
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
  // WORKOUT-TEMPLATES-001: gym programmes and the core / mobility / recovery workouts
  'GYM_FULL_BODY',
  'GYM_UPPER_LOWER',
  'GYM_PUSH_PULL_LEGS',
  'CORE',
  'MOBILITY',
  'RECOVERY',
  // TRAINING-BLOCKS-001: general athletic development (no sport)
  'ATHLETIC_FOUNDATION',
  'STRENGTH_FOUNDATION',
  'EXPLOSIVE_POWER',
  'SPEED_ACCELERATION',
  'AGILITY_COD',
  'CONDITIONING',
] as const;
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];

export type ProfessionalSport = Extract<SportKey, 'FOOTBALL' | 'SURFING' | 'BASKETBALL'>;
export const PROFESSIONAL_SPORTS: readonly ProfessionalSport[] = ['SURFING', 'FOOTBALL', 'BASKETBALL'];

/**
 * Whether a workout belongs to a sport or to general athletic development (TRAINING-BLOCKS-001). Athleticism is NOT a sport:
 * a general workout has `sport: null` and never touches `SportKey`, `SPORTS`, `V1_ENABLED_SPORTS` or `CONTENT_SPORTS`.
 * Workouts without `trainingDomain` (every sport workout published earlier) are SPORT_SPECIFIC.
 */
export type TrainingDomain = 'SPORT_SPECIFIC' | 'GENERAL_ATHLETIC';

/**
 * WORKOUT-TEMPLATES-001: who a built-in template is written for. GENERAL = suitable without individual supervision;
 * EXPERIENCED_OR_SUPERVISED = loaded barbell work that assumes lifting experience or a coach. Not a medical or readiness claim.
 */
export const TEMPLATE_AUDIENCES = ['GENERAL', 'EXPERIENCED_OR_SUPERVISED'] as const;
export type TemplateAudience = (typeof TEMPLATE_AUDIENCES)[number];

interface ProfessionalWorkoutBase {
  readonly id: string;
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
  /** Absent = GENERAL. */
  readonly audience?: TemplateAudience;
}

export const audienceOf = (w: ProfessionalWorkoutBase): TemplateAudience => w.audience ?? 'GENERAL';

export interface SportWorkout extends ProfessionalWorkoutBase {
  readonly sport: ProfessionalSport;
  readonly trainingDomain?: 'SPORT_SPECIFIC';
}

export interface GeneralWorkout extends ProfessionalWorkoutBase {
  readonly sport: null;
  readonly trainingDomain: 'GENERAL_ATHLETIC';
}

export type ProfessionalWorkout = SportWorkout | GeneralWorkout;

export const domainOf = (w: ProfessionalWorkout): TrainingDomain => w.trainingDomain ?? 'SPORT_SPECIFIC';

export const x = (
  exerciseId: string,
  sets: number,
  target: number | null,
  restSec: number,
  alternatives?: ProfessionalItem['alternatives'],
): ProfessionalItem => ({
  exerciseId,
  dosage: { sets, target, restSec },
  ...(alternatives ? { alternatives } : {}),
});
/** A substitution with its own dosage. */
export const alt = (exerciseId: string, sets: number, target: number | null, restSec: number, timeSemantics?: TimeSemantics) => ({
  exerciseId,
  dosage: { sets, target, restSec },
  ...(timeSemantics ? { timeSemantics } : {}),
});
/** An item whose seconds value is explicitly a COMPLETION TIME CAP (a fixed course or distance; the athlete records the actual time). */
export const cap = (
  exerciseId: string,
  sets: number,
  target: number,
  restSec: number,
  alternatives?: ProfessionalItem['alternatives'],
): ProfessionalItem => ({ ...x(exerciseId, sets, target, restSec, alternatives), timeSemantics: 'COMPLETION_TIME_CAP' });
/**
 * A per-session adjustment of a workout when it is used inside a Training Block (TRAINING-BLOCKS-001): progression is set in
 * the BLOCK, so one workout can serve several blocks and weeks without a duplicate template. Absolute values (never deltas);
 * the source workout is never changed.
 */
export interface WorkoutAdjustment {
  readonly sets?: Readonly<Record<string, number>>;
  readonly target?: Readonly<Record<string, number>>;
  readonly omitExercises?: readonly string[];
  /** 0-based indexes into the workout's sections. */
  readonly omitSections?: readonly number[];
}

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
