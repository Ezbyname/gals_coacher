import { File } from 'expo-file-system';

import { pickSpreadsheet, spreadsheetFileName } from '../pickSpreadsheet';

jest.mock('expo-file-system', () => ({ File: { pickFileAsync: jest.fn() } }));
const pick = File.pickFileAsync as unknown as jest.Mock;
const picked = (name: string) => ({ canceled: false, result: { name, bytes: async () => new Uint8Array([80, 75]) } });

describe('pickSpreadsheet', () => {
  it('Android picker id -> name null (the screen says "Excel file"); bytes are read; a real name is kept', async () => {
    pick.mockResolvedValueOnce(picked('document:22'));
    expect(await pickSpreadsheet()).toEqual({ name: null, bytes: new Uint8Array([80, 75]) });
    pick.mockResolvedValueOnce(picked('league.xlsx'));
    expect((await pickSpreadsheet())!.name).toBe('league.xlsx');
  });

  it('cancel -> null (nothing changes)', async () => {
    pick.mockResolvedValueOnce({ canceled: true });
    expect(await pickSpreadsheet()).toBeNull();
  });
});

/** CAL-SCHEDULE-IMPORT-002B QA XI-06: an internal document id is never shown as the file name. */
describe('spreadsheetFileName', () => {
  it('keeps a real spreadsheet file name (Hebrew, spaces, .xlsx / .xls / .xlsm)', () => {
    expect(spreadsheetFileName('2026-ילדים-א-שומרון - 11-10-2026.xlsx')).toBe('2026-ילדים-א-שומרון - 11-10-2026.xlsx');
    expect(spreadsheetFileName(' league.XLS ')).toBe('league.XLS');
    expect(spreadsheetFileName('games.xlsm')).toBe('games.xlsm');
  });

  it('an Android picker document id (no file name) -> null, shown as "Excel file"', () => {
    for (const id of ['document:22', 'msf:1000000034', '22', 'primary:Download/x', 'a/b.xlsx', '.xlsx', '']) {
      expect(spreadsheetFileName(id)).toBeNull();
    }
  });
});
