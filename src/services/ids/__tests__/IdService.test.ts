import { isUuid } from '@/domain/ids';

import { createExpoIdService, createSequentialIdService } from '../IdService';

describe('IdService', () => {
  it('sequential service yields deterministic, valid UUIDs', () => {
    const ids = createSequentialIdService();
    const a = ids.newUuid();
    const b = ids.newUuid();
    expect(a).toBe('00000000-0000-4000-8000-000000000001');
    expect(b).toBe('00000000-0000-4000-8000-000000000002');
    expect(isUuid(a)).toBe(true);
    expect(isUuid(b)).toBe(true);
  });

  it('sequential instances are independent (repeatable per test)', () => {
    expect(createSequentialIdService().newUuid()).toBe(createSequentialIdService().newUuid());
  });

  it('expo service yields unique valid v4 UUIDs', () => {
    const ids = createExpoIdService();
    const generated = Array.from({ length: 50 }, () => ids.newUuid());
    expect(generated.every(isUuid)).toBe(true);
    expect(new Set(generated).size).toBe(50);
  });

  it('refuses to hand out a malformed id', () => {
    expect(() => createExpoIdService(() => 'not-a-uuid').newUuid()).toThrow(/invalid UUID/);
    expect(() => createExpoIdService(() => undefined as unknown as string).newUuid()).toThrow(
      /invalid UUID/,
    );
  });
});
