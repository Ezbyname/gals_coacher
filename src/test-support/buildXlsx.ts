import { strToU8, zipSync } from 'fflate';

/**
 * Tests only: a deterministic minimal .xlsx (zip of SpreadsheetML parts) built
 * in memory — strings go to the shared-strings table (like Excel writes them),
 * numbers stay numeric cells (Excel dates / times as serials), null = no cell.
 * No binary fixture is committed; the owner's real workbook never enters the repo.
 */
export type TestCell = string | number | null;
export interface TestSheet {
  name: string;
  rows: TestCell[][];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : col(Math.floor(i / 26) - 1) + col(i % 26));

export function buildXlsx(sheets: TestSheet[], options: { date1904?: boolean } = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = (s: string) => {
    let i = shared.indexOf(s);
    if (i < 0) i = shared.push(s) - 1;
    return i;
  };
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((sheet, n) => {
    const rows = sheet.rows
      .map((cells, r) => {
        const cs = cells
          .map((v, c) => {
            if (v === null) return '';
            const ref = `${col(c)}${r + 1}`;
            return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${sharedIndex(v)}</v></c>`;
          })
          .join('');
        return `<row r="${r + 1}">${cs}</row>`;
      })
      .join('');
    files[`xl/worksheets/sheet${n + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    );
  });
  const sheetTags = sheets.map((s, n) => `<sheet name="${esc(s.name)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join('');
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `${options.date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<sheets>${sheetTags}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_s, n) => `<Relationship Id="rId${n + 1}" Type="worksheet" Target="worksheets/sheet${n + 1}.xml"/>`).join('') +
      `</Relationships>`,
  );
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') +
      `</sst>`,
  );
  files['[Content_Types].xml'] = strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  return zipSync(files);
}

/** The real workbook's columns (CAL-SCHEDULE-IMPORT-002B acceptance shape). */
export const FIXTURE_HEADER = [
  'ליגה', 'Code', 'Week Day', 'תאריך', 'מחזור', 'Time', 'Home Team', 'Home Team Code', 'Away Team', 'Away Team Code', 'Venue', 'Home Score', 'Away Score',
];
export const HOF = 'הפועל חוף הכרמל';
export const MAAYAN = 'הפועל חוף הכרמל מעיין צבי';
/** A small league: 6 games, 4 of them HOF's (2 home, 2 away; one on 01-10-2026, in the past), 2 of the prefix-sharing club. */
export const FIXTURE_ROWS: TestCell[][] = [
  ['ילדים א', 791001, 'יום חמישי', '22-10-2026', 1, '17:30', 'מכבי חדרה מרכז', 12884, HOF, 12157, 'ביה"ס תחכמוני, חדרה', null, null],
  ['ילדים א', 791002, 'יום חמישי', '22-10-2026', 1, '19:00', MAAYAN, 12696, 'מכבי מי עמי', 13621, 'קיבוץ מעיין צבי', null, null],
  ['ילדים א', 791003, 'יום חמישי', '29/10/2026', 2, '19:00', HOF, 12157, "הפועל ג'סר אלזרקא", 13590, 'ביה"ס כרמל וים, קיבוץ עין כרמל', null, null],
  ['ילדים א', 791004, 'יום חמישי', '05.11.2026', 3, '19:00', HOF, 12157, MAAYAN, 12696, 'קיבוץ מעיין צבי', null, null],
  ['ילדים א', 791005, 'יום חמישי', '05-11-2026', 3, '17:30', 'מכבי פרדס חנה כרכור', 13434, 'הפועל מנשה', 1238, 'היכל הספורט מנשה', null, null],
  ['ילדים א', 791006, 'יום חמישי', '01-10-2026', 0, '18:00', 'הפועל אור עקיבא דור העתיד', 11335, HOF, 12157, 'ביה"ס דרור, אור עקיבא', null, null],
];
