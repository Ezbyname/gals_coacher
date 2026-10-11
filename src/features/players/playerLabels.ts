import type { BasketballProfileErrors, DominantHand, PrimaryPosition } from '@/domain/basketball/profile';
import type { PlayerCoreErrors } from '@/domain/player';
import type { PlayerProfileErrors } from '@/data/local/players/playerRepository';
import type { TranslationKey, TranslationParams } from '@/i18n/types';

type T = (key: TranslationKey, params?: TranslationParams) => string;

const SPECIFIC_POSITIONS = new Set<PrimaryPosition | null>(['PG', 'SG', 'SF', 'PF', 'C']);

/** A concrete position (PG–C): only these can have a secondary position. */
export const isSpecificPosition = (code: PrimaryPosition | null): boolean => SPECIFIC_POSITIONS.has(code);

/** `PG · רכז`: the abbreviation stays an isolated left-to-right run; MULTIPLE/NOT_SURE have none. */
export function positionLabel(t: T, code: PrimaryPosition): string {
  const name = t(`basketball.position.${code}`);
  return isSpecificPosition(code) ? t('basketball.positionWithCode', { code, name }) : name;
}

export const handLabel = (t: T, code: DominantHand) => t(`basketball.hand.${code}`);

// Domain error code → message. Exhaustive: a new domain code fails to compile until mapped.
const NAME: Record<NonNullable<PlayerCoreErrors['name']>, TranslationKey> = {
  REQUIRED: 'players.errors.nameRequired',
};
const DATE_OF_BIRTH: Record<NonNullable<PlayerCoreErrors['dateOfBirth']>, TranslationKey> = {
  REQUIRED: 'players.errors.dateOfBirthRequired',
  INVALID_DATE: 'players.errors.dateOfBirthInvalid',
  IN_FUTURE: 'players.errors.dateOfBirthFuture',
};
const HEIGHT: Record<NonNullable<PlayerCoreErrors['heightCm']>, TranslationKey> = {
  NOT_POSITIVE_INTEGER: 'players.errors.heightInvalid',
};
const TEAM_NAME: Record<NonNullable<PlayerCoreErrors['teamName']>, TranslationKey> = {
  TOO_LONG: 'players.errors.teamNameTooLong',
};
const SECONDARY: Record<NonNullable<BasketballProfileErrors['secondaryPosition']>, TranslationKey> = {
  UNKNOWN_CODE: 'players.errors.choiceInvalid',
  REQUIRES_SPECIFIC_PRIMARY: 'players.errors.secondaryNeedsPrimary',
  SAME_AS_PRIMARY: 'players.errors.secondarySameAsPrimary',
};
const UNKNOWN_CODE: Record<'UNKNOWN_CODE', TranslationKey> = { UNKNOWN_CODE: 'players.errors.choiceInvalid' };

export type PlayerFieldMessages = Partial<
  Record<'name' | 'dateOfBirth' | 'height' | 'teamName' | 'primaryPosition' | 'secondaryPosition' | 'dominantHand', string>
>;

/**
 * Localized message per form field for the domain's validation errors. The
 * form never sends experience / weeklyFrequency, so those cannot fail here.
 */
export function fieldMessages(t: T, errors: PlayerProfileErrors): PlayerFieldMessages {
  const { player = {}, basketball = {} } = errors;
  const out: PlayerFieldMessages = {};
  if (player.name) out.name = t(NAME[player.name]);
  if (player.dateOfBirth) out.dateOfBirth = t(DATE_OF_BIRTH[player.dateOfBirth]);
  if (player.heightCm) out.height = t(HEIGHT[player.heightCm]);
  if (player.teamName) out.teamName = t(TEAM_NAME[player.teamName]);
  if (basketball.primaryPosition) out.primaryPosition = t(UNKNOWN_CODE[basketball.primaryPosition]);
  if (basketball.secondaryPosition) out.secondaryPosition = t(SECONDARY[basketball.secondaryPosition]);
  if (basketball.dominantHand) out.dominantHand = t(UNKNOWN_CODE[basketball.dominantHand]);
  return out;
}
