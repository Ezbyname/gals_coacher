import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ACTIVITY_TYPE_NAME_MAX_LENGTH,
  BUILTIN_ACTIVITY_TYPES,
  isActivityTypeId,
  isBuiltinActivityType,
  requiresTitle,
  selectableActivityTypes,
  sortActivityTypes,
  validateCustomActivityTypeName,
} from '../activityType';

const CUSTOM_A = '00000000-0000-4000-8000-0000000000a1';
const CUSTOM_B = '00000000-0000-4000-8000-0000000000b2';
const builtin = (id: (typeof BUILTIN_ACTIVITY_TYPES)[number], active = true) => ({
  id,
  builtin: id,
  createdAt: 0,
  active,
});
const custom = (id: string, createdAt: number, active = true) => ({ id, builtin: null, createdAt, active });

describe('Activity Type identity', () => {
  it('ids are built-in codes or UUIDs — never labels', () => {
    for (const code of BUILTIN_ACTIVITY_TYPES) expect(isActivityTypeId(code)).toBe(true);
    expect(isActivityTypeId(CUSTOM_A)).toBe(true);
    for (const value of ['Game', 'משחק', 'game', 'Swim', '', 'SCHOOL', null, 1]) {
      expect(isActivityTypeId(value)).toBe(false);
    }
    expect(isBuiltinActivityType(CUSTOM_A)).toBe(false);
  });

  it('only OTHER requires a title (a custom type is not OTHER)', () => {
    expect(BUILTIN_ACTIVITY_TYPES.filter(requiresTitle)).toEqual(['OTHER']);
    expect(requiresTitle(CUSTOM_A)).toBe(false);
  });
});

describe('custom type names', () => {
  it('trims and otherwise keeps the text exactly (case, inner spaces, any script)', () => {
    expect(validateCustomActivityTypeName('  שחייה  ', [])).toEqual({ ok: true, value: 'שחייה' });
    expect(validateCustomActivityTypeName(' Swim  Club ', [])).toEqual({ ok: true, value: 'Swim  Club' });
  });

  it.each([
    ['', 'REQUIRED'],
    ['   \t ', 'REQUIRED'],
    [null, 'REQUIRED'],
    ['x'.repeat(ACTIVITY_TYPE_NAME_MAX_LENGTH + 1), 'TOO_LONG'],
  ])('rejects %p as %s', (input, error) => {
    expect(validateCustomActivityTypeName(input, [])).toEqual({ ok: false, error });
  });

  it('the limit is 35 (the owner-approved Title limit), counted after trimming', () => {
    expect(ACTIVITY_TYPE_NAME_MAX_LENGTH).toBe(35);
    expect(validateCustomActivityTypeName(` ${'x'.repeat(35)} `, [])).toEqual({
      ok: true,
      value: 'x'.repeat(35),
    });
  });

  it('a duplicate of another custom name (case-insensitive, trimmed) is refused', () => {
    expect(validateCustomActivityTypeName(' swim ', ['Swim'])).toEqual({ ok: false, error: 'DUPLICATE' });
    expect(validateCustomActivityTypeName('Swim 2', ['Swim'])).toEqual({ ok: true, value: 'Swim 2' });
  });
});

describe('order and selection', () => {
  const catalog = [
    custom(CUSTOM_B, 20),
    builtin('OTHER'),
    custom(CUSTOM_A, 10, false),
    builtin('GAME', false),
    builtin('TEAM_TRAINING'),
  ];

  it('built-ins in their fixed order, then custom types by creation — whatever the input order', () => {
    expect(sortActivityTypes(catalog).map((t) => t.id)).toEqual([
      'TEAM_TRAINING',
      'GAME',
      'OTHER',
      CUSTOM_A,
      CUSTOM_B,
    ]);
    expect(sortActivityTypes([...catalog].reverse()).map((t) => t.id)).toEqual(
      sortActivityTypes(catalog).map((t) => t.id),
    );
  });

  it('a new event offers only active types', () => {
    expect(selectableActivityTypes(catalog).map((t) => t.id)).toEqual(['TEAM_TRAINING', 'OTHER', CUSTOM_B]);
  });

  it('an edited event also offers the inactive type it already has — and only that one', () => {
    expect(selectableActivityTypes(catalog, 'GAME').map((t) => t.id)).toEqual([
      'TEAM_TRAINING',
      'GAME',
      'OTHER',
      CUSTOM_B,
    ]);
    expect(selectableActivityTypes(catalog, CUSTOM_A).map((t) => t.id)).toEqual([
      'TEAM_TRAINING',
      'OTHER',
      CUSTOM_A,
      CUSTOM_B,
    ]);
  });

  it('zero active types: nothing to offer (nothing is invented or reactivated)', () => {
    expect(selectableActivityTypes([builtin('GAME', false), custom(CUSTOM_A, 1, false)])).toEqual([]);
  });
});

describe('activity type boundaries', () => {
  it('reads no clock, translates nothing and knows no sport', () => {
    const code = readFileSync(resolve(__dirname, '../activityType.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Date\.now|new Date|i18n|BASKETBALL|sport/i);
  });
});
