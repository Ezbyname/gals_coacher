import { File } from 'expo-file-system';

/**
 * CAL-SCHEDULE-IMPORT-002B — choose a spreadsheet with the system file picker
 * (expo-file-system's native picker, already in the app: no new native module)
 * and read its bytes locally. Nothing is uploaded. null when the user cancels.
 */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function pickSpreadsheet(): Promise<{ name: string | null; bytes: Uint8Array } | null> {
  const picked = await File.pickFileAsync({ mimeTypes: [XLSX_MIME_TYPE, 'application/octet-stream'] });
  if (picked.canceled) return null;
  return { name: spreadsheetFileName(picked.result.name), bytes: await picked.result.bytes() };
}

/**
 * The picked file's name for display, or null when the picker gave only an
 * internal document id. On Android, a document chosen in the system picker is a
 * `content://` URI whose last segment is an id (e.g. "document:22"), not the file
 * name; the installed expo-file-system does not expose the provider's display
 * name. Showing the id would be wrong (CAL-SCHEDULE-IMPORT-002B QA, XI-06): only a
 * real spreadsheet file name is shown; otherwise the screen says "Excel file".
 */
export function spreadsheetFileName(name: string): string | null {
  const trimmed = name.trim();
  return /^[^/\\]+\.(xlsx|xlsm|xls)$/i.test(trimmed) ? trimmed : null;
}
