import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { FOOTBALL } from '../../../exercise/catalog/football';
import { SURFING } from '../../../exercise/catalog/surfing';
import { PROFESSIONAL_WORKOUTS } from '..';
import { renderContentReviewSheet } from '../reviewSheet';

/** The human CONTENT-REVIEW-SHEET is rendered from the shipped content: it must list every item completely. */
describe('CONTENT-REVIEW-SHEET', () => {
  const sheet = renderContentReviewSheet();

  it('lists every new Exercise and every professional workout with all the required fields', () => {
    for (const e of [...SURFING, ...FOOTBALL]) {
      expect(sheet).toContain(`### ${e.id}`);
      expect(sheet).toContain(e.name.he);
      expect(sheet).toContain(e.name.en);
      expect(sheet).toContain(e.instructions!.he);
      expect(sheet).toContain(e.instructions!.en);
    }
    for (const w of PROFESSIONAL_WORKOUTS) {
      expect(sheet).toContain(`### ${w.id} — ${w.name[1]}`);
      expect(sheet).toContain(w.summary[0]);
    }
    for (const field of ['HE name', 'EN name', 'Sport', 'Difficulty', 'Dosage (ORIGINAL_RECOMMENDATION)', 'Equipment', 'Evidence class', 'Coaching cues — HE', 'Safety — EN', 'Source / provenance', 'Exactly what the source supports', 'What is Gals Coacher synthesis']) {
      expect(sheet.split(field).length - 1).toBeGreaterThanOrEqual(21);
    }
    expect(sheet.match(/PENDING_HUMAN_REVIEW/g)!.length).toBeGreaterThanOrEqual(7);
    expect(sheet).toMatch(/not official FIFA, ISA or Surfing Australia programming/);
  });

  it('writes the sheet to a file when asked (WRITE_REVIEW_SHEET=<path>)', () => {
    const target = process.env.WRITE_REVIEW_SHEET;
    if (!target) return;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sheet, 'utf8');
    expect(sheet.length).toBeGreaterThan(20_000);
  });
});
