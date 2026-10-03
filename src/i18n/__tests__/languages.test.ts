import { en } from '../en';
import { he } from '../he';
import { DEFAULT_LANGUAGE, directionFor, isLanguage, messagesFor, planDirection } from '../languages';

describe('languages', () => {
  it('defaults to Hebrew', () => {
    expect(DEFAULT_LANGUAGE).toBe('he');
  });

  it('maps Hebrew to RTL and English to LTR', () => {
    expect(directionFor('he')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it('recognises only supported languages', () => {
    expect(isLanguage('he')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it('returns the dictionary for each language', () => {
    expect(messagesFor('he')).toBe(he);
    expect(messagesFor('en')).toBe(en);
  });
});

describe('planDirection', () => {
  it('renders when the native direction already matches', () => {
    expect(planDirection('rtl', 'rtl', null)).toEqual({ action: 'render' });
    expect(planDirection('ltr', 'ltr', 'ltr')).toEqual({ action: 'render' });
  });

  it('reloads once on a mismatch that has not been attempted', () => {
    expect(planDirection('rtl', 'ltr', null)).toEqual({ action: 'reload', target: 'rtl' });
    expect(planDirection('ltr', 'rtl', null)).toEqual({ action: 'reload', target: 'ltr' });
  });

  it('reloads when the earlier attempt was for the other direction', () => {
    expect(planDirection('rtl', 'ltr', 'ltr')).toEqual({ action: 'reload', target: 'rtl' });
  });

  it('never reloads again for a target already attempted (loop guard)', () => {
    expect(planDirection('rtl', 'ltr', 'rtl')).toEqual({ action: 'render-mismatch' });
    expect(planDirection('ltr', 'rtl', 'ltr')).toEqual({ action: 'render-mismatch' });
  });
});
