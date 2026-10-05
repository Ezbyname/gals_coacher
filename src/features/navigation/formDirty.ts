/**
 * Whether a form differs from the values it was opened with. Compares every
 * field by value (one level deep, which covers the forms' plain field objects
 * such as a date / time), so changing a field and changing it back is clean
 * again, and the initial values (loaded or default) are never dirty.
 */
export function isFormDirty<T extends Record<string, unknown>>(values: T, initial: T): boolean {
  return Object.keys({ ...initial, ...values }).some((key) => !sameValue(values[key], initial[key]));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}
