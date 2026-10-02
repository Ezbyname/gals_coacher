/**
 * Branded UUID types. Every syncable entity gets its UUID on-device before its
 * first write (docs/ARCHITECTURE.md §"Local-first & sync"), so retries upsert
 * instead of duplicating.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Uuid = Brand<string, 'Uuid'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): value is Uuid {
  return UUID_RE.test(value);
}
