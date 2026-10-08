import type { TaxonomyGroup } from '@/domain/taxonomy/nodes';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** Taxonomy node / group keys → translated labels (TRAIN-TAXONOMY-001). */
export const nodeLabel = (t: T, key: string) => t(`taxonomy.node.${key}` as TranslationKey);
export const groupLabel = (t: T, group: TaxonomyGroup) => t(`taxonomy.group.${group}`);

/** "Basketball › Shooting › Free Throws" — the separator mirrors on its own in Hebrew (Bidi_Mirrored). */
export const pathLabel = (t: T, keys: readonly string[]) => keys.map((k) => nodeLabel(t, k)).join(' › ');

/** Where a category lives in the app. */
export const categoryPath = (key: string) => `/exercises/categories/${key}` as const;
