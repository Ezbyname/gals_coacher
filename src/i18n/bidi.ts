/**
 * Unicode bidi isolates. Wrapping a run in an isolate stops the surrounding
 * Hebrew (RTL) text from reordering it, so `8 / 10` never shows as `10 / 8`.
 */
export const LRI = '⁦'; // left-to-right isolate
export const FSI = '⁨'; // first-strong isolate (direction from content)
export const PDI = '⁩'; // pop directional isolate

/** Force left-to-right display for a measurement value (e.g. `18/20`, `4.38`). */
export function ltr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

/** Isolate an inserted value so it cannot reorder or be reordered by its context. */
export function isolate(text: string): string {
  return `${FSI}${text}${PDI}`;
}

const BIDI_CONTROLS = /[⁦-⁩]/g;

/** Removes isolate characters (for comparisons in tests and logs). */
export function stripBidi(text: string): string {
  return text.replace(BIDI_CONTROLS, '');
}
