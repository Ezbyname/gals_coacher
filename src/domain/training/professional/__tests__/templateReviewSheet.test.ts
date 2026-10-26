import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORKOUT_TEMPLATES_001_IDS } from '../templates';
import { renderTemplateReviewSheet } from '../templateReviewSheet';

/** WORKOUT-TEMPLATES-001 S1: the review sheet is generated from the shipped draft content and says nothing is published. */
describe('WORKOUT-TEMPLATES-001 content review sheet', () => {
  const sheet = renderTemplateReviewSheet();
  it('lists every draft with its three sections, evidence classes and an owner decision line', () => {
    for (const id of WORKOUT_TEMPLATES_001_IDS) expect(sheet).toContain(`## ${id} — `);
    expect((sheet.match(/### WARM_UP/g) ?? []).length).toBe(12);
    expect((sheet.match(/### MAIN/g) ?? []).length).toBe(12);
    expect((sheet.match(/### COOL_DOWN/g) ?? []).length).toBe(12);
    expect((sheet.match(/Owner decision/g) ?? []).length).toBe(15); // 12 templates + 3 Program Blocks
    for (const id of ['GYM-BEGINNER-4W-01', 'GYM-INTERMEDIATE-4W-01', 'GYM-ADVANCED-4W-01']) expect(sheet).toContain(`## ${id} — `);
  });
  it('states the four owner-approved publications and that no decision is source-supported', () => {
    expect(sheet).toContain('four templates were PUBLISHED on explicit owner approval');
    expect(sheet.split('Review status: **PUBLISHED**').length - 1).toBe(4);
    expect(sheet).not.toContain('`SOURCE_SUPPORTED`');
    expect(sheet).toContain('`ORIGINAL_RECOMMENDATION`');
    expect(sheet).toContain('explicit content review required');
  });
  // WT_WRITE_SHEET=<dir> writes the sheet for the owner (docs/content-review); unset = no file is written.
  const dir = process.env.WT_WRITE_SHEET;
  (dir ? it : it.skip)('writes the sheet file', () => {
    mkdirSync(dir!, { recursive: true });
    writeFileSync(join(dir!, 'WORKOUT-TEMPLATES-001-CONTENT-REVIEW-SHEET.md'), sheet, 'utf8');
  });
});
