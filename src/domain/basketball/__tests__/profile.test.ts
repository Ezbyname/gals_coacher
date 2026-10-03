import {
  DOMINANT_HANDS,
  EMPTY_BASKETBALL_PROFILE,
  EXPERIENCE_LEVELS,
  PRIMARY_POSITIONS,
  SECONDARY_POSITIONS,
  WEEKLY_FREQUENCIES,
  validateBasketballProfile,
} from '../profile';

describe('basketball profile codes', () => {
  it('defines exactly the approved codes', () => {
    expect(PRIMARY_POSITIONS).toEqual(['PG', 'SG', 'SF', 'PF', 'C', 'MULTIPLE', 'NOT_SURE']);
    expect(SECONDARY_POSITIONS).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
    expect(DOMINANT_HANDS).toEqual(['RIGHT', 'LEFT', 'BOTH']);
    expect(EXPERIENCE_LEVELS).toEqual(['LESS_THAN_ONE_YEAR', 'ONE_TO_TWO_YEARS', 'THREE_PLUS_YEARS']);
    expect(WEEKLY_FREQUENCIES).toEqual(['ZERO_TO_ONE', 'TWO_TO_THREE', 'FOUR_TO_FIVE', 'SIX_PLUS']);
  });
});

describe('validateBasketballProfile', () => {
  it('accepts a completely empty profile', () => {
    expect(validateBasketballProfile({})).toEqual({ ok: true, value: EMPTY_BASKETBALL_PROFILE });
    expect(validateBasketballProfile(EMPTY_BASKETBALL_PROFILE)).toEqual({
      ok: true,
      value: EMPTY_BASKETBALL_PROFILE,
    });
  });

  it('accepts every allowed code', () => {
    for (const primaryPosition of PRIMARY_POSITIONS) {
      expect(validateBasketballProfile({ primaryPosition }).ok).toBe(true);
    }
    for (const dominantHand of DOMINANT_HANDS) {
      expect(validateBasketballProfile({ dominantHand }).ok).toBe(true);
    }
    for (const experience of EXPERIENCE_LEVELS) {
      expect(validateBasketballProfile({ experience }).ok).toBe(true);
    }
    for (const weeklyFrequency of WEEKLY_FREQUENCIES) {
      expect(validateBasketballProfile({ weeklyFrequency }).ok).toBe(true);
    }
    for (const secondaryPosition of SECONDARY_POSITIONS) {
      const primaryPosition = secondaryPosition === 'PG' ? 'C' : 'PG';
      expect(validateBasketballProfile({ primaryPosition, secondaryPosition }).ok).toBe(true);
    }
  });

  it('returns the full validated profile', () => {
    expect(
      validateBasketballProfile({
        primaryPosition: 'SG',
        secondaryPosition: 'SF',
        dominantHand: 'LEFT',
        experience: 'ONE_TO_TWO_YEARS',
        weeklyFrequency: 'TWO_TO_THREE',
      }),
    ).toEqual({
      ok: true,
      value: {
        primaryPosition: 'SG',
        secondaryPosition: 'SF',
        dominantHand: 'LEFT',
        experience: 'ONE_TO_TWO_YEARS',
        weeklyFrequency: 'TWO_TO_THREE',
      },
    });
  });

  it('rejects unknown codes, including free text and wrong case', () => {
    expect(
      validateBasketballProfile({
        primaryPosition: 'CENTER',
        dominantHand: 'right',
        experience: 'TEN_YEARS',
        weeklyFrequency: '',
      }),
    ).toEqual({
      ok: false,
      errors: {
        primaryPosition: 'UNKNOWN_CODE',
        dominantHand: 'UNKNOWN_CODE',
        experience: 'UNKNOWN_CODE',
        weeklyFrequency: 'UNKNOWN_CODE',
      },
    });
  });

  it('rejects MULTIPLE / NOT_SURE as a secondary position code', () => {
    for (const secondaryPosition of ['MULTIPLE', 'NOT_SURE', 'XX']) {
      expect(validateBasketballProfile({ primaryPosition: 'PG', secondaryPosition })).toEqual({
        ok: false,
        errors: { secondaryPosition: 'UNKNOWN_CODE' },
      });
    }
  });

  it('accepts a specific primary with no secondary', () => {
    expect(validateBasketballProfile({ primaryPosition: 'PF', secondaryPosition: null })).toEqual({
      ok: true,
      value: { ...EMPTY_BASKETBALL_PROFILE, primaryPosition: 'PF' },
    });
  });

  it('accepts a secondary that differs from the primary', () => {
    expect(validateBasketballProfile({ primaryPosition: 'PG', secondaryPosition: 'SG' }).ok).toBe(true);
  });

  it('rejects a secondary equal to the primary', () => {
    for (const position of SECONDARY_POSITIONS) {
      expect(validateBasketballProfile({ primaryPosition: position, secondaryPosition: position })).toEqual({
        ok: false,
        errors: { secondaryPosition: 'SAME_AS_PRIMARY' },
      });
    }
  });

  it.each(['MULTIPLE', 'NOT_SURE'])('rejects a secondary when the primary is %s', (primaryPosition) => {
    expect(validateBasketballProfile({ primaryPosition, secondaryPosition: 'SG' })).toEqual({
      ok: false,
      errors: { secondaryPosition: 'REQUIRES_SPECIFIC_PRIMARY' },
    });
  });

  it('rejects a secondary without a primary', () => {
    expect(validateBasketballProfile({ secondaryPosition: 'SG' })).toEqual({
      ok: false,
      errors: { secondaryPosition: 'REQUIRES_SPECIFIC_PRIMARY' },
    });
    expect(validateBasketballProfile({ primaryPosition: null, secondaryPosition: 'SG' })).toEqual({
      ok: false,
      errors: { secondaryPosition: 'REQUIRES_SPECIFIC_PRIMARY' },
    });
  });
});
