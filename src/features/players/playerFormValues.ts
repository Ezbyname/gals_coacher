import {
  EMPTY_BASKETBALL_PROFILE,
  type BasketballProfile,
  type DominantHand,
  type ExperienceLevel,
  type PrimaryPosition,
  type SecondaryPosition,
  type WeeklyFrequency,
} from '@/domain/basketball/profile';
import type { PlayerProfile, PlayerProfileInput } from '@/data/local/players/playerRepository';

/** What the form edits: raw text for typed fields, codes for chip fields. */
export type PlayerFormValues = {
  name: string;
  day: string;
  month: string;
  year: string;
  height: string;
  primaryPosition: PrimaryPosition | null;
  secondaryPosition: SecondaryPosition | null;
  dominantHand: DominantHand | null;
  experience: ExperienceLevel | null;
  weeklyFrequency: WeeklyFrequency | null;
};

export const EMPTY_FORM_VALUES: PlayerFormValues = {
  name: '',
  day: '',
  month: '',
  year: '',
  height: '',
  primaryPosition: null,
  secondaryPosition: null,
  dominantHand: null,
  experience: null,
  weeklyFrequency: null,
};

export function formValuesFromProfile({ player, basketball }: PlayerProfile): PlayerFormValues {
  return {
    name: player.name,
    day: String(player.dateOfBirth.day),
    month: String(player.dateOfBirth.month),
    year: String(player.dateOfBirth.year),
    height: player.heightCm === null ? '' : String(player.heightCm),
    // The current form edits every player as a Basketball player (UI unchanged
    // in this commit); a player without Basketball starts from empty answers.
    ...(basketball ?? EMPTY_BASKETBALL_PROFILE),
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
 * Converts form text to the domain input. This only reads the text; every
 * rule (required, real date, not in the future, positive whole height, code
 * relationships) is decided by the domain validation in the repository.
 */
export function formValuesToInput(values: PlayerFormValues): PlayerProfileInput {
  const day = numberFrom(values.day);
  const month = numberFrom(values.month);
  const year = numberFrom(values.year);
  const noDate = day === null && month === null && year === null;
  const basketball: BasketballProfile = {
    primaryPosition: values.primaryPosition,
    secondaryPosition: values.secondaryPosition,
    dominantHand: values.dominantHand,
    experience: values.experience,
    weeklyFrequency: values.weeklyFrequency,
  };
  return {
    player: {
      name: values.name,
      dateOfBirth: noDate
        ? null
        : { year: year ?? Number.NaN, month: month ?? Number.NaN, day: day ?? Number.NaN },
      heightCm: numberFrom(values.height),
    },
    basketball,
  };
}
