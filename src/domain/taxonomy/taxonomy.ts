import type { SportKey } from '../sport';

import type { TaxonomyGroup, TaxonomyNodeDefinition } from './nodes';

/**
 * Pure helpers over the training taxonomy (TRAIN-TAXONOMY-001): a curated tree
 * of nodes with an active state, and many-to-many exercise membership. Nothing
 * here touches storage; the repository supplies the active state and the
 * custom-exercise memberships.
 *
 * Visibility rule (owner, 2026-10-07): a node is shown for NEW selection only
 * when it and all its ancestors are active AND its shelf holds at least one
 * active exercise — empty shelves are never shown. Hiding never removes
 * membership; history is untouched (taxonomy is never snapshotted).
 */

export interface TaxonomyNode {
  readonly key: string;
  readonly parent: string | null;
  /** The root key this node belongs to (its domain). */
  readonly domain: string;
  /** The domain's sport (null = general fitness). */
  readonly sport: SportKey | null;
  readonly group: TaxonomyGroup | null;
  /** 0 for a domain. */
  readonly depth: number;
  /** Position among its siblings (0-based). */
  readonly sortOrder: number;
  readonly active: boolean;
}

export interface Taxonomy {
  /** Every node, parents before children, siblings in display order. */
  readonly nodes: readonly TaxonomyNode[];
  node(key: string): TaxonomyNode | null;
  /** Children of `parent` (null = the domains), in display order, active or not. */
  children(parent: string | null): readonly TaxonomyNode[];
  /** Root → node (for a breadcrumb). Throws for an unknown key. */
  path(key: string): readonly TaxonomyNode[];
  /** Exercises listed directly on the node. */
  directMembers(key: string): readonly string[];
  /** The node's shelf: its own members and every ACTIVE descendant's, without duplicates. */
  exerciseIdsUnder(key: string): ReadonlySet<string>;
  /** Every node an exercise is listed under (many-to-many), in tree order. */
  nodesOf(exerciseId: string): readonly string[];
}

export class TaxonomyStructureError extends Error {
  constructor(readonly reason: string) {
    super(`invalid taxonomy: ${reason}`);
    this.name = 'TaxonomyStructureError';
  }
}

/**
 * Builds the taxonomy. `active(key)` gives each node's stored state;
 * `members` maps node key → exercise ids (built-in curation merged with
 * custom memberships). Structural errors (duplicate key, unknown parent,
 * cycle, membership on an unknown node) throw — fail closed.
 */
export function buildTaxonomy(
  definitions: readonly TaxonomyNodeDefinition[],
  active: (key: string) => boolean,
  members: Readonly<Record<string, readonly string[]>>,
): Taxonomy {
  const defs = new Map<string, TaxonomyNodeDefinition>();
  for (const d of definitions) {
    if (defs.has(d.key)) throw new TaxonomyStructureError(`duplicate key ${d.key}`);
    defs.set(d.key, d);
  }
  const byParent = new Map<string | null, TaxonomyNodeDefinition[]>();
  for (const d of definitions) {
    if (d.parent !== null && !defs.has(d.parent)) {
      throw new TaxonomyStructureError(`${d.key} has unknown parent ${d.parent}`);
    }
    byParent.set(d.parent, [...(byParent.get(d.parent) ?? []), d]);
  }

  // Walk from the domains: every node must be reached exactly once (no cycles, no orphans).
  const nodes: TaxonomyNode[] = [];
  const byKey = new Map<string, TaxonomyNode>();
  const visit = (def: TaxonomyNodeDefinition, parent: TaxonomyNode | null, sortOrder: number) => {
    const n: TaxonomyNode = {
      key: def.key,
      parent: def.parent,
      domain: parent ? parent.domain : def.key,
      sport: parent ? parent.sport : def.sport,
      group: def.group,
      depth: parent ? parent.depth + 1 : 0,
      sortOrder,
      active: active(def.key),
    };
    nodes.push(n);
    byKey.set(n.key, n);
    (byParent.get(def.key) ?? []).forEach((child, i) => visit(child, n, i));
  };
  (byParent.get(null) ?? []).forEach((d, i) => visit(d, null, i));
  if (nodes.length !== defs.size) {
    const unreached = [...defs.keys()].filter((k) => !byKey.has(k));
    throw new TaxonomyStructureError(`cycle or unreachable nodes: ${unreached.join(', ')}`);
  }

  for (const key of Object.keys(members)) {
    if (!byKey.has(key)) throw new TaxonomyStructureError(`membership on unknown node ${key}`);
  }
  const ofExercise = new Map<string, string[]>();
  for (const n of nodes) {
    for (const id of new Set(members[n.key] ?? [])) ofExercise.set(id, [...(ofExercise.get(id) ?? []), n.key]);
  }

  const children = (parent: string | null) =>
    nodes.filter((n) => n.parent === parent).sort((a, b) => a.sortOrder - b.sortOrder);

  const under = (key: string, out: Set<string>) => {
    for (const id of members[key] ?? []) out.add(id);
    for (const child of children(key)) if (child.active) under(child.key, out);
    return out;
  };

  return {
    nodes,
    node: (key) => byKey.get(key) ?? null,
    children,
    path: (key) => {
      const out: TaxonomyNode[] = [];
      for (let n = byKey.get(key) ?? null; n; n = n.parent ? byKey.get(n.parent)! : null) out.unshift(n);
      if (out.length === 0) throw new TaxonomyStructureError(`unknown node ${key}`);
      return out;
    },
    directMembers: (key) => [...new Set(members[key] ?? [])],
    exerciseIdsUnder: (key) => {
      if (!byKey.has(key)) throw new TaxonomyStructureError(`unknown node ${key}`);
      return under(key, new Set());
    },
    nodesOf: (exerciseId) => ofExercise.get(exerciseId) ?? [],
  };
}

/** Number of ACTIVE exercises on a node's shelf. */
export function activeCountUnder(taxonomy: Taxonomy, key: string, activeExercises: ReadonlySet<string>): number {
  let count = 0;
  for (const id of taxonomy.exerciseIdsUnder(key)) if (activeExercises.has(id)) count++;
  return count;
}

/** Shown for new selection: the node and all ancestors active, and at least one active exercise on its shelf. */
export function isVisible(taxonomy: Taxonomy, key: string, activeExercises: ReadonlySet<string>): boolean {
  return (
    taxonomy.path(key).every((n) => n.active) && activeCountUnder(taxonomy, key, activeExercises) > 0
  );
}

/** The children of `parent` (null = domains) a user may navigate to now, in display order. */
export function visibleChildren(
  taxonomy: Taxonomy,
  parent: string | null,
  activeExercises: ReadonlySet<string>,
): readonly TaxonomyNode[] {
  if (parent !== null && !taxonomy.path(parent).every((n) => n.active)) return [];
  return taxonomy
    .children(parent)
    .filter((n) => n.active && activeCountUnder(taxonomy, n.key, activeExercises) > 0);
}
