import type { ExternalPayload } from './plan';

/**
 * CAL-SYNC-NOTIFY-001E closure — text written into the PHONE calendar is plain text.
 *
 * In-app strings carry invisible Unicode bidi formatting controls (isolates around
 * interpolated names, marks) so Hebrew / English mix correctly on screen. Another
 * calendar app stores them verbatim, where they break search, export and comparison.
 * The phone calendar applies its own bidi algorithm to the visible text, so the
 * entry still reads correctly in Hebrew and English without them.
 * Removed: ALM U+061C, LRM/RLM U+200E-200F, embeddings/overrides U+202A-202E,
 * isolates U+2066-2069. Visible characters (Hebrew, "·", digits) are untouched.
 */
const BIDI_FORMATTING = /[؜‎‏‪-‮⁦-⁩]/g;

export function plainCalendarText(text: string): string {
  return text.replace(BIDI_FORMATTING, '');
}

/** Every persisted, searchable text field of an external entry, as plain text. */
export function plainExternalPayload(p: ExternalPayload): ExternalPayload {
  return {
    ...p,
    title: plainCalendarText(p.title),
    location: p.location === null ? null : plainCalendarText(p.location),
    notes: p.notes === null ? null : plainCalendarText(p.notes),
  };
}
