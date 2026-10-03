import { en } from '../en';
import { he } from '../he';
import { placeholdersOf } from '../translate';

function flatten(node: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v as object, key));
  }
  return out;
}

const heFlat = flatten(he);
const enFlat = flatten(en);

describe('translation parity', () => {
  it('Hebrew and English have exactly the same keys', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(heFlat).sort());
  });

  it('no translation is empty', () => {
    for (const [key, value] of [...Object.entries(heFlat), ...Object.entries(enFlat)]) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('each key uses the same {placeholders} in both languages', () => {
    for (const key of Object.keys(heFlat)) {
      expect({ key, placeholders: placeholdersOf(enFlat[key] as string) }).toEqual({
        key,
        placeholders: placeholdersOf(heFlat[key] as string),
      });
    }
  });

  it('uses the approved Hebrew copy', () => {
    expect(he.nav).toMatchObject({
      quickTraining: 'אימון מהיר',
      players: 'שחקנים',
      exercises: 'תרגילים',
      history: 'היסטוריה',
      diagnostics: 'בדיקות מערכת',
    });
    expect(he.exercises.libraryTitle).toBe('ספריית תרגילים');
    expect(he.home.title).toBe('🏀 מוכנים לאימון?');
    expect(he.home.subtitle).toBe('בוחרים שחקן, בוחרים תרגיל, יוצאים לדרך.');
    expect(he.common.comingSoon).toBe('בקרוב');
    expect(he.app.name).toBe('Gals Coacher');
    expect(en.app.name).toBe('Gals Coacher');
  });
});
