import { migrations } from '../migrations';
import { runMigrations } from '../migrations/runMigrations';
import { createPlayer, getPlayer, updatePlayer } from '../players/playerRepository';
import { PlayerDataError } from '../players/errors';
import { openNodeSqlite } from '@/test-support/nodeSqlite';
import { createSequentialIdService } from '@/services/ids/IdService';

/**
 * CAL-SCHEDULE-IMPORT-002A — schema v14 (player_team_name): one nullable
 * players.team_name column; purely additive (every existing Player keeps its
 * row and upgrades with no team).
 */
type Db = ReturnType<typeof openNodeSqlite>;
const NOW = new Date(2026, 9, 11, 12).getTime();
const ids = createSequentialIdService();
const deps = () => ({ ids, clock: { wallNow: () => NOW, monotonicNow: () => 0 } });
const FAMILY = '00000000-0000-4000-8000-0000000000f1';
const PLAYER = '00000000-0000-4000-8000-0000000000a1';

async function open(upTo?: number): Promise<Db> {
  const db = openNodeSqlite(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, upTo === undefined ? migrations : migrations.filter((m) => m.version <= upTo));
  return db;
}
const version = async (db: Db) => (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version;

describe('schema v14 — players.team_name', () => {
  let db: Db;
  afterEach(async () => {
    await db.closeAsync();
  });

  it('fresh install (latest, v16) has a nullable team_name and no default', async () => {
    db = await open();
    expect(await version(db)).toBe(19);
    const col = await db.getFirstAsync<{ type: string; notnull: number; dflt_value: unknown }>(
      "SELECT type, \"notnull\", dflt_value FROM pragma_table_info('players') WHERE name = 'team_name'",
    );
    expect(col).toEqual({ type: 'TEXT', notnull: 0, dflt_value: null });
  });

  it('upgrades a v13 database (to the latest): the Player row is unchanged and has no team; idempotent', async () => {
    db = await open(13);
    expect(await version(db)).toBe(13);
    await db.runAsync("INSERT INTO families (id) VALUES (?)", [FAMILY]);
    await db.runAsync(
      'INSERT INTO players (id, family_id, name, date_of_birth, height_cm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [PLAYER, FAMILY, 'Daniel', '2013-03-04', 151, NOW, NOW],
    );
    const before = await db.getFirstAsync('SELECT * FROM players');
    await runMigrations(db, migrations);
    await runMigrations(db, migrations); // a second run changes nothing
    expect(await version(db)).toBe(19);
    expect(await db.getFirstAsync('SELECT id, family_id, name, date_of_birth, height_cm, created_at, updated_at FROM players')).toEqual(before);
    expect((await getPlayer(db, PLAYER))!.player).toMatchObject({ name: 'Daniel', heightCm: 151, teamName: null });
  });

  it('the CHECK refuses a blank or over-long team name; accepts a trimmed one', async () => {
    db = await open();
    await db.runAsync("INSERT INTO families (id) VALUES (?)", [FAMILY]);
    const insert = (team: string | null) =>
      db.runAsync(
        'INSERT INTO players (id, family_id, name, date_of_birth, team_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [PLAYER, FAMILY, 'Daniel', '2013-03-04', team, NOW, NOW],
      );
    await expect(insert('   ')).rejects.toThrow();
    await expect(insert('x'.repeat(61))).rejects.toThrow();
    await insert('הפועל חוף הכרמל');
    expect((await getPlayer(db, PLAYER))!.player.teamName).toBe('הפועל חוף הכרמל');
  });
});

describe('Player repository — team name', () => {
  let db: Db;
  beforeEach(async () => {
    db = await open();
  });
  afterEach(async () => {
    await db.closeAsync();
  });
  const input = (teamName?: string | null) => ({
    player: { name: 'Daniel', dateOfBirth: { year: 2013, month: 3, day: 4 }, ...(teamName === undefined ? {} : { teamName }) },
    basketball: null,
  });

  it('create stores the trimmed name; blank or omitted = no team', async () => {
    const a = await createPlayer(db, input('  הפועל חוף הכרמל '), deps());
    expect(a.ok && a.profile.player.teamName).toBe('הפועל חוף הכרמל');
    const b = await createPlayer(db, input(''), deps());
    expect(b.ok && b.profile.player.teamName).toBeNull();
    const c = await createPlayer(db, input(), deps());
    expect(c.ok && c.profile.player.teamName).toBeNull();
  });

  it('an over-long name is a validation result (TOO_LONG), nothing written', async () => {
    const r = await createPlayer(db, input('x'.repeat(61)), deps());
    expect(r).toEqual({ ok: false, errors: { player: { teamName: 'TOO_LONG' } } });
    expect((await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM players'))!.n).toBe(0);
  });

  it('an edit that omits the team keeps it; null clears it; a new value replaces it', async () => {
    const created = await createPlayer(db, input('הפועל חוף הכרמל'), deps());
    if (!created.ok) throw new Error('seed failed');
    const id = created.profile.player.id;
    const keep = await updatePlayer(db, id, input(), deps());
    expect(keep.ok && keep.profile.player.teamName).toBe('הפועל חוף הכרמל');
    const change = await updatePlayer(db, id, input('מכבי מי עמי'), deps());
    expect(change.ok && change.profile.player.teamName).toBe('מכבי מי עמי');
    const clear = await updatePlayer(db, id, input(null), deps());
    expect(clear.ok && clear.profile.player.teamName).toBeNull();
  });

  it('a stored team name that is not trimmed fails the read closed (never normalized on read)', async () => {
    const created = await createPlayer(db, input('הפועל חוף הכרמל'), deps());
    if (!created.ok) throw new Error('seed failed');
    await db.runAsync('UPDATE players SET team_name = ? WHERE id = ?', [' הפועל ', created.profile.player.id]);
    await expect(getPlayer(db, created.profile.player.id)).rejects.toThrow(PlayerDataError);
  });
});
