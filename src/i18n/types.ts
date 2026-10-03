import type { he } from './he';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Shape every language dictionary must satisfy (keys of he.ts, any strings). */
export type Messages = Widen<typeof he>;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dot-path of every translatable string, e.g. 'home.quickTraining'. */
export type TranslationKey = Leaves<Messages>;

export type TranslationParams = Record<string, string | number>;
