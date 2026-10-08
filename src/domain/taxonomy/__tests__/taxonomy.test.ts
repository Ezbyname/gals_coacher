import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { en } from '@/i18n/en';
import { he } from '@/i18n/he';

import { BUILTIN_EXERCISES, builtinExercise } from '../../exercise/catalog';
import { bodyAreasOf } from '../../exercise/exercise';
import type { TrainingCategory } from '../../exercise/taxonomy';
import { BASKETBALL_CROSS_LISTED, BUILTIN_TAXONOMY_MEMBERS } from '../memberships';
import { BUILTIN_TAXONOMY_NODES, builtinTaxonomyNode, type TaxonomyNodeDefinition } from '../nodes';
import {
  activeCountUnder,
  buildTaxonomy,
  isVisible,
  TaxonomyStructureError,
  visibleChildren,
  type Taxonomy,
} from '../taxonomy';

/**
 * The curated taxonomy is coaching content: these checks are its quality gate
 * (structure, both languages, seeding, membership integrity and coherence with
 * each exercise's own truth) — they catch content mistakes without forcing
 * every legitimate coach decision.
 */
const allActive = () => true;
const curated = (active: (key: string) => boolean = allActive) =>
  buildTaxonomy(BUILTIN_TAXONOMY_NODES, active, BUILTIN_TAXONOMY_MEMBERS);
const t = curated();
const keys = BUILTIN_TAXONOMY_NODES.map((n) => n.key);
const everyExercise = new Set(BUILTIN_EXERCISES.map((e) => e.id));
const under = (taxonomy: Taxonomy, key: string) => [...taxonomy.exerciseIdsUnder(key)];
const def = (id: string) => builtinExercise(id)!;
const childKeys = (taxonomy: Taxonomy, parent: string | null) => taxonomy.children(parent).map((n) => n.key);

describe('taxonomy structure', () => {
  it('has unique, stable, code-like keys prefixed by their domain', () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const n of t.nodes) {
      expect(n.key).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(n.key.startsWith(n.domain)).toBe(true);
    }
    expect(builtinTaxonomyNode('FITNESS_LEGS_HINGE')?.parent).toBe('FITNESS_LEGS');
    expect(builtinTaxonomyNode('NOT_THERE')).toBeNull();
  });

  it('every parent exists, every node is reachable from a domain (no cycles), depth ≤ 2 in V1', () => {
    for (const d of BUILTIN_TAXONOMY_NODES) if (d.parent !== null) expect(keys).toContain(d.parent);
    expect(t.nodes).toHaveLength(BUILTIN_TAXONOMY_NODES.length);
    expect(Math.max(...t.nodes.map((n) => n.depth))).toBe(2);
    expect(childKeys(t, null)).toEqual(['FITNESS', 'BASKETBALL']);
  });

  it('ordering is stable: siblings in curated order, parents before children, identical on every build', () => {
    expect(curated().nodes.map((n) => n.key)).toEqual(t.nodes.map((n) => n.key));
    for (const n of t.nodes) {
      if (n.parent) expect(t.nodes.findIndex((p) => p.key === n.parent)).toBeLessThan(t.nodes.indexOf(n));
      const siblings = t.children(n.parent);
      expect(siblings.map((s) => s.sortOrder)).toEqual(siblings.map((_, i) => i));
    }
  });

  it('roots carry the domain sport; children inherit domain and sport', () => {
    expect(t.node('FITNESS')!.sport).toBeNull();
    expect(t.node('BASKETBALL')!.sport).toBe('BASKETBALL');
    expect(t.node('BASKETBALL_SHOOTING_PULL_UP')!).toMatchObject({ domain: 'BASKETBALL', sport: 'BASKETBALL', depth: 2 });
    expect(t.path('BASKETBALL_SHOOTING_PULL_UP').map((n) => n.key)).toEqual([
      'BASKETBALL',
      'BASKETBALL_SHOOTING',
      'BASKETBALL_SHOOTING_PULL_UP',
    ]);
    expect(() => t.path('NOPE')).toThrow(TaxonomyStructureError);
  });

  it('the model supports arbitrary depth (no migration per level) and fails closed on bad structure', () => {
    const deep: TaxonomyNodeDefinition[] = ['A', 'A_B', 'A_B_C', 'A_B_C_D', 'A_B_C_D_E'].map((key, i, all) => ({
      key,
      parent: i === 0 ? null : all[i - 1]!,
      sport: null,
      group: null,
    }));
    const tree = buildTaxonomy(deep, allActive, { A_B_C_D_E: ['X'] });
    expect(tree.node('A_B_C_D_E')!.depth).toBe(4);
    expect(under(tree, 'A')).toEqual(['X']);
    const n = (key: string, parent: string | null): TaxonomyNodeDefinition => ({ key, parent, sport: null, group: null });
    expect(() => buildTaxonomy([n('A', null), n('A', null)], allActive, {})).toThrow(/duplicate/);
    expect(() => buildTaxonomy([n('A', 'Z')], allActive, {})).toThrow(/unknown parent/);
    expect(() => buildTaxonomy([n('A', 'B'), n('B', 'A')], allActive, {})).toThrow(/cycle/);
    expect(() => buildTaxonomy([n('A', null)], allActive, { B: ['X'] })).toThrow(/unknown node/);
  });
});

describe('approved trees (owner, 2026-10-07)', () => {
  it('Fitness separates BODY AREA from TRAINING GOAL — two groups, never mixed', () => {
    const level1 = t.children('FITNESS');
    expect(level1.filter((n) => n.group === 'BODY_AREA').map((n) => n.key)).toEqual([
      'FITNESS_CHEST',
      'FITNESS_BACK',
      'FITNESS_SHOULDERS',
      'FITNESS_ARMS',
      'FITNESS_CORE',
      'FITNESS_LEGS',
      'FITNESS_FULL_BODY',
    ]);
    expect(level1.filter((n) => n.group === 'TRAINING_GOAL').map((n) => n.key)).toEqual([
      'FITNESS_STRENGTH',
      'FITNESS_POWER',
      'FITNESS_SPEED',
      'FITNESS_AGILITY',
      'FITNESS_CONDITIONING',
      'FITNESS_MOBILITY',
      'FITNESS_WARMUP',
      'FITNESS_COOLDOWN',
    ]);
    expect(level1.every((n) => n.group !== null)).toBe(true);
    expect(childKeys(t, 'FITNESS_LEGS')).toEqual([
      'FITNESS_LEGS_SQUAT_LUNGE',
      'FITNESS_LEGS_HINGE',
      'FITNESS_LEGS_SINGLE_LEG',
      'FITNESS_LEGS_CALVES_ANKLES',
    ]);
    expect(childKeys(t, 'FITNESS_CORE')).toEqual(['FITNESS_CORE_STABILITY', 'FITNESS_CORE_ROTATION_FLEXION']);
    expect(childKeys(t, 'FITNESS_ARMS')).toEqual([]); // V1: one Arms category
  });

  it('Basketball has the approved categories; Athletic Development holds Speed / Agility / Jumping / Conditioning', () => {
    expect(childKeys(t, 'BASKETBALL')).toEqual([
      'BASKETBALL_SHOOTING',
      'BASKETBALL_FINISHING',
      'BASKETBALL_BALL_HANDLING',
      'BASKETBALL_PASSING',
      'BASKETBALL_DEFENSE',
      'BASKETBALL_FOOTWORK',
      'BASKETBALL_REBOUNDING',
      'BASKETBALL_ATHLETIC',
    ]);
    expect(childKeys(t, 'BASKETBALL_ATHLETIC')).toEqual([
      'BASKETBALL_ATHLETIC_SPEED',
      'BASKETBALL_ATHLETIC_AGILITY',
      'BASKETBALL_ATHLETIC_JUMPING',
      'BASKETBALL_ATHLETIC_CONDITIONING',
    ]);
    expect(t.children('BASKETBALL').every((n) => n.group === null)).toBe(true);
    expect(childKeys(t, 'BASKETBALL_SHOOTING')).toHaveLength(8);
    expect(childKeys(t, 'BASKETBALL_FINISHING')).toHaveLength(6);
    expect(childKeys(t, 'BASKETBALL_BALL_HANDLING')).toHaveLength(10);
    expect(childKeys(t, 'BASKETBALL_PASSING')).toHaveLength(4);
    expect(childKeys(t, 'BASKETBALL_DEFENSE')).toHaveLength(4);
    expect(childKeys(t, 'BASKETBALL_FOOTWORK')).toHaveLength(4);
  });
});

describe('labels', () => {
  it('every node has a Hebrew and an English label, and no label exists for an unknown node', () => {
    expect(Object.keys(he.taxonomy.node).sort()).toEqual([...keys].sort());
    expect(Object.keys(en.taxonomy.node).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const heLabel = he.taxonomy.node[key as keyof typeof he.taxonomy.node];
      const enLabel = en.taxonomy.node[key as keyof typeof en.taxonomy.node];
      expect(heLabel.trim().length).toBeGreaterThan(0);
      expect(heLabel).toMatch(/[֐-׿]/);
      expect(enLabel.trim().length).toBeGreaterThan(0);
    }
    expect(he.taxonomy.group.BODY_AREA).toMatch(/[֐-׿]/);
    expect(en.taxonomy.group.TRAINING_GOAL).toBe('By training goal');
  });
});

describe('seeding', () => {
  it('every built-in node is seeded by a migration, and nothing else is (a new node needs a migration)', () => {
    const source = readFileSync(resolve(__dirname, '../../../data/local/migrations/index.ts'), 'utf8');
    const seeded = [...source.matchAll(/\('([A-Z0-9_]+)', 1, 1, 0, 0\)/g)].map((m) => m[1]);
    expect(seeded.sort()).toEqual([...keys].sort());
  });
});

describe('built-in membership', () => {
  it('references only known nodes and built-in exercises, without duplicates on a node', () => {
    for (const [key, ids] of Object.entries(BUILTIN_TAXONOMY_MEMBERS)) {
      expect(keys).toContain(key);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(everyExercise.has(id)).toBe(true);
    }
  });

  it('every built-in exercise can be found under at least one node', () => {
    const unmapped = BUILTIN_EXERCISES.filter((e) => t.nodesOf(e.id).length === 0).map((e) => e.id);
    expect(unmapped).toEqual([]);
  });

  it('is many-to-many: one exercise, one definition, several paths', () => {
    expect(t.nodesOf('DEADLIFT')).toEqual(['FITNESS_BACK', 'FITNESS_LEGS_HINGE', 'FITNESS_FULL_BODY', 'FITNESS_STRENGTH']);
    expect(t.nodesOf('PULL_UP_JUMPER')).toEqual([
      'BASKETBALL_SHOOTING_MID_RANGE',
      'BASKETBALL_SHOOTING_PULL_UP',
      'BASKETBALL_SHOOTING_OFF_THE_DRIBBLE',
    ]);
    // A shelf counts an exercise once even when it sits on several child shelves.
    expect(under(t, 'BASKETBALL_SHOOTING').filter((id) => id === 'PULL_UP_JUMPER')).toHaveLength(1);
    // Many paths, one record: the catalog still has exactly one definition per id.
    expect(BUILTIN_EXERCISES.filter((e) => e.id === 'PULL_UP_JUMPER')).toHaveLength(1);
    const multi = BUILTIN_EXERCISES.filter((e) => t.nodesOf(e.id).length >= 2).length;
    expect(multi).toBeGreaterThanOrEqual(40);
  });

  it('a parent shelf includes its children (Legs ⊇ Hinge) without the parent listing them itself', () => {
    expect(under(t, 'FITNESS_LEGS')).toEqual(expect.arrayContaining(under(t, 'FITNESS_LEGS_HINGE')));
    expect(t.directMembers('FITNESS_LEGS')).toEqual(['BAND_LATERAL_WALK']);
  });
});

describe('coaching coherence with each exercise’s own truth', () => {
  const members = (key: string) => under(t, key).map(def);
  const hasCategory = (...cats: TrainingCategory[]) => (e: ReturnType<typeof def>) =>
    e.categories.some((c) => cats.includes(c));

  it('Fitness holds only general exercises; Basketball holds Basketball drills plus the explicit cross-list', () => {
    for (const e of members('FITNESS')) expect(e.sports).not.toContain('BASKETBALL');
    const general = members('BASKETBALL').filter((e) => !e.sports.includes('BASKETBALL')).map((e) => e.id);
    expect(general.sort()).toEqual([...BASKETBALL_CROSS_LISTED].sort());
    // Cross-listed general exercises live only under Athletic Development.
    for (const id of BASKETBALL_CROSS_LISTED) {
      for (const key of t.nodesOf(id).filter((k) => k.startsWith('BASKETBALL'))) {
        expect(t.path(key).map((n) => n.key)).toContain('BASKETBALL_ATHLETIC');
      }
    }
    // Every Basketball drill is on the Basketball tree.
    for (const e of BUILTIN_EXERCISES.filter((x) => x.sports.includes('BASKETBALL'))) {
      expect(t.nodesOf(e.id).some((k) => k.startsWith('BASKETBALL'))).toBe(true);
    }
  });

  it('Shooting holds Basketball shooting drills measured by makes / attempts', () => {
    for (const e of members('BASKETBALL_SHOOTING')) {
      expect(e.categories).toContain('BASKETBALL_SHOOTING');
      expect(e.measurement.type).toBe('MADE_ATTEMPTS');
    }
  });

  it('body-area shelves match the exercise’s primary muscles / areas', () => {
    const primary = (e: ReturnType<typeof def>) => e.primaryMuscles;
    for (const e of members('FITNESS_CHEST')) expect(primary(e)).toContain('CHEST');
    for (const e of members('FITNESS_SHOULDERS')) expect(primary(e)).toContain('SHOULDERS');
    for (const e of members('FITNESS_BACK')) {
      expect(primary(e).some((m) => ['UPPER_BACK', 'LATS', 'LOWER_BACK'].includes(m))).toBe(true);
    }
    for (const e of members('FITNESS_ARMS')) {
      expect(primary(e).some((m) => ['BICEPS', 'TRICEPS', 'FOREARMS_GRIP'].includes(m))).toBe(true);
    }
    for (const e of members('FITNESS_LEGS')) expect(bodyAreasOf(e)).toContain('LOWER_BODY');
    for (const e of members('FITNESS_LEGS_CALVES_ANKLES')) expect(primary(e)).toContain('CALVES');
    for (const e of members('FITNESS_CORE')) {
      expect(bodyAreasOf(e).includes('CORE') || e.categories.includes('CORE')).toBe(true);
    }
    for (const e of members('FITNESS_FULL_BODY')) expect(bodyAreasOf(e)).toContain('FULL_BODY');
  });

  it('pattern shelves match the movement pattern', () => {
    for (const e of members('FITNESS_LEGS_HINGE')) expect(e.movementPatterns).toContain('HINGE');
    for (const e of members('FITNESS_LEGS_SQUAT_LUNGE')) {
      expect(e.movementPatterns.some((p) => p === 'SQUAT' || p === 'LUNGE')).toBe(true);
    }
  });

  it('training-goal shelves match the exercise’s training categories', () => {
    expect(members('FITNESS_STRENGTH').every(hasCategory('STRENGTH'))).toBe(true);
    expect(members('FITNESS_POWER').every(hasCategory('POWER', 'PLYOMETRIC'))).toBe(true);
    expect(members('FITNESS_SPEED').every(hasCategory('SPEED'))).toBe(true);
    expect(members('FITNESS_AGILITY').every(hasCategory('AGILITY'))).toBe(true);
    expect(members('FITNESS_CONDITIONING').every(hasCategory('CONDITIONING', 'CARDIO', 'HIIT'))).toBe(true);
    expect(members('FITNESS_MOBILITY').every(hasCategory('MOBILITY', 'FLEXIBILITY'))).toBe(true);
    expect(members('FITNESS_WARMUP').every(hasCategory('WARMUP'))).toBe(true);
    expect(members('FITNESS_COOLDOWN').every(hasCategory('COOLDOWN'))).toBe(true);
  });
});

describe('visibility: inactive and empty nodes are hidden from NEW selection', () => {
  const activeExercises = new Set(everyExercise);

  it('lists the curated-ahead-of-content (empty) nodes explicitly — a content gap is never silent', () => {
    const empty = t.nodes.filter((n) => activeCountUnder(t, n.key, activeExercises) === 0).map((n) => n.key);
    expect(empty).toEqual([
      'BASKETBALL_SHOOTING_ON_THE_MOVE',
      'BASKETBALL_FINISHING_REVERSE_LAYUP',
      'BASKETBALL_FINISHING_CONTACT',
      'BASKETBALL_FINISHING_FLOATER',
      'BASKETBALL_FINISHING_POWER',
      'BASKETBALL_BALL_HANDLING_HESITATION',
      'BASKETBALL_BALL_HANDLING_CHANGE_OF_PACE',
      'BASKETBALL_BALL_HANDLING_COMBINATION',
      'BASKETBALL_PASSING_ONE_HAND',
      'BASKETBALL_PASSING_ON_THE_MOVE',
      'BASKETBALL_DEFENSE_RECOVERY',
      'BASKETBALL_FOOTWORK',
      'BASKETBALL_FOOTWORK_JUMP_STOP',
      'BASKETBALL_FOOTWORK_PIVOT',
      'BASKETBALL_FOOTWORK_JAB_STEP',
      'BASKETBALL_FOOTWORK_TRIPLE_THREAT',
    ]);
    for (const key of empty) expect(isVisible(t, key, activeExercises)).toBe(false);
    expect(childKeys(t, 'BASKETBALL')).toContain('BASKETBALL_FOOTWORK');
    expect(visibleChildren(t, 'BASKETBALL', activeExercises).map((n) => n.key)).not.toContain('BASKETBALL_FOOTWORK');
  });

  it('a shelf whose only exercises are inactive is hidden; counts use active exercises only', () => {
    const withoutFreeThrows = new Set([...activeExercises].filter((id) => id !== 'FREE_THROWS'));
    expect(activeCountUnder(t, 'BASKETBALL_SHOOTING_FREE_THROWS', activeExercises)).toBe(1);
    expect(isVisible(t, 'BASKETBALL_SHOOTING_FREE_THROWS', withoutFreeThrows)).toBe(false);
    expect(activeCountUnder(t, 'BASKETBALL_SHOOTING', withoutFreeThrows)).toBe(
      activeCountUnder(t, 'BASKETBALL_SHOOTING', activeExercises) - 1,
    );
  });

  it('an inactive node hides itself and its subtree, keeps its memberships, and leaves the parent shelf', () => {
    const inactive = curated((key) => key !== 'FITNESS_LEGS_HINGE');
    expect(inactive.node('FITNESS_LEGS_HINGE')!.active).toBe(false);
    expect(visibleChildren(inactive, 'FITNESS_LEGS', activeExercises).map((n) => n.key)).not.toContain(
      'FITNESS_LEGS_HINGE',
    );
    expect(isVisible(inactive, 'FITNESS_LEGS_HINGE', activeExercises)).toBe(false);
    // Membership is kept (history / reactivation) …
    expect(inactive.directMembers('FITNESS_LEGS_HINGE')).toContain('NORDIC_HAMSTRING');
    expect(inactive.nodesOf('NORDIC_HAMSTRING')).toContain('FITNESS_LEGS_HINGE');
    // … but the Legs shelf no longer offers what only the inactive child held.
    expect(under(inactive, 'FITNESS_LEGS')).not.toContain('NORDIC_HAMSTRING');
    expect(under(inactive, 'FITNESS_LEGS')).toContain('GOBLET_SQUAT');
    // An inactive domain hides everything below it.
    const noBasketball = curated((key) => key !== 'BASKETBALL');
    expect(visibleChildren(noBasketball, null, activeExercises).map((n) => n.key)).toEqual(['FITNESS']);
    expect(visibleChildren(noBasketball, 'BASKETBALL', activeExercises)).toEqual([]);
    expect(isVisible(noBasketball, 'BASKETBALL_SHOOTING', activeExercises)).toBe(false);
  });

  it('both domains are offered when everything is active', () => {
    expect(visibleChildren(t, null, activeExercises).map((n) => n.key)).toEqual(['FITNESS', 'BASKETBALL']);
  });
});
