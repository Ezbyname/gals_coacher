import type { DirectionService } from '@/services/direction/DirectionService';

/** In-memory DirectionService for tests: records calls, never reloads anything. */
export function createFakeDirectionService(initialRTL: boolean, reloadImpl?: () => Promise<void>) {
  const calls: string[] = [];
  let rtl = initialRTL;
  const service: DirectionService & { calls: string[]; setNativeRTL(v: boolean): void } = {
    calls,
    setNativeRTL: (v) => {
      rtl = v;
    },
    isRTL: () => rtl,
    apply: (v) => {
      calls.push(`apply:${v ? 'rtl' : 'ltr'}`);
    },
    reload: async () => {
      calls.push('reload');
      await reloadImpl?.();
    },
  };
  return service;
}
