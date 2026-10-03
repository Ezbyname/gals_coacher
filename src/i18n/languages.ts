import { en } from './en';
import { he } from './he';
import type { Messages } from './types';

export const LANGUAGES = ['he', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Fresh installs always start in Hebrew, whatever the OS language is. */
export const DEFAULT_LANGUAGE: Language = 'he';

export type Direction = 'rtl' | 'ltr';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function directionFor(language: Language): Direction {
  return language === 'he' ? 'rtl' : 'ltr';
}

const MESSAGES: Record<Language, Messages> = { he, en };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

/**
 * What to do at startup, given the direction the language needs, the
 * direction the native layer is using, and the target of a reload already
 * attempted (the loop guard).
 *
 * - `render`: directions match.
 * - `reload`: mismatch, not yet attempted for this target — apply and reload once.
 * - `render-mismatch`: mismatch even though a reload for this target was already
 *   attempted — never reload again; render and expose the mismatch.
 */
export type DirectionPlan = { action: 'render' } | { action: 'reload'; target: Direction } | { action: 'render-mismatch' };

export function planDirection(
  target: Direction,
  nativeDirection: Direction,
  attemptedTarget: Direction | null,
): DirectionPlan {
  if (nativeDirection === target) return { action: 'render' };
  if (attemptedTarget === target) return { action: 'render-mismatch' };
  return { action: 'reload', target };
}
