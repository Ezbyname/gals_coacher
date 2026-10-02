import { MEASUREMENT_TYPES, isMeasurementType, resultDirection } from '../measurement';
import { isUuid } from '../ids';

describe('measurement types', () => {
  it('defines exactly the V1 generic measurement types', () => {
    expect(MEASUREMENT_TYPES).toEqual([
      'TIME',
      'DURATION',
      'REPETITIONS',
      'MADE_ATTEMPTS',
      'DISTANCE',
      'RATING',
      'COMPLETION',
    ]);
  });

  it('treats sprint-style TIME as lower-is-better', () => {
    expect(resultDirection('TIME')).toBe('LOWER_IS_BETTER');
  });

  it('treats held DURATION (plank) and counts as higher-is-better', () => {
    expect(resultDirection('DURATION')).toBe('HIGHER_IS_BETTER');
    expect(resultDirection('REPETITIONS')).toBe('HIGHER_IS_BETTER');
    expect(resultDirection('MADE_ATTEMPTS')).toBe('HIGHER_IS_BETTER');
  });

  it('does not rank COMPLETION', () => {
    expect(resultDirection('COMPLETION')).toBe('NOT_RANKED');
  });

  it('guards unknown values', () => {
    expect(isMeasurementType('MADE_ATTEMPTS')).toBe(true);
    expect(isMeasurementType('FREE_THROWS')).toBe(false);
    expect(isMeasurementType(3)).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts v4 UUIDs and rejects junk', () => {
    expect(isUuid('3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0c3a')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
