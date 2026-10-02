import { randomUUID } from 'expo-crypto';

import type { Uuid } from '@/domain/ids';

/** Generates the on-device id assigned before an entity's first local write. */
export function newUuid(): Uuid {
  return randomUUID() as Uuid;
}
