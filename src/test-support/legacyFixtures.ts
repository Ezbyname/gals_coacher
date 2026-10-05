/**
 * Rows exactly as earlier app versions stored them, written with raw SQL so
 * an old-schema fixture never depends on today's repository code (which reads
 * newer columns). Used to prove upgrades over realistic existing data.
 */
type Db = { execAsync(sql: string): Promise<unknown> };

export const LEGACY = {
  family: '00000000-0000-4000-8000-00000000f001',
  noa: '00000000-0000-4000-8000-00000000a001', // no sport
  gal: '00000000-0000-4000-8000-00000000a002', // Basketball, profile with dormant fields
  assessment: '00000000-0000-4000-8000-00000000b001',
  createdAt: 1_790_000_000_000,
  takenAt: 1_790_100_000_000,
} as const;

export const LEGACY_CATEGORIES = ['SHOOTING', 'BALL_HANDLING', 'PASSING', 'FINISHING', 'DEFENSE', 'SPEED'];

/** Schema v2 (Slice 1.1): the local family, a player without a sport and a Basketball player. */
export async function seedV2Players(db: Db): Promise<void> {
  const { family, noa, gal, createdAt } = LEGACY;
  await db.execAsync(`
    INSERT INTO families (id) VALUES ('${family}');
    INSERT INTO app_meta (key, value) VALUES ('local_family_id', '${family}');
    INSERT INTO players (id, family_id, name, date_of_birth, height_cm, created_at, updated_at) VALUES
      ('${noa}', '${family}', 'Noa', '2016-01-02', NULL, ${createdAt}, ${createdAt}),
      ('${gal}', '${family}', 'Gal', '2015-07-09', 142, ${createdAt + 1}, ${createdAt + 1});
    INSERT INTO player_sports (player_id, sport) VALUES ('${gal}', 'BASKETBALL');
    INSERT INTO basketball_player_profiles
      (player_id, sport, primary_position, secondary_position, dominant_hand, experience, weekly_frequency)
      VALUES ('${gal}', 'BASKETBALL', 'SG', 'SF', 'LEFT', 'ONE_TO_TWO_YEARS', 'TWO_TO_THREE');
  `);
}

/** Schema v3 (Slice 1.2): one Basketball self-assessment with its six ratings (1..5, 1). */
export async function seedV3SelfAssessment(db: Db): Promise<void> {
  const { gal, assessment, takenAt } = LEGACY;
  await db.execAsync(`
    INSERT INTO self_assessments (id, player_id, sport, taken_at)
      VALUES ('${assessment}', '${gal}', 'BASKETBALL', ${takenAt});
    INSERT INTO self_assessment_ratings (assessment_id, category, rating) VALUES
      ${LEGACY_CATEGORIES.map((c, i) => `('${assessment}', '${c}', ${(i % 5) + 1})`).join(',\n      ')};
  `);
}

/** Schema v4 (Slice 1.3): Basketball and sport-less calendar events. */
export const LEGACY_EVENTS = {
  game: '00000000-0000-4000-8000-00000000c001', // BASKETBALL
  gym: '00000000-0000-4000-8000-00000000c002', // no sport
} as const;
export async function seedV4CalendarEvents(db: Db): Promise<void> {
  const { gal, createdAt } = LEGACY;
  const { game, gym } = LEGACY_EVENTS;
  await db.execAsync(`
    INSERT INTO calendar_events
      (id, player_id, type, sport, start_at, end_at, title, notes, created_at, updated_at) VALUES
      ('${game}', '${gal}', 'GAME', 'BASKETBALL', ${createdAt + 3_600_000}, ${createdAt + 7_200_000},
        'Cup final', 'Hall 2', ${createdAt}, ${createdAt}),
      ('${gym}', '${gal}', 'GYM', NULL, ${createdAt + 90_000_000}, NULL, NULL, NULL, ${createdAt}, ${createdAt});
  `);
}
