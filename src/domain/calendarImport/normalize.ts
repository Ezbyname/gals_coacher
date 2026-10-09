/**
 * CAL-TEXT-IMPORT-001A — text normalization for pasted schedules (WhatsApp).
 *
 * Only spelling variants are unified; no meaning is added. Regexes avoid
 * lookbehind and Unicode property escapes so behaviour is the same in Jest
 * (Node) and on the device (Hermes).
 */

/** Hebrew letters, including final forms (א…ת). */
export const HEBREW_LETTER = 'א-ת';

const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;
const DASHES = /[‐-―−﹘﹣－]/g;
// Geresh (׳) look-alikes typed on phones: apostrophes, single quotes, backtick.
const GERESH_LIKE = /['‘’`´]/g;
// Gershayim (״) look-alikes: straight / curly double quotes.
const GERSHAYIM_LIKE = /["“”]/g;
const NBSP = /[   ]/g;
// Emoji and their modifiers. Removed for matching; never interpreted.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;

/** The location pin, read before emoji are removed (it can introduce a location line). */
export const LOCATION_PIN = '\u{1F4CD}';

export const GERESH = '׳';
export const GERSHAYIM = '״';

/** Whole-message normalization: line breaks, direction marks, dashes, quotes, spaces. */
export function normalizeMessage(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(BIDI_CONTROLS, '')
    .replace(DASHES, '-')
    .replace(GERESH_LIKE, GERESH)
    .replace(GERSHAYIM_LIKE, GERSHAYIM)
    .replace(NBSP, ' ');
}

/** One line for matching: emoji removed, spaces collapsed, trimmed. */
export function cleanLine(line: string): string {
  return line.replace(EMOJI, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function isHebrewLetter(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  return code >= 0x05d0 && code <= 0x05ea;
}

export function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}
