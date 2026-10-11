import {
  validateBasketballProfile,
  type BasketballProfile,
  type BasketballProfileErrors,
  type BasketballProfileInput,
} from '@/domain/basketball/profile';
import { formatCalendarDate, parseCalendarDate } from '@/domain/calendarDate';
import { isUuid, type Uuid } from '@/domain/ids';
import {
  TEAM_NAME_MAX_LENGTH,
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

import { PlayerDataError, PlayerNotFoundError, type PlayerDataField } from './errors';
import { ensureLocalFamily } from './localFamily';
import type { PlayerDb } from './playerDb';

/**
 * A sport the Player is (or was) assigned to. An inactive assignment keeps
 * its history (profile, self-assessments, calendar events) but is not the
 * Player's current sport (SPORT-LIFE-001).
 */
export interface PlayerSportAssignment {
  readonly sport: SportKey;
  readonly active: boolean;
}

/**
 * A generic Player, its sport assignments, and — when the Player has a
 * Basketball assignment, active or not — the stored Basketball profile
 * (Basketball is the only sport in V1). `basketball: null` means the Player
 * never had Basketball. Whether Basketball is CURRENT is `isSportActive`.
 */
export interface PlayerProfile {
  readonly player: Player;
  readonly basketball: BasketballProfile | null;
  readonly sports: readonly PlayerSportAssignment[];
}

/** True when the Player's assignment to `sport` exists and is active. */
export function isSportActive(profile: Pick<PlayerProfile, 'sports'>, sport: SportKey): boolean {
  return profile.sports.some((assignment) => assignment.sport === sport && assignment.active);
}

/**
 * `basketball: null` = Basketball not selected (not active). On update, the V1 fields
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
      `INSERT INTO players (id, family_id, name, date_of_birth, height_cm, team_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        familyId,
        valid.core.name,
        formatCalendarDate(valid.core.dateOfBirth),
        valid.core.heightCm,
        valid.core.teamName,
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
      sports: valid.basketball === null ? [] : [{ sport: BASKETBALL, active: true }],
    },
  };
}

/**
 * Updates a Player in one transaction; id, family and createdAt are preserved.
 * Basketball, read inside the transaction:
 * - none stored, `basketball: null` → personal fields only;
 * - none stored, Basketball given → assignment + profile are added;
 * - active, Basketball given → the profile is updated (omitted dormant fields kept);
 * - active, `basketball: null` → the assignment becomes INACTIVE. Nothing is
 *   deleted: the profile, self-assessments and calendar events are not touched;
 * - inactive, `basketball: null` → personal fields only (profile untouched);
 * - inactive, Basketball given → REACTIVATED: the same assignment and the same
 *   profile row are reused (the profile updated as above); never a duplicate.
 * An edit that does not mention the team name (`teamName` undefined) keeps the
 * stored one; null / blank clears it.
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
    const stored = existing.sports.find((assignment) => assignment.sport === BASKETBALL) ?? null;

    const teamName = input.player.teamName === undefined ? existing.player.teamName : valid.core.teamName;
    await db.runAsync(
      'UPDATE players SET name = ?, date_of_birth = ?, height_cm = ?, team_name = ?, updated_at = ? WHERE id = ?',
      [valid.core.name, formatCalendarDate(valid.core.dateOfBirth), valid.core.heightCm, teamName, now, id],
    );
    if (valid.basketball !== null && input.basketball !== null) {
      if (stored === null) {
        await insertBasketball(db, id, valid.basketball);
      } else {
        await updateBasketballProfile(db, id, valid.basketball, input.basketball);
        if (!stored.active) await setSportActive(db, id, BASKETBALL, true);
      }
    } else if (stored?.active) {
      // Deactivation is a lifecycle change only: never a DELETE.
      await setSportActive(db, id, BASKETBALL, false);
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

/** Changes only the assignment's lifecycle; the row and everything referencing it stay. */
async function setSportActive(db: PlayerDb, id: string, sport: SportKey, active: boolean): Promise<void> {
  await db.runAsync('UPDATE player_sports SET active = ? WHERE player_id = ? AND sport = ?', [
    active ? 1 : 0,
    id,
    sport,
  ]);
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
  SELECT p.id, p.family_id, p.name, p.date_of_birth, p.height_cm, p.team_name, p.created_at, p.updated_at,
         ps.sport AS assignment_sport, ps.active AS assignment_active,
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
  team_name: unknown;
  created_at: unknown;
  updated_at: unknown;
  assignment_sport: unknown;
  assignment_active: unknown;
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

  // Stored trimmed, non-blank, within the limit — nothing is normalized on read.
  const teamName = row.team_name;
  if (
    teamName !== null &&
    !(typeof teamName === 'string' && teamName.length > 0 && teamName === teamName.trim() && teamName.length <= TEAM_NAME_MAX_LENGTH)
  ) {
    throw fail('teamName', 'INVALID_VALUE');
  }

  const { created_at: createdAt, updated_at: updatedAt } = row;
  if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt))
    throw fail('createdAt', 'INVALID_VALUE');
  if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt))
    throw fail('updatedAt', 'INVALID_VALUE');

  const player: Player = { id: rawId, familyId, name, dateOfBirth, heightCm, teamName, createdAt, updatedAt };
  const hasAssignment = row.assignment_sport !== null;
  const hasProfile = row.profile_player_id !== null;
  if (!hasAssignment && !hasProfile) return { player, basketball: null, sports: [] };
  if (!hasProfile) throw fail('basketballProfile', 'MISSING_ROW');
  if (!hasAssignment) throw fail('basketballProfile', 'INVALID_RELATIONSHIP');
  if (row.profile_sport !== BASKETBALL) throw fail('basketballProfile', 'INVALID_VALUE');
  // The lifecycle flag is exactly 0 or 1 (the CHECK guards it; a bypass fails the read).
  if (row.assignment_active !== 0 && row.assignment_active !== 1) throw fail('sportActive', 'INVALID_VALUE');
  const sports = [{ sport: BASKETBALL, active: row.assignment_active === 1 }];

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

  return { player, basketball: basketball.value, sports };
}
