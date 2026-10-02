import { MEASUREMENT_TYPES, isMeasurementType } from '../measurement';
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
