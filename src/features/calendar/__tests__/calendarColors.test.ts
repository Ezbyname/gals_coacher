import { BUILTIN_ACTIVITY_TYPES } from '@/domain/activityType';

import {
  CUSTOM_TYPE_PALETTE,
  TYPE_COLORS,
  TYPE_GLYPHS,
  activityTypeColor,
  activityTypeGlyph,
  customTypeColor,
  stableHash,
} from '../calendarColors';

const ID_A = '00000000-0000-4000-8000-0000000000a1';
const ID_B = '00000000-0000-4000-8000-0000000000b2';

describe('activity type colours (CAL-COLOR-001 + ACTIVITY-001)', () => {
  it('the six built-ins keep their fixed colours and glyphs', () => {
    expect(TYPE_COLORS).toEqual({
      TEAM_TRAINING: '#1F5FA8',
      PERSONAL_TRAINING: '#6A3FA0',
      GAME: '#B0303F',
      GYM: '#A65400',
      RECOVERY: '#2E7D32',
      OTHER: '#546E7A',
    });
    for (const id of BUILTIN_ACTIVITY_TYPES) {
      expect(activityTypeColor({ id, builtin: id })).toBe(TYPE_COLORS[id]);
      expect(activityTypeGlyph({ builtin: id, name: null })).toBe(TYPE_GLYPHS[id]);
    }
  });

  it('a custom colour is a fixed function of the id (a known hash value; same id → same colour)', () => {
    expect(stableHash('')).toBe(0x811c9dc5);
    expect(stableHash('a')).toBe(0xe40c292c); // FNV-1a reference value
    expect(customTypeColor(ID_A)).toBe(CUSTOM_TYPE_PALETTE[stableHash(ID_A) % CUSTOM_TYPE_PALETTE.length]);
    expect(customTypeColor(ID_A)).toBe(customTypeColor(ID_A));
    expect(CUSTOM_TYPE_PALETTE).toContain(customTypeColor(ID_B));
  });

  it('the name never decides the colour: same id, any name → same colour', () => {
    const colours = ['Swim', 'שחייה', 'Something else', ''].map((name) =>
      activityTypeColor({ id: ID_A, builtin: null, ...{ name } }),
    );
    expect(new Set(colours).size).toBe(1);
  });

  it('spreads over the palette and never takes a built-in colour', () => {
    const ids = Array.from(
      { length: 64 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(new Set(ids.map(customTypeColor)).size).toBeGreaterThan(4);
    for (const colour of CUSTOM_TYPE_PALETTE) expect(Object.values(TYPE_COLORS)).not.toContain(colour);
  });

  it('a custom marker is its name’s initial: readable without colour', () => {
    expect(activityTypeGlyph({ builtin: null, name: 'swim' })).toBe('S');
    expect(activityTypeGlyph({ builtin: null, name: 'שחייה' })).toBe('ש');
  });
});
