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

import { emitDataChanged } from '../../changes';
import { runSerialized } from '../connectionQueue';

import { PlayerArchivedError, PlayerDataError, PlayerHasActiveSessionError, PlayerNotFoundError, type PlayerDataField } from './errors';
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
      player: { id, familyId, ...valid.core, archivedAt: null, createdAt: now, updatedAt: now },
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

/**
 * Sets only the Player's current team name (CAL-SCHEDULE-IMPORT-002B: "Save as this
 * Player's team" after choosing the team in a fixture file — an explicit user
 * choice, never automatic). Trimmed; blank / null clears it; over the limit →
 * TOO_LONG (nothing written). Throws PlayerNotFoundError for an unknown id.
 */
export async function setPlayerTeamName(
  db: PlayerDb,
  id: string,
  teamName: string | null,
  deps: { clock: Clock },
): Promise<{ ok: true; teamName: string | null } | { ok: false; error: 'TOO_LONG' }> {
  const trimmed = (teamName ?? '').trim();
  const value = trimmed.length === 0 ? null : trimmed;
  if (value !== null && value.length > TEAM_NAME_MAX_LENGTH) return { ok: false, error: 'TOO_LONG' };
  const now = deps.clock.wallNow();
  await writeTransaction(db, async () => {
    const existing = await db.getFirstAsync('SELECT id FROM players WHERE id = ?', [id]);
    if (existing === null) throw new PlayerNotFoundError(id);
    await db.runAsync('UPDATE players SET team_name = ?, updated_at = ? WHERE id = ?', [value, now, id]);
  });
  return { ok: true, teamName: value };
}

/** The Player with its Basketball profile, or null if no such Player exists. */
export function getPlayer(db: PlayerDb, id: string): Promise<PlayerProfile | null> {
  return runSerialized(db, () => readPlayer(db, id));
}

/**
 * The ACTIVE Players (the roster), oldest first (created_at, then id). Archived
 * Players only when explicitly asked for (PLAYER-ARCHIVE-001). Any malformed row
 * fails the read. A single Player — archived or not — is always readable by id
 * (getPlayer), so history stays reachable.
 */
export function listPlayers(db: PlayerDb, options: { includeArchived?: boolean } = {}): Promise<PlayerProfile[]> {
  const where = options.includeArchived === true ? '' : ' WHERE p.archived_at IS NULL';
  return runSerialized(db, async () => {
    const rows = await db.getAllAsync<PlayerRow>(`${SELECT_PLAYERS}${where} ORDER BY p.created_at, p.id`, []);
    return rows.map(parsePlayerRow);
  });
}

/**
 * PLAYER-ARCHIVE-001 — takes the Player off the active roster. Nothing is
 * deleted: profile, sports, self-assessments, calendar events, planned workouts
 * and training sessions all stay, and every reference stays valid. Archiving an
 * archived Player keeps its original time. Throws PlayerNotFoundError for an
 * unknown id (nothing written). Returns when the Player was archived.
 */
export async function archivePlayer(db: PlayerDb, id: string, deps: { clock: Clock }): Promise<number> {
  const now = deps.clock.wallNow();
  let archivedAt = now;
  await writeTransaction(db, async () => {
    const row = await db.getFirstAsync<{ archived_at: number | null }>('SELECT archived_at FROM players WHERE id = ?', [id]);
    if (row === null) throw new PlayerNotFoundError(id);
    if (row.archived_at !== null) {
      archivedAt = row.archived_at;
      return;
    }
    // QB safety gate S1: never archive in the middle of a workout (and never invent ABANDONED for it).
    const running = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM training_sessions WHERE player_id = ? AND status = 'IN_PROGRESS'",
      [id],
    );
    if (running !== null) throw new PlayerHasActiveSessionError(id, running.id);
    await db.runAsync('UPDATE players SET archived_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  });
  return archivedAt;
}

/** Back on the active roster (archived_at = NULL), with all of their history. Throws PlayerNotFoundError. */
export async function restorePlayer(db: PlayerDb, id: string, deps: { clock: Clock }): Promise<void> {
  const now = deps.clock.wallNow();
  await writeTransaction(db, async () => {
    const row = await db.getFirstAsync<{ archived_at: number | null }>('SELECT archived_at FROM players WHERE id = ?', [id]);
    if (row === null) throw new PlayerNotFoundError(id);
    if (row.archived_at === null) return;
    await db.runAsync('UPDATE players SET archived_at = NULL, updated_at = ? WHERE id = ?', [now, id]);
  });
}

/**
 * For repositories that CREATE Player-owned activity: the Player must exist
 * (PlayerNotFoundError) and be active (PlayerArchivedError). Call inside the
 * write transaction. Edits of existing rows do not call this: history stays editable.
 */
export async function assertActivePlayer(db: PlayerDb, id: string): Promise<void> {
  const row = await db.getFirstAsync<{ archived_at: unknown }>('SELECT archived_at FROM players WHERE id = ?', [id]);
  if (row === null) throw new PlayerNotFoundError(id);
  if (row.archived_at !== null) throw new PlayerArchivedError(id);
}

/**
 * One write transaction at a time per connection (see ../connectionQueue).
 * Reads are queued too, so they never observe another save's uncommitted rows.
 */
function writeTransaction(db: PlayerDb, task: () => Promise<void>): Promise<void> {
  // After a COMMITTED write only (e.g. archive / restore changes whose events may remind) — CAL-SYNC-NOTIFY-001C.
  return runSerialized(db, () => db.withTransactionAsync(task)).then(() => emitDataChanged('players'));
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
  SELECT p.id, p.family_id, p.name, p.date_of_birth, p.height_cm, p.team_name, p.archived_at, p.created_at, p.updated_at,
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
  archived_at: unknown;
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

  const archivedAt = row.archived_at;
  if (archivedAt !== null && !(typeof archivedAt === 'number' && Number.isSafeInteger(archivedAt) && archivedAt > 0)) {
    throw fail('archivedAt', 'INVALID_VALUE');
  }

  const player: Player = { id: rawId, familyId, name, dateOfBirth, heightCm, teamName, archivedAt, createdAt, updatedAt };
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
