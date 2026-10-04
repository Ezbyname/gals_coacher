import {
  validateBasketballProfile,
  type BasketballProfile,
  type BasketballProfileErrors,
  type BasketballProfileInput,
} from '@/domain/basketball/profile';
import { formatCalendarDate, parseCalendarDate } from '@/domain/calendarDate';
import { isUuid, type Uuid } from '@/domain/ids';
import {
  validatePlayerCore,
  type Player,
  type PlayerCore,
  type PlayerCoreErrors,
  type PlayerCoreInput,
} from '@/domain/player';
import type { SportKey } from '@/domain/sport';
import type { Clock } from '@/services/clock/Clock';
import { localCalendarDateFromEpoch } from '@/services/clock/localCalendarDate';
import type { IdService } from '@/services/ids/IdService';

import { runSerialized } from '../connectionQueue';

import {
  PlayerDataError,
  PlayerNotFoundError,
  SportRemovalNotSupportedError,
  type PlayerDataField,
} from './errors';
import { ensureLocalFamily } from './localFamily';
import type { PlayerDb } from './playerDb';

/**
 * A generic Player and, when the player has a Basketball assignment, its
 * Basketball profile (Basketball is the only sport in V1). `basketball: null`
 * means no Basketball assignment — a valid player.
 */
export interface PlayerProfile {
  readonly player: Player;
  readonly basketball: BasketballProfile | null;
}

/**
 * `basketball: null` = Basketball not selected. On update, the V1 fields
 * (positions, dominant hand) are always written (omitted = cleared), while
 * `experience` / `weeklyFrequency` — no longer collected by the V1 UI — keep
 * their stored value unless the input provides them, so they are never
 * silently cleared.
 */
export interface PlayerProfileInput {
  readonly player: PlayerCoreInput;
  readonly basketball: BasketballProfileInput | null;
}

export type PlayerProfileErrors = {
  player?: PlayerCoreErrors;
  basketball?: BasketballProfileErrors;
};

/** Invalid input is a result, not an exception: nothing was written. */
export type SavePlayerResult =
  | { readonly ok: true; readonly profile: PlayerProfile }
  | { readonly ok: false; readonly errors: PlayerProfileErrors };

const BASKETBALL: SportKey = 'BASKETBALL';
const NO_BASKETBALL = { ok: true, value: null } as const;

/** `today` comes from the single timestamp of this operation. */
function validateInput(
  input: PlayerProfileInput,
  now: number,
):
  | { ok: true; core: PlayerCore; basketball: BasketballProfile | null }
  | { ok: false; errors: PlayerProfileErrors } {
  const core = validatePlayerCore(input.player, localCalendarDateFromEpoch(now));
  const basketball = input.basketball === null ? NO_BASKETBALL : validateBasketballProfile(input.basketball);
  if (core.ok && basketball.ok) return { ok: true, core: core.value, basketball: basketball.value };
  const errors: PlayerProfileErrors = {};
  if (!core.ok) errors.player = core.errors;
  if (!basketball.ok) errors.basketball = basketball.errors;
  return { ok: false, errors };
}

/**
 * Creates a Player in one transaction, creating the local Family on first use.
 * With Basketball selected, the BASKETBALL assignment and its profile (a
 * profile row exists even when every field is empty) are written in the same
 * transaction; without it, no sport rows are written. Any failure rolls back
 * all of it.
 */
export async function createPlayer(
  db: PlayerDb,
  input: PlayerProfileInput,
  deps: { ids: IdService; clock: Clock },
): Promise<SavePlayerResult> {
  const now = deps.clock.wallNow();
  const valid = validateInput(input, now);
  if (!valid.ok) return valid;

  const id = deps.ids.newUuid();
  let familyId: Uuid | undefined;
  await writeTransaction(db, async () => {
    familyId = await ensureLocalFamily(db, deps.ids);
    await db.runAsync(
      `INSERT INTO players (id, family_id, name, date_of_birth, height_cm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        familyId,
        valid.core.name,
        formatCalendarDate(valid.core.dateOfBirth),
        valid.core.heightCm,
        now,
        now,
      ],
    );
    if (valid.basketball !== null) await insertBasketball(db, id, valid.basketball);
  });
  if (familyId === undefined) throw new Error('createPlayer: transaction finished without a family id');

  return {
    ok: true,
    profile: {
      player: { id, familyId, ...valid.core, createdAt: now, updatedAt: now },
      basketball: valid.basketball,
    },
  };
}

/**
 * Updates a Player in one transaction; id, family and createdAt are preserved.
 * Basketball, read inside the transaction:
 * - none stored, `basketball: null` → personal fields only;
 * - none stored, Basketball given → assignment + profile are added;
 * - stored, Basketball given → the profile is updated (omitted dormant fields kept);
 * - stored, `basketball: null` → SportRemovalNotSupportedError, nothing written.
 * Throws PlayerNotFoundError for an unknown id (never creates a Player).
 */
export async function updatePlayer(
  db: PlayerDb,
  id: string,
  input: PlayerProfileInput,
  deps: { clock: Clock },
): Promise<SavePlayerResult> {
  const now = deps.clock.wallNow();
  const valid = validateInput(input, now);
  if (!valid.ok) return valid;

  let updated = null as PlayerProfile | null;
  await writeTransaction(db, async () => {
    // Authoritative read of the full stored state before any write: a missing or
    // orphaned profile (or any other malformed value) fails with PlayerDataError
    // here, so nothing is written and no raw constraint error can surface.
    const existing = await readPlayer(db, id);
    if (existing === null) throw new PlayerNotFoundError(id);
    const hasBasketball = existing.basketball !== null;
    // Only for a valid stored state: removal is not supported in Slice 1.1.
    if (hasBasketball && valid.basketball === null) throw new SportRemovalNotSupportedError(id, BASKETBALL);

    await db.runAsync(
      'UPDATE players SET name = ?, date_of_birth = ?, height_cm = ?, updated_at = ? WHERE id = ?',
      [valid.core.name, formatCalendarDate(valid.core.dateOfBirth), valid.core.heightCm, now, id],
    );
    if (valid.basketball !== null && input.basketball !== null) {
      if (hasBasketball) await updateBasketballProfile(db, id, valid.basketball, input.basketball);
      else await insertBasketball(db, id, valid.basketball);
    }
    // Re-read inside the transaction: the saved result is parsed like any read.
    updated = await readPlayer(db, id);
  });
  if (updated === null) throw new PlayerNotFoundError(id);
  return { ok: true, profile: updated };
}

/** The Player with its Basketball profile, or null if no such Player exists. */
export function getPlayer(db: PlayerDb, id: string): Promise<PlayerProfile | null> {
  return runSerialized(db, () => readPlayer(db, id));
}

/** All Players, oldest first (created_at, then id). Any malformed row fails the read. */
export function listPlayers(db: PlayerDb): Promise<PlayerProfile[]> {
  return runSerialized(db, async () => {
    const rows = await db.getAllAsync<PlayerRow>(`${SELECT_PLAYERS} ORDER BY p.created_at, p.id`, []);
    return rows.map(parsePlayerRow);
  });
}

/**
 * One write transaction at a time per connection (see ../connectionQueue).
 * Reads are queued too, so they never observe another save's uncommitted rows.
 */
function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  return runSerialized(db, () => db.withTransactionAsync(task));
}

/** Unqueued read; only for use inside an already-queued operation. */
async function readPlayer(db: PlayerDb, id: string): Promise<PlayerProfile | null> {
  const row = await db.getFirstAsync<PlayerRow>(`${SELECT_PLAYERS} WHERE p.id = ?`, [id]);
  return row === null ? null : parsePlayerRow(row);
}

/** The BASKETBALL assignment and its profile; always written together. */
async function insertBasketball(db: PlayerDb, id: string, profile: BasketballProfile): Promise<void> {
  await db.runAsync('INSERT INTO player_sports (player_id, sport) VALUES (?, ?)', [id, BASKETBALL]);
  await db.runAsync(
    `INSERT INTO basketball_player_profiles
       (player_id, sport, primary_position, secondary_position, dominant_hand, experience, weekly_frequency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      BASKETBALL,
      profile.primaryPosition,
      profile.secondaryPosition,
      profile.dominantHand,
      profile.experience,
      profile.weeklyFrequency,
    ],
  );
}

const PROFILE_COLUMNS = {
  primaryPosition: 'primary_position',
  secondaryPosition: 'secondary_position',
  dominantHand: 'dominant_hand',
  experience: 'experience',
  weeklyFrequency: 'weekly_frequency',
} as const satisfies Record<keyof BasketballProfile, string>;

/** Fields no longer collected by the V1 UI: kept unless the input provides them. */
const DORMANT_FIELDS = new Set<keyof BasketballProfile>(['experience', 'weeklyFrequency']);

/** Writes the V1 fields always and the dormant fields only when the input provides them. */
async function updateBasketballProfile(
  db: PlayerDb,
  id: string,
  profile: BasketballProfile,
  input: BasketballProfileInput,
): Promise<void> {
  const fields = (Object.keys(PROFILE_COLUMNS) as (keyof BasketballProfile)[]).filter(
    (field) => !DORMANT_FIELDS.has(field) || input[field] !== undefined,
  );
  // Column names come from the fixed PROFILE_COLUMNS map, never from input.
  await db.runAsync(
    `UPDATE basketball_player_profiles SET ${fields.map((f) => `${PROFILE_COLUMNS[f]} = ?`).join(', ')}
     WHERE player_id = ?`,
    [...fields.map((f) => profile[f]), id],
  );
}

// The BASKETBALL assignment and the Basketball profile are each LEFT JOINed
// from players on their own, so all four combinations are observable (none,
// both, assignment only, profile only).
const SELECT_PLAYERS = `
  SELECT p.id, p.family_id, p.name, p.date_of_birth, p.height_cm, p.created_at, p.updated_at,
         ps.sport AS assignment_sport,
         b.player_id AS profile_player_id, b.sport AS profile_sport,
         b.primary_position, b.secondary_position, b.dominant_hand, b.experience, b.weekly_frequency
  FROM players p
  LEFT JOIN player_sports ps ON ps.player_id = p.id AND ps.sport = 'BASKETBALL'
  LEFT JOIN basketball_player_profiles b ON b.player_id = p.id`;

/** Raw SQLite values: nothing is trusted until parsed. */
type PlayerRow = {
  id: unknown;
  family_id: unknown;
  name: unknown;
  date_of_birth: unknown;
  height_cm: unknown;
  created_at: unknown;
  updated_at: unknown;
  assignment_sport: unknown;
  profile_player_id: unknown;
  profile_sport: unknown;
  primary_position: unknown;
  secondary_position: unknown;
  dominant_hand: unknown;
  experience: unknown;
  weekly_frequency: unknown;
};

const PROFILE_FIELDS = [
  'primaryPosition',
  'secondaryPosition',
  'dominantHand',
  'experience',
  'weeklyFrequency',
] as const satisfies readonly (keyof BasketballProfile & PlayerDataField)[];

function parsePlayerRow(row: PlayerRow): PlayerProfile {
  const rawId = typeof row.id === 'string' ? row.id : null;
  const fail = (field: PlayerDataField, reason: PlayerDataError['reason']) =>
    new PlayerDataError(field, reason, rawId);

  if (rawId === null || !isUuid(rawId)) throw fail('id', 'INVALID_VALUE');
  const familyId = row.family_id;
  if (typeof familyId !== 'string' || !isUuid(familyId)) throw fail('familyId', 'INVALID_VALUE');

  const name = row.name;
  if (typeof name !== 'string' || name.trim().length === 0 || name !== name.trim()) {
    throw fail('name', 'INVALID_VALUE');
  }

  const dateOfBirth = typeof row.date_of_birth === 'string' ? parseCalendarDate(row.date_of_birth) : null;
  if (dateOfBirth === null) throw fail('dateOfBirth', 'INVALID_VALUE');

  const heightCm = row.height_cm;
  if (heightCm !== null && !(typeof heightCm === 'number' && Number.isInteger(heightCm) && heightCm > 0)) {
    throw fail('heightCm', 'INVALID_VALUE');
  }

  const { created_at: createdAt, updated_at: updatedAt } = row;
  if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt))
    throw fail('createdAt', 'INVALID_VALUE');
  if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt))
    throw fail('updatedAt', 'INVALID_VALUE');

  const player: Player = { id: rawId, familyId, name, dateOfBirth, heightCm, createdAt, updatedAt };
  const hasAssignment = row.assignment_sport !== null;
  const hasProfile = row.profile_player_id !== null;
  if (!hasAssignment && !hasProfile) return { player, basketball: null };
  if (!hasProfile) throw fail('basketballProfile', 'MISSING_ROW');
  if (!hasAssignment) throw fail('basketballProfile', 'INVALID_RELATIONSHIP');
  if (row.profile_sport !== BASKETBALL) throw fail('basketballProfile', 'INVALID_VALUE');

  const codes = {
    primaryPosition: row.primary_position,
    secondaryPosition: row.secondary_position,
    dominantHand: row.dominant_hand,
    experience: row.experience,
    weeklyFrequency: row.weekly_frequency,
  };
  for (const field of PROFILE_FIELDS) {
    if (codes[field] !== null && typeof codes[field] !== 'string') throw fail(field, 'UNKNOWN_CODE');
  }
  const basketball = validateBasketballProfile(codes as BasketballProfileInput);
  if (!basketball.ok) {
    const field = PROFILE_FIELDS.find((f) => basketball.errors[f] !== undefined) ?? 'basketballProfile';
    const code = field === 'basketballProfile' ? undefined : basketball.errors[field];
    throw fail(field, code === 'UNKNOWN_CODE' ? 'UNKNOWN_CODE' : 'INVALID_RELATIONSHIP');
  }

  return { player, basketball: basketball.value };
}
