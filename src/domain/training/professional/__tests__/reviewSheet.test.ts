import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { FOOTBALL } from '../../../exercise/catalog/football';
import { BASKETBALL_EXPANSION } from '../../../exercise/catalog/basketball';
import { SURFING } from '../../../exercise/catalog/surfing';
import { PROFESSIONAL_WORKOUTS } from '..';
import { renderContentReviewSheet } from '../reviewSheet';

/** The human CONTENT-REVIEW-SHEET is rendered from the shipped content: it must list every item completely. */
describe('CONTENT-REVIEW-SHEET', () => {
  const sheet = renderContentReviewSheet();

  it('lists every new Exercise and every professional workout with all the required fields', () => {
    for (const e of [...SURFING, ...FOOTBALL, ...BASKETBALL_EXPANSION]) {
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
      expect(sheet.split(field).length - 1).toBeGreaterThanOrEqual(22);
    }
    expect(sheet.match(/PENDING_HUMAN_REVIEW/g)!.length).toBeGreaterThanOrEqual(16);
    expect(sheet).toMatch(/not official FIFA, ISA, Surfing Australia or USA Basketball programming/);
    // one combined sheet: both slices, all 15 workouts, the owner-cited sources flagged, nothing implied about Basketball sources
    expect(sheet).toMatch(/SPORT-CONTENT-001 \+ SPORT-CONTENT-002/);
    expect(sheet.match(/\| \*\*Slice\*\* \| SPORT-CONTENT-002 \(new\)/g)).toHaveLength(9);
    expect(sheet.match(/\| \*\*Slice\*\* \| SPORT-CONTENT-001 \(unchanged\)/g)).toHaveLength(6);
    expect(sheet).toMatch(/owner-cited, not opened/);
    expect(sheet).toMatch(/No external source was consulted for the Basketball workouts/);
  });

  it('writes the sheet to a file when asked (WRITE_REVIEW_SHEET=<path>)', () => {
    const target = process.env.WRITE_REVIEW_SHEET;
    if (!target) return;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sheet, 'utf8');
    expect(sheet.length).toBeGreaterThan(40_000);
  });
});
