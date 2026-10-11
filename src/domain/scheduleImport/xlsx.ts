import { strFromU8, unzipSync } from 'fflate';

/**
 * CAL-SCHEDULE-IMPORT-002B — a minimal, pure XLSX reader (no native code, no
 * network): an .xlsx file is a zip of XML parts. Only what a fixture sheet
 * needs is read — sheet names and every cell's value (shared / inline
 * strings, numbers, booleans). Formatting, formulas and styles are ignored;
 * a formula cell yields its cached value. Dates arrive as text or as Excel
 * serial numbers (interpreted by the fixture reader, which knows the column).
 */
export type CellValue = string | number | boolean | null;

export interface Sheet {
  readonly name: string;
  /** Rows by their 1-based spreadsheet number, cells by 0-based column; missing cells are null. */
  readonly rows: readonly { readonly number: number; readonly cells: readonly CellValue[] }[];
}

export interface Workbook {
  readonly sheets: readonly Sheet[];
  /** true when the workbook uses the 1904 date system (rare; Mac Excel legacy). */
  readonly date1904: boolean;
}

export class XlsxReadError extends Error {
  constructor(readonly reason: 'NOT_A_WORKBOOK' | 'NO_SHEETS') {
    super(`XLSX: ${reason}`);
    this.name = 'XlsxReadError';
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? _m;
  });
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : null;
};

/** All text of the <t> elements inside a fragment (rich text runs concatenated). */
function textOf(fragment: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out += decodeXml(m[1] ?? '');
  return out;
}

/** "A" → 0, "Z" → 25, "AA" → 26 … */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readWorkbook(bytes: Uint8Array): Workbook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new XlsxReadError('NOT_A_WORKBOOK');
  }
  const part = (path: string) => (files[path] ? strFromU8(files[path]!) : null);
  const workbookXml = part('xl/workbook.xml');
  if (workbookXml === null) throw new XlsxReadError('NOT_A_WORKBOOK');

  const relsXml = part('xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const shared: string[] = [];
  const sharedXml = part('xl/sharedStrings.xml');
  if (sharedXml !== null) for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]!));

  const sheets: Sheet[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(m[0], 'name') ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], 'r:id');
    const path = (rid && targets.get(rid)) ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = part(path);
    if (xml !== null) sheets.push({ name, rows: readRows(xml, shared) });
  }
  if (sheets.length === 0) throw new XlsxReadError('NO_SHEETS');
  return { sheets, date1904: /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbookXml) };
}

function readRows(xml: string, shared: readonly string[]): Sheet['rows'] {
  const rows: { number: number; cells: CellValue[] }[] = [];
  for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const number = Number(attr(r[1]!, 'r') ?? rows.length + 1);
    const cells: CellValue[] = [];
    let next = 0;
    for (const c of r[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1]!, 'r');
      const col = ref ? columnIndex(ref.replace(/[0-9]/g, '')) : next;
      next = col + 1;
      cells[col] = cellValue(attr(c[1]!, 't'), c[2] ?? '', shared);
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows.push({ number, cells });
  }
  return rows;
}

function cellValue(type: string | null, inner: string, shared: readonly string[]): CellValue {
  if (type === 'inlineStr') return textOf(inner);
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (v === undefined) return null;
  const raw = decodeXml(v);
  if (type === 's') return shared[Number(raw)] ?? null;
  if (type === 'str' || type === 'e') return raw;
  if (type === 'b') return raw === '1';
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
}
