import { FSI, LRI, PDI, isolate, ltr, stripBidi } from '../bidi';
import { he } from '../he';
import { translate } from '../translate';

describe('bidi helpers', () => {
  it('ltr wraps a value in a left-to-right isolate', () => {
    expect(ltr('8 / 10')).toBe(`${LRI}8 / 10${PDI}`);
  });

  it('isolate wraps a value in a first-strong isolate', () => {
    expect(isolate('4.38')).toBe(`${FSI}4.38${PDI}`);
  });

  it('stripBidi removes only isolate controls', () => {
    expect(stripBidi(`${LRI}18/20${PDI} ${FSI}x${PDI}`)).toBe('18/20 x');
  });

  it('keeps sports measurements in logical order inside Hebrew text', () => {
    const values = { shots: ltr('18/20'), percent: ltr('80%'), sprint: ltr('4.38'), rest: ltr('00:45'), distance: ltr('20m') };
    const text = translate(he, 'diagnostics.rtlSampleValue', values);
    for (const v of ['18/20', '80%', '4.38', '00:45', '20m']) {
      // Each value is present unchanged and enclosed in an LTR isolate.
      expect(text).toContain(`${LRI}${v}${PDI}`);
    }
    expect(stripBidi(text)).toBe('קליעות 18/20 · אחוז 80% · ספרינט 4.38 שנ׳ · מנוחה 00:45 · מרחק 20m');
  });
});
