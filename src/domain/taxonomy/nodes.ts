import type { SportKey } from '../sport';

/**
 * Training taxonomy (TRAIN-TAXONOMY-001): the curated DISCOVERY / NAVIGATION
 * tree over the exercise library — "Fitness → Legs → Hinge", "Basketball →
 * Shooting → Pull-Up". It is not an exercise attribute: an exercise's own
 * truth (categories, muscles, patterns, sports, …; src/domain/exercise) stays
 * where it is, and one exercise may sit under many nodes (many-to-many,
 * src/domain/taxonomy/memberships.ts).
 *
 * Built-in nodes are curated here under stable keys (persisted / referenced
 * as-is; labels come from i18n `taxonomy.node.<KEY>`). Like built-in
 * exercises, each key has a database row holding only its active state
 * (migration v10). A NEW built-in node needs a new migration seeding its key
 * (a test enforces it). Keys never change meaning; a node is never deleted —
 * it can only become inactive.
 *
 * Order = array order among siblings. Depth is unlimited in the model (an
 * adjacency list); the first UX uses domain → category → sub-category.
 */

/** How a level-2 Fitness node is grouped on screen (two separate concepts, never mixed in one list). */
export const TAXONOMY_GROUPS = ['BODY_AREA', 'TRAINING_GOAL'] as const;
export type TaxonomyGroup = (typeof TAXONOMY_GROUPS)[number];

export interface TaxonomyNodeDefinition {
  readonly key: string;
  /** null = a domain (root). */
  readonly parent: string | null;
  /** Roots only: the sport this domain belongs to; null = general fitness. */
  readonly sport: SportKey | null;
  /** Section the node is shown under among its siblings (Fitness level 2); null = none. */
  readonly group: TaxonomyGroup | null;
}

const root = (key: string, sport: SportKey | null): TaxonomyNodeDefinition => ({
  key,
  parent: null,
  sport,
  group: null,
});
const node = (key: string, parent: string, group: TaxonomyGroup | null = null): TaxonomyNodeDefinition => ({
  key,
  parent,
  sport: null,
  group,
});
const children = (parent: string, keys: readonly string[]): TaxonomyNodeDefinition[] =>
  keys.map((key) => node(key, parent));

const FITNESS: TaxonomyNodeDefinition[] = [
  root('FITNESS', null),
  // By body area — WHERE the exercise works.
  node('FITNESS_CHEST', 'FITNESS', 'BODY_AREA'),
  node('FITNESS_BACK', 'FITNESS', 'BODY_AREA'),
  node('FITNESS_SHOULDERS', 'FITNESS', 'BODY_AREA'),
  node('FITNESS_ARMS', 'FITNESS', 'BODY_AREA'),
  node('FITNESS_CORE', 'FITNESS', 'BODY_AREA'),
  ...children('FITNESS_CORE', ['FITNESS_CORE_STABILITY', 'FITNESS_CORE_ROTATION_FLEXION']),
  node('FITNESS_LEGS', 'FITNESS', 'BODY_AREA'),
  ...children('FITNESS_LEGS', [
    'FITNESS_LEGS_SQUAT_LUNGE',
    'FITNESS_LEGS_HINGE',
    'FITNESS_LEGS_SINGLE_LEG',
    'FITNESS_LEGS_CALVES_ANKLES',
  ]),
  node('FITNESS_FULL_BODY', 'FITNESS', 'BODY_AREA'),
  // By training goal — WHY it is trained.
  node('FITNESS_STRENGTH', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_POWER', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_SPEED', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_AGILITY', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_CONDITIONING', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_MOBILITY', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_WARMUP', 'FITNESS', 'TRAINING_GOAL'),
  node('FITNESS_COOLDOWN', 'FITNESS', 'TRAINING_GOAL'),
];

const BASKETBALL: TaxonomyNodeDefinition[] = [
  root('BASKETBALL', 'BASKETBALL'),
  node('BASKETBALL_SHOOTING', 'BASKETBALL'),
  ...children('BASKETBALL_SHOOTING', [
    'BASKETBALL_SHOOTING_FORM_CLOSE_RANGE',
    'BASKETBALL_SHOOTING_FREE_THROWS',
    'BASKETBALL_SHOOTING_MID_RANGE',
    'BASKETBALL_SHOOTING_THREE_POINT',
    'BASKETBALL_SHOOTING_CATCH_AND_SHOOT',
    'BASKETBALL_SHOOTING_PULL_UP',
    'BASKETBALL_SHOOTING_OFF_THE_DRIBBLE',
    'BASKETBALL_SHOOTING_ON_THE_MOVE',
  ]),
  node('BASKETBALL_FINISHING', 'BASKETBALL'),
  ...children('BASKETBALL_FINISHING', [
    'BASKETBALL_FINISHING_LAYUPS',
    'BASKETBALL_FINISHING_REVERSE_LAYUP',
    'BASKETBALL_FINISHING_AROUND_THE_RIM',
    'BASKETBALL_FINISHING_CONTACT',
    'BASKETBALL_FINISHING_FLOATER',
    'BASKETBALL_FINISHING_POWER',
  ]),
  node('BASKETBALL_BALL_HANDLING', 'BASKETBALL'),
  ...children('BASKETBALL_BALL_HANDLING', [
    'BASKETBALL_BALL_HANDLING_STATIONARY',
    'BASKETBALL_BALL_HANDLING_STRONG_HAND',
    'BASKETBALL_BALL_HANDLING_WEAK_HAND',
    'BASKETBALL_BALL_HANDLING_CROSSOVER',
    'BASKETBALL_BALL_HANDLING_BETWEEN_THE_LEGS',
    'BASKETBALL_BALL_HANDLING_BEHIND_THE_BACK',
    'BASKETBALL_BALL_HANDLING_HESITATION',
    'BASKETBALL_BALL_HANDLING_CHANGE_OF_PACE',
    'BASKETBALL_BALL_HANDLING_COMBINATION',
    'BASKETBALL_BALL_HANDLING_MOVING',
  ]),
  node('BASKETBALL_PASSING', 'BASKETBALL'),
  ...children('BASKETBALL_PASSING', [
    'BASKETBALL_PASSING_CHEST',
    'BASKETBALL_PASSING_BOUNCE',
    'BASKETBALL_PASSING_ONE_HAND',
    'BASKETBALL_PASSING_ON_THE_MOVE',
  ]),
  node('BASKETBALL_DEFENSE', 'BASKETBALL'),
  ...children('BASKETBALL_DEFENSE', [
    'BASKETBALL_DEFENSE_ON_BALL',
    'BASKETBALL_DEFENSE_CLOSEOUTS',
    'BASKETBALL_DEFENSE_CHANGE_OF_DIRECTION',
    'BASKETBALL_DEFENSE_RECOVERY',
  ]),
  node('BASKETBALL_FOOTWORK', 'BASKETBALL'),
  ...children('BASKETBALL_FOOTWORK', [
    'BASKETBALL_FOOTWORK_JUMP_STOP',
    'BASKETBALL_FOOTWORK_PIVOT',
    'BASKETBALL_FOOTWORK_JAB_STEP',
    'BASKETBALL_FOOTWORK_TRIPLE_THREAT',
  ]),
  node('BASKETBALL_REBOUNDING', 'BASKETBALL'),
  // Locked (owner, 2026-10-07): athletic qualities live under one Basketball category.
  node('BASKETBALL_ATHLETIC', 'BASKETBALL'),
  ...children('BASKETBALL_ATHLETIC', [
    'BASKETBALL_ATHLETIC_SPEED',
    'BASKETBALL_ATHLETIC_AGILITY',
    'BASKETBALL_ATHLETIC_JUMPING',
    'BASKETBALL_ATHLETIC_CONDITIONING',
  ]),
];

// SPORT-CONTENT-001: Football and Surfing domains (content sports; not Player / Calendar sports).
const FOOTBALL: TaxonomyNodeDefinition[] = [
  root('FOOTBALL', 'FOOTBALL'),
  ...children('FOOTBALL', [
    'FOOTBALL_BALL_MASTERY',
    'FOOTBALL_DRIBBLING',
    'FOOTBALL_PASSING',
    'FOOTBALL_SHOOTING',
    'FOOTBALL_POSSESSION',
    'FOOTBALL_GAMES',
  ]),
];

const SURFING: TaxonomyNodeDefinition[] = [
  root('SURFING', 'SURFING'),
  ...children('SURFING', ['SURFING_POP_UP_STANCE', 'SURFING_PADDLING', 'SURFING_WAVE_READING', 'SURFING_TURNS']),
];

/** Every built-in node, domains first, siblings in display order. */
export const BUILTIN_TAXONOMY_NODES: readonly TaxonomyNodeDefinition[] = [
  ...FITNESS,
  ...BASKETBALL,
  ...FOOTBALL,
  ...SURFING,
];

const BY_KEY = new Map(BUILTIN_TAXONOMY_NODES.map((n) => [n.key, n]));

export function builtinTaxonomyNode(key: string): TaxonomyNodeDefinition | null {
  return BY_KEY.get(key) ?? null;
}
