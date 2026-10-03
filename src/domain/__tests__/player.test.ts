import type { CalendarDate } from '../calendarDate';
import { validatePlayerCore, type PlayerCoreInput } from '../player';

// `today` is always passed explicitly; nothing reads the clock or timezone.
const today: CalendarDate = { year: 2026, month: 10, day: 3 };

const valid: PlayerCoreInput = {
  name: 'גל',
  dateOfBirth: { year: 2015, month: 7, day: 9 },
};

describe('validatePlayerCore', () => {
  it('accepts a valid name and date of birth', () => {
    expect(validatePlayerCore(valid, today)).toEqual({
      ok: true,
      value: { name: 'גל', dateOfBirth: { year: 2015, month: 7, day: 9 }, heightCm: null },
    });
  });

  it('requires only name and date of birth', () => {
    const result = validatePlayerCore({ name: 'Noa', dateOfBirth: { year: 2014, month: 1, day: 1 } }, today);
    expect(result.ok).toBe(true);

    const empty = validatePlayerCore({ name: '', dateOfBirth: null }, today);
    expect(empty).toEqual({ ok: false, errors: { name: 'REQUIRED', dateOfBirth: 'REQUIRED' } });
  });

  describe('name', () => {
    it('rejects an empty name', () => {
      expect(validatePlayerCore({ ...valid, name: '' }, today)).toEqual({
        ok: false,
        errors: { name: 'REQUIRED' },
      });
    });

    it('rejects a whitespace-only name', () => {
      expect(validatePlayerCore({ ...valid, name: ' \t\n  ' }, today)).toEqual({
        ok: false,
        errors: { name: 'REQUIRED' },
      });
    });

    it('trims the name', () => {
      const result = validatePlayerCore({ ...valid, name: '  Gal Cohen  ' }, today);
      expect(result.ok && result.value.name).toBe('Gal Cohen');
    });
  });

  describe('date of birth', () => {
    it('is required', () => {
      expect(validatePlayerCore({ ...valid, dateOfBirth: null }, today)).toEqual({
        ok: false,
        errors: { dateOfBirth: 'REQUIRED' },
      });
    });

    it('rejects an impossible date', () => {
      for (const dateOfBirth of [
        { year: 2025, month: 2, day: 29 },
        { year: 2015, month: 2, day: 31 },
        { year: 2015, month: 13, day: 1 },
        { year: 2015, month: 1, day: 0 },
        { year: 2015, month: Number.NaN, day: 1 },
      ]) {
        expect(validatePlayerCore({ ...valid, dateOfBirth }, today)).toEqual({
          ok: false,
          errors: { dateOfBirth: 'INVALID_DATE' },
        });
      }
    });

    it('rejects a future date', () => {
      for (const dateOfBirth of [
        { year: 2026, month: 10, day: 4 },
        { year: 2026, month: 11, day: 1 },
        { year: 2027, month: 1, day: 1 },
      ]) {
        expect(validatePlayerCore({ ...valid, dateOfBirth }, today)).toEqual({
          ok: false,
          errors: { dateOfBirth: 'IN_FUTURE' },
        });
      }
    });

    it('accepts a date of birth equal to today', () => {
      const result = validatePlayerCore({ ...valid, dateOfBirth: { ...today } }, today);
      expect(result).toEqual({ ok: true, value: { name: 'גל', dateOfBirth: today, heightCm: null } });
    });

    it('has no minimum year or age limit', () => {
      expect(validatePlayerCore({ ...valid, dateOfBirth: { year: 1890, month: 5, day: 5 } }, today).ok).toBe(
        true,
      );
    });
  });

  describe('height', () => {
    it('may be omitted or null', () => {
      expect(validatePlayerCore(valid, today).ok).toBe(true);
      const result = validatePlayerCore({ ...valid, heightCm: null }, today);
      expect(result.ok && result.value.heightCm).toBeNull();
    });

    it('accepts a positive whole number', () => {
      for (const heightCm of [1, 142, 350]) {
        const result = validatePlayerCore({ ...valid, heightCm }, today);
        expect(result.ok && result.value.heightCm).toBe(heightCm);
      }
    });

    it.each([
      ['zero', 0],
      ['negative', -140],
      ['non-integer', 142.5],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('rejects %s', (_label, heightCm) => {
      expect(validatePlayerCore({ ...valid, heightCm }, today)).toEqual({
        ok: false,
        errors: { heightCm: 'NOT_POSITIVE_INTEGER' },
      });
    });
  });
});
