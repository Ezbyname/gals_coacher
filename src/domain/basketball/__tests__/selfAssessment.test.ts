import { BASKETBALL_SELF_ASSESSMENT_CATEGORIES } from '../selfAssessment';

describe('Basketball self-assessment categories', () => {
  it('are exactly the six approved codes, in the approved order', () => {
    expect(BASKETBALL_SELF_ASSESSMENT_CATEGORIES).toEqual([
      'SHOOTING',
      'BALL_HANDLING',
      'PASSING',
      'FINISHING',
      'DEFENSE',
      'SPEED',
    ]);
    expect(BASKETBALL_SELF_ASSESSMENT_CATEGORIES).toHaveLength(6);
    expect(new Set(BASKETBALL_SELF_ASSESSMENT_CATEGORIES).size).toBe(6);
  });

  it('are stable codes, never display text', () => {
    for (const code of BASKETBALL_SELF_ASSESSMENT_CATEGORIES) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });
});
