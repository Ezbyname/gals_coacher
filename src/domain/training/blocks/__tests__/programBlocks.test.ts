import { newTemplateProblem } from '../../professional/templateMeta';
import { professionalWorkout, PUBLISHED_WORKOUT_TEMPLATES } from '../../professional';
import { planName, planSessionDates, previewBlock, PROGRAM_BLOCK_DRAFTS, TRAINING_BLOCKS, trainingBlock, totalSessions, PLAN_NAME_MAX } from '..';

/** WORKOUT-TEMPLATES-001 (S5): the gym Program Blocks (drafts) and the allowAdjacentTrainingDays option. */
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const start = { year: 2026, month: 10, day: 26 };
const IDS = ['GYM-BEGINNER-4W-01', 'GYM-INTERMEDIATE-4W-01', 'GYM-ADVANCED-4W-01'];

describe('gym Program Blocks are DRAFT content (PBK-01…)', () => {
  it('PBK-01: three drafts, all PENDING_HUMAN_REVIEW; none is in the published set; each resolves by id', () => {
    expect(PROGRAM_BLOCK_DRAFTS.map((b) => b.id)).toEqual(IDS);
    for (const b of PROGRAM_BLOCK_DRAFTS) {
      expect(b.reviewStatus).toBe('PENDING_HUMAN_REVIEW');
      expect(TRAINING_BLOCKS.map((x) => x.id)).not.toContain(b.id);
      expect(trainingBlock(b.id)).toBe(b);
    }
    expect(TRAINING_BLOCKS).toHaveLength(6); // the published set is unchanged
  });

  it('PBK-02: every session references an existing Workout Template that follows the three-section rule; the schedule is complete and ordered', () => {
    for (const b of PROGRAM_BLOCK_DRAFTS) {
      expect(b.schedule).toHaveLength(totalSessions(b));
      for (let week = 1; week <= b.weeks; week += 1) {
        expect(b.schedule.filter((x) => x.week === week).map((x) => x.slot)).toEqual(Array.from({ length: b.sessionsPerWeek }, (_, i) => i + 1));
      }
      for (const session of b.schedule) {
        const w = professionalWorkout(session.workoutId);
        expect([b.id, session.workoutId, w !== null]).toEqual([b.id, session.workoutId, true]);
        expect(newTemplateProblem(w!)).toBeNull();
        expect(PUBLISHED_WORKOUT_TEMPLATES.map((x) => x.id)).not.toContain(session.workoutId); // drafts only: nothing is published
      }
    }
  });

  it('PBK-03: progression, RIR and the lighter week are informational notes only: no adjustment, no load, no source-supported claim', () => {
    for (const b of PROGRAM_BLOCK_DRAFTS) {
      expect(b.schedule.every((x) => x.adjust === undefined)).toBe(true);
      expect(b.schedule.some((x) => x.note !== undefined)).toBe(true);
      expect(b.decisions.every((d) => d.evidence !== 'SOURCE_SUPPORTED')).toBe(true);
      expect(b.sources).toEqual([]);
    }
    expect(JSON.stringify(PROGRAM_BLOCK_DRAFTS)).not.toMatch(/injur|prevent|medical|rehab/i);
  });

  it('PBK-04: plan names fit the limit in both languages', () => {
    for (const b of PROGRAM_BLOCK_DRAFTS) {
      for (const session of b.schedule) {
        for (const language of ['he', 'en'] as const) expect(planName(b, session, language).length).toBeLessThanOrEqual(PLAN_NAME_MAX);
      }
      expect(previewBlock(b, 'en', null)).toHaveLength(totalSessions(b));
    }
  });
});

describe('allowAdjacentTrainingDays (PBK-05…)', () => {
  it('PBK-05: the original six blocks keep the old rule (the option is absent): consecutive days are refused', () => {
    for (const b of TRAINING_BLOCKS) {
      expect(b.allowAdjacentTrainingDays).toBeUndefined();
      expect(planSessionDates(b, start, [MON, TUE])).toEqual({ ok: false, error: 'WEEKDAYS_ADJACENT' });
      expect(planSessionDates(b, start, [6, 0])).toEqual({ ok: false, error: 'WEEKDAYS_ADJACENT' });
      expect(planSessionDates(b, start, [MON, THU]).ok).toBe(true);
    }
  });

  it('PBK-06: only the explicitly approved Intermediate block enables it, and it permits the intended adjacent days', () => {
    expect(PROGRAM_BLOCK_DRAFTS.filter((b) => b.allowAdjacentTrainingDays === true).map((b) => b.id)).toEqual(['GYM-INTERMEDIATE-4W-01']);
    const block = trainingBlock('GYM-INTERMEDIATE-4W-01')!;
    const r = planSessionDates(block, start, [MON, TUE, THU, FRI]);
    expect(r.ok && r.dates).toHaveLength(16);
    if (!r.ok) throw new Error('plan');
    // Monday and Tuesday are both used: the first week's dates are consecutive days
    expect(r.dates.slice(0, 4).map((d) => d.day)).toEqual([26, 27, 29, 30]);
  });

  it('PBK-07: the option relaxes ONLY the adjacency rule; every other scheduling rule is unchanged', () => {
    const block = trainingBlock('GYM-INTERMEDIATE-4W-01')!;
    expect(planSessionDates(block, start, [MON, TUE])).toEqual({ ok: false, error: 'WEEKDAY_COUNT' });
    expect(planSessionDates(block, start, [MON, TUE, THU, 9])).toEqual({ ok: false, error: 'WEEKDAY_INVALID' });
    expect(planSessionDates(block, start, [MON, MON, THU, FRI])).toEqual({ ok: false, error: 'WEEKDAY_INVALID' });
    expect(planSessionDates(block, { year: 2026, month: 2, day: 30 }, [MON, TUE, THU, FRI])).toEqual({ ok: false, error: 'START_DATE_INVALID' });
  });

  it('PBK-08: the Beginner and Advanced drafts keep the rest-day rule (option absent)', () => {
    const beginner = trainingBlock('GYM-BEGINNER-4W-01')!;
    expect(beginner.allowAdjacentTrainingDays).toBeUndefined();
    expect(planSessionDates(beginner, start, [MON, TUE, THU])).toEqual({ ok: false, error: 'WEEKDAYS_ADJACENT' });
    const ok = planSessionDates(beginner, start, [MON, WED, FRI]);
    expect(ok.ok && ok.dates).toHaveLength(12);
    expect(planSessionDates(trainingBlock('GYM-ADVANCED-4W-01')!, start, [MON, TUE, THU])).toEqual({ ok: false, error: 'WEEKDAYS_ADJACENT' });
  });
});
