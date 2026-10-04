import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SPORTS } from '../sport';
import * as selfAssessmentModule from '../selfAssessment';
import {
  SELF_RATINGS,
  isSelfRating,
  selfAssessmentCategories,
  validateSelfAssessment,
  type SelfAssessmentInput,
} from '../selfAssessment';

const TAKEN_AT = new Date(2026, 9, 4, 18, 30).getTime();
const ORDER = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];

/** A complete Basketball assessment; `overrides` replaces single answers. */
function basketball(
  overrides: Record<string, number | null | undefined> = {},
  extra: SelfAssessmentInput['ratings'] = [],
): SelfAssessmentInput {
  const values: Record<string, number | null | undefined> = {
    SHOOTING: 3,
    BALL_HANDLING: 2,
    PASSING: 4,
    FINISHING: 1,
    DEFENSE: 5,
    SPEED: 3,
    ...overrides,
  };
  return {
    sport: 'BASKETBALL',
    takenAt: TAKEN_AT,
    ratings: [...ORDER.map((category) => ({ category, rating: values[category] })), ...extra],
  };
}

const errorsOf = (input: SelfAssessmentInput) => {
  const result = validateSelfAssessment(input);
  if (result.ok) throw new Error('expected invalid');
  return result.errors;
};

describe('SelfRating', () => {
  it('is exactly 1, 2, 3, 4, 5', () => {
    expect(SELF_RATINGS).toEqual([1, 2, 3, 4, 5]);
    for (const value of SELF_RATINGS) expect(isSelfRating(value)).toBe(true);
  });

  it.each([0, 6, -1, 2.5, 1.0000001, Number.NaN, Infinity, -Infinity, null, undefined, '3', true])(
    'rejects %p',
    (value) => {
      expect(isSelfRating(value)).toBe(false);
    },
  );
});

describe('selfAssessmentCategories', () => {
  it('Basketball has the six categories in canonical order', () => {
    expect(selfAssessmentCategories('BASKETBALL')).toEqual(ORDER);
  });

  it('no other sport has a self-assessment today', () => {
    for (const sport of SPORTS.filter((s) => s !== 'BASKETBALL')) {
      expect(selfAssessmentCategories(sport)).toBeNull();
    }
  });
});

describe('validateSelfAssessment — valid', () => {
  it('accepts all six Basketball categories answered once with 1–5', () => {
    expect(validateSelfAssessment(basketball())).toEqual({
      ok: true,
      value: {
        sport: 'BASKETBALL',
        takenAt: TAKEN_AT,
        ratings: [
          { category: 'SHOOTING', rating: 3 },
          { category: 'BALL_HANDLING', rating: 2 },
          { category: 'PASSING', rating: 4 },
          { category: 'FINISHING', rating: 1 },
          { category: 'DEFENSE', rating: 5 },
          { category: 'SPEED', rating: 3 },
        ],
      },
    });
  });

  it.each([1, 5])('accepts the boundary rating %p everywhere', (rating) => {
    const all = Object.fromEntries(ORDER.map((c) => [c, rating]));
    const result = validateSelfAssessment(basketball(all));
    expect(result.ok && result.value.ratings.every((r) => r.rating === rating)).toBe(true);
  });

  it('accepts answers in any order and returns them in the canonical Basketball order', () => {
    const shuffled = [...basketball().ratings].reverse();
    expect(shuffled.map((r) => r.category)).not.toEqual(ORDER);
    const result = validateSelfAssessment({ sport: 'BASKETBALL', takenAt: TAKEN_AT, ratings: shuffled });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ratings.map((r) => r.category)).toEqual(ORDER);
    expect(result.value.ratings.find((r) => r.category === 'DEFENSE')!.rating).toBe(5);
  });

  it('does not change the caller input', () => {
    const input = basketball();
    const copy = JSON.parse(JSON.stringify(input));
    validateSelfAssessment(input);
    expect(input).toEqual(copy);
  });
});

describe('validateSelfAssessment — ratings', () => {
  it.each([0, 6, -1, 2.5, Number.NaN, Infinity])('rejects rating %p as INVALID_RATING', (rating) => {
    expect(errorsOf(basketball({ PASSING: rating }))).toEqual({ categories: { PASSING: 'INVALID_RATING' } });
  });

  it('rejects a null answer as unanswered (MISSING)', () => {
    expect(errorsOf(basketball({ SPEED: null }))).toEqual({ categories: { SPEED: 'MISSING' } });
  });

  it('rejects an undefined answer as unanswered (MISSING)', () => {
    expect(errorsOf(basketball({ SHOOTING: undefined }))).toEqual({ categories: { SHOOTING: 'MISSING' } });
  });

  it('reports every problem category at once (so a form can mark each one)', () => {
    expect(errorsOf(basketball({ SHOOTING: null, DEFENSE: 0, SPEED: 7 }))).toEqual({
      categories: { SHOOTING: 'MISSING', DEFENSE: 'INVALID_RATING', SPEED: 'INVALID_RATING' },
    });
  });
});

describe('validateSelfAssessment — category set', () => {
  it('rejects a missing category (incomplete assessment)', () => {
    const input = basketball();
    const withoutFinishing = { ...input, ratings: input.ratings.filter((r) => r.category !== 'FINISHING') };
    expect(errorsOf(withoutFinishing)).toEqual({ categories: { FINISHING: 'MISSING' } });
  });

  it('rejects empty ratings, naming every category as missing', () => {
    expect(errorsOf({ sport: 'BASKETBALL', takenAt: TAKEN_AT, ratings: [] })).toEqual({
      ratings: 'EMPTY',
      categories: Object.fromEntries(ORDER.map((c) => [c, 'MISSING'])),
    });
  });

  it('rejects an unknown category', () => {
    expect(errorsOf(basketball({}, [{ category: 'DUNKING', rating: 4 }]))).toEqual({
      categories: { DUNKING: 'UNKNOWN_CATEGORY' },
    });
  });

  it('rejects a duplicate category, even with the same rating', () => {
    expect(errorsOf(basketball({}, [{ category: 'SHOOTING', rating: 3 }]))).toEqual({
      categories: { SHOOTING: 'DUPLICATE' },
    });
  });

  it('rejects a seventh (extra) category', () => {
    expect(errorsOf(basketball({}, [{ category: 'REBOUNDING', rating: 2 }])).categories).toEqual({
      REBOUNDING: 'UNKNOWN_CATEGORY',
    });
  });

  it('rejects categories of another (future) sport', () => {
    expect(errorsOf(basketball({}, [{ category: 'SERVE', rating: 3 }])).categories).toEqual({
      SERVE: 'UNKNOWN_CATEGORY',
    });
  });

  it('category codes are case-sensitive stable codes, not labels', () => {
    const input = basketball();
    const lower = {
      ...input,
      ratings: input.ratings.map((r) => ({ ...r, category: r.category.toLowerCase() })),
    };
    const errors = errorsOf(lower);
    expect(errors.categories!.shooting).toBe('UNKNOWN_CATEGORY');
    expect(errors.categories!.SHOOTING).toBe('MISSING');
  });
});

describe('validateSelfAssessment — prototype-like category codes', () => {
  const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

  it('rejects a complete assessment plus "__proto__" as an own UNKNOWN_CATEGORY error', () => {
    const result = validateSelfAssessment(basketball({}, [{ category: '__proto__', rating: 3 }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const categories = result.errors.categories!;
    expect(Object.keys(categories)).toEqual(['__proto__']);
    expect(hasOwn(categories, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(categories, '__proto__')?.value).toBe('UNKNOWN_CATEGORY');
    // The error object's own prototype was not replaced.
    expect(Object.getPrototypeOf(categories)).toBe(Object.prototype);
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__'])(
    'rejects %p as an own UNKNOWN_CATEGORY error',
    (category) => {
      const result = validateSelfAssessment(basketball({}, [{ category, rating: 3 }]));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(Object.keys(result.errors.categories!)).toEqual([category]);
      expect(Object.getOwnPropertyDescriptor(result.errors.categories!, category)?.value).toBe(
        'UNKNOWN_CATEGORY',
      );
    },
  );

  it('"__proto__" alone is reported next to the six missing categories', () => {
    const result = validateSelfAssessment({
      sport: 'BASKETBALL',
      takenAt: TAKEN_AT,
      ratings: [{ category: '__proto__', rating: 3 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors.categories!).sort()).toEqual(['__proto__', ...ORDER].sort());
  });
});

describe('validateSelfAssessment — sport', () => {
  it.each(['FOOTBALL', 'TENNIS', 'basketball', 'CHESS', ''])('rejects unsupported sport %p', (sport) => {
    expect(errorsOf({ ...basketball(), sport })).toEqual({ sport: 'UNSUPPORTED_SPORT' });
  });
});

describe('validateSelfAssessment — takenAt', () => {
  it.each([TAKEN_AT, 0, -86_400_000])('accepts the whole-millisecond timestamp %p', (takenAt) => {
    const result = validateSelfAssessment({ ...basketball(), takenAt });
    expect(result.ok && result.value.takenAt).toBe(takenAt);
  });

  it.each([Number.NaN, Infinity, -Infinity, TAKEN_AT + 0.5, Number.MAX_SAFE_INTEGER + 2])(
    'rejects %p as INVALID_TIMESTAMP',
    (takenAt) => {
      expect(errorsOf({ ...basketball(), takenAt })).toEqual({ takenAt: 'INVALID_TIMESTAMP' });
    },
  );
});

describe('self-assessment stays subjective and un-aggregated', () => {
  it('exports no total / average / score / level / grade / gap / comparison API', () => {
    const names = Object.keys(selfAssessmentModule);
    expect(names.sort()).toEqual(
      ['SELF_RATINGS', 'isSelfRating', 'selfAssessmentCategories', 'validateSelfAssessment'].sort(),
    );
    for (const name of names) {
      expect(name).not.toMatch(/score|average|mean|total|sum|level|grade|gap|percent|compare|rank/i);
    }
  });

  it.each(['../selfAssessment.ts', '../basketball/selfAssessment.ts'])(
    '%s does not depend on measurements, comparison or MeasurementType.RATING',
    (file) => {
      const code = readFileSync(resolve(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/measurement|comparison|MeasurementType|['"]RATING['"]/i);
      expect(code).not.toMatch(/Date\.now|new Date|wallNow|clock/i);
    },
  );
});
