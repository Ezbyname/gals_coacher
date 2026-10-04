import type { DominantHand, PrimaryPosition, SecondaryPosition } from '@/domain/basketball/profile';
import type { PlayerProfile, PlayerProfileInput } from '@/data/local/players/playerRepository';

/**
 * What the form edits: raw text for typed fields, codes for chip fields, and
 * whether Basketball is selected. The Basketball answers stay in this state
 * while Basketball is unselected (so re-selecting restores them) but are only
 * sent when it is selected.
 */
export type PlayerFormValues = {
  name: string;
  day: string;
  month: string;
  year: string;
  height: string;
  basketballSelected: boolean;
  primaryPosition: PrimaryPosition | null;
  secondaryPosition: SecondaryPosition | null;
  dominantHand: DominantHand | null;
};

export const EMPTY_FORM_VALUES: PlayerFormValues = {
  name: '',
  day: '',
  month: '',
  year: '',
  height: '',
  basketballSelected: false,
  primaryPosition: null,
  secondaryPosition: null,
  dominantHand: null,
};

export function formValuesFromProfile({ player, basketball }: PlayerProfile): PlayerFormValues {
  return {
    name: player.name,
    day: String(player.dateOfBirth.day),
    month: String(player.dateOfBirth.month),
    year: String(player.dateOfBirth.year),
    height: player.heightCm === null ? '' : String(player.heightCm),
    basketballSelected: basketball !== null,
    primaryPosition: basketball?.primaryPosition ?? null,
    secondaryPosition: basketball?.secondaryPosition ?? null,
    dominantHand: basketball?.dominantHand ?? null,
  };
}

const NUMBER_TEXT = /^[+-]?\d+(\.\d+)?$/;

/** Empty → null; a plain number → its value; anything else → NaN (the domain rejects it). */
function numberFrom(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return NUMBER_TEXT.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/**
 * Converts form state to the repository input. This only reads the form;
 * every rule (required, real date, not in the future, positive whole height,
 * position relationships) is decided by the domain validation.
 *
 * - Basketball not selected → `basketball: null` (hidden answers are dropped).
 * - Basketball selected → only primary, secondary and dominant hand. The
 *   no-longer-collected `experience` / `weeklyFrequency` are omitted (never
 *   sent as null), so the repository keeps any stored values.
 */
export function formValuesToInput(values: PlayerFormValues): PlayerProfileInput {
  const day = numberFrom(values.day);
  const month = numberFrom(values.month);
  const year = numberFrom(values.year);
  const noDate = day === null && month === null && year === null;
  return {
    player: {
      name: values.name,
      dateOfBirth: noDate
        ? null
        : { year: year ?? Number.NaN, month: month ?? Number.NaN, day: day ?? Number.NaN },
      heightCm: numberFrom(values.height),
    },
    basketball: values.basketballSelected
      ? {
          primaryPosition: values.primaryPosition,
          secondaryPosition: values.secondaryPosition,
          dominantHand: values.dominantHand,
        }
      : null,
  };
}
