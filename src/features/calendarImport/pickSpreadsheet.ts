import { File } from 'expo-file-system';

/**
 * CAL-SCHEDULE-IMPORT-002B — choose a spreadsheet with the system file picker
 * (expo-file-system's native picker, already in the app: no new native module)
 * and read its bytes locally. Nothing is uploaded. null when the user cancels.
 */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function pickSpreadsheet(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const picked = await File.pickFileAsync({ mimeTypes: [XLSX_MIME_TYPE, 'application/octet-stream'] });
  if (picked.canceled) return null;
  return { name: picked.result.name, bytes: await picked.result.bytes() };
}
