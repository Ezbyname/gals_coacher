import { randomUUID } from 'expo-crypto';

import { isUuid, type Uuid } from '@/domain/ids';

/**
 * Generates the on-device id assigned before an entity's first local write.
 * Injected through Services so tests can use deterministic ids; local-first
 * writes, outbox retries and idempotent cloud upserts all depend on it.
 */
export interface IdService {
  newUuid(): Uuid;
}

export function createExpoIdService(generate: () => string = randomUUID): IdService {
  return {
    newUuid: () => {
      const id = generate();
      // Never let a malformed id reach storage: ids are the idempotency key for sync.
      if (!isUuid(id)) throw new Error(`ID generator returned an invalid UUID: ${String(id)}`);
      return id;
    },
  };
}

/**
 * Deterministic ids for tests: valid v4-shaped UUIDs numbered 1, 2, 3…
 * (`00000000-0000-4000-8000-000000000001`).
 */
export function createSequentialIdService(): IdService {
  let n = 0;
  return {
    newUuid: () => {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Uuid;
    },
  };
}
