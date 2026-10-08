import { BUILTIN_TAXONOMY_MEMBERS } from '../memberships';
import { BUILTIN_TAXONOMY_NODES } from '../nodes';
import { buildTaxonomy } from '../taxonomy';
import {
  addCategory,
  classificationError,
  MAX_TEMPLATE_CATEGORIES,
  NO_CLASSIFICATION,
  removeCategory,
  setPrimary,
  type TemplateClassification,
} from '../templateClassification';

/** TRAIN-TAXONOMY-001E: 0..3 categories, at most one primary, explicit coach intent. */
const taxonomy = buildTaxonomy(BUILTIN_TAXONOMY_NODES, () => true, BUILTIN_TAXONOMY_MEMBERS);
const all = () => true;
const c = (nodeKeys: string[], primary: string | null = null): TemplateClassification => ({ nodeKeys, primary });

describe('the locked model', () => {
  it('allows 0, 1, 2 and 3 categories, with or without a primary', () => {
    expect(MAX_TEMPLATE_CATEGORIES).toBe(3);
    expect(classificationError(NO_CLASSIFICATION, taxonomy, all)).toBeNull();
    expect(classificationError(c(['BASKETBALL_SHOOTING']), taxonomy, all)).toBeNull();
    expect(classificationError(c(['BASKETBALL_SHOOTING', 'FITNESS_LEGS'], 'FITNESS_LEGS'), taxonomy, all)).toBeNull();
    expect(
      classificationError(c(['BASKETBALL_SHOOTING', 'FITNESS_LEGS', 'FITNESS_STRENGTH'], 'FITNESS_LEGS'), taxonomy, all),
    ).toBeNull();
  });

  it('refuses a 4th, a duplicate, a primary that is not selected and an unknown node', () => {
    expect(classificationError(c(['FITNESS_LEGS', 'FITNESS_BACK', 'FITNESS_CORE', 'FITNESS_ARMS']), taxonomy, all)).toBe('TOO_MANY');
    expect(classificationError(c(['FITNESS_LEGS', 'FITNESS_LEGS']), taxonomy, all)).toBe('DUPLICATE');
    expect(classificationError(c(['FITNESS_LEGS'], 'FITNESS_BACK'), taxonomy, all)).toBe('PRIMARY_NOT_SELECTED');
    expect(classificationError(c(['NOPE']), taxonomy, all)).toBe('UNKNOWN_NODE');
  });

  it('a NEW category must be selectable; one the template already had may stay', () => {
    const rebounding = (key: string) => key !== 'BASKETBALL_REBOUNDING';
    expect(classificationError(c(['BASKETBALL_REBOUNDING']), taxonomy, rebounding)).toBe('NOT_SELECTABLE');
    expect(
      classificationError(c(['BASKETBALL_REBOUNDING']), taxonomy, rebounding, c(['BASKETBALL_REBOUNDING'])),
    ).toBeNull();
  });
});

describe('editing helpers (what the form does)', () => {
  it('add: appends in order; a duplicate or a 4th is refused unchanged', () => {
    let x = addCategory(NO_CLASSIFICATION, 'FITNESS_LEGS');
    x = addCategory(x, 'BASKETBALL_SHOOTING');
    expect(x.nodeKeys).toEqual(['FITNESS_LEGS', 'BASKETBALL_SHOOTING']);
    expect(addCategory(x, 'FITNESS_LEGS')).toBe(x);
    x = addCategory(x, 'FITNESS_STRENGTH');
    expect(addCategory(x, 'FITNESS_BACK')).toBe(x);
    expect(x.nodeKeys).toHaveLength(3);
  });

  it('primary: set, change, clear; only a selected category can be primary', () => {
    let x = c(['FITNESS_LEGS', 'BASKETBALL_SHOOTING']);
    x = setPrimary(x, 'FITNESS_LEGS');
    expect(x.primary).toBe('FITNESS_LEGS');
    x = setPrimary(x, 'BASKETBALL_SHOOTING');
    expect(x.primary).toBe('BASKETBALL_SHOOTING'); // still only one
    expect(setPrimary(x, 'FITNESS_BACK')).toBe(x);
    expect(setPrimary(x, null).primary).toBeNull();
  });

  it('remove: removing the primary leaves no primary (never silently another one)', () => {
    const x = c(['FITNESS_LEGS', 'BASKETBALL_SHOOTING'], 'FITNESS_LEGS');
    expect(removeCategory(x, 'FITNESS_LEGS')).toEqual(c(['BASKETBALL_SHOOTING']));
    expect(removeCategory(x, 'BASKETBALL_SHOOTING')).toEqual(c(['FITNESS_LEGS'], 'FITNESS_LEGS'));
  });
});
