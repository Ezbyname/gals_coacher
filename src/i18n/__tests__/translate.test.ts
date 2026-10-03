import { FSI, PDI, stripBidi } from '../bidi';
import { en } from '../en';
import { he } from '../he';
import { placeholdersOf, translate } from '../translate';

describe('translate', () => {
  it('looks up nested keys per language', () => {
    expect(translate(he, 'nav.quickTraining')).toBe('אימון מהיר');
    expect(translate(en, 'nav.quickTraining')).toBe('Quick Training');
  });

  it('interpolates parameters, each wrapped in a first-strong isolate', () => {
    const text = translate(en, 'diagnostics.sqliteReady', { version: 1, applied: 0 });
    expect(text).toBe(`ready · schema v${FSI}1${PDI} (applied this launch: ${FSI}0${PDI})`);
    expect(stripBidi(translate(he, 'diagnostics.sqliteReady', { version: 1, applied: 1 }))).toBe(
      'מוכן · סכמה v1 (הוחלו בהפעלה זו: 1)',
    );
  });

  it('throws on a missing parameter instead of showing a raw placeholder', () => {
    expect(() => translate(en, 'diagnostics.sqliteError')).toThrow(/Missing parameter "message"/);
  });

  it('throws on an unknown key', () => {
    // @ts-expect-error deliberately invalid key
    expect(() => translate(en, 'nav.nope')).toThrow(/Missing translation/);
  });

  it('lists placeholders', () => {
    expect(placeholdersOf('a {x} b {y}')).toEqual(['x', 'y']);
    expect(placeholdersOf('none')).toEqual([]);
  });
});
