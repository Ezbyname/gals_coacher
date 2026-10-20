import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { ATHLETIC } from '../../../exercise/catalog/athletic';
import { GENERAL_ATHLETIC_WORKOUTS } from '../../professional';
import { TRAINING_BLOCKS } from '..';
import { renderTrainingBlocksReviewSheet } from '../reviewSheet';

/** TRAINING-BLOCKS-001 — the combined CONTENT-REVIEW-SHEET is generated from the shipped content and cannot drift from it. */
describe('TRAINING-BLOCKS-001 CONTENT-REVIEW-SHEET', () => {
  const sheet = renderTrainingBlocksReviewSheet();

  it('covers every new Exercise, every general workout and every block, all PENDING_HUMAN_REVIEW', () => {
    expect(sheet).toMatch(/6 Exercises \+ 13 workouts \+ 6 Training Blocks/);
    for (const e of ATHLETIC) expect(sheet).toContain(`### ${e.id}`);
    for (const w of GENERAL_ATHLETIC_WORKOUTS) {
      expect(sheet).toContain(`### ${w.id} — ${w.name[1]}`);
      expect(sheet).toContain(w.summary[0]);
    }
    for (const b of TRAINING_BLOCKS) {
      expect(sheet).toContain(`### ${b.id} — ${b.name[1]}`);
      expect(sheet).toContain(`${b.weeks} weeks · ${b.sessionsPerWeek} sessions a week`);
    }
    expect(sheet.match(/\| \*\*Review status\*\* \| `PENDING_HUMAN_REVIEW` \|/g)).toHaveLength(13 + 6);
    expect(sheet).not.toMatch(/`PUBLISHED`/);
  });

  it('lists every week of every block and the reuse matrix', () => {
    for (const b of TRAINING_BLOCKS) {
      for (let week = 1; week <= b.weeks; week++) expect(sheet).toContain(`| ${week} | ${b.schedule.find((s) => s.week === week && s.slot === 1)!.workoutId}`);
    }
    expect(sheet).toMatch(/## D\. Reuse matrix/);
    expect(sheet).toMatch(/EXPLOSIVE-POWER-8W-01.*8 weeks · 2 sessions a week · 16 sessions/s);
  });

  it('states the evidence honestly: what was opened, what was not, and what stays synthesized', () => {
    expect(sheet).toMatch(/\*\*opened\*\* = the full text was read/);
    expect(sheet).toMatch(/_\(not opened\)_/);
    expect(sheet).toMatch(/_\(abstract only\)_/);
    expect(sheet).toMatch(/Landing-before-plyometrics.*\*\*SYNTHESIZED\*\*/);
    expect(sheet).toMatch(/Corrections to the Phase 1 report/);
    expect(sheet).toMatch(/Resolved human-review decisions/);
    expect(sheet).toMatch(/Explosive Power = 8 weeks \/ 16 sessions — APPROVED/);
    expect(sheet).toMatch(/Conditioning = 6 weeks \/ 12 sessions — APPROVED/);
    expect(sheet).not.toMatch(/## Points that need a human decision/);
  });

  it('shows each alternative with its OWN prescription and every dosage unit', () => {
    expect(sheet).toMatch(/alternative: BIKE_INTERVALS .*8 × 30s, rest 60s/);
    expect(sheet).toMatch(/alternative: SKI_ERG_INTERVALS .*6 × 30s, rest 60s/);
    expect(sheet).toMatch(/RUN_INTERVALS .*6 × 45s, rest 90s/);
    expect(sheet).not.toMatch(/\(no target\)/);
  });

  it('shows every TIME-measured value as a recording cap, never as a goal', () => {
    expect(sheet).toMatch(/SPRINT_10M .*5s.*recording cap — record your actual time; not a goal/);
    expect(sheet).toMatch(/PRO_AGILITY_5_10_5 .*8s.*recording cap/);
    expect(sheet).toMatch(/T_DRILL .*16s.*recording cap/);
  });

  it('claims no injury prevention and links no video', () => {
    // the sheet itself states that the programmes make no such claim; remove that sentence, then nothing else may say it
    expect(sheet.replace('make no injury-prevention or medical claim', '').toLowerCase()).not.toMatch(/injury[- ]prevention|prevent injur/);
    expect(sheet).not.toMatch(/youtube/i);
  });

  it('writes the sheet to a file when asked (WRITE_BLOCKS_REVIEW_SHEET=<path>)', () => {
    const target = process.env.WRITE_BLOCKS_REVIEW_SHEET;
    if (!target) return;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sheet, 'utf8');
    expect(sheet.length).toBeGreaterThan(30_000);
  });
});
