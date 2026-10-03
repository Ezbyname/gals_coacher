import { isolate } from './bidi';
import type { Messages, TranslationKey, TranslationParams } from './types';

const PLACEHOLDER = /\{(\w+)\}/g;

function lookup(messages: Messages, key: TranslationKey): string {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') throw new Error(`Missing translation for "${key}".`);
  return node;
}

/**
 * Returns the string for `key`, replacing `{name}` placeholders. Every
 * inserted value is wrapped in a bidi isolate so numbers and Latin text keep
 * their order inside Hebrew sentences. A missing parameter throws.
 */
export function translate(
  messages: Messages,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  return lookup(messages, key).replace(PLACEHOLDER, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Missing parameter "${name}" for "${key}".`);
    return isolate(String(value));
  });
}

/** Names of the `{placeholders}` in a string (for parity checks). */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string).sort();
}
