import {
  COMPARISON_POLICIES,
  defaultComparisonPolicy,
  isComparisonPolicy,
  resolveComparisonPolicy,
} from '../comparison';
import { MEASUREMENT_TYPES } from '../measurement';

describe('comparison policy', () => {
  it('offers exactly LOWER, HIGHER, CUSTOM and NOT_RANKED', () => {
    expect(COMPARISON_POLICIES).toEqual([
      'LOWER_IS_BETTER',
      'HIGHER_IS_BETTER',
      'CUSTOM',
      'NOT_RANKED',
    ]);
  });

  it('defaults TIME (sprints) to lower-is-better', () => {
    expect(defaultComparisonPolicy('TIME')).toBe('LOWER_IS_BETTER');
    expect(resolveComparisonPolicy('TIME')).toBe('LOWER_IS_BETTER');
  });

  it('never treats MADE_ATTEMPTS as a plain higher-is-better scalar', () => {
    // 1/1 = 100% must not automatically beat 18/20 = 90%.
    expect(defaultComparisonPolicy('MADE_ATTEMPTS')).toBe('CUSTOM');
    expect(resolveComparisonPolicy('MADE_ATTEMPTS')).not.toBe('HIGHER_IS_BETTER');
  });

  it('has no universal default for DISTANCE, DURATION or RATING (fails closed)', () => {
    for (const type of ['DISTANCE', 'DURATION', 'RATING'] as const) {
      expect(defaultComparisonPolicy(type)).toBeNull();
      expect(() => resolveComparisonPolicy(type)).toThrow(/must declare/);
    }
  });

  it('lets an exercise declare its own policy', () => {
    expect(resolveComparisonPolicy('DURATION', 'HIGHER_IS_BETTER')).toBe('HIGHER_IS_BETTER'); // plank
    expect(resolveComparisonPolicy('DURATION', 'LOWER_IS_BETTER')).toBe('LOWER_IS_BETTER'); // timed drill
    expect(resolveComparisonPolicy('DISTANCE', 'LOWER_IS_BETTER')).toBe('LOWER_IS_BETTER');
    expect(resolveComparisonPolicy('TIME', 'NOT_RANKED')).toBe('NOT_RANKED');
    expect(resolveComparisonPolicy('RATING', 'HIGHER_IS_BETTER')).toBe('HIGHER_IS_BETTER'); // skill
    expect(resolveComparisonPolicy('RATING', 'LOWER_IS_BETTER')).toBe('LOWER_IS_BETTER'); // fatigue
    expect(resolveComparisonPolicy('RATING', 'NOT_RANKED')).toBe('NOT_RANKED'); // effort / RPE
  });

  it('does not rank COMPLETION by default', () => {
    expect(defaultComparisonPolicy('COMPLETION')).toBe('NOT_RANKED');
  });

  it('defines a default (possibly null) for every measurement type', () => {
    for (const type of MEASUREMENT_TYPES) {
      expect(defaultComparisonPolicy(type)).not.toBeUndefined();
    }
  });

  it('guards unknown values', () => {
    expect(isComparisonPolicy('CUSTOM')).toBe(true);
    expect(isComparisonPolicy('BIGGER')).toBe(false);
  });
});
