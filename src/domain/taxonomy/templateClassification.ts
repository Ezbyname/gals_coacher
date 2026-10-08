import type { Taxonomy } from './taxonomy';

/**
 * Workout Template classification (TRAIN-TAXONOMY-001E, owner-locked
 * 2026-10-07): the coach's explicit statement of what a template trains —
 * 0 to 3 taxonomy categories, at most one of them primary. Discovery
 * metadata only: never derived from the template's exercises, never copied
 * into a planned workout, a session or any result.
 */

export const MAX_TEMPLATE_CATEGORIES = 3;

export interface TemplateClassification {
  /** Selected categories, in the coach's order; no duplicates; at most 3. */
  readonly nodeKeys: readonly string[];
  /** One of `nodeKeys`, or none. */
  readonly primary: string | null;
}

export const NO_CLASSIFICATION: TemplateClassification = { nodeKeys: [], primary: null };

export type ClassificationError =
  | 'TOO_MANY'
  | 'DUPLICATE'
  | 'PRIMARY_NOT_SELECTED'
  | 'UNKNOWN_NODE'
  /** A category that is inactive (or has no active exercise) cannot be NEWLY chosen. */
  | 'NOT_SELECTABLE';

/**
 * Checks a classification against the taxonomy. A category the template
 * already had (`previous`) may stay even if it has since become inactive —
 * it is never silently removed or rewritten; only NEW ones must be
 * selectable now. Returns the first problem, or null.
 */
export function classificationError(
  next: TemplateClassification,
  taxonomy: Taxonomy,
  selectable: (key: string) => boolean,
  previous: TemplateClassification = NO_CLASSIFICATION,
): ClassificationError | null {
  if (new Set(next.nodeKeys).size !== next.nodeKeys.length) return 'DUPLICATE';
  if (next.nodeKeys.length > MAX_TEMPLATE_CATEGORIES) return 'TOO_MANY';
  if (next.primary !== null && !next.nodeKeys.includes(next.primary)) return 'PRIMARY_NOT_SELECTED';
  for (const key of next.nodeKeys) {
    if (taxonomy.node(key) === null) return 'UNKNOWN_NODE';
    if (!previous.nodeKeys.includes(key) && !selectable(key)) return 'NOT_SELECTABLE';
  }
  return null;
}

/** Adds a category at the end; a duplicate or a 4th is refused (returns the input unchanged). */
export function addCategory(c: TemplateClassification, key: string): TemplateClassification {
  if (c.nodeKeys.includes(key) || c.nodeKeys.length >= MAX_TEMPLATE_CATEGORIES) return c;
  return { ...c, nodeKeys: [...c.nodeKeys, key] };
}

/** Removes a category; removing the primary leaves no primary (never silently another one). */
export function removeCategory(c: TemplateClassification, key: string): TemplateClassification {
  return {
    nodeKeys: c.nodeKeys.filter((k) => k !== key),
    primary: c.primary === key ? null : c.primary,
  };
}

/** Makes a selected category the primary; null clears it. A key that is not selected is ignored. */
export function setPrimary(c: TemplateClassification, key: string | null): TemplateClassification {
  if (key !== null && !c.nodeKeys.includes(key)) return c;
  return { ...c, primary: key };
}
